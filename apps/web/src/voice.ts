import { useMemo, useSyncExternalStore } from 'react';
import { call, socket, type Lobby } from './net';
import { BITRATE_MAX, BITRATE_STEPS, CTX_BLOCKED_MS, JB_STEPS, classifyQuality, isIOSDevice, needsTap, nextFallback, pathKind, tuneOpusSdp, type PathKind, type Quality } from './voiceCore';

export { tuneOpusSdp };
export type { Quality };

/**
 * Hlasovy a textovy chat miestnosti.
 *
 * Hlas: WebRTC "mesh" (kazdy s kazdym, pri max. 7 hracoch to staci). Zvuk ide priamo medzi hracmi a je
 * sifrovany (DTLS-SRTP, povinne v WebRTC). Server zvuk nikdy nevidi: len odovzda ponuku/odpoved (SDP) medzi
 * dvoma hracmi z tej istej miestnosti cez existujuce Socket.IO spojenie (TLS).
 * Chat: sprava ide cez server (TLS), server ju neuklada a len rozposle clenom miestnosti.
 */

export type MicError = '' | 'denied' | 'none' | 'insecure' | 'busy';
export type PeerState = 'connecting' | 'live' | 'failed';

/** Rozsah lokalnej hlasitosti hraca: 0 = ticho, 1 = povodna, 2 = dvojnasobok (+6 dB). */
export const VOLUME_MIN = 0;
export const VOLUME_MAX = 2;
export const VOLUME_STEP = 0.05;

export interface ChatMsg { id: string; from: string; name: string; text: string; at: number; mine: boolean; /** systemova poznamka (odchod hraca, zmena zakladatela) */ sys?: boolean }
export interface MicDevice { id: string; label: string }

export interface VoiceState {
  /** som v hlasovom kanali (pocujem ostatnych) */
  joined: boolean;
  /** pripajam sa (pytam mikrofon, volam server) */
  busy: boolean;
  /** mikrofon je stlmeny len u mna (stale pocujem ostatnych) */
  selfMuted: boolean;
  /** mam zivy mikrofon (stream existuje) */
  hasMic: boolean;
  micError: MicError;
  muteAll: boolean;
  /** id hracov, ktorych som stlmil (hlas aj chat) */
  muted: string[];
  /** id hracov, ktori su v hlasovom kanali */
  inVoice: string[];
  peers: Record<string, PeerState>;
  quality: Record<string, Quality>;
  /** lokalna hlasitost hracov (id -> 0..2, chyba = 1); drzi sa aj pri vypadku spojenia */
  volumes: Record<string, number>;
  /** id hracov, ktori prave hovoria (aj moje, ak mikrofon nie je stlmeny) */
  speaking: string[];
  messages: ChatMsg[];
  unread: number;
  /** zvukove vstupy (mikrofony) a ten, ktory sa prave pouziva */
  devices: MicDevice[];
  micId: string;
  /** server posiela aj TURN relay (bez neho sa cez prisne siete nemusia hraci spojit) */
  hasTurn: boolean;
  me: string;
  code: string;
  players: { id: string; name: string; bot: boolean }[];
  /** zvuk ostatnych je pripraveny, ale prehliadac ho caka na klepnutie (iOS: zvukovy kontext / prehravac pozastaveny) */
  audioBlocked: boolean;
  /** hlas sa po prerusenom spojeni (napr. appka bola v pozadi) pripaja znova */
  rejoining: boolean;
}

const empty = (): VoiceState => ({
  joined: false, busy: false, selfMuted: false, hasMic: false, micError: '', muteAll: false, muted: [], inVoice: [], peers: {}, quality: {}, volumes: {}, speaking: [],
  messages: [], unread: 0, devices: [], micId: '', hasTurn: false, me: '', code: '', players: [], audioBlocked: false, rejoining: false,
});

let state: VoiceState = empty();
const subs = new Set<() => void>();
function set(patch: Partial<VoiceState>) { state = { ...state, ...patch }; subs.forEach(f => f()); }
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const useVoice = (): VoiceState => useSyncExternalStore(subscribe, () => state, () => state);

interface Peer {
  id: string; pc: RTCPeerConnection; audio: HTMLAudioElement; stream: MediaStream | null;
  analyser: AnalyserNode | null; src: MediaStreamAudioSourceNode | null; gain: GainNode | null; tries: number;
  /** adaptivne ladenie: aktualny strop bitratu, cielovy jitter buffer a pocet po sebe iducich pokojnych vzoriek */
  bitrate: number; jb: number; calm: number; prev: { lost: number; recv: number } | null;
  /** ako hra zvuk: `element` = priamo prehravac (iOS, zaloha), `webaudio` = cez Web Audio (hlasitost do 200 %) */
  mode: 'element' | 'webaudio';
  /** kedy analyzator naposledy videl zvuk, kolkokrat po sebe zvuk prichadza, no nepocut, a kedy sa kontext zasekol */
  heardAt: number; strikes: number; blockedSince: number; energy: number;
  /** cesta zvuku (relay / priamo) a hladina prichadzajuceho zvuku pre diagnostiku */
  path: PathKind; lvl: number;
}

const peers = new Map<string, Peer>();
let ice: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
let local: MediaStream | null = null;
let ctx: AudioContext | null = null;
let localAnalyser: AnalyserNode | null = null;
let localSrc: MediaStreamAudioSourceNode | null = null;
let meter: ReturnType<typeof setInterval> | null = null;
let chatOpen = false;
const heard = new Map<string, number>();   // id -> kedy naposledy hovoril

