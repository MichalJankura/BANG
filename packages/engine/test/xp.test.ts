import { describe, expect, it } from 'vitest';
import {
  State, applyCommand, botCommand, createGame, setupActors, Card, CardType, Role,
  computeXp, comboMultiplier, emptyStats, relation, rankFor, rankProgress, RANKS, isWinner, teamOf,
} from '../src';

const names = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Hrac${i}` }));

function started(n: number): State {
  let s = createGame(names(n), 1, {});
  while (s.setup) {
    const who = setupActors(s)[0];
    s = applyCommand(s, who, botCommand(s, who, Math.random)!);
  }
  return s;
}

function setup(n: number, roles: Role[]): State {
  const s = started(n);
  s.pending = null; s.queue = []; s.store = [];
  const all: Card[] = [...s.deck, ...s.discard];
  for (const p of s.players) { all.push(...p.hand, ...p.inPlay); p.hand = []; p.inPlay = []; }
  s.deck = all.sort((a, b) => a.id - b.id); s.discard = [];
  s.players.forEach((p, i) => { p.character = 'willythekid'; p.role = roles[i]; p.hp = p.maxHp = 4; p.alive = true; });
  s.turn = { player: 'p0', phase: 'play', bangs: 0, skipped: false, goldPan: 0, raddie: 0, luzena: false, extra: false, again: false };
  delete s.stats;
  return s;
}

function giveCard(s: State, pid: string, type: CardType, where: 'hand' | 'inPlay' = 'hand'): Card {
  const i = s.deck.findIndex(c => c.type === type);
  const c = s.deck.splice(i, 1)[0];
  s.players.find(p => p.id === pid)![where].push(c);
  return c;
}

function stackTop(s: State, pred: (c: Card) => boolean) {
  const i = s.deck.findIndex(pred);
  s.deck.push(s.deck.splice(i, 1)[0]);
}

const pl = (s: State, id: string) => s.players.find(p => p.id === id)!;
const stat = (s: State, id: string) => s.stats?.[id] ?? emptyStats();

describe('statistiky pre XP', () => {
  it('Serif trafi Odpadlika BANGom: takticky zasah, 1 zivot, 1 karta', () => {
    let s = setup(4, ['sceriffo', 'rinnegato', 'fuorilegge', 'fuorilegge']);
    const b = giveCard(s, 'p0', 'bang');
    s = applyCommand(s, 'p0', { type: 'play', cardId: b.id, target: 'p1' });
    expect(pl(s, 'p1').hp).toBe(3);
    expect(stat(s, 'p0')).toMatchObject({ cards: 1, dmg: 1, hitsValid: 1, hitsNeutral: 0, hitsAlly: 0 });
  });

  it('Bandita trafi Banditu: spojenec, ziadne XP za poskodenie', () => {
    let s = setup(4, ['fuorilegge', 'fuorilegge', 'sceriffo', 'vice']);
    const b = giveCard(s, 'p0', 'bang');
    s = applyCommand(s, 'p0', { type: 'play', cardId: b.id, target: 'p1' });
    expect(stat(s, 'p0')).toMatchObject({ dmg: 0, hitsAlly: 1, hitsValid: 0 });
  });

  it('Bandita trafi Odpadlika: neutralny zasah', () => {
    let s = setup(4, ['fuorilegge', 'rinnegato', 'sceriffo', 'fuorilegge']);
    const b = giveCard(s, 'p0', 'bang');
    s = applyCommand(s, 'p0', { type: 'play', cardId: b.id, target: 'p1' });
    expect(stat(s, 'p0')).toMatchObject({ dmg: 1, hitsNeutral: 1 });
  });

  it('Vedla! sa rata ako unik a zahrata karta, zasah nie', () => {
    let s = setup(4, ['sceriffo', 'fuorilegge', 'fuorilegge', 'rinnegato']);
    const b = giveCard(s, 'p0', 'bang');
    const m = giveCard(s, 'p1', 'mancato');
    s = applyCommand(s, 'p0', { type: 'play', cardId: b.id, target: 'p1' });
    expect(s.pending?.kind).toBe('bang');
    s = applyCommand(s, 'p1', { type: 'respond', cardId: m.id });
    expect(pl(s, 'p1').hp).toBe(4);
    expect(stat(s, 'p1')).toMatchObject({ dodges: 1, cards: 1 });
    expect(stat(s, 'p0')).toMatchObject({ cards: 1, hitsValid: 0, dmg: 0 });
  });

  it('prijatie zasahu cez pass zachova, ze islo o BANG!', () => {
    let s = setup(4, ['sceriffo', 'fuorilegge', 'fuorilegge', 'rinnegato']);
    const b = giveCard(s, 'p0', 'bang');
    giveCard(s, 'p1', 'mancato');
    s = applyCommand(s, 'p0', { type: 'play', cardId: b.id, target: 'p1' });
    s = applyCommand(s, 'p1', { type: 'pass' });
    expect(stat(s, 'p0')).toMatchObject({ hitsValid: 1, dmg: 1 });
  });

  it('Gulomet: poskodenie sa rata, zasah BANG! nie', () => {
    let s = setup(4, ['sceriffo', 'fuorilegge', 'fuorilegge', 'rinnegato']);
    const g = giveCard(s, 'p0', 'gatling');
    s = applyCommand(s, 'p0', { type: 'play', cardId: g.id });
    expect(stat(s, 'p0')).toMatchObject({ dmg: 3, hitsValid: 0, hitsNeutral: 0 });
  });

  it('Dynamit vybuchne inemu: majitel dostane dynHits', () => {
    let s = setup(4, ['sceriffo', 'fuorilegge', 'fuorilegge', 'rinnegato']);
    const d = giveCard(s, 'p0', 'dinamite');
    s = applyCommand(s, 'p0', { type: 'play', cardId: d.id });
    const i = pl(s, 'p0').inPlay.findIndex(c => c.id === d.id);
    pl(s, 'p1').inPlay.push(pl(s, 'p0').inPlay.splice(i, 1)[0]);
    stackTop(s, c => c.suit === 'spades' && c.rank >= 2 && c.rank <= 9);
    s = applyCommand(s, 'p0', { type: 'endTurn' });
    expect(pl(s, 'p1').hp).toBe(1);
    expect(stat(s, 'p0')).toMatchObject({ dynHits: 1, dynSelf: false, dmg: 0 });
  });

  it('Dynamit vybuchne majitelovi: dynSelf', () => {
    let s = setup(4, ['sceriffo', 'fuorilegge', 'fuorilegge', 'rinnegato']);
    const d = giveCard(s, 'p0', 'dinamite');
    s = applyCommand(s, 'p0', { type: 'play', cardId: d.id });
    s.turn.player = 'p3';
    stackTop(s, c => c.suit === 'spades' && c.rank >= 2 && c.rank <= 9);
    s = applyCommand(s, 'p3', { type: 'endTurn' });
    expect(pl(s, 'p0').hp).toBe(1);
    expect(stat(s, 'p0')).toMatchObject({ dynHits: 0, dynSelf: true });
  });

  it('Odpadlik a Serif: takticky az jeden na jedneho', () => {
    const s = setup(4, ['sceriffo', 'rinnegato', 'fuorilegge', 'vice']);
    expect(relation(s, 'p1', 'p0')).toBe('neutral');
    expect(relation(s, 'p1', 'p2')).toBe('valid');
    expect(relation(s, 'p1', 'p3')).toBe('valid');
    expect(relation(s, 'p3', 'p0')).toBe('ally');
    pl(s, 'p2').alive = false; pl(s, 'p3').alive = false;
    expect(relation(s, 'p1', 'p0')).toBe('valid');
  });
});

describe('vypocet XP', () => {
  const base = { stats: emptyStats(), survivedSec: 0, durationSec: 600 };

  it('kombo nasobic', () => {
    expect([0, 9, 10, 19, 20, 29, 30, 99].map(comboMultiplier)).toEqual([1, 1, 1.15, 1.15, 1.3, 1.3, 1.5, 1.5]);
  });

  it('akcie, kombo, prezitie a vyhra', () => {
    const stats = { ...emptyStats(), cards: 12, dmg: 3, hitsValid: 2, hitsNeutral: 1, dodges: 2, dynHits: 1 };
    const x = computeXp({ role: 'fuorilegge', stats, survivedSec: 125, durationSec: 900, winner: 'fuorilegge' });
    // 15 + 50 + 16 + 25 = 106; ×1.15 = 121.9 -> 122
    expect(x.action).toBe(106);
    expect(x.comboBonus).toBe(16);
    expect(x.survival).toBe(4);
    expect(x.result).toBe(100);
    expect(x.total).toBe(122 + 4 + 100);
    expect(x.won).toBe(true);
  });

  it('mrtvy Pomocnik pri vyhre Serifa dostane plnu odmenu', () => {
    const x = computeXp({ ...base, role: 'vice', survivedSec: 60, winner: 'sceriffo' });
    expect(x.won).toBe(true);
    expect(x.result).toBe(100);
  });

  it('vyhra Odpadlika 175, prehra 15, odchod 0', () => {
    expect(computeXp({ ...base, role: 'rinnegato', winner: 'rinnegato' }).result).toBe(175);
    expect(computeXp({ ...base, role: 'sceriffo', winner: 'rinnegato' }).result).toBe(15);
    const a = computeXp({ ...base, role: 'rinnegato', winner: 'rinnegato', abandoned: true });
    expect(a).toMatchObject({ result: 0, won: false });
  });

  it('prezitie nepresiahne dlzku zapasu ani strop', () => {
    expect(computeXp({ ...base, role: 'vice', survivedSec: 9999, durationSec: 300, winner: 'fuorilegge' }).minutes).toBe(5);
    expect(computeXp({ ...base, role: 'vice', survivedSec: 1e7, durationSec: 1e7, winner: 'fuorilegge' }).survival).toBe(180);
  });

  it('nezaporne a odolne voci nezmyslom', () => {
    const stats = { ...emptyStats(), dmg: -5, hitsValid: NaN, cards: Infinity };
    const x = computeXp({ role: 'vice', stats, survivedSec: -10, durationSec: 100, winner: 'fuorilegge' });
    expect(x.total).toBe(15);
  });

  it('timy a vitazi', () => {
    expect(isWinner('vice', 'sceriffo')).toBe(true);
    expect(isWinner('vice', 'fuorilegge')).toBe(false);
    expect(teamOf('vice')).toBe('sheriff_team');
    expect(teamOf('rinnegato')).toBe('renegade');
  });
});

describe('hodnosti', () => {
  it('prahy', () => {
    expect(RANKS.length).toBe(13);
    expect(rankFor(0).id).toBe(1);
    expect(rankFor(149).id).toBe(1);
    expect(rankFor(150).id).toBe(2);
    expect(rankFor(11999).id).toBe(12);
    expect(rankFor(12000).name).toBe('Legenda pohraničia');
  });
  it('postup', () => {
    expect(rankProgress(250)).toMatchObject({ into: 100, span: 200, ratio: 0.5 });
    expect(rankProgress(50000)).toMatchObject({ next: null, ratio: 1 });
  });
});
