import { useSyncExternalStore } from 'react';
import type { DbRole } from '@bang/engine';
import { call, saveSession, savedSession, socket } from './net';

/** Profil prihlaseneho hraca (bez id uctu, server ho klientovi neposiela). */
export interface Profile {
  nickname: string;
  preferredRole: DbRole;
  xp: number;
  rating: number;
  rankId: number;
  gamesPlayed: number;
  gamesWon: number;
}

/** Vysledok ranked zapasu zo servera (pozapasova obrazovka). */
export interface MatchResult {
  role: string;
  won: boolean;
  abandoned: boolean;
  xp: {
    damage: number; hits: number; dodges: number; dynamite: number; action: number; multiplier: number; comboBonus: number;
    survival: number; minutes: number; result: number; total: number; hitsValid: number; cards: number;
  };
  xpBefore: number; xpAfter: number;
  ratingBefore: number; ratingAfter: number;
  rankBefore: number; rankAfter: number;
}

interface AccountState {
  /** server ma ranked zapnuty (null = este nevieme) */
  enabled: boolean | null;
  profile: Profile | null;
}

let state: AccountState = { enabled: null, profile: null };
const subs = new Set<() => void>();
const set = (patch: Partial<AccountState>) => { state = { ...state, ...patch }; subs.forEach(f => f()); };

export const useAccount = () => useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => state);

socket.on('serverInfo', (i: { ranked?: boolean }) => set({ enabled: !!i?.ranked }));

type AuthAck = { profile?: Profile; session?: string; expired?: boolean };

/** Po kazdom pripojeni: obnovi prihlasenie zo session (pred pripojenim k stolu). */
export async function resumeAccount(): Promise<void> {
  const s = savedSession();
  if (!s) return;
  const r = await call<AuthAck>('auth', { op: 'resume', session: s });
  if (r.ok && r.profile) set({ profile: r.profile });
  else if (r.expired) { saveSession(null); set({ profile: null }); }
}

export async function refreshAccount(): Promise<void> {
  if (!state.profile) return;
  const r = await call<AuthAck>('auth', { op: 'me' });
  if (r.ok && r.profile) set({ profile: r.profile });
  else if (r.expired) { saveSession(null); set({ profile: null }); }
}

export async function login(nickname: string, password: string, hp: string): Promise<string | null> {
  const r = await call<AuthAck>('auth', { op: 'login', nickname, password, hp });
  if (!r.ok || !r.session || !r.profile) return r.error ?? 'Prihlásenie sa nepodarilo';
  saveSession(r.session);
  set({ profile: r.profile });
  return null;
}

export async function register(nickname: string, password: string, role: DbRole, hp: string): Promise<string | null> {
  const r = await call<AuthAck>('auth', { op: 'register', nickname, password, role, hp });
  if (!r.ok || !r.session || !r.profile) return r.error ?? 'Registrácia sa nepodarila';
  saveSession(r.session);
  set({ profile: r.profile });
  return null;
}

export async function logout(): Promise<string | null> {
  const r = await call('auth', { op: 'logout' });
  if (r.error) return r.error;
  saveSession(null);
  set({ profile: null });
  return null;
}

export async function changeRole(role: DbRole): Promise<string | null> {
  const r = await call<AuthAck>('auth', { op: 'setRole', role });
  if (!r.ok || !r.profile) return r.error ?? 'Zmena sa nepodarila';
  set({ profile: r.profile });
  return null;
}

/** Po zapase: profil sa hned posunie na nove hodnoty zo servera. */
export function applyResult(r: MatchResult) {
  const p = state.profile;
  if (!p) return;
  set({ profile: { ...p, xp: r.xpAfter, rating: r.ratingAfter, rankId: r.rankAfter, gamesPlayed: p.gamesPlayed + 1, gamesWon: p.gamesWon + (r.won ? 1 : 0) } });
}