/** iPhone / iPad: tu hra zvuk priamo prehravac (Web Audio je po zapnuti mikrofonu pozastaveny a hlasitost prehravaca sa ignoruje). */
export const IOS = typeof navigator !== 'undefined' && isIOSDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
/** Posuvnik hlasitosti ma zmysel len tam, kde hlasitost zaberie (nie na iOS). Stlmenie funguje vsade. */
export const VOLUME_ADJUSTABLE = !IOS;

const secure = () => typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;

// ---------- zvukovy kontext a meranie hlasitosti (zelene podsvietenie hovoriaceho) ----------

function audioCtx(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (C) {
      try { ctx = new C({ latencyHint: 'interactive' }); } catch { ctx = new C(); }
      // Prehliadac kontext po case pozastavi (karta v pozadi, Safari "interrupted"): pri navrate ho znova spustime.
      const wake = () => { if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') void ctx.resume().catch(() => { /* caka na dalsi klik */ }); };
      ctx.addEventListener('statechange', wake);
      document.addEventListener('visibilitychange', wake);
    }
  } catch { /* bez Web Audio sa pouzije obycajny prehravac */ }
  return ctx;
}

/** Spolocna vystupna zbernica: limiter, aby zosilenie nad 100 % nezacalo praskat. */
let bus: DynamicsCompressorNode | null = null;
function outputBus(c: AudioContext): AudioNode {
  if (!bus || bus.context !== c) {
    bus = c.createDynamicsCompressor();
    bus.threshold.value = -10; bus.knee.value = 12; bus.ratio.value = 8; bus.attack.value = 0.003; bus.release.value = 0.2;
    bus.connect(c.destination);
  }
  return bus;
}

function analyserFor(stream: MediaStream): { analyser: AnalyserNode; src: MediaStreamAudioSourceNode } | null {
  const c = audioCtx();
  if (!c) return null;
  try {
    const src = c.createMediaStreamSource(stream);
    const analyser = c.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    return { analyser, src };
  } catch { return null; }
}

const level = (a: AnalyserNode, buf: Uint8Array<ArrayBuffer>): number => {
  a.getByteTimeDomainData(buf);
  let max = 0;
  for (let i = 0; i < buf.length; i++) max = Math.max(max, Math.abs(buf[i] - 128));
  return max / 128;
};

function startMeter() {
  if (meter) return;
  const buf = new Uint8Array(256);
  meter = setInterval(() => {
    const now = Date.now();
    if (localAnalyser && !state.selfMuted && level(localAnalyser, buf) > 0.06) heard.set(state.me, now);
    for (const p of peers.values()) {
      if (!p.analyser) continue;
      p.lvl = level(p.analyser, buf);
      if (p.lvl > 0.02) p.heardAt = now;
      if (effective(p.id) > 0 && p.lvl > 0.04) heard.set(p.id, now);
    }
    checkAudio(now);
    watchMic(now);
    const speaking = [...heard].filter(([, t]) => now - t < 350).map(([id]) => id).sort();
    if (speaking.join() !== state.speaking.join()) set({ speaking });
  }, 120);
}
/**
 * Strazca odosielania: na iPhone system pri prerusení (hovor, Siri, prepnutie slúchadiel, oznámenie) mikrofón ticho vypne.
 * Stopa ostane "live", ale `muted` je true, takze druhi nas nepocuju a nikto o tom nevie. Ak to trva dlhsie ako 2,5 s
 * (a nie sme stlmeni sami), mikrofon sa ziska znova a vymeni sa stopa vo vsetkych spojeniach.
 */
let micDeadSince = 0;
let micRevivedAt = 0;
function watchMic(now: number) {
  const t = local?.getAudioTracks()[0];
  if (!state.joined || !t || state.selfMuted || !(t.readyState === 'ended' || t.muted)) { micDeadSince = 0; return; }
  if (!micDeadSince) micDeadSince = now;
  if (now - micDeadSince < 2500 || now - micRevivedAt < 6000 || document.visibilityState !== 'visible') return;
  micRevivedAt = now; micDeadSince = 0;
  void reviveMic(true);
}
function stopMeter() { if (meter) clearInterval(meter); meter = null; heard.clear(); }

// ---------- mute a hlasitost jednotlivych hracov ----------

const VOL_KEY = 'bang.vol';
const clampVol = (v: number) => Math.round(Math.min(VOLUME_MAX, Math.max(VOLUME_MIN, Number.isFinite(v) ? v : 1)) * 100) / 100;

/** Ulozene hlasitosti podla mena hraca (id sa pri novej miestnosti meni, prezyvka zvycajne nie). */
function loadVols(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(VOL_KEY) ?? '{}') as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) if (typeof v === 'number' && k.length <= 24) out[k] = clampVol(v);
    return out;
  } catch { return {}; }
}
let stored = loadVols();
let saveTimer: ReturnType<typeof setTimeout> | undefined;
function persistVols() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const keys = Object.keys(stored);
    for (const k of keys.slice(0, Math.max(0, keys.length - 64))) delete stored[k];   // nech to nerastie donekonecna
    try { localStorage.setItem(VOL_KEY, JSON.stringify(stored)); } catch { /* bez uloziska to ide tiez */ }
  }, 300);
}

const isMuted = (id: string) => state.muteAll || state.muted.includes(id);
const volumeOf = (id: string) => state.volumes[id] ?? 1;
/** Skutocne zosilenie, ktore pocujem: stlmeny hrac = 0, inak jeho posuvnik. */
const effective = (id: string) => (isMuted(id) ? 0 : volumeOf(id));

