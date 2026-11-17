/**
 * Cisty (bez DOM a bez siete) kus hlasoveho chatu: ladenie Opusu, hodnotenie kvality spojenia, rozpoznanie iOS a rozhodovanie
 * o zalohe prehravania. Oddelene od `voice.ts`, aby sa to dalo testovat bez prehliadaca.
 */

/** kvalita prijmu/odosielania hlasu s jednym hracom (z WebRTC statistik) */
export type Quality = 'good' | 'fair' | 'poor';

/** Cez co ide zvuk: `relay` = cez TURN server, `direct` = priamo medzi hracmi (host / srflx / prflx), '' = zatial nezname. */
export type PathKind = 'relay' | 'direct' | '';

/** Cielovy bitrate Opusu pre rec (mono): 40 kb/s je pri reci prakticky nerozoznatelne od plnej kvality; 24 kb/s je zachrana pri strate. */
export const BITRATE_MAX = 40_000;
export const BITRATE_STEPS = [24_000, 32_000, BITRATE_MAX] as const;
/** Jitter buffer (ms): minimum pre cistu siet, viac pre rozkolisanu. Vyssia hodnota = mensie vypadky, ale vacsie oneskorenie. */
export const JB_STEPS = [40, 80, 140] as const;

/**
 * Upravi Opus v SDP: mono, vnutorna korekcia chyb (FEC), DTX (pri tichu sa nevysiela nic, vyznamne pri 6 spojeniach naraz),
 * strop bitratu a pasmo 48 kHz. Ostatne riadky ostavaju nedotknute.
 */
export function tuneOpusSdp(sdp: string, maxBps: number): string {
  const nl = sdp.includes('\r\n') ? '\r\n' : '\n';
  const lines = sdp.split(/\r?\n/);
  const at = lines.findIndex(l => /^a=rtpmap:\d+ opus\/48000/i.test(l));
  if (at < 0) return sdp;
  const pt = /^a=rtpmap:(\d+) /.exec(lines[at])![1];
  const want: Record<string, string> = {
    stereo: '0', 'sprop-stereo': '0', useinbandfec: '1', usedtx: '1', cbr: '0',
    maxplaybackrate: '48000', maxaveragebitrate: String(Math.round(maxBps)),
  };
  const fi = lines.findIndex(l => l.startsWith(`a=fmtp:${pt} `));
  const params = new Map<string, string>();
  if (fi >= 0) for (const kv of lines[fi].slice(`a=fmtp:${pt} `.length).split(';')) { const [k, v] = kv.trim().split('='); if (k) params.set(k, v ?? ''); }
  for (const [k, v] of Object.entries(want)) params.set(k, v);
  const out = `a=fmtp:${pt} ${[...params].map(([k, v]) => (v === '' ? k : `${k}=${v}`)).join(';')}`;
  if (fi >= 0) lines[fi] = out; else lines.splice(at + 1, 0, out);
  return lines.join(nl);
}

/** Kvalita spojenia zo statistik: moja strata prijmu, strata, ktoru ma protistrana z mojho hlasu, RTT (ms), jitter (ms). */
export function classifyQuality(m: { inLoss: number; outLoss: number; rtt: number; jitter: number }): Quality {
  if (m.inLoss > 0.08 || m.outLoss > 0.12 || m.rtt > 400 || m.jitter > 60) return 'poor';
  if (m.inLoss > 0.03 || m.outLoss > 0.05 || m.rtt > 200 || m.jitter > 30) return 'fair';
  return 'good';
}

/** Typ cesty zvuku z typov lokalneho a vzdialeneho kandidata vybraneho paru (`candidateType` z getStats). */
export function pathKind(localType?: string, remoteType?: string): PathKind {
  if (!localType && !remoteType) return '';
  return localType === 'relay' || remoteType === 'relay' ? 'relay' : 'direct';
}

/**
 * iPhone, iPad a iPod (aj iPadOS, ktory sa hlasi ako Mac s dotykom). Vsetky prehliadace na iOS bezia na WebKit, takze plati aj pre Chrome a Firefox na iPhone.
 * Tu iOS ignoruje hlasitost prehravaca a Web Audio sa po zapnuti mikrofonu casto pozastavi, preto tam hra zvuk priamo prehravac.
 */
export function isIOSDevice(ua: string, platform = '', touchPoints = 0): boolean {
  return /iPhone|iPad|iPod/i.test(ua) || (platform === 'MacIntel' && touchPoints > 1);
}

/** Pocet po sebe iducich vzoriek, v ktorych zvuk prichadza, ale cez Web Audio ho nepocut, kym sa prepne na prehravac. */
export const FALLBACK_STRIKES = 2;
/** Ak je Web Audio kontext pozastaveny takto dlho (ms), prehra sa zvuk radsej cez prehravac. */
export const CTX_BLOCKED_MS = 3000;

/**
 * Samoliecba prehravania cez Web Audio. Zvuk od protistrany prichadza (energia v getStats rastie), ale analyzator ho dlho
 * nevidi alebo kontext nebezi: pocitame takéto vzorky a po `FALLBACK_STRIKES` odporucime prepnut na prehravac.
 */
export function nextFallback(prevStrikes: number, o: { energyRising: boolean; msSinceHeard: number; ctxRunning: boolean }): { strikes: number; fallback: boolean } {
  const silent = o.energyRising && (!o.ctxRunning || o.msSinceHeard > 4000);
  const strikes = silent ? prevStrikes + 1 : 0;
  return { strikes, fallback: strikes >= FALLBACK_STRIKES };
}

/**
 * Musi hrac nieco klepnut, aby sa zvuk spustil? Ano, ak: nejaky hrac hra cez Web Audio a kontext nebezi, alebo ma prehravac
 * so zvukom pozastavenu prehravku.
 */
export function needsTap(peers: { hasStream: boolean; mode: 'element' | 'webaudio'; paused: boolean }[], ctxRunning: boolean): boolean {
  return peers.some(p => p.hasStream && (p.mode === 'webaudio' ? !ctxRunning : p.paused));
}
