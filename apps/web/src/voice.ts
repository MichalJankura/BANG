import { useSyncExternalStore } from 'react';
import { call, socket, type Lobby } from './net';

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
}

const empty = (): VoiceState => ({
  joined: false, busy: false, selfMuted: false, hasMic: false, micError: '', muteAll: false, muted: [], inVoice: [], peers: {}, speaking: [],
  messages: [], unread: 0, devices: [], micId: '', hasTurn: false, me: '', code: '', players: [],
});

let state: VoiceState = empty();
const subs = new Set<() => void>();
function set(patch: Partial<VoiceState>) { state = { ...state, ...patch }; subs.forEach(f => f()); }
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const useVoice = (): VoiceState => useSyncExternalStore(subscribe, () => state, () => state);

interface Peer { id: string; pc: RTCPeerConnection; audio: HTMLAudioElement; stream: MediaStream | null; analyser: AnalyserNode | null; src: MediaStreamAudioSourceNode | null; tries: number }

const peers = new Map<string, Peer>();
let ice: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
let local: MediaStream | null = null;
let ctx: AudioContext | null = null;
let localAnalyser: AnalyserNode | null = null;
let localSrc: MediaStreamAudioSourceNode | null = null;
let meter: ReturnType<typeof setInterval> | null = null;
let chatOpen = false;
const heard = new Map<string, number>();   // id -> kedy naposledy hovoril

const secure = () => typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;

// ---------- zvukovy kontext a meranie hlasitosti (zelene podsvietenie hovoriaceho) ----------

function audioCtx(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (C) ctx = new C();
  } catch { /* bez merania to ide tiez */ }
  return ctx;
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
    for (const p of peers.values()) if (p.analyser && !isMuted(p.id) && level(p.analyser, buf) > 0.04) heard.set(p.id, now);
    const speaking = [...heard].filter(([, t]) => now - t < 350).map(([id]) => id).sort();
    if (speaking.join() !== state.speaking.join()) set({ speaking });
  }, 120);
}
function stopMeter() { if (meter) clearInterval(meter); meter = null; heard.clear(); }

// ---------- mute ----------

const isMuted = (id: string) => state.muteAll || state.muted.includes(id);
function applyMute() { for (const p of peers.values()) p.audio.muted = isMuted(p.id); }

export function toggleMuteAll() { set({ muteAll: !state.muteAll }); applyMute(); }
export function toggleMute(id: string) {
  set({ muted: state.muted.includes(id) ? state.muted.filter(x => x !== id) : [...state.muted, id] });
  applyMute();
}

// ---------- WebRTC ----------

function closePeer(id: string) {
  const p = peers.get(id);
  if (!p) return;
  peers.delete(id);
  try { p.src?.disconnect(); } catch { /* nic */ }
  p.pc.onconnectionstatechange = null; p.pc.ontrack = null;
  try { p.pc.close(); } catch { /* nic */ }
  p.audio.srcObject = null; p.audio.remove();
  heard.delete(id);
  const next = { ...state.peers }; delete next[id];
  set({ peers: next });
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

function makePeer(id: string): Peer {
  closePeer(id);
  const pc = new RTCPeerConnection({ iceServers: ice, iceCandidatePoolSize: 2 });
  const audio = new Audio();
  audio.autoplay = true;
  audio.muted = isMuted(id);
  audio.style.display = 'none';
  document.body.appendChild(audio);
  const p: Peer = { id, pc, audio, stream: null, analyser: null, src: null, tries: 0 };
  // Jeden obojsmerny zvukovy kanal: mikrofon sa doplni/vymeni neskor bez novej dohody (replaceTrack).
  const tr = pc.addTransceiver('audio', { direction: 'sendrecv' });
  const track = local?.getAudioTracks()[0];
  if (track) void tr.sender.replaceTrack(track);
  pc.ontrack = e => {
    const stream = e.streams[0] ?? new MediaStream([e.track]);
    p.stream = stream;
    audio.srcObject = stream;
    void audio.play().catch(() => { /* prehra sa po dalsom kliknuti */ });
    const a = analyserFor(stream);
    if (a) { p.analyser = a.analyser; p.src = a.src; }
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
    await p.pc.setLocalDescription(await p.pc.createOffer());
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
    await p.pc.setLocalDescription(await p.pc.createAnswer());
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
  return { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(id ? { deviceId: exact ? { exact: id } : { ideal: id } } : {}) };
}

async function getMic(id = savedMic(), exact = false): Promise<MicError> {
  if (!secure()) return 'insecure';
  try {
    local = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(id, exact), video: false });
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

/** Pripoji do hlasoveho kanala. Ak mikrofon nie je k dispozicii, pripoji ako poslucha (pocuje ostatnych). */
export async function joinVoice() {
  if (state.joined || state.busy || !state.me) return;
  set({ busy: true });
  void audioCtx()?.resume();   // musi sa spustit z kliknutia, inak ho prehliadac nechá pozastaveny
  const err = await getMic();
  const res = await call('voice', { on: true }) as { ok?: boolean; error?: string; ice?: RTCIceServer[]; peers?: string[] };
  if (!res.ok) { stopLocal(); set({ busy: false, micError: err }); return; }
  if (Array.isArray(res.ice) && res.ice.length) ice = res.ice;
  const hasTurn = ice.some(x => [x.urls].flat().some(u => typeof u === 'string' && /^turns?:/i.test(u)));
  const track = local?.getAudioTracks()[0];
  if (local) { const a = analyserFor(local); if (a) { localAnalyser = a.analyser; localSrc = a.src; } }
  void audioCtx()?.resume();
  set({ joined: true, busy: false, micError: err, hasMic: !!track, selfMuted: false, hasTurn });
  startMeter();
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

export function leaveVoice() {
  for (const id of [...peers.keys()]) closePeer(id);
  stopLocal(); stopMeter();
  navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
  if (state.joined && socket.connected) socket.emit('voice', { on: false });
  set({ joined: false, busy: false, hasMic: false, selfMuted: false, peers: {}, speaking: [] });
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

// Po prerusenom spojeni je clen na serveri mimo hlasu: lokalne sa tiez vsetko zavrie, hrac sa pripoji znova klikom.
socket.on('disconnect', () => { if (state.joined || peers.size) leaveVoice(); });

/** Volat pri kazdej zmene miestnosti: drzi zoznam hracov a zatvara spojenia s tymi, co odisli z hlasu. */
export function syncVoice(lobby: Lobby | null) {
  if (!lobby) { if (state.code) { leaveVoice(); state = empty(); subs.forEach(f => f()); } return; }
  if (state.code && state.code !== lobby.code) { leaveVoice(); state = empty(); }
  const inVoice = lobby.players.filter(p => p.voice && !p.bot).map(p => p.id);
  const ids = new Set(lobby.players.map(p => p.id));
  for (const id of [...peers.keys()]) if (!inVoice.includes(id) || !ids.has(id)) closePeer(id);
  set({
    me: lobby.me, code: lobby.code, inVoice,
    players: lobby.players.map(p => ({ id: p.id, name: p.name, bot: p.bot })),
    muted: state.muted.filter(id => ids.has(id)),
  });
}