function applyVolume(p: Peer) {
  const v = effective(p.id);
  if (p.mode === 'webaudio' && p.gain && ctx) {
    p.gain.gain.setTargetAtTime(v, ctx.currentTime, 0.02);   // plynuly prechod, bez prasknutia
  } else {
    p.audio.muted = v === 0;
    p.audio.volume = Math.min(1, v);   // obycajny prehravac vie len do 100 %
  }
}
function applyMute() { for (const p of peers.values()) applyVolume(p); }

export function toggleMuteAll() { set({ muteAll: !state.muteAll }); applyMute(); }
export function toggleMute(id: string) {
  set({ muted: state.muted.includes(id) ? state.muted.filter(x => x !== id) : [...state.muted, id] });
  applyMute();
}

/** Nastavi lokalnu hlasitost hraca (0..2). Plati len u mna, pamata sa aj po vypadku a po navrate do miestnosti. */
export function setVolume(id: string, value: number) {
  const v = clampVol(value);
  set({ volumes: { ...state.volumes, [id]: v } });
  const p = peers.get(id);
  if (p) applyVolume(p);
  const name = state.players.find(x => x.id === id)?.name;
  if (name) {
    if (v === 1) delete stored[name]; else { delete stored[name]; stored[name] = v; }
    persistVols();
  }
}
export const resetVolume = (id: string) => setVolume(id, 1);
export const getVolume = (id: string) => volumeOf(id);

/**
 * Napojenie UI: `const { volume, muted, set, reset, toggleMute } = usePeerVolume(player.id)`.
 * `volume` je 0..2 (1 = povodna), `muted` = hrac je stlmeny (hlas aj chat) alebo su stlmeni vsetci.
 */
export function usePeerVolume(id: string) {
  const v = useVoice();
  const volume = v.volumes[id] ?? 1;
  const muted = v.muteAll || v.muted.includes(id);
  return useMemo(() => ({
    volume, muted,
    set: (x: number) => setVolume(id, x),
    reset: () => resetVolume(id),
    toggleMute: () => toggleMute(id),
  }), [id, volume, muted]);
}

// ---------- WebRTC ----------

function closePeer(id: string) {
  const p = peers.get(id);
  if (!p) return;
  peers.delete(id);
  for (const n of [p.src, p.gain, p.analyser]) { try { n?.disconnect(); } catch { /* nic */ } }
  p.src = null; p.gain = null; p.analyser = null;
  p.pc.onconnectionstatechange = null; p.pc.ontrack = null;
  try { p.pc.close(); } catch { /* nic */ }
  p.audio.pause(); p.audio.srcObject = null; p.audio.remove();
  heard.delete(id);
  const next = { ...state.peers }; delete next[id];
  const q = { ...state.quality }; delete q[id];
  set({ peers: next, quality: q });
}

function setPeerState(id: string, s: PeerState) { if (state.peers[id] !== s) set({ peers: { ...state.peers, [id]: s } }); }

/** Pocka na zber ICE kandidatov (bez "trickle"), aby sa ponuka/odpoved poslala jednou spravou. */
function gathered(pc: RTCPeerConnection, ms = 3500): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(res => {
    const done = () => { pc.removeEventListener('icegatheringstatechange', on); clearTimeout(t); res(); };
    const on = () => { if (pc.iceGatheringState === 'complete') done(); };
    const t = setTimeout(done, ms);
    pc.addEventListener('icegatheringstatechange', on);
  });
}

// ---------- kvalita zvuku: Opus, odosielac, jitter buffer, adaptacia na siet ----------

const STATS_MS = 2500;

type SenderParams = RTCRtpSendParameters & { encodings: (RTCRtpEncodingParameters & { adaptivePtime?: boolean; networkPriority?: string })[] };

/** Strop bitratu a priorita odosielatela (hlas ma prednost pred inou prevadzkou). */
async function tuneSender(p: Peer, bps: number) {
  const sender = p.pc.getSenders()[0];
  if (!sender) return;
  const prm = sender.getParameters() as SenderParams;
  if (!prm.encodings?.length) prm.encodings = [{}];
  const e = prm.encodings[0];
  e.maxBitrate = bps; e.priority = 'high'; e.networkPriority = 'high'; e.adaptivePtime = true;
  try { await sender.setParameters(prm); return; } catch { /* starsi prehliadac nepozna niektore polia */ }
  delete e.adaptivePtime; delete e.networkPriority;
  try { await sender.setParameters(prm); } catch { /* ostane predvolene */ }
}

/** Jitter buffer prijimaca (Chromium 114+; inde sa ignoruje). */
function tuneJitter(p: Peer, ms: number) {
  const r = p.pc.getReceivers()[0] as (RTCRtpReceiver & { jitterBufferTarget?: number | null }) | undefined;
  if (!r) return;
  try { r.jitterBufferTarget = ms; p.jb = ms; } catch { /* nepodporene */ }
}

const num = (o: Record<string, unknown> | undefined, k: string): number => { const v = o?.[k]; return typeof v === 'number' && Number.isFinite(v) ? v : 0; };

/**
 * Jedna vzorka statistik pre spojenie: strata, RTT, jitter. Z nich urci kvalitu, zniZi/zvysi strop bitratu
 * (strata u protistrany) a velkost jitter buffera (strata a jitter u mna). Zlepsenie sa uplatni az po niekolkych
 * pokojnych vzorkach, aby sa hodnoty nekyvali.
 */
