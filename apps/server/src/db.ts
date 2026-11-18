import type { DbRole } from '@bang/engine';

/**
 * Pristup k Supabase (Postgres) cez PostgREST RPC. Vola ho LEN server so service_role klucom
 * (SUPABASE_SERVICE_KEY, nikdy sa neposiela klientovi). Bez nastavenych premennych je ranked vypnuty.
 * Vsetky volania su parametrizovane (JSON telo), ziadne skladanie SQL.
 */
const BASE = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

/** https; http len pre lokalny vyvoj (localhost) */
export const rankedEnabled = (/^https:\/\/[a-z0-9.-]+$/i.test(BASE) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(BASE)) && KEY.length > 20;

export interface Profile {
  id: string;
  nickname: string;
  preferredRole: DbRole;
  xp: number;
  rating: number;
  rankId: number;
  gamesPlayed: number;
  gamesWon: number;
}

export class DbError extends Error {}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!rankedEnabled) throw new DbError('ranked disabled');
  const headers: Record<string, string> = { 'content-type': 'application/json', apikey: KEY };
  // Stare kluce su JWT (posielaju sa aj ako Bearer), nove `sb_secret_...` len v hlavicke apikey.
  if (!KEY.startsWith('sb_')) headers.authorization = `Bearer ${KEY}`;
  const res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers, body: JSON.stringify(args), signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  if (!res.ok) {
    // Do logu len stav, kod a spravu. Pole `details` z PostgREST moze obsahovat cely riadok (aj hash hesla), preto sa nezapisuje.
    let info = '';
    try { const j = JSON.parse(text) as { code?: string; message?: string }; info = `${j.code ?? ''} ${String(j.message ?? '').slice(0, 160)}`; } catch { /* nie JSON */ }
    console.error(`db ${fn}: HTTP ${res.status} ${info}`);
    throw new DbError(`db ${fn} ${res.status}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

export const db = {
  register: (nickname: string, hash: string, role: DbRole) =>
    rpc<Profile | null>('register_player', { p_nickname: nickname, p_hash: hash, p_role: role }),
  loginLookup: (nickname: string) =>
    rpc<{ id: string; hash: string } | null>('login_lookup', { p_nickname: nickname }),
  createSession: (player: string, tokenHash: string, days: number) =>
    rpc<Profile>('create_session', { p_player: player, p_token_hash: tokenHash, p_days: days }),
  sessionProfile: (tokenHash: string) =>
    rpc<Profile | null>('session_profile', { p_token_hash: tokenHash }),
  deleteSession: (tokenHash: string) =>
    rpc<null>('delete_session', { p_token_hash: tokenHash }),
  setRole: (player: string, role: DbRole) =>
    rpc<Profile>('set_preferred_role', { p_player: player, p_role: role }),
  recordMatch: (payload: MatchPayload) =>
    rpc<MatchRecordResult>('record_match', { p: payload }),
  leaderboard: (limit: number) =>
    rpc<{ nickname: string; xp: number; rating: number; rankId: number; gamesPlayed: number; gamesWon: number }[]>('leaderboard', { p_limit: limit }),
};

export interface MatchPayload {
  match_id: string;
  room_code: string;
  winning_faction: string;
  duration_seconds: number;
  options: Record<string, unknown>;
  participants: {
    player_id: string;
    assigned_role: DbRole;
    team: string;
    survived_seconds: number;
    cards_played: number;
    damage_dealt: number;
    bang_hits: number;
    valid_bangs: number;
    invalid_bangs: number;
    dodges_successful: number;
    dynamite_kills_or_hits: number;
    dynamite_self_exploded: boolean;
    abandoned: boolean;
    is_winner: boolean;
    xp_earned: number;
    xp_breakdown: Record<string, unknown>;
  }[];
}

export interface MatchRecordResult {
  match_id: string;
  results: {
    player_id: string;
    xp_before: number; xp_after: number; xp_earned: number;
    rating_before: number; rating_after: number; rating_delta: number;
    rank_before: number; rank_after: number; is_winner: boolean;
  }[];
}
