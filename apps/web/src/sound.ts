import { useEffect, useRef, useSyncExternalStore } from 'react';
import gamestart from '../../../assets/sounds/gamestart.wav';
import shot from '../../../assets/sounds/shot.wav';
import zoom from '../../../assets/sounds/zoom.wav';
import horse from '../../../assets/sounds/horse.wav';
import drums from '../../../assets/sounds/indianwardrums.wav';
import dynamite from '../../../assets/sounds/dynamite.wav';

/**
 * Zvukove efekty hry. Ide sa cez Web Audio (fetch + dekodovanie), takze netreba media-src v CSP.
 * Vlastny AudioContext, nezavisly od hlasoveho chatu (voice.ts). Prehliadac ho pusti az po kliknuti,
 * preto sa pri kazdom klepnuti/klavese skusi obnovit; zvuk spusteny skor zaznie po prvom kliknuti.
 */

const URLS = { gamestart, shot, zoom, horse, drums, dynamite } as const;
export type Sfx = Exclude<keyof typeof URLS, 'gamestart'>;

// ---------- zapnute / vypnute (pamata si sa v localStorage) ----------

const KEY = 'bang.sfx';
let enabled = (() => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } })();
const subs = new Set<() => void>();

export function setSfxEnabled(on: boolean) {
  enabled = on;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
  if (on) { wake(); if (musicWanted) void startMusicNode(); }
  else stopMusicNode(0.15);
  subs.forEach(f => f());
}

export function useSfxEnabled(): boolean {
  return useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => enabled);
}

// ---------- zvukovy kontext ----------

let ctx: AudioContext | null = null;
let out: GainNode | null = null;

function ac(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    out = ctx.createGain();
    out.gain.value = 0.8;
    out.connect(ctx.destination);
  } catch { ctx = null; }
  return ctx;
}

function wake() {
  const c = ac();
  if (c && c.state !== 'running' && c.state !== 'closed') void c.resume().catch(() => { /* az po dalsom kliknuti */ });
}

if (typeof document !== 'undefined') {
  const onGesture = () => { if (enabled) wake(); };
  document.addEventListener('pointerdown', onGesture, true);
  document.addEventListener('keydown', onGesture, true);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && enabled) wake(); });
}

const buffers = new Map<keyof typeof URLS, Promise<AudioBuffer | null>>();
function load(name: keyof typeof URLS): Promise<AudioBuffer | null> {
  let p = buffers.get(name);
  if (!p) {
    const c = ac();
    p = !c ? Promise.resolve(null)
      : fetch(URLS[name]).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then(b => c.decodeAudioData(b))
        .catch(() => { buffers.delete(name); return null; });
    buffers.set(name, p);
  }
  return p;
}

/** Kratky efekt. Ked su zvuky vypnute, nerobi nic. */
export function playSfx(name: Sfx, volume = 1) {
  if (!enabled) return;
  wake();
  void load(name).then(buf => {
    const c = ctx;
    if (!buf || !c || !out || !enabled) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = volume;
    src.connect(g).connect(out);
    src.start();
  });
}

// ---------- hudba pocas vyberu rol a postav ----------

let musicWanted = false;
let music: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let musicTry = 0;

async function startMusicNode() {
  if (music || !enabled) return;
  const my = ++musicTry;
  const buf = await load('gamestart');
  const c = ctx;
  if (!buf || !c || !out || my !== musicTry || music || !musicWanted || !enabled) return;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, c.currentTime);
  gain.gain.linearRampToValueAtTime(0.55, c.currentTime + 0.8);
  src.connect(gain).connect(out);
  src.start();
  music = { src, gain };
}

function stopMusicNode(fade: number) {
  musicTry++;
  const m = music;
  music = null;
  if (!m || !ctx) return;
  const t = ctx.currentTime;
  m.gain.gain.cancelScheduledValues(t);
  m.gain.gain.setValueAtTime(m.gain.gain.value, t);
  m.gain.gain.linearRampToValueAtTime(0, t + fade);
  try { m.src.stop(t + fade + 0.05); } catch { /* uz stoji */ }
}

/** Hudba hra, kym je komponent pripojeny (obrazovka vyberu); pri prechode na stol stichne. */
export function useSetupMusic() {
  useEffect(() => {
    musicWanted = true;
    wake();
    void startMusicNode();
    return () => { musicWanted = false; stopMusicNode(1.2); };
  }, []);
}

// ---------- efekty podla dennika hry ----------

type Line = { k: string; t: string };

/** Ktory zvuk patri k riadku dennika (texty su zo servera, vzdy po slovensky). */
function soundFor(t: string): Sfx | null {
  if (/^Dynamit vybuchol/.test(t)) return 'dynamite';
  if (/ zahral Indiánov!/.test(t)) return 'drums';
  if (/ zahral BANG!| v dueli odhodil BANG!| strieľa na hráča /.test(t)) return 'shot';
  if (/ vyložil Mustang\.$/.test(t)) return 'horse';
  if (/ vyložil Mieridlo\.$/.test(t)) return 'zoom';
  return null;
}

/** Nove riadky: najdlhsi koniec predosleho dennika, ktorym novy zacina. Bez prekryvu (velky skok) nic. */
function fresh(a: Line[], b: Line[]): Line[] {
  for (let k = 0; k < a.length; k++) {
    const n = a.length - k;
    if (n > b.length) continue;
    let ok = true;
    for (let i = 0; i < n && ok; i++) ok = a[k + i].k === b[i].k && a[k + i].t === b[i].t;
    if (ok) return b.slice(n);
  }
  return a.length ? [] : b;
}

/** Prehra efekty pre udalosti, ktore pribudli v denniku od posledneho stavu. Prvy stav (pripojenie) neprehrava nic. */
export function useGameSounds(log: Line[]) {
  const prev = useRef<Line[] | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = log;
    if (!p || p === log) return;
    const played = new Set<Sfx>();
    for (const l of fresh(p, log)) {
      const s = soundFor(l.t);
      if (s && !played.has(s)) { played.add(s); playSfx(s); }
    }
  }, [log]);
}