async function sample(p: Peer) {
  if (peers.get(p.id) !== p || p.pc.connectionState !== 'connected') return;
  let inbound: Record<string, unknown> | undefined, remote: Record<string, unknown> | undefined, pair: Record<string, unknown> | undefined;
  const all = new Map<string, Record<string, unknown>>();
  let selected = '';
  try {
    (await p.pc.getStats()).forEach((r: Record<string, unknown>) => {
      all.set(String(r.id), r);
      if (r.type === 'inbound-rtp' && r.kind === 'audio') inbound = r;
      else if (r.type === 'remote-inbound-rtp' && r.kind === 'audio') remote = r;
      else if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated) pair = r;
      else if (r.type === 'transport' && typeof r.selectedCandidatePairId === 'string') selected = r.selectedCandidatePairId;
    });
  } catch { return; }
  if (peers.get(p.id) !== p) return;
  if (selected && all.get(selected)) pair = all.get(selected);

  // typ cesty zvuku (relay = cez TURN) pre diagnostiku
  const lt = all.get(String(pair?.localCandidateId))?.candidateType, rt = all.get(String(pair?.remoteCandidateId))?.candidateType;
  p.path = pathKind(typeof lt === 'string' ? lt : undefined, typeof rt === 'string' ? rt : undefined);

  // samoliecba: zvuk prichadza (energia rastie), ale cez Web Audio ho nepocut -> prepni na prehravac
  const energy = num(inbound, 'totalAudioEnergy');
  const energyRising = energy - p.energy > 0.0005;
  p.energy = energy;
  if (p.mode === 'webaudio') {
    const f = nextFallback(p.strikes, { energyRising, msSinceHeard: Date.now() - p.heardAt, ctxRunning: ctx?.state === 'running' });
    p.strikes = f.strikes;
    if (f.fallback) routeToElement(p);
  }

  const lost = num(inbound, 'packetsLost'), recv = num(inbound, 'packetsReceived');
  const dl = p.prev ? Math.max(0, lost - p.prev.lost) : 0, dr = p.prev ? Math.max(0, recv - p.prev.recv) : 0;
  p.prev = { lost, recv };
  const inLoss = dl + dr > 20 ? dl / (dl + dr) : 0;             // moja strata prijmu
  const outLoss = num(remote, 'fractionLost');                    // strata, ktoru ma protistrana z mojho hlasu
  const rtt = (num(remote, 'roundTripTime') || num(pair, 'currentRoundTripTime')) * 1000;
  const jitter = num(inbound, 'jitter') * 1000;

  const level: Quality = classifyQuality({ inLoss, outLoss, rtt, jitter });
  if (state.quality[p.id] !== level) set({ quality: { ...state.quality, [p.id]: level } });

  // odosielanie: strop bitratu podla straty u protistrany
  const wantRate = outLoss > 0.10 ? BITRATE_STEPS[0] : outLoss > 0.04 ? BITRATE_STEPS[1] : BITRATE_STEPS[2];
  // prijem: jitter buffer podla straty a jitteru u mna
  const wantJb = level === 'poor' ? JB_STEPS[2] : level === 'fair' ? JB_STEPS[1] : JB_STEPS[0];
  p.calm = level === 'good' ? p.calm + 1 : 0;
  const better = p.calm >= 4;   // ~10 s bez problemu
  if (wantRate < p.bitrate || (wantRate > p.bitrate && better)) { p.bitrate = wantRate; void tuneSender(p, wantRate); }
  if (wantJb > p.jb || (wantJb < p.jb && better)) tuneJitter(p, wantJb);
}

let statsTimer: ReturnType<typeof setInterval> | null = null;
function startStats() { if (!statsTimer) statsTimer = setInterval(() => { for (const p of peers.values()) void sample(p); }, STATS_MS); }
function stopStats() { if (statsTimer) clearInterval(statsTimer); statsTimer = null; }

// ---------- odomykanie zvuku (iOS) a zaloha prehravania ----------

/** Prepne hraca z Web Audio na obycajny prehravac (hlasitost len do 100 %, ale hra aj ked je Web Audio zaseknuty). */
function routeToElement(p: Peer) {
  if (p.mode === 'element') return;
  p.mode = 'element';
  try { p.gain?.disconnect(); } catch { /* nic */ }
  p.gain = null;
  p.strikes = 0;
  applyVolume(p);
  void p.audio.play().catch(() => { /* caka na klepnutie */ });
}

/**
 * Spusti zvuk, ktory prehliadac drzi pozastaveny. Musi sa zavolat z klepnutia: na iOS inak `resume()` aj `play()` ticho zlyhaju.
 * Vola ho kazde klepnutie pocas hlasu (listener nizsie) a tlacidlo "Klepni, aby si pocul ostatnych".
 */
export function unlockAudio() {
  if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') void ctx.resume().catch(() => { /* este nie */ });
  for (const p of peers.values()) if (p.stream && p.audio.paused) void p.audio.play().catch(() => { /* este nie */ });
  setTimeout(() => checkAudio(Date.now()), 300);
}

const UNLOCK_EVENTS = ['touchend', 'pointerup', 'click', 'keydown'] as const;
let unlockArmed = false;
const onGesture = () => unlockAudio();
function armUnlock(on: boolean) {
  if (on === unlockArmed) return;
  unlockArmed = on;
  for (const ev of UNLOCK_EVENTS) { if (on) document.addEventListener(ev, onGesture, { capture: true, passive: true }); else document.removeEventListener(ev, onGesture, { capture: true }); }
}

