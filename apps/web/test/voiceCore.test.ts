import { describe, expect, it } from 'vitest';
import { BITRATE_MAX, FALLBACK_STRIKES, classifyQuality, isIOSDevice, needsTap, nextFallback, pathKind, tuneOpusSdp } from '../src/voiceCore';

const SDP = [
  'v=0', 'm=audio 9 UDP/TLS/RTP/SAVPF 111 63 9', 'a=rtpmap:111 opus/48000/2', 'a=fmtp:111 minptime=10;useinbandfec=0;stereo=1', 'a=rtpmap:63 red/48000/2', 'a=rtpmap:9 G722/8000',
].join('\r\n') + '\r\n';

describe('tuneOpusSdp', () => {
  it('nastaví mono, FEC, DTX a strop bitratu a zachová cudzie parametre', () => {
    const out = tuneOpusSdp(SDP, 32_000);
    const fmtp = out.split('\r\n').find(l => l.startsWith('a=fmtp:111 '))!;
    const kv = Object.fromEntries(fmtp.slice('a=fmtp:111 '.length).split(';').map(x => x.split('=')));
    expect(kv).toMatchObject({ minptime: '10', stereo: '0', 'sprop-stereo': '0', useinbandfec: '1', usedtx: '1', cbr: '0', maxplaybackrate: '48000', maxaveragebitrate: '32000' });
  });
  it('bez riadku fmtp ho doplní hneď za rtpmap Opusu a zachová koncové zalomenie', () => {
    const lines = SDP.split('\r\n').filter(l => !l.startsWith('a=fmtp:'));
    const out = tuneOpusSdp(lines.join('\r\n'), BITRATE_MAX).split('\r\n');
    expect(out[out.indexOf('a=rtpmap:111 opus/48000/2') + 1]).toMatch(/^a=fmtp:111 .*maxaveragebitrate=40000/);
  });
  it('SDP bez Opusu a SDP s LF nechá nedotknuté / zachová LF', () => {
    const noOpus = 'v=0\r\nm=audio 9 RTP/AVP 0\r\na=rtpmap:0 PCMU/8000\r\n';
    expect(tuneOpusSdp(noOpus, 40_000)).toBe(noOpus);
    expect(tuneOpusSdp(SDP.replace(/\r\n/g, '\n'), 40_000)).not.toContain('\r');
  });
});

describe('classifyQuality', () => {
  const ok = { inLoss: 0, outLoss: 0, rtt: 40, jitter: 5 };
  it('čistá sieť je good, hranice sa posúvajú na fair a poor', () => {
    expect(classifyQuality(ok)).toBe('good');
    expect(classifyQuality({ ...ok, inLoss: 0.04 })).toBe('fair');
    expect(classifyQuality({ ...ok, rtt: 250 })).toBe('fair');
    expect(classifyQuality({ ...ok, outLoss: 0.13 })).toBe('poor');
    expect(classifyQuality({ ...ok, jitter: 61 })).toBe('poor');
  });
});

describe('pathKind', () => {
  it('relay, ak je relay ktorákoľvek strana; inak priamo; bez údajov nič', () => {
    expect(pathKind('host', 'srflx')).toBe('direct');
    expect(pathKind('srflx', 'relay')).toBe('relay');
    expect(pathKind('relay', 'host')).toBe('relay');
    expect(pathKind(undefined, undefined)).toBe('');
  });
});

describe('isIOSDevice', () => {
  it('pozná iPhone, iPad a iPadOS ako Mac s dotykom; Mac, Windows a Android nie', () => {
    expect(isIOSDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1')).toBe(true);
    expect(isIOSDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 CriOS/126.0 Mobile/15E148 Safari/604.1')).toBe(true);
    expect(isIOSDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', 'MacIntel', 5)).toBe(true);
    expect(isIOSDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', 'MacIntel', 0)).toBe(false);
    expect(isIOSDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0 Safari/537.36', 'Win32', 0)).toBe(false);
    expect(isIOSDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/140.0 Mobile Safari/537.36', 'Linux armv8l', 5)).toBe(false);
  });
});

describe('nextFallback (samoliečba Web Audio)', () => {
  const quiet = { energyRising: false, msSinceHeard: 60_000, ctxRunning: true };
  it('keď zvuk neprichádza (DTX, ticho), nikdy neprepína', () => {
    expect(nextFallback(5, quiet)).toEqual({ strikes: 0, fallback: false });
  });
  it('keď zvuk prichádza a analyzátor ho vidí, nič sa nedeje', () => {
    expect(nextFallback(1, { energyRising: true, msSinceHeard: 300, ctxRunning: true })).toEqual({ strikes: 0, fallback: false });
  });
  it('zvuk prichádza, ale cez Web Audio ho nevidno: po FALLBACK_STRIKES vzorkách prepne', () => {
    let s = 0, fb = false;
    for (let i = 0; i < FALLBACK_STRIKES; i++) ({ strikes: s, fallback: fb } = nextFallback(s, { energyRising: true, msSinceHeard: 9000, ctxRunning: true }));
    expect(fb).toBe(true);
  });
  it('pozastavený kontext s prichádzajúcim zvukom sa počíta ako problém aj keď bol zvuk nedávno videný', () => {
    expect(nextFallback(1, { energyRising: true, msSinceHeard: 100, ctxRunning: false }).fallback).toBe(true);
  });
  it('jedna dobrá vzorka vynuluje počítadlo', () => {
    const a = nextFallback(0, { energyRising: true, msSinceHeard: 9000, ctxRunning: true });
    expect(a.strikes).toBe(1);
    expect(nextFallback(a.strikes, quiet).strikes).toBe(0);
  });
});

describe('needsTap', () => {
  it('Web Audio s bežiacim kontextom nepotrebuje klepnutie, pozastavený áno', () => {
    expect(needsTap([{ hasStream: true, mode: 'webaudio', paused: true }], true)).toBe(false);
    expect(needsTap([{ hasStream: true, mode: 'webaudio', paused: true }], false)).toBe(true);
  });
  it('prehrávač: pozastavená prehrávka (iOS odmietol play) = klepnutie; kontext je pri ňom jedno', () => {
    expect(needsTap([{ hasStream: true, mode: 'element', paused: true }], false)).toBe(true);
    expect(needsTap([{ hasStream: true, mode: 'element', paused: false }], false)).toBe(false);
  });
  it('hráč bez streamu (ešte sa pripája) klepnutie nevyžaduje', () => {
    expect(needsTap([{ hasStream: false, mode: 'element', paused: true }], false)).toBe(false);
    expect(needsTap([], false)).toBe(false);
  });
});
