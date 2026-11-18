import { describe, expect, it } from 'vitest';
import { createGame, emptyStats, type State } from '@bang/engine';
import { cleanNickname, hashPassword, validPassword, verifyPassword } from '../src/auth.js';
import { buildPayload, markLeft, newMatch, track } from '../src/ranked.js';
import type { Member, Room } from '../src/types.js';

describe('ucty', () => {
  it('prezyvka', () => {
    expect(cleanNickname('  Jožko  Mrkvička ')).toBe('Jožko Mrkvička');
    expect(cleanNickname('ab')).toBeNull();
    expect(cleanNickname('a'.repeat(17))).toBeNull();
    expect(cleanNickname('<script>')).toBeNull();
    expect(cleanNickname('_admin')).toBeNull();
    expect(cleanNickname("x' OR 1=1")).toBeNull();
    expect(cleanNickname('Billy_the.Kid-2')).toBe('Billy_the.Kid-2');
    expect(cleanNickname(42)).toBeNull();
  });

  it('heslo', () => {
    expect(validPassword('1234567')).toBe(false);
    expect(validPassword('12345678')).toBe(true);
    expect(validPassword('x'.repeat(129))).toBe(false);
    expect(validPassword({})).toBe(false);
  });

  it('scrypt hash a overenie', async () => {
    const h = await hashPassword('správne heslo');
    expect(h.startsWith('scrypt$32768$8$3$')).toBe(true);
    expect(await hashPassword('správne heslo')).not.toBe(h);
    expect(await verifyPassword('správne heslo', h)).toBe(true);
    expect(await verifyPassword('zlé heslo', h)).toBe(false);
    expect(await verifyPassword('x', 'scrypt$1024$1$1$AAAA$BBBB')).toBe(false);
    expect(await verifyPassword('x', 'bcrypt$whatever')).toBe(false);
  });
});

describe('ranked zapas', () => {
  const members = (n: number): Member[] => Array.from({ length: n }, (_, i) => ({
    id: `p${i}`, token: '', name: `H${i}`, bot: false, socket: null, voice: false, acct: `acct-${i}`,
  }));

  it('sleduje zaciatok, vyradenia, odchod a zostavi zaznam', () => {
    const ms = members(4);
    let st: State = createGame(ms.map(m => ({ id: m.id, name: m.name })), 7, {});
    const match = newMatch(ms);
    expect(Object.keys(match.accounts)).toHaveLength(4);
    expect(track(match, st, 1000)).toBe(false);
    expect(match.startedAt).toBeNull();
    st = { ...st, setup: null };
    track(match, st, 2000);
    expect(match.startedAt).toBe(2000);

    st.players.forEach((p, i) => { p.role = i === 0 ? 'sceriffo' : i === 1 ? 'vice' : i === 2 ? 'fuorilegge' : 'rinnegato'; });
    st.players[1].alive = false;
    track(match, st, 62_000);
    markLeft(match, 'p3');
    st.stats = { p0: { ...emptyStats(), cards: 10, dmg: 2, hitsValid: 2 } };
    st.winner = 'sceriffo';
    expect(track(match, st, 182_000)).toBe(true);

    const room = { code: 'ABCD' } as Room;
    const { payload, xp } = buildPayload(room, match, st, 182_000);
    expect(payload.winning_faction).toBe('sheriff_team');
    expect(payload.duration_seconds).toBe(180);
    const by = Object.fromEntries(payload.participants.map(p => [p.player_id, p]));
    expect(by['acct-0']).toMatchObject({ assigned_role: 'sheriff', is_winner: true, valid_bangs: 2, damage_dealt: 2 });
    // mrtvy Pomocnik vyhrava s timom, prezil 1 minutu
    expect(by['acct-1']).toMatchObject({ assigned_role: 'deputy', is_winner: true, survived_seconds: 60 });
    expect(xp.p1.result).toBe(100);
    expect(by['acct-3']).toMatchObject({ abandoned: true, is_winner: false });
    expect(xp.p3.result).toBe(0);
    // (10 + 40) * 1.15 = 57.5 -> 58, 3 min = 6, vyhra 100
    expect(xp.p0.total).toBe(58 + 6 + 100);
  });
});