/**
 * Zistuje, ci treba klepnutie na spustenie zvuku (banner v UI) a ak sa Web Audio dlho nerozbehne, prepne hracov na prehravac.
 * Vola sa z merania hlasitosti (~8x za sekundu), zmena stavu sa zapisuje len raz.
 */
function checkAudio(now: number) {
  const running = ctx?.state === 'running';
  for (const p of peers.values()) {
    if (p.mode !== 'webaudio' || !p.stream) continue;
    if (running) { p.blockedSince = 0; continue; }
    if (!p.blockedSince) p.blockedSince = now;
    else if (now - p.blockedSince > CTX_BLOCKED_MS) routeToElement(p);
  }
  const blocked = state.joined && needsTap([...peers.values()].map(p => ({ hasStream: !!p.stream, mode: p.mode, paused: p.audio.paused })), running);
  if (blocked !== state.audioBlocked) set({ audioBlocked: blocked });
}

/** Stav pre diagnosticky panel (`?voicedebug=1`). */
export interface VoiceDebug {
  ios: boolean; mic: string; ctx: string; secure: boolean; hasTurn: boolean; iceServers: number; wantVoice: boolean;
  peers: { id: string; name: string; state: string; mode: string; paused: boolean; path: string; level: number; quality: string }[];
}
export function voiceDebug(): VoiceDebug {
  const mt = local?.getAudioTracks()[0];
  return {
    ios: IOS, mic: mt ? `${mt.readyState}${mt.muted ? ' SYSTEM-MUTED' : ''}${mt.enabled ? '' : ' disabled'}${state.selfMuted ? ' selfmuted' : ''}` : 'none', ctx: ctx?.state ?? 'none', secure: secure(), hasTurn: state.hasTurn, iceServers: ice.length, wantVoice: resumeVoice,
    peers: [...peers.values()].map(p => ({
      id: p.id, name: state.players.find(x => x.id === p.id)?.name ?? p.id, state: state.peers[p.id] ?? '?', mode: p.mode,
      paused: p.audio.paused, path: p.path || '?', level: Math.round(p.lvl * 100) / 100, quality: state.quality[p.id] ?? '?',
    })),
  };
}
export const voiceDebugOn = () => {
  try { return new URLSearchParams(location.search).get('voicedebug') === '1' || localStorage.getItem('bang.voicedebug') === '1'; } catch { return false; }
};

function makePeer(id: string): Peer {
  closePeer(id);
  const pc = new RTCPeerConnection({ iceServers: ice, iceCandidatePoolSize: 2, bundlePolicy: 'max-bundle' });
  const audio = new Audio();
  audio.autoplay = true;
  audio.muted = true;
  audio.setAttribute('playsinline', '');   // iOS: prehravat priamo na stranke, nie cez celoobrazovkovy prehravac
  audio.style.display = 'none';
  document.body.appendChild(audio);
  const p: Peer = {
    id, pc, audio, stream: null, analyser: null, src: null, gain: null, tries: 0, bitrate: BITRATE_MAX, jb: JB_STEPS[0], calm: 0, prev: null,
    mode: IOS ? 'element' : 'webaudio', heardAt: 0, strikes: 0, blockedSince: 0, energy: 0, path: '', lvl: 0,
  };
  // Jeden obojsmerny zvukovy kanal: mikrofon sa doplni/vymeni neskor bez novej dohody (replaceTrack).
  const tr = pc.addTransceiver('audio', { direction: 'sendrecv' });
  const track = local?.getAudioTracks()[0];
  if (track) void tr.sender.replaceTrack(track);
  pc.ontrack = e => {
    const stream = e.streams[0] ?? new MediaStream([e.track]);
    p.stream = stream;
    for (const n of [p.src, p.gain, p.analyser]) { try { n?.disconnect(); } catch { /* nic */ } }
    p.src = null; p.gain = null; p.analyser = null;
    audio.srcObject = stream;
    // Dve cesty prehravania:
    //  - `element` (iPhone / iPad, zaloha): zvuk hra priamo prehravac. Web Audio sa po zapnuti mikrofonu na iOS pozastavi a hlasitost
    //    prehravaca iOS ignoruje, takze tu funguje len stlmenie. Web Audio ostava len na meranie "hovori".
    //  - `webaudio` (ostatne): zdroj > GainNode (hlasitost 0..200 %) > limiter. Prehravac ostava stisenny, lebo Chromium bez neho
    //    vzdialenemu streamu nepusti zvuk do Web Audio. Ak by zvuk nebol pocut, `sample` / `checkAudio` prepne na `element`.
    const c = audioCtx();
    let routed = false;
    if (c) {
      try {
        const src = c.createMediaStreamSource(stream);
        const analyser = c.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);          // meranie "hovori" pred zosilnenim
        p.src = src; p.analyser = analyser;
        if (p.mode === 'webaudio') {
          const gain = c.createGain();
          gain.gain.value = 0;
          src.connect(gain);
          gain.connect(outputBus(c));
          p.gain = gain;
          routed = true;
        }
      } catch { /* bez Web Audio hra obycajny prehravac */ }
    }
    if (!routed) p.mode = 'element';
    if (!p.analyser) { const a = analyserFor(stream); if (a) { p.analyser = a.analyser; p.src = a.src; } }
    p.heardAt = Date.now();   // dobu odkedy zvuk prichadza pocitame od teraz
    p.blockedSince = 0;
    audio.muted = p.mode === 'webaudio' ? true : isMuted(id);
    applyVolume(p);
    void audio.play().catch(() => { /* prehra sa po klepnuti (unlockAudio) alebo cez banner */ });
    void c?.resume().catch(() => { /* caka na klepnutie */ });
    tuneJitter(p, JB_STEPS[0]);
  };
  // Zaseknute alebo prerusene spojenie (napr. prisna siet bez relay) sa po case oznaci ako zlyhane.
  const fail = () => {
    if (peers.get(id) !== p || pc.connectionState === 'connected') return;
    setPeerState(id, 'failed');
    // Znovu skusi ten s mensim id (aby neposielali obaja naraz), najviac 3x; dalej uz rucne tlacidlom.
    if (state.joined && state.me < id && p.tries < 3 && state.inVoice.includes(id)) {
      setTimeout(() => { if (peers.get(id) === p && state.joined) void offerTo(id, p.tries + 1); }, 1500 * (p.tries + 1));
    }
  };
  let stall: ReturnType<typeof setTimeout> | undefined;
  const arm = (ms: number) => { clearTimeout(stall); stall = setTimeout(fail, ms); };
  arm(25000);
  pc.onconnectionstatechange = () => {
    const c = pc.connectionState;
    if (c === 'connected') { clearTimeout(stall); setPeerState(id, 'live'); }
    else if (c === 'disconnected') arm(8000);
    else if (c === 'failed' || c === 'closed') { clearTimeout(stall); fail(); }
  };
  peers.set(id, p);
  setPeerState(id, 'connecting');
  return p;
}

