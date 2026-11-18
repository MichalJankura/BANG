import { randomUUID } from 'node:crypto';
import { FACTION, ROLE_DB, computeXp, emptyStats, teamOf, type State } from '@bang/engine';
import type { Member, MatchResultMsg, RankedMatch, Room } from './types.js';
import { db, type MatchPayload } from './db.js';
import { forgetPlayer } from './auth.js';

/** Novy ranked zapas pri starte hry: mapa clen -> ucet. */
export function newMatch(members: Member[]): RankedMatch {
  const accounts: Record<string, string> = {};
  for (const m of members) if (m.acct) accounts[m.id] = m.acct;
  return { id: randomUUID(), accounts, startedAt: null, deadAt: {}, left: [], status: 'playing' };
}

/** Volane z broadcast: zaciatok zapasu, casy vyradenia. Vrati true, ked je zapas na zapis. */
export function track(match: RankedMatch, st: State, now = Date.now()): boolean {
  if (match.status !== 'playing') return false;
  if (!st.setup && match.startedAt === null) match.startedAt = now;
  for (const p of st.players) if ((!p.alive || p.ghost) && match.deadAt[p.id] === undefined) match.deadAt[p.id] = now;
  return !!st.winner;
}

/** Clen odisiel z rozohratej ranked hry (nahradil ho bot). */
export function markLeft(match: RankedMatch, id: string) {
  if (match.status === 'playing' && match.accounts[id] && !match.left.includes(id)) match.left.push(id);
}

/** Vypocita XP z autoritativneho stavu enginu a zostavi zaznam pre DB. */
export function buildPayload(room: Room, match: RankedMatch, st: State, now = Date.now()): { payload: MatchPayload; xp: Record<string, ReturnType<typeof computeXp>> } {
  const start = match.startedAt ?? now;
  const durationSec = Math.max(0, Math.round((now - start) / 1000));
  const winner = st.winner!;
  const xp: Record<string, ReturnType<typeof computeXp>> = {};
  const participants: MatchPayload['participants'] = [];
  for (const [mid, acct] of Object.entries(match.accounts)) {
    const p = st.players.find(x => x.id === mid);
    if (!p) continue;
    const stats = st.stats?.[mid] ?? emptyStats();
    const died = match.deadAt[mid];
    const survivedSec = Math.max(0, Math.round(((died ?? now) - start) / 1000));
    const abandoned = match.left.includes(mid);
    const x = computeXp({ role: p.role, stats, survivedSec, durationSec, winner, abandoned });
    xp[mid] = x;
    participants.push({
      player_id: acct,
      assigned_role: ROLE_DB[p.role],
      team: teamOf(p.role),
      survived_seconds: Math.min(survivedSec, durationSec),
      cards_played: stats.cards,
      damage_dealt: stats.dmg,
      bang_hits: stats.hitsValid + stats.hitsNeutral + stats.hitsAlly,
      valid_bangs: stats.hitsValid,
      invalid_bangs: stats.hitsAlly,
      dodges_successful: stats.dodges,
      dynamite_kills_or_hits: stats.dynHits,
      dynamite_self_exploded: stats.dynSelf,
      abandoned,
      is_winner: x.won,
      xp_earned: x.total,
      xp_breakdown: { ...x, hitsValid: stats.hitsValid, hitsNeutral: stats.hitsNeutral, hitsAlly: stats.hitsAlly, cards: stats.cards },
    });
  }
  return {
    payload: {
      match_id: match.id, room_code: room.code, winning_faction: FACTION[winner], duration_seconds: durationSec,
      options: { goldRush: !!st.opts.goldRush, shadows: !!st.opts.shadows }, participants,
    },
    xp,
  };
}

/**
 * Zapis zapasu do DB (idempotentny podla match.id, opakuje sa pri chybe siete) a rozoslanie vysledkov.
 * `done` sa zavola po uspechu aj neuspechu, aby server ulozil snimok a rozoslal stav.
 */
export async function finalize(room: Room, match: RankedMatch, st: State, done: () => void) {
  match.status = 'sending';
  const { payload, xp } = buildPayload(room, match, st);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await db.recordMatch(payload);
      const byAcct = new Map(res.results.map(r => [r.player_id, r]));
      const results: Record<string, MatchResultMsg> = {};
      for (const [mid, acct] of Object.entries(match.accounts)) {
        const r = byAcct.get(acct), x = xp[mid];
        const p = st.players.find(q => q.id === mid);
        if (!r || !x || !p) continue;
        forgetPlayer(acct);
        results[mid] = {
          role: p.role, won: r.is_winner, abandoned: match.left.includes(mid),
          xp: { ...x, hitsValid: st.stats?.[mid]?.hitsValid ?? 0, cards: st.stats?.[mid]?.cards ?? 0 },
          xpBefore: r.xp_before, xpAfter: r.xp_after,
          ratingBefore: r.rating_before, ratingAfter: r.rating_after,
          rankBefore: r.rank_before, rankAfter: r.rank_after,
        };
      }
      match.results = results;
      match.status = 'done';
      for (const m of room.members) {
        const msg = results[m.id];
        if (msg && m.socket && !m.bot) m.socket.emit('matchResult', msg);
        // Odznak v lobby sa obnovi na novu hodnost a rating.
        if (msg && m.badge) m.badge = { ...m.badge, rankId: msg.rankAfter, rating: msg.ratingAfter };
      }
      done();
      return;
    } catch (e) {
      console.error(`Zapis ranked zapasu ${match.id} zlyhal (pokus ${attempt + 1}):`, (e as Error).message);
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  match.status = 'failed';
  for (const m of room.members) m.socket?.emit('matchResult', { error: 'Výsledok sa nepodarilo uložiť' });
  done();
}
