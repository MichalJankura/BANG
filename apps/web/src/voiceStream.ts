import type { Call, StreamVideoClient } from '@stream-io/video-client';

/**
 * Hlas cez Stream (https://getstream.io/video), volitelna alternativa k vlastnemu WebRTC v `voice.ts`.
 * Server (VOICE_PROVIDER=stream) vyda kratkodoby token na hovor miestnosti, zvuk ide cez ich SFU.
 * Modul sa nacita az pri pripojeni do hlasu v tomto rezime (SDK je velky, vlastny WebRTC ho nepotrebuje).
 * Id hraca v hre = userId v Stream, vdaka comu sa UI (stlmenie, hlasitost, "hovori") napaja rovnako ako pri vlastnom WebRTC.
 */

export interface StreamAuth { apiKey: string; userId: string; token: string; callId: string; callType: string }
export type StreamMicError = '' | 'denied' | 'none' | 'busy';

export interface StreamHooks {
  /** spojenie s hracom: ide sa pripajat / zvuk prichadza */
  peer(id: string, s: 'connecting' | 'live' | 'failed'): void;
  /** hrac z hovoru odisiel */
  gone(id: string): void;
  /** stav vlastneho mikrofonu sa zmenil (zapnuty = true) */
  mic(enabled: boolean): void;
  /** hlasitost (0..2) hraca podla UI; 0 = stlmeny */
  volume(id: string): number;
}

export interface StreamSession {
  toggleMic(): Promise<void>;
  /** znova pouzije hlasitosti a stlmenia z UI na vsetkych prehravacoch */
  apply(): void;
  /** spusti prehravace, ktore prehliadac drzi pozastavene (volat z klepnutia) */
  unlock(): void;
  /** id hracov (aj vlastne), ktori prave hovoria */
  speaking(): string[];
  /** zoznam prehravacov pre diagnostiku */
  debug(): { id: string; paused: boolean }[];
  leave(): Promise<void>;
}

interface Slot { userId: string; audio: HTMLAudioElement; unbind: () => void }

const CONNECT_TIMEOUT_MS = 20000;

export async function joinStream(a: StreamAuth, hooks: StreamHooks, expectedPeers: string[]): Promise<{ session: StreamSession; micError: StreamMicError }> {
  const { StreamVideoClient } = await import('@stream-io/video-client');
  const client: StreamVideoClient = new StreamVideoClient({ apiKey: a.apiKey, user: { id: a.userId }, token: a.token });
  const call: Call = client.call(a.callType, a.callId);
  const slots = new Map<string, Slot>();      // sessionId -> prehravac
  const talking = new Set<string>();
  let left = false;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  // Kto uz v hlase je, ale este sa nepripojil, je "pripaja sa"; ak sa nepripoji do casu, oznaci sa ako zlyhane.
  for (const id of expectedPeers) {
    hooks.peer(id, 'connecting');
    timers.set(id, setTimeout(() => { if (!left) hooks.peer(id, 'failed'); }, CONNECT_TIMEOUT_MS));
  }

  try {
    await call.join({ create: true });
  } catch (e) {
    try { await client.disconnectUser(); } catch { /* nic */ }
    throw e;
  }

  const volumeOf = (id: string) => hooks.volume(id);
  const applyTo = (s: Slot) => { const v = volumeOf(s.userId); s.audio.muted = v === 0; s.audio.volume = Math.min(1, v); };

  const subParticipants = call.state.participants$.subscribe(list => {
    if (left) return;
    const alive = new Set<string>();
    talking.clear();
    for (const p of list) {
      if (p.isLocalParticipant) { if (p.isSpeaking) talking.add(p.userId); continue; }
      alive.add(p.sessionId);
      let slot = slots.get(p.sessionId);
      if (!slot) {
        const audio = new Audio();
        audio.autoplay = true;
        audio.setAttribute('playsinline', '');   // iOS: prehravat priamo na stranke
        audio.style.display = 'none';
        document.body.appendChild(audio);
        const unbind = call.bindAudioElement(audio, p.sessionId, 'audioTrack') ?? (() => { /* nic */ });
        slot = { userId: p.userId, audio, unbind };
        slots.set(p.sessionId, slot);
        applyTo(slot);
        clearTimeout(timers.get(p.userId)); timers.delete(p.userId);
        hooks.peer(p.userId, 'live');
      }
      if (p.isSpeaking) talking.add(p.userId);
    }
    for (const [sid, slot] of [...slots]) {
      if (alive.has(sid)) continue;
      try { slot.unbind(); } catch { /* nic */ }
      slot.audio.pause(); slot.audio.srcObject = null; slot.audio.remove();
      slots.delete(sid);
      if (![...slots.values()].some(x => x.userId === slot.userId)) hooks.gone(slot.userId);
    }
  });

  const subMic = call.microphone.state.status$.subscribe(st => { if (!left) hooks.mic(st === 'enabled'); });

  let micError: StreamMicError = '';
  try {
    await call.microphone.enable();
  } catch (e) {
    const n = (e as { name?: string })?.name ?? '';
    micError = n === 'NotAllowedError' || n === 'SecurityError' ? 'denied' : n === 'NotFoundError' || n === 'OverconstrainedError' ? 'none' : 'busy';
  }

  const session: StreamSession = {
    async toggleMic() {
      try { await call.microphone.toggle(); } catch { /* zamietnuty mikrofon: stav ostane */ }
    },
    apply() { for (const s of slots.values()) applyTo(s); },
    unlock() { for (const s of slots.values()) if (s.audio.paused && s.audio.srcObject) void s.audio.play().catch(() => { /* este nie */ }); },
    speaking: () => [...talking],
    debug: () => [...slots.values()].map(s => ({ id: s.userId, paused: s.audio.paused })),
    async leave() {
      if (left) return;
      left = true;
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      subParticipants.unsubscribe(); subMic.unsubscribe();
      for (const s of slots.values()) { try { s.unbind(); } catch { /* nic */ } s.audio.pause(); s.audio.srcObject = null; s.audio.remove(); }
      slots.clear(); talking.clear();
      try { await call.leave(); } catch { /* nic */ }
      try { await client.disconnectUser(); } catch { /* nic */ }
    },
  };
  return { session, micError };
}