async function offerTo(id: string, tries = 0) {
  const p = makePeer(id);
  p.tries = tries;
  try {
    const offer = await p.pc.createOffer();
    await p.pc.setLocalDescription({ type: 'offer', sdp: tuneOpusSdp(offer.sdp ?? '', BITRATE_MAX) });
    void tuneSender(p, p.bitrate);
    await gathered(p.pc);
    if (peers.get(id) !== p || !p.pc.localDescription) return;
    socket.emit('rtc', { to: id, t: 'offer', sdp: p.pc.localDescription.sdp });
  } catch { setPeerState(id, 'failed'); }
}

async function onOffer(from: string, sdp: string) {
  const old = peers.get(from);
  // Obaja poslali ponuku naraz: ustupi ten s vacsim id.
  if (old && old.pc.signalingState === 'have-local-offer' && state.me < from) return;
  const p = makePeer(from);
  try {
    await p.pc.setRemoteDescription({ type: 'offer', sdp });
    const answer = await p.pc.createAnswer();
    await p.pc.setLocalDescription({ type: 'answer', sdp: tuneOpusSdp(answer.sdp ?? '', BITRATE_MAX) });
    void tuneSender(p, p.bitrate);
    await gathered(p.pc);
    if (peers.get(from) !== p || !p.pc.localDescription) return;
    socket.emit('rtc', { to: from, t: 'answer', sdp: p.pc.localDescription.sdp });
  } catch { setPeerState(from, 'failed'); }
}

async function onAnswer(from: string, sdp: string) {
  const p = peers.get(from);
  if (!p || p.pc.signalingState !== 'have-local-offer') return;
  try { await p.pc.setRemoteDescription({ type: 'answer', sdp }); } catch { setPeerState(from, 'failed'); }
}

// ---------- verejne ovladanie ----------

const savedMic = () => { try { return localStorage.getItem('bang.mic') ?? ''; } catch { return ''; } };
const saveMic = (id: string) => { try { localStorage.setItem('bang.mic', id); } catch { /* bez uloziska to ide tiez */ } };

function audioConstraints(id: string, exact: boolean): MediaTrackConstraints {
  return {
    // Spracovanie hlasu v prehliadaci: ozvena, sum a vyrovnanie hlasitosti.
    echoCancellation: true, noiseSuppression: true, autoGainControl: true,
    // Mono 48 kHz = presne to, co Opus pre rec pouziva (ziadne zbytocne prevzorkovanie ani stereo). Nizke oneskorenie zachytavania.
    channelCount: { ideal: 1 }, sampleRate: { ideal: 48000 }, sampleSize: { ideal: 16 },
    // Nizke oneskorenie zachytavania a model izolacie hlasu v Chromiu (ignoruje sa, ak ich prehliadac nepozna).
    ...({ latency: { ideal: 0.02 }, voiceIsolation: { ideal: true } } as MediaTrackConstraints),
    ...(id ? { deviceId: exact ? { exact: id } : { ideal: id } } : {}),
  };
}

async function getMic(id = savedMic(), exact = false): Promise<MicError> {
  if (!secure()) return 'insecure';
  try {
    local = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(id, exact), video: false });
    local.getAudioTracks().forEach(t => { t.contentHint = 'speech'; });   // kodek ladi na rec, nie na hudbu
    return '';
  } catch (e) {
    const n = (e as DOMException)?.name;
    return n === 'NotAllowedError' || n === 'SecurityError' ? 'denied' : n === 'NotFoundError' || n === 'OverconstrainedError' ? 'none' : 'busy';
  }
}

/** Zoznam mikrofonov (popisy su k dispozicii az po povoleni mikrofonu). */
async function refreshDevices() {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    const ins = all.filter(d => d.kind === 'audioinput' && d.deviceId !== 'communications');
    const devices = ins.map((d, i) => ({ id: d.deviceId, label: d.label || `Mikrofón ${i + 1}` }));
    const cur = (local as MediaStream | null)?.getAudioTracks()[0]?.getSettings().deviceId ?? state.micId;
    set({ devices, micId: devices.some(d => d.id === cur) ? cur : '' });
  } catch { /* bez zoznamu to ide tiez */ }
}

/** Prepne na iny mikrofon bez prerusenia spojeni (vymeni sa len stopa v odosielatoch). */
export async function selectMic(id: string) {
  saveMic(id);
  if (!state.joined) { set({ micId: id }); return; }
  const old = local as MediaStream | null;
  const prev = state.micId;
  local = null;
  const err = await getMic(id, true);
  const got = local as MediaStream | null;
  const track = got?.getAudioTracks()[0];
  if (!got || !track) {
    local = old;   // povodny mikrofon ostane
    set({ micError: err, micId: prev });
    return;
  }
  old?.getTracks().forEach(t => t.stop());
  track.enabled = !state.selfMuted;
  for (const p of peers.values()) { const sender = p.pc.getSenders()[0]; if (sender) void sender.replaceTrack(track); }
  try { localSrc?.disconnect(); } catch { /* nic */ }
  const a = analyserFor(got);
  localAnalyser = a?.analyser ?? null; localSrc = a?.src ?? null;
  set({ hasMic: true, micError: '', micId: id });
  void refreshDevices();
}

/** Hrac chcel byt v hlase, no spojenie sa prerusilo (appka v pozadi, vypadok siete): po navrate do miestnosti sa pripoji sam. */
let resumeVoice = false;

/**
 * Pripoji do hlasoveho kanala. Ak mikrofon nie je k dispozicii, pripoji ako poslucha (pocuje ostatnych).
 * `auto` = obnova po prerusenom spojeni (nie z klepnutia: zvuk potom odomkne prve klepnutie alebo banner).
 */
export async function joinVoice(auto = false) {
  if (state.joined || state.busy || !state.me) return;
  set({ busy: true, rejoining: auto });
  void audioCtx()?.resume();   // musi sa spustit z kliknutia, inak ho prehliadac nechá pozastaveny
  const err = await getMic();
  const res = await call('voice', { on: true }) as { ok?: boolean; error?: string; ice?: RTCIceServer[]; peers?: string[] };
  if (!res.ok) { stopLocal(); resumeVoice = false; set({ busy: false, rejoining: false, micError: err }); return; }
  if (Array.isArray(res.ice) && res.ice.length) ice = res.ice;
  const hasTurn = ice.some(x => [x.urls].flat().some(u => typeof u === 'string' && /^turns?:/i.test(u)));
  const track = local?.getAudioTracks()[0];
  if (local) { const a = analyserFor(local); if (a) { localAnalyser = a.analyser; localSrc = a.src; } }
  void audioCtx()?.resume();
  set({ joined: true, busy: false, rejoining: false, micError: err, hasMic: !!track, selfMuted: false, hasTurn });
  resumeVoice = false;
  startMeter(); startStats();
  armUnlock(true);
  document.addEventListener('visibilitychange', onVisible);
  void refreshDevices();
  navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
  // Novy clen vola tych, ktori uz v hlase su; ostatni cakaju na jeho ponuku.
  for (const id of res.peers ?? []) void offerTo(id);
}

const onDeviceChange = () => { void refreshDevices(); };

function stopLocal() {
  local?.getTracks().forEach(t => t.stop());
  try { localSrc?.disconnect(); } catch { /* nic */ }
  local = null; localAnalyser = null; localSrc = null;
}

/** Po navrate do appky: odomkne zvuk a, ak system pocas pozadia vypol mikrofon (stopa skoncila), ziska ho znova. */
function onVisible() {
  if (document.visibilityState !== 'visible' || !state.joined) return;
  unlockAudio();
  void reviveMic();
}
async function reviveMic(force = false) {
  const t = local?.getAudioTracks()[0];
  if (!state.joined || !t || (t.readyState !== 'ended' && !(force && t.muted))) return;
  const wasMuted = state.selfMuted;
  stopLocal();
  set({ hasMic: false });
  await toggleMic();   // !local > ziska mikrofon znova a vymeni stopu vo vsetkych spojeniach
  if (wasMuted && local) { (local as MediaStream).getAudioTracks().forEach(x => { x.enabled = false; }); set({ selfMuted: true }); }
}

/** Zatvori spojenia a mikrofon (bez zmeny zamyslu hraca): pouziva sa pri odchode aj pri prerusenom spojeni so serverom. */
function teardown() {
  for (const id of [...peers.keys()]) closePeer(id);
  stopLocal(); stopMeter(); stopStats(); armUnlock(false);
  document.removeEventListener('visibilitychange', onVisible);
  navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
  if (state.joined && socket.connected) socket.emit('voice', { on: false });
  set({ joined: false, busy: false, hasMic: false, selfMuted: false, peers: {}, quality: {}, speaking: [], audioBlocked: false });
}

/** Hrac sa z hlasu odpoji sam (tlacidlo) alebo odide z miestnosti: nepripaja sa znova. */
export function leaveVoice() {
  resumeVoice = false;
  teardown();
  if (state.rejoining) set({ rejoining: false });
}

/** Stlmi / zapne vlastny mikrofon. Ak sa este nepodarilo ziskat mikrofon (zamietnuty), skusi ho znova. */
export async function toggleMic() {
  if (!state.joined) return joinVoice();
  if (!local) {
    const err = await getMic();
    const got = local as MediaStream | null;   // getMic() ju nastavi, TypeScript to cez await nevidi
    const track = got?.getAudioTracks()[0];
    if (got && track) {
      for (const p of peers.values()) { const s = p.pc.getSenders()[0]; if (s) void s.replaceTrack(track); }
      const a = analyserFor(got);
      if (a) { localAnalyser = a.analyser; localSrc = a.src; }
      set({ hasMic: true, micError: '', selfMuted: false });
      void refreshDevices();
    } else set({ micError: err });
    return;
  }
  const next = !state.selfMuted;
  local.getAudioTracks().forEach(t => { t.enabled = !next; });
  if (next) heard.delete(state.me);
  set({ selfMuted: next });
}

/** Rucne obnovi spojenie s jednym hracom (po zlyhani). */
export function retryPeer(id: string) { if (state.joined && state.inVoice.includes(id)) void offerTo(id); }

// ---------- chat ----------

/** Systemova poznamka v chate (odchod hraca, zmena zakladatela). */
export function addSystemMessage(text: string) {
  const msg: ChatMsg = { id: 'sys' + Date.now() + Math.random().toString(36).slice(2, 6), from: '', name: '', text, at: Date.now(), mine: false, sys: true };
  set({ messages: [...state.messages, msg].slice(-100) });
}

export function setChatOpen(open: boolean) { chatOpen = open; if (open && state.unread) set({ unread: 0 }); }

export async function sendChat(text: string): Promise<string> {
  const t = text.trim();
  if (!t) return '';
  const r = await call('chat', { text: t.slice(0, 300) });
  return r.error ?? '';
}

// ---------- napojenie na server a na miestnost ----------

socket.on('rtc', (d: { from?: string; t?: string; sdp?: string }) => {
  if (!state.joined || typeof d?.from !== 'string' || typeof d.sdp !== 'string') return;
  if (!state.players.some(p => p.id === d.from && !p.bot)) return;
  if (d.t === 'offer') void onOffer(d.from, d.sdp);
  else if (d.t === 'answer') void onAnswer(d.from, d.sdp);
});

socket.on('chat', (m: { id?: string; from?: string; name?: string; text?: string; at?: number }) => {
  if (typeof m?.id !== 'string' || typeof m.from !== 'string' || typeof m.text !== 'string') return;
  const msg: ChatMsg = { id: m.id, from: m.from, name: String(m.name ?? '').slice(0, 24), text: m.text.slice(0, 300), at: Number(m.at) || Date.now(), mine: m.from === state.me };
  if (state.messages.some(x => x.id === msg.id)) return;
  const quiet = msg.mine || state.muted.includes(msg.from) || chatOpen;
  set({ messages: [...state.messages, msg].slice(-100), unread: quiet ? state.unread : state.unread + 1 });
});

// Ak som sa do hlasu pripojil sam, server mi TURN udaje poslal az ked prisiel druhy clovek.
socket.on('ice', (d: { ice?: RTCIceServer[] }) => {
  if (!Array.isArray(d?.ice) || !d.ice.length) return;
  ice = d.ice;
  set({ hasTurn: ice.some(x => [x.urls].flat().some(u => typeof u === 'string' && /^turns?:/i.test(u))) });
});

// Po prerusenom spojeni (iOS uspi stranku v pozadi, vypadok siete) je clen na serveri mimo hlasu: lokalne sa vsetko zavrie
// a ak hrac v hlase bol, po navrate do miestnosti (udalost `room`, viď syncVoice) sa pripoji sam.
socket.on('disconnect', () => {
  if (!state.joined && !peers.size) return;
  const was = state.joined || resumeVoice;
  teardown();
  resumeVoice = was;
  if (was) set({ rejoining: true });
});

/** Volat pri kazdej zmene miestnosti: drzi zoznam hracov a zatvara spojenia s tymi, co odisli z hlasu. */
export function syncVoice(lobby: Lobby | null) {
  if (!lobby) { resumeVoice = false; if (state.code) { leaveVoice(); state = empty(); subs.forEach(f => f()); } return; }
  if (state.code && state.code !== lobby.code) { leaveVoice(); state = empty(); }
  const inVoice = lobby.players.filter(p => p.voice && !p.bot).map(p => p.id);
  const ids = new Set(lobby.players.map(p => p.id));
  for (const id of [...peers.keys()]) if (!inVoice.includes(id) || !ids.has(id)) closePeer(id);
  // Hlasitosti: id v tejto miestnosti nema ulozenu hodnotu -> doplni sa podla prezyvky z minula.
  let volumes = state.volumes;
  for (const p of lobby.players) {
    if (p.bot || p.id === lobby.me || volumes[p.id] !== undefined || stored[p.name] === undefined) continue;
    if (volumes === state.volumes) volumes = { ...volumes };
    volumes[p.id] = stored[p.name];
  }
  const changed = volumes !== state.volumes;
  set({
    me: lobby.me, code: lobby.code, inVoice, volumes,
    players: lobby.players.map(p => ({ id: p.id, name: p.name, bot: p.bot })),
    muted: state.muted.filter(id => ids.has(id)),
  });
  if (changed) applyMute();
  // Spojenie s hlasom sa prerusilo a hrac je spat v miestnosti: pripoj ho znova.
  if (resumeVoice && !state.joined && !state.busy && lobby.players.some(p => p.id === lobby.me)) void joinVoice(true);
}
