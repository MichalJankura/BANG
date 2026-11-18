import { describe, expect, it } from 'vitest';
import {
  State, applyCommand, actor, botCommand, buildDeck, createGame, distance, setupActors, setupViewFor, viewFor,
  eliminate, renamePlayer, buildDeck as buildDeckT, BASE_CHARS, CHARACTERS, ROLES_BY_COUNT, buildEquipDeck,
  Card, CardType, CharKey, Role, RuleError, EquipType, Options, EQUIP, GR_CHARS, abilitiesFor, didWin, heapLeft, NUGGETS,
} from '../src';

const names = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Hrac${i}` }));

/** Prejde vyber rol a postav botmi. */
function started(n: number, seed: number, rand: () => number = Math.random, opts: Partial<Options> = {}): State {
  let s = createGame(names(n), seed, opts);
  while (s.setup) {
    const who = setupActors(s)[0];
    s = applyCommand(s, who, botCommand(s, who, rand)!);
  }
  return s;
}

function countCards(s: State): number {
  let n = s.deck.length + s.discard.length + s.store.length;
  for (const p of s.players) n += p.hand.length + p.inPlay.length;
  if (s.pending?.kind === 'kit') n += s.pending.cards.length;
  return n;
}

/** Pripravi rucne nastaveny stav: p0 je na tahu ve fazi hrani, vsichni maji prazdne ruce. */
function setup(n: number, chars: Partial<Record<number, CharKey>> = {}, roles?: Role[], opts: Partial<Options> = {}): State {
  const s = started(n, 1, Math.random, opts);
  s.pending = null; s.queue = []; s.store = [];
  const all: Card[] = [...s.deck, ...s.discard];
  for (const p of s.players) { all.push(...p.hand, ...p.inPlay); p.hand = []; p.inPlay = []; }
  s.deck = all.sort((a, b) => a.id - b.id); s.discard = [];
  s.players.forEach((p, i) => {
    p.character = chars[i] ?? 'willythekid';
    p.role = roles?.[i] ?? (i === 0 ? 'sceriffo' : i === 1 ? 'rinnegato' : 'fuorilegge');
    p.hp = p.maxHp = 4; p.alive = true;
  });
  s.turn = { player: 'p0', phase: 'play', bangs: 0, skipped: false, goldPan: 0, raddie: 0, luzena: false, extra: false, again: false };
  return s;
}

function giveCard(s: State, pid: string, type: CardType, where: 'hand' | 'inPlay' = 'hand', pred: (c: Card) => boolean = () => true): Card {
  const i = s.deck.findIndex(c => c.type === type && pred(c));
  const c = s.deck.splice(i, 1)[0];
  s.players.find(p => p.id === pid)![where].push(c);
  return c;
}

/** Polozi na vrch balicku kartu dane barvy (pro sejmuti). */
function stackTop(s: State, pred: (c: Card) => boolean) {
  const i = s.deck.findIndex(pred);
  s.deck.push(s.deck.splice(i, 1)[0]);
}

describe('balicek', () => {
  it('ma 80 karet, 20 od kazde barvy a spravne pocty', () => {
    const d = buildDeck();
    expect(d.length).toBe(80);
    for (const suit of ['hearts', 'diamonds', 'clubs', 'spades']) expect(d.filter(c => c.suit === suit).length).toBe(20);
    const count = (t: CardType) => d.filter(c => c.type === t).length;
    expect(count('bang')).toBe(25);
    expect(count('mancato')).toBe(12);
    expect(count('birra')).toBe(6);
    expect(new Set(d.map(c => c.id)).size).toBe(80);
  });
});

describe('vzdalenost', () => {
  it('pocita kratsi cestu kolem stolu, Mustang a Hledi', () => {
    const s = setup(6);
    expect(distance(s, 'p0', 'p1')).toBe(1);
    expect(distance(s, 'p0', 'p3')).toBe(3);
    expect(distance(s, 'p0', 'p5')).toBe(1);
    giveCard(s, 'p3', 'mustang', 'inPlay');
    expect(distance(s, 'p0', 'p3')).toBe(4);
    expect(distance(s, 'p3', 'p0')).toBe(3);
    giveCard(s, 'p0', 'mirino', 'inPlay');
    expect(distance(s, 'p0', 'p3')).toBe(3);
    expect(distance(s, 'p0', 'p1')).toBe(1);
  });
  it('mrtvi hraci se nepocitaji', () => {
    const s = setup(5);
    expect(distance(s, 'p0', 'p2')).toBe(2);
    s.players[1].alive = false;
    expect(distance(s, 'p0', 'p2')).toBe(1);
  });
});

describe('BANG! a Vedle!', () => {
  it('zasah ubere zivot, Vedle! ho zrusi', () => {
    let s = setup(4);
    const b = giveCard(s, 'p0', 'bang');
    s = applyCommand(s, 'p0', { type: 'play', cardId: b.id, target: 'p1' });
    expect(s.players[1].hp).toBe(3);

    s = setup(4);
    const b2 = giveCard(s, 'p0', 'bang');
    const m = giveCard(s, 'p1', 'mancato');
    s = applyCommand(s, 'p0', { type: 'play', cardId: b2.id, target: 'p1' });
    expect(s.pending?.kind).toBe('bang');
    expect(() => applyCommand(s, 'p0', { type: 'endTurn' })).toThrow(RuleError);
    s = applyCommand(s, 'p1', { type: 'respond', cardId: m.id });
    expect(s.players[1].hp).toBe(4);
    expect(s.pending).toBeNull();
  });
  it('jen jeden BANG! za tah, mimo dostrel nelze', () => {
    let s = setup(5, { 0: 'bartcassidy' });
    const b1 = giveCard(s, 'p0', 'bang');
    const b2 = giveCard(s, 'p0', 'bang');
    expect(() => applyCommand(s, 'p0', { type: 'play', cardId: b1.id, target: 'p2' })).toThrow(RuleError);
    s = applyCommand(s, 'p0', { type: 'play', cardId: b1.id, target: 'p1' });
    expect(() => applyCommand(s, 'p0', { type: 'play', cardId: b2.id, target: 'p1' })).toThrow(RuleError);
  });
  it('Slab the Killer: uspesny Barel + jedno Vedle! (FAQ Q02)', () => {
    let s = setup(4, { 0: 'slab' });
    const b = giveCard(s, 'p0', 'bang');
    giveCard(s, 'p1', 'barile', 'inPlay');
    const m = giveCard(s, 'p1', 'mancato');
    stackTop(s, c => c.suit === 'hearts');
    s = applyCommand(s, 'p0', { type: 'play', cardId: b.id, target: 'p1' });
    expect(s.pending).toMatchObject({ kind: 'bang', needed: 1 });
    s = applyCommand(s, 'p1', { type: 'respond', cardId: m.id });
    expect(s.players[1].hp).toBe(4);
  });
  it('Slab the Killer: bez Barelu jedno Vedle! nestaci', () => {
    let s = setup(4, { 0: 'slab' });
    const b = giveCard(s, 'p0', 'bang');
    giveCard(s, 'p1', 'mancato');
    s = applyCommand(s, 'p0', { type: 'play', cardId: b.id, target: 'p1' });
    expect(s.players[1].hp).toBe(3);
    expect(s.players[1].hand.length).toBe(1);
  });
});

describe('smrt, odmeny a konec hry', () => {
  it('Kulomet: zabiti se pripisuje hraci, odmena 3 karty (FAQ Q05)', () => {
    let s = setup(4);
    s.players[2].hp = 1;
    const g = giveCard(s, 'p0', 'gatling');
    s = applyCommand(s, 'p0', { type: 'play', cardId: g.id });
    expect(s.players[2].alive).toBe(false);
    expect(s.players[0].hand.length).toBe(3);
  });
  it('Pivo zachrani pri smrtelnem zasahu, Saloon ne (FAQ Q10)', () => {
    let s = setup(4);
    s.players[1].hp = 1;
    const b = giveCard(s, 'p0', 'bang');
    const beer = giveCard(s, 'p1', 'birra');
    giveCard(s, 'p1', 'saloon');
    s = applyCommand(s, 'p0', { type: 'play', cardId: b.id, target: 'p1' });
    expect(s.pending?.kind).toBe('lethal');
    expect(viewFor(s, 'p1').eligible).toEqual([beer.id]);
    s = applyCommand(s, 'p1', { type: 'respond', cardId: beer.id });
    expect(s.players[1].alive).toBe(true);
    expect(s.players[1].hp).toBe(1);
  });
  it('Serif zabije pomocnika: odhodi vsechny karty', () => {
    let s = setup(5, {}, ['sceriffo', 'vice', 'fuorilegge', 'fuorilegge', 'rinnegato']);
    s.players[1].hp = 1;
    const b = giveCard(s, 'p0', 'bang');
    giveCard(s, 'p0', 'birra');
    giveCard(s, 'p0', 'mustang', 'inPlay');
    s = applyCommand(s, 'p0', { type: 'play', cardId: b.id, target: 'p1' });
    expect(s.players[1].alive).toBe(false);
    expect(s.players[0].hand.length + s.players[0].inPlay.length).toBe(0);
  });
  it('smrt Serifa: vyhrava Bandita, Odpadlik jen kdyz zbyl sam', () => {
    let s = setup(4, {}, ['fuorilegge', 'sceriffo', 'rinnegato', 'fuorilegge']);
    s.players[1].hp = 1;
    const b = giveCard(s, 'p0', 'bang');
    s = applyCommand(s, 'p0', { type: 'play', cardId: b.id, target: 'p1' });
    expect(s.winner).toBe('fuorilegge');

    s = setup(4, {}, ['rinnegato', 'sceriffo', 'fuorilegge', 'fuorilegge']);
    s.players[1].hp = 1; s.players[2].alive = false; s.players[3].alive = false;
    const b2 = giveCard(s, 'p0', 'bang');
    s = applyCommand(s, 'p0', { type: 'play', cardId: b2.id, target: 'p1' });
    expect(s.winner).toBe('rinnegato');
  });
});

describe('ostatni karty', () => {
  it('Duel: BANG! z duelu se nepocita do limitu (FAQ Q06)', () => {
    let s = setup(4, { 0: 'bartcassidy' });
    const d = giveCard(s, 'p0', 'duello');
    const b1 = giveCard(s, 'p0', 'bang');
    const b2 = giveCard(s, 'p0', 'bang');
    const b3 = giveCard(s, 'p2', 'bang');
    s = applyCommand(s, 'p0', { type: 'play', cardId: d.id, target: 'p2' });
    s = applyCommand(s, 'p2', { type: 'respond', cardId: b3.id });
    s = applyCommand(s, 'p0', { type: 'respond', cardId: b1.id });
    expect(s.players[2].hp).toBe(3);
    s = applyCommand(s, 'p0', { type: 'play', cardId: b2.id, target: 'p1' });
    expect(s.players[1].hp).toBe(3);
  });
  it('Panika! nebere ohled na zbran (FAQ Q04)', () => {
    const s = setup(6);
    giveCard(s, 'p0', 'winchester', 'inPlay');
    giveCard(s, 'p2', 'barile', 'inPlay');
    const pan = giveCard(s, 'p0', 'panico');
    expect(() => applyCommand(s, 'p0', { type: 'play', cardId: pan.id, target: 'p2', pick: 'hand' })).toThrow(RuleError);
  });
  it('Vezeni nejde na Serifa, Dynamit vybuchne na pikach 2-9', () => {
    let s = setup(4);
    const j = giveCard(s, 'p1', 'prigione');
    s.turn.player = 'p1';
    expect(() => applyCommand(s, 'p1', { type: 'play', cardId: j.id, target: 'p0' })).toThrow(RuleError);

    s = setup(4);
    giveCard(s, 'p1', 'dinamite', 'inPlay');
    stackTop(s, c => c.suit === 'spades' && c.rank === 5);
    s = applyCommand(s, 'p0', { type: 'endTurn' });
    expect(s.players[1].hp).toBe(1);
    expect(s.turn.player).toBe('p1');
  });
  it('konec tahu: odhazuje se presne nad limit (FAQ Q12)', () => {
    let s = setup(4);
    s.players[0].hp = 2;
    const cs = [giveCard(s, 'p0', 'mancato'), giveCard(s, 'p0', 'mancato'), giveCard(s, 'p0', 'mancato')];
    s = applyCommand(s, 'p0', { type: 'endTurn' });
    expect(s.pending).toMatchObject({ kind: 'discard', count: 1 });
    expect(() => applyCommand(s, 'p0', { type: 'discard', cardIds: [cs[0].id, cs[1].id] })).toThrow(RuleError);
    s = applyCommand(s, 'p0', { type: 'discard', cardIds: [cs[0].id] });
    expect(s.turn.player).toBe('p1');
  });
});

describe('vyber rol a postav', () => {
  it('kazdy si berie jednu rolu, obsadenu kartu nejde vziat druhykrat', () => {
    let s = createGame(names(4), 3);
    expect(s.setup?.phase).toBe('roles');
    expect(actor(s)).toBeNull();
    s = applyCommand(s, 'p1', { type: 'pickRole', slot: 2 });
    expect(() => applyCommand(s, 'p2', { type: 'pickRole', slot: 2 })).toThrow(RuleError);
    expect(() => applyCommand(s, 'p1', { type: 'pickRole', slot: 0 })).toThrow(RuleError);
    s = applyCommand(s, 'p0', { type: 'pickRole', slot: 0 });
    s = applyCommand(s, 'p2', { type: 'pickRole', slot: 1 });
    s = applyCommand(s, 'p3', { type: 'pickRole', slot: 3 });
    expect(s.setup?.phase).toBe('chars');
    expect(new Set(s.players.map(p => p.role)).has('sceriffo')).toBe(true);
  });
  it('postavy: presne 2 otocene, vyber len z nich, potom sa rozda a zacina Serif', () => {
    let s = createGame(names(4), 5);
    for (let i = 0; i < 4; i++) s = applyCommand(s, `p${i}`, { type: 'pickRole', slot: i });
    s = applyCommand(s, 'p0', { type: 'pickChar', slot: 0 });
    expect(() => applyCommand(s, 'p0', { type: 'chooseChar', ch: s.setup!.chars[0].ch })).toThrow(RuleError);
    s = applyCommand(s, 'p0', { type: 'pickChar', slot: 1 });
    expect(() => applyCommand(s, 'p0', { type: 'pickChar', slot: 2 })).toThrow(RuleError);
    expect(() => applyCommand(s, 'p1', { type: 'pickChar', slot: 1 })).toThrow(RuleError);
    expect(() => applyCommand(s, 'p0', { type: 'chooseChar', ch: s.setup!.chars[5].ch })).toThrow(RuleError);
    const want = s.setup!.chars[1].ch;
    s = applyCommand(s, 'p0', { type: 'chooseChar', ch: want });
    for (let i = 1; i < 4; i++) {
      s = applyCommand(s, `p${i}`, { type: 'pickChar', slot: 2 * i });
      s = applyCommand(s, `p${i}`, { type: 'pickChar', slot: 2 * i + 1 });
      s = applyCommand(s, `p${i}`, { type: 'chooseChar', ch: s.setup!.chars[2 * i].ch });
    }
    expect(s.setup).toBeNull();
    expect(s.players[0].character).toBe(want);
    const sheriff = s.players.find(p => p.role === 'sceriffo')!;
    expect(s.turn.player).toBe(sheriff.id);
    expect(sheriff.maxHp).toBeGreaterThan(0);
    expect(countCards(s)).toBe(80);
  });
  it('pohlad pocas vyberu neprezradi cudzie roly ani postavy', () => {
    let s = createGame(names(5), 9);
    for (let i = 0; i < 5; i++) s = applyCommand(s, `p${i}`, { type: 'pickRole', slot: i });
    s = applyCommand(s, 'p1', { type: 'pickChar', slot: 4 });
    const v = setupViewFor(s, 'p0');
    for (let i = 0; i < 5; i++) {
      const r = v.roles[i];
      expect(r.role === null || r.taken === 'p0' || r.role === 'sceriffo').toBe(true);
    }
    expect(v.chars[4]).toEqual({ taken: 'p1', ch: null });
    expect(setupViewFor(s, 'p1').chars[4].ch).toBe(s.setup!.chars[4].ch);
  });
});

describe('Panika! a Cat Balou z ruky', () => {
  it('obet si zoradi karty, utocnik vyberie podla poradia', () => {
    let s = setup(4);
    const pan = giveCard(s, 'p0', 'panico');
    const a = giveCard(s, 'p1', 'mancato');
    const b = giveCard(s, 'p1', 'birra');
    const c = giveCard(s, 'p1', 'bang');
    s = applyCommand(s, 'p0', { type: 'play', cardId: pan.id, target: 'p1', pick: 'hand' });
    expect(s.pending).toMatchObject({ kind: 'arrange', player: 'p1' });
    expect(() => applyCommand(s, 'p1', { type: 'arrange', order: [a.id, b.id] })).toThrow(RuleError);
    s = applyCommand(s, 'p1', { type: 'arrange', order: [c.id, a.id, b.id] });
    expect(s.pending).toMatchObject({ kind: 'steal', player: 'p0', victim: 'p1' });
    const v = viewFor(s, 'p0');
    expect(v.pending?.count).toBe(3);
    expect(JSON.stringify(v)).not.toContain(`"id":${b.id},`);
    s = applyCommand(s, 'p0', { type: 'steal', index: 2 });
    expect(s.players[0].hand.map(x => x.id)).toContain(b.id);
    expect(s.players[1].hand.map(x => x.id)).toEqual([c.id, a.id]);
  });
  it('Cat Balou: vybrana karta ide do odhadzovacieho balika, pri 1 karte bez miesania', () => {
    let s = setup(4);
    const cb = giveCard(s, 'p0', 'catbalou');
    const only = giveCard(s, 'p2', 'birra');
    s = applyCommand(s, 'p0', { type: 'play', cardId: cb.id, target: 'p2', pick: 'hand' });
    expect(s.pending).toBeNull();
    expect(s.discard.map(x => x.id)).toContain(only.id);
  });
});

describe('El Gringo', () => {
  it('pri výstrele čaká na obranu a po úspešnom Vedľa! si kartu neberie', () => {
    let s = setup(4, { 1: 'elgringo' });
    const shot = giveCard(s, 'p0', 'bang');
    const beer = giveCard(s, 'p0', 'birra');
    const missed = giveCard(s, 'p1', 'mancato');
    const hp = s.players[1].hp;

    s = applyCommand(s, 'p0', { type: 'play', cardId: shot.id, target: 'p1' });
    expect(s.pending).toMatchObject({ kind: 'bang', player: 'p1' });
    expect(() => applyCommand(s, 'p1', { type: 'steal', index: 0 })).toThrow(RuleError);

    s = applyCommand(s, 'p1', { type: 'respond', cardId: missed.id });
    expect(s.pending).toBeNull();
    expect(s.players[1].hp).toBe(hp);
    expect(s.players[1].hand).toEqual([]);
    expect(s.players[0].hand).toEqual([beer]);
  });

  it('po zásahu vyberá zakrytú kartu iba z ruky útočníka, potom pokračuje Guľomet', () => {
    let s = setup(4, { 1: 'elgringo' });
    const gatling = giveCard(s, 'p0', 'gatling');
    const beer = giveCard(s, 'p0', 'birra');
    const bang = giveCard(s, 'p0', 'bang');
    const scope = giveCard(s, 'p0', 'mirino', 'inPlay');
    s = applyCommand(s, 'p0', { type: 'play', cardId: gatling.id });
    expect(s.players[1].hp).toBe(3);
    expect(s.players[1].hand).toEqual([]);
    expect(s.players[2].hp).toBe(4);
    expect(s.pending).toMatchObject({ kind: 'arrange', player: 'p0', src: 'p1', card: 'elgringo' });
    expect(() => applyCommand(s, 'p0', { type: 'arrange', order: [scope.id, bang.id] })).toThrow(RuleError);
    s = applyCommand(s, 'p0', { type: 'arrange', order: [bang.id, beer.id] });
    const v = viewFor(s, 'p1');
    expect(v.pending).toMatchObject({ kind: 'steal', player: 'p1', victim: 'p0', card: 'elgringo', count: 2 });
    expect(JSON.stringify(v)).not.toContain(`"id":${beer.id},`);
    expect(() => applyCommand(s, 'p1', { type: 'steal', index: 2 })).toThrow(RuleError);
    s = applyCommand(s, 'p1', { type: 'steal', index: 1 });
    expect(s.players[1].hand).toEqual([beer]);
    expect(s.players[0].hand).toEqual([bang]);
    expect(s.players[0].inPlay).toEqual([scope]);
    expect(s.players[2].hp).toBe(3);
    expect(s.pending).toBeNull();
  });

  it('aj jedinú kartu berie až po výbere', () => {
    let s = setup(4, { 1: 'elgringo' });
    const shot = giveCard(s, 'p0', 'bang');
    const beer = giveCard(s, 'p0', 'birra');
    s = applyCommand(s, 'p0', { type: 'play', cardId: shot.id, target: 'p1' });
    expect(viewFor(s, 'p1').pending).toMatchObject({ kind: 'steal', count: 1 });
    expect(s.players[0].hand).toEqual([beer]);
    s = applyCommand(s, 'p1', { type: 'steal', index: 0 });
    expect(s.players[1].hand).toEqual([beer]);
    expect(s.pending).toBeNull();
  });

  it('pri prázdnej ruke preskočí výber aj keď má útočník vyloženú kartu', () => {
    let s = setup(4, { 1: 'elgringo' });
    const shot = giveCard(s, 'p0', 'bang');
    const scope = giveCard(s, 'p0', 'mirino', 'inPlay');
    s = applyCommand(s, 'p0', { type: 'play', cardId: shot.id, target: 'p1' });
    expect(s.pending).toBeNull();
    expect(s.players[1].hand).toEqual([]);
    expect(s.players[0].inPlay).toEqual([scope]);
  });

  it('za každý stratený život umožní jeden výber zo zostávajúcich kariet', () => {
    let s = setup(4, { 1: 'elgringo' });
    const a = giveCard(s, 'p0', 'bang');
    const b = giveCard(s, 'p0', 'bang');
    const c = giveCard(s, 'p0', 'bang');
    s.queue.push({ t: 'damage', target: 'p1', amount: 2, src: 'p0' });
    const draw = giveCard(s, 'p0', 'diligenza');
    s = applyCommand(s, 'p0', { type: 'play', cardId: draw.id });
    s = applyCommand(s, 'p0', { type: 'arrange', order: s.players[0].hand.map(card => card.id) });
    s = applyCommand(s, 'p1', { type: 'steal', index: 1 });
    s = applyCommand(s, 'p1', { type: 'steal', index: 1 });
    expect(s.players[1].hand).toEqual([b, c]);
    expect(s.players[0].hand).toContainEqual(a);
    expect(s.pending).toBeNull();
  });
});

describe('skryte informace', () => {
  it('pohled hrace neobsahuje cizi role ani karty', () => {
    const s = started(5, 7);
    for (const p of s.players) {
      const v = viewFor(s, p.id);
      const json = JSON.stringify(v);
      for (const o of s.players) {
        if (o.id === p.id) continue;
        const pv = v.players.find(x => x.id === o.id)!;
        expect(pv.role).toBe(o.role === 'sceriffo' ? 'sceriffo' : null);
        expect((pv as any).hand).toBeUndefined();
      }
      expect(json).not.toContain('"deck"');
      expect(json).not.toContain('"rng"');
    }
  });
});

describe('fuzz: nahodne partie', () => {
  it('500 partii dohraje do konce bez chyby a zadna karta se neztrati', () => {
    let finished = 0;
    for (let g = 0; g < 500; g++) {
      let seed = g * 7919 + 13;
      const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      let s = started(4 + (g % 4), g + 1, rand);
      for (let step = 0; step < 6000 && !s.winner; step++) {
        const who = actor(s)!;
        const cmd = botCommand(s, who, rand);
        expect(cmd, `hra ${g} krok ${step}: bot nema tah`).not.toBeNull();
        s = applyCommand(s, who, cmd!);
        expect(countCards(s), `hra ${g} krok ${step}`).toBe(80);
        for (const p of s.players) if (p.alive) {
          const dying = s.pending?.kind === 'lethal' && s.pending.player === p.id;
          if (!dying) expect(p.hp, `hra ${g} krok ${step}`).toBeGreaterThan(0);
          expect(p.hp).toBeLessThanOrEqual(p.maxHp);
        }
      }
      if (s.winner) finished++;
    }
    expect(finished).toBe(500);
  });
});

// ---------- Gold Rush ----------

const GR = { goldRush: true };
const pl = (s: State, id: string) => s.players.find(p => p.id === id)!;
const countEquip = (s: State) => s.equipDeck.length + s.equipUsed.length + s.shop.length
  + s.players.reduce((n, p) => n + p.equip.length, 0) + (s.pending?.kind === 'josh' ? 1 : 0);
/** Da do ponuky kartu daneho typu (vymeni ju s prvou kartou ponuky). */
function offer(s: State, type: EquipType) {
  let i = s.shop.findIndex(e => e.type === type);
  if (i < 0) {
    const pool = s.equipDeck.findIndex(e => e.type === type) >= 0 ? s.equipDeck : s.equipUsed;
    const j = pool.findIndex(e => e.type === type);
    const c = pool.splice(j, 1)[0];
    pool.push(s.shop[0]); s.shop[0] = c; i = 0;
  }
  return s.shop[i];
}
function giveEquip(s: State, pid: string, type: EquipType) {
  const c = offer(s, type);
  s.shop.splice(s.shop.indexOf(c), 1);
  s.shop.push(s.equipDeck.pop()!);
  pl(s, pid).equip.push(c);
}

describe('Gold Rush', () => {
  it('balik vybavenia ma 24 kariet, ponuka 3, postav je 24', () => {
    const s = started(5, 3, Math.random, GR);
    expect(countEquip(s)).toBe(24);
    expect(s.shop.length).toBe(3);
    expect(Object.values(EQUIP).reduce((n, e) => n + e.count, 0)).toBe(24);
    const base = createGame(names(4), 1);
    expect(base.setup!.chars.length).toBe(16);
    expect(base.setup!.chars.some(c => GR_CHARS.includes(c.ch))).toBe(false);
    expect(createGame(names(4), 1, GR).setup!.chars.length).toBe(24);
  });

  it('za kazdy zobrany zivot je nuget, Gulomet da nuget za kazdy zasah', () => {
    let s = setup(4, {}, undefined, GR);
    const g = giveCard(s, 'p0', 'gatling');
    s = applyCommand(s, 'p0', { type: 'play', cardId: g.id });
    expect(pl(s, 'p0').gold).toBe(3);
    expect(s.players.slice(1).every(p => p.hp === 3)).toBe(true);
  });

  it('v hre je len 30 nugetov: z prazdnej kopky sa neda brat, zaplatene sa vracaju', () => {
    let s = setup(4, {}, undefined, GR);
    pl(s, 'p1').gold = NUGGETS - 1;
    expect(heapLeft(s)).toBe(1);
    const g = giveCard(s, 'p0', 'gatling');
    s = applyCommand(s, 'p0', { type: 'play', cardId: g.id });
    expect(pl(s, 'p0').gold).toBe(1); // tri zasahy, ale na kopke bol len jeden
    expect(heapLeft(s)).toBe(0);
    const b = giveCard(s, 'p0', 'birra');
    expect(viewFor(s, 'p0').beerGold).toEqual([]);
    expect(() => applyCommand(s, 'p0', { type: 'play', cardId: b.id, gold: true })).toThrow(RuleError);
    s = applyCommand(s, 'p0', { type: 'endTurn' });
    while (s.pending) s = applyCommand(s, s.pending.player, botCommand(s, s.pending.player)!);
    const c = offer(s, 'cinturone');
    s = applyCommand(s, 'p1', { type: 'buy', equipId: c.id });
    expect(heapLeft(s)).toBe(2);
  });

  it('bez rozsirenia sa nugety nerozdavaju a kupit sa neda', () => {
    let s = setup(4);
    const b = giveCard(s, 'p0', 'bang');
    s = applyCommand(s, 'p0', { type: 'play', cardId: b.id, target: 'p1' });
    expect(pl(s, 'p0').gold).toBe(0);
    expect(() => applyCommand(s, 'p0', { type: 'buy', equipId: 201 })).toThrow(RuleError);
  });

  it('nakup: cierna karta ostava vylozena, ponuka sa doplni, duplicitu nekupis', () => {
    let s = setup(4, {}, undefined, GR);
    pl(s, 'p0').gold = 10;
    const c = offer(s, 'stivali');
    s = applyCommand(s, 'p0', { type: 'buy', equipId: c.id });
    expect(pl(s, 'p0').gold).toBe(7);
    expect(pl(s, 'p0').equip.map(e => e.type)).toEqual(['stivali']);
    expect(s.shop.length).toBe(3);
    expect(countEquip(s)).toBe(24);
    expect(() => applyCommand(s, 'p0', { type: 'buy', equipId: 999 })).toThrow(RuleError);
    pl(s, 'p0').gold = 0;
    expect(() => applyCommand(s, 'p0', { type: 'buy', equipId: s.shop[0].id })).toThrow(RuleError);
  });

  it('Cizmy a Talizman: karta a nuget za strateny zivot', () => {
    let s = setup(4, {}, undefined, GR);
    giveEquip(s, 'p1', 'stivali'); giveEquip(s, 'p1', 'talismano');
    const b = giveCard(s, 'p0', 'bang');
    s = applyCommand(s, 'p0', { type: 'play', cardId: b.id, target: 'p1' });
    expect(pl(s, 'p1').hand.length).toBe(1);
    expect(pl(s, 'p1').gold).toBe(1);
  });

  it('Flasa ako BANG! sa nerata do limitu, Panak lieci', () => {
    let s = setup(4, {}, undefined, GR);
    pl(s, 'p0').gold = 5; pl(s, 'p0').character = 'bartcassidy';
    const b = giveCard(s, 'p0', 'bang');
    s = applyCommand(s, 'p0', { type: 'play', cardId: b.id, target: 'p1' });
    const f = offer(s, 'bottiglia');
    s = applyCommand(s, 'p0', { type: 'buy', equipId: f.id, as: 'bang', target: 'p1' });
    expect(pl(s, 'p1').hp).toBe(2);
    expect(s.turn.bangs).toBe(1);
    const sh = offer(s, 'bicchierino');
    s = applyCommand(s, 'p0', { type: 'buy', equipId: sh.id, target: 'p1' });
    expect(pl(s, 'p1').hp).toBe(3);
    expect(countEquip(s)).toBe(24);
  });

  it('Pivo za nuget a Madam Yto', () => {
    let s = setup(4, { 2: 'madame_yto' }, undefined, GR);
    const b = giveCard(s, 'p0', 'birra');
    s = applyCommand(s, 'p0', { type: 'play', cardId: b.id, gold: true });
    expect(pl(s, 'p0').gold).toBe(1);
    expect(pl(s, 'p0').hp).toBe(4);
    expect(pl(s, 'p2').hand.length).toBe(1);
  });

  it('odhodenie cudzieho vybavenia stoji cenu + 1', () => {
    let s = setup(4, {}, undefined, GR);
    giveEquip(s, 'p2', 'ferro_di_cavallo');
    pl(s, 'p0').gold = 2;
    const id = pl(s, 'p2').equip[0].id;
    expect(() => applyCommand(s, 'p0', { type: 'scrap', target: 'p2', equipId: id })).toThrow(RuleError);
    pl(s, 'p0').gold = 3;
    s = applyCommand(s, 'p0', { type: 'scrap', target: 'p2', equipId: id });
    expect(pl(s, 'p2').equip.length).toBe(0);
    expect(pl(s, 'p0').gold).toBe(0);
  });

  it('Panika a Cat Balou na vybavenie nedosiahnu', () => {
    let s = setup(4, {}, undefined, GR);
    giveEquip(s, 'p1', 'zaino');
    const c = giveCard(s, 'p0', 'catbalou');
    expect(viewFor(s, 'p0').playable[c.id]).toBeUndefined();
  });

  it('Kalumet: karova karta nema ucinok, okrem Duelu', () => {
    let s = setup(4, {}, undefined, GR);
    giveEquip(s, 'p1', 'calumet');
    const d = giveCard(s, 'p0', 'bang', 'hand', c => c.suit === 'diamonds');
    const h = giveCard(s, 'p0', 'bang', 'hand', c => c.suit === 'hearts');
    const duel = giveCard(s, 'p0', 'duello', 'hand', c => c.suit === 'diamonds');
    const v = viewFor(s, 'p0');
    expect(v.playable[d.id]).not.toContain('p1');
    expect(v.playable[h.id]).toContain('p1');
    expect(v.playable[duel.id]).toContain('p1');
    const ind = giveCard(s, 'p0', 'indiani');
    s = applyCommand(s, 'p0', { type: 'play', cardId: ind.id });
    expect(pl(s, 'p1').hp).toBe(4);
    expect(pl(s, 'p2').hp).toBe(3);
  });

  it('Hladany: odmena 2 karty a nuget', () => {
    let s = setup(5, {}, ['sceriffo', 'vice', 'fuorilegge', 'fuorilegge', 'rinnegato'], GR);
    pl(s, 'p0').gold = 2;
    const w = offer(s, 'ricercato');
    s = applyCommand(s, 'p0', { type: 'buy', equipId: w.id, target: 'p4' });
    expect(pl(s, 'p4').equip.length).toBe(1);
    pl(s, 'p4').hp = 1;
    const b = giveCard(s, 'p0', 'bang');
    s = applyCommand(s, 'p0', { type: 'play', cardId: b.id, target: 'p4' });
    expect(pl(s, 'p4').alive).toBe(false);
    expect(pl(s, 'p0').hand.length).toBe(2);
    expect(pl(s, 'p0').gold).toBe(2); // 1 za zasah + 1 odmena
    expect(countEquip(s)).toBe(24);
  });

  it('Batoh zachrani pri smrtelnom zasahu', () => {
    let s = setup(4, {}, undefined, GR);
    giveEquip(s, 'p1', 'zaino');
    pl(s, 'p1').gold = 2; pl(s, 'p1').hp = 1;
    const b = giveCard(s, 'p0', 'bang');
    s = applyCommand(s, 'p0', { type: 'play', cardId: b.id, target: 'p1' });
    expect(s.pending?.kind).toBe('lethal');
    expect(abilitiesFor(s, 'p1').map(a => a.name)).toEqual(['zaino']);
    s = applyCommand(s, 'p1', { type: 'ability', name: 'zaino' });
    expect(pl(s, 'p1').alive).toBe(true);
    expect(pl(s, 'p1').hp).toBe(1);
    expect(pl(s, 'p1').gold).toBe(0);
  });

  it('Opasok dvihne limit ruky na 8, Krompac prida kartu', () => {
    let s = setup(4, {}, undefined, GR);
    giveEquip(s, 'p0', 'cinturone'); giveEquip(s, 'p1', 'piccone');
    for (let i = 0; i < 8; i++) giveCard(s, 'p0', 'mancato');
    s = applyCommand(s, 'p0', { type: 'endTurn' });
    expect(s.turn.player).toBe('p1');
    expect(pl(s, 'p0').hand.length).toBe(8);
    expect(pl(s, 'p1').hand.length).toBe(3);
  });

  it('Zlata horucka: vylieci a hrac hra znova', () => {
    let s = setup(4, {}, undefined, GR);
    pl(s, 'p0').gold = 5; pl(s, 'p0').hp = 1;
    const c = offer(s, 'corsa_all_oro');
    s = applyCommand(s, 'p0', { type: 'buy', equipId: c.id });
    expect(s.turn.player).toBe('p0');
    expect(pl(s, 'p0').hp).toBe(4);
    expect(pl(s, 'p0').hand.length).toBe(2);
  });

  it('postavy: Dutch Will, Raddie Snake, Jacky Murieta, Pretty Luzena, Simeon Picos, Josh McCloud', () => {
    let s = setup(4, { 1: 'dutch_will' }, undefined, GR);
    s = applyCommand(s, 'p0', { type: 'endTurn' });
    expect(s.pending?.kind).toBe('dutch');
    const v = viewFor(s, 'p1');
    s = applyCommand(s, 'p1', { type: 'discard', cardIds: [v.pending!.cards![0].id] });
    expect(pl(s, 'p1').hand.length).toBe(1);
    expect(pl(s, 'p1').gold).toBe(1);

    s = setup(4, { 0: 'raddie_snake' }, undefined, GR);
    pl(s, 'p0').gold = 3;
    s = applyCommand(s, 'p0', { type: 'ability', name: 'raddie' });
    s = applyCommand(s, 'p0', { type: 'ability', name: 'raddie' });
    expect(pl(s, 'p0').hand.length).toBe(2);
    expect(() => applyCommand(s, 'p0', { type: 'ability', name: 'raddie' })).toThrow(RuleError);

    s = setup(4, { 0: 'jacky_murieta', 1: 'simeon_picos' }, undefined, GR);
    pl(s, 'p0').gold = 2;
    s = applyCommand(s, 'p0', { type: 'ability', name: 'jacky', target: 'p1' });
    expect(pl(s, 'p1').hp).toBe(3);
    expect(pl(s, 'p1').gold).toBe(1);
    expect(pl(s, 'p0').gold).toBe(1);

    s = setup(4, { 0: 'pretty_luzena' }, undefined, GR);
    pl(s, 'p0').gold = 3; pl(s, 'p0').hp = 2;
    const a = offer(s, 'bicchierino');
    s = applyCommand(s, 'p0', { type: 'buy', equipId: a.id, target: 'p0' });
    expect(pl(s, 'p0').gold).toBe(3); // cena 1 - 1 = zadarmo
    const b2 = offer(s, 'bicchierino');
    s = applyCommand(s, 'p0', { type: 'buy', equipId: b2.id, target: 'p0' });
    expect(pl(s, 'p0').gold).toBe(2);

    s = setup(4, { 0: 'josh_mccloud' }, undefined, GR);
    pl(s, 'p0').gold = 2;
    s.equipDeck.push(s.equipDeck.splice(s.equipDeck.findIndex(e => e.type === 'union_pacific' || e.type === 'stivali' || e.type === 'talismano'), 1)[0]);
    s = applyCommand(s, 'p0', { type: 'ability', name: 'josh' });
    expect(s.pending?.kind).toBe('josh');
    s = applyCommand(s, 'p0', { type: 'equipUse' });
    expect(s.pending).toBeNull();
    expect(countEquip(s)).toBe(24);
  });

  it('Don Bell: srdce na konci tahu = tah navyse, ale len raz', () => {
    let s = setup(4, { 0: 'don_bell' }, undefined, GR);
    stackTop(s, c => c.suit === 'hearts');
    s = applyCommand(s, 'p0', { type: 'endTurn' });
    expect(s.turn.player).toBe('p0');
    expect(s.turn.extra).toBe(true);
    stackTop(s, c => c.suit === 'hearts');
    s = applyCommand(s, 'p0', { type: 'endTurn' });
    expect(s.turn.player).toBe('p1');
  });
});

describe('Tienovi pistolnici', () => {
  const SH = { goldRush: true, shadows: true };
  it('vyradeny hrac sa vracia na svoj tah ako tien, neda sa zranit a po tahu zmizne', () => {
    let s = setup(5, {}, ['sceriffo', 'vice', 'fuorilegge', 'fuorilegge', 'rinnegato'], SH);
    pl(s, 'p1').hp = 1;
    const b = giveCard(s, 'p0', 'bang');
    s = applyCommand(s, 'p0', { type: 'play', cardId: b.id, target: 'p1' });
    expect(pl(s, 'p1').alive).toBe(false);
    s = applyCommand(s, 'p0', { type: 'endTurn' });
    expect(s.turn.player).toBe('p1');
    const g = pl(s, 'p1');
    expect([g.alive, g.ghost, g.hp, g.hand.length]).toEqual([true, true, 0, 2]);
    expect(viewFor(s, 'p2').players[1].role).toBe('vice');
    s = applyCommand(s, 'p1', { type: 'endTurn' });
    expect(pl(s, 'p1').alive).toBe(false);
    expect(pl(s, 'p1').hand.length).toBe(0);
    expect(s.turn.player).toBe('p2');
    expect(countCards(s)).toBe(80);
  });

  it('bez variantu sa mrtvy hrac preskakuje', () => {
    let s = setup(5, {}, ['sceriffo', 'vice', 'fuorilegge', 'fuorilegge', 'rinnegato'], GR);
    pl(s, 'p1').hp = 1;
    const b = giveCard(s, 'p0', 'bang');
    s = applyCommand(s, 'p0', { type: 'play', cardId: b.id, target: 'p1' });
    s = applyCommand(s, 'p0', { type: 'endTurn' });
    expect(s.turn.player).toBe('p2');
  });

  it('tien Odpadlika sa prida k strane s viac odkrytymi rolami a vyhrava s nou', () => {
    let s = setup(5, {}, ['sceriffo', 'rinnegato', 'fuorilegge', 'fuorilegge', 'vice'], SH);
    pl(s, 'p1').hp = 1;
    const b = giveCard(s, 'p0', 'bang');
    s = applyCommand(s, 'p0', { type: 'play', cardId: b.id, target: 'p1' });
    s = applyCommand(s, 'p0', { type: 'endTurn' });
    expect(pl(s, 'p1').side).toBe('law'); // odkryty je len Serif
    s = applyCommand(s, 'p1', { type: 'endTurn' });
    pl(s, 'p2').hp = 0; pl(s, 'p2').alive = false; pl(s, 'p2').dead = true;
    pl(s, 'p3').hp = 0; pl(s, 'p3').alive = false; pl(s, 'p3').dead = true;
    s.winner = 'sceriffo';
    expect(didWin(s, pl(s, 'p1'))).toBe(true);
    expect(didWin(s, pl(s, 'p2'))).toBe(false);
  });
});

describe('fuzz: Gold Rush a tiene', () => {
  for (const [label, opts] of [['Gold Rush', { goldRush: true }], ['Gold Rush + tiene', { goldRush: true, shadows: true }], ['len tiene', { shadows: true }]] as const) {
    it(`${label}: 300 partii dohraje bez chyby, karty sa nestracaju`, () => {
      let finished = 0;
      for (let g = 0; g < 300; g++) {
        let seed = g * 104729 + 7;
        const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
        let s = started(4 + (g % 4), g + 1, rand, opts);
        for (let step = 0; step < 12000 && !s.winner; step++) {
          const who = actor(s)!;
          const cmd = botCommand(s, who, rand);
          expect(cmd, `hra ${g} krok ${step}: bot nema tah`).not.toBeNull();
          s = applyCommand(s, who, cmd!);
          expect(countCards(s), `hra ${g} krok ${step}`).toBe(80);
          if (opts.goldRush) expect(countEquip(s), `hra ${g} krok ${step}`).toBe(24);
          for (const p of s.players) {
            expect(p.gold).toBeGreaterThanOrEqual(0);
            expect(heapLeft(s)).toBeGreaterThanOrEqual(0);
            if (p.alive && !p.ghost) {
              const dying = s.pending?.kind === 'lethal' && s.pending.player === p.id;
              if (!dying) expect(p.hp, `hra ${g} krok ${step}`).toBeGreaterThan(0);
              expect(p.hp).toBeLessThanOrEqual(p.maxHp);
            }
          }
        }
        if (s.winner) finished++;
      }
      expect(finished).toBe(300);
    });
  }
});

describe('Vyradenie hraca zakladatelom a nahrada hraca', () => {
  it('pred zaciatkom hry sa vyradit neda', () => {
    const s = createGame(names(5), 3);
    expect(() => eliminate(s, 'p1')).toThrow(RuleError);
  });

  it('serifa nejde vyradit, kym je v hre bandita alebo odpadlik', () => {
    const s = setup(4);
    expect(() => eliminate(s, 'p0')).toThrow(/Šerifa/);
    const t = eliminate(s, 'p2');
    expect(t.players.find(p => p.id === 'p2')!.alive).toBe(false);
    expect(() => eliminate(t, 'p0')).toThrow(/Šerifa/);
  });

  it('vyradeny hrac zahodi karty, role sa odkryje a hra pokracuje', () => {
    const s = setup(5);
    giveCard(s, 'p3', 'bang'); giveCard(s, 'p3', 'bang', 'inPlay');
    const before = countCards(s);
    const t = eliminate(s, 'p3');
    const p = t.players.find(x => x.id === 'p3')!;
    expect(p.alive).toBe(false);
    expect(p.hand.length + p.inPlay.length).toBe(0);
    expect(countCards(t)).toBe(before);
    expect(t.version).toBe(s.version + 1);
    expect(s.players.find(x => x.id === 'p3')!.alive).toBe(true);
    expect(t.winner).toBeFalsy();
    expect(actor(t)).toBe('p0');
  });

  it('vyradenie hraca, na ktorom sa caka (zasah, ktory sa ma brat), neznehybni hru', () => {
    let s = setup(5);
    const bang = giveCard(s, 'p0', 'bang');
    giveCard(s, 'p1', 'mancato');
    s = applyCommand(s, 'p0', { type: 'play', cardId: bang.id, target: 'p1' });
    expect(s.pending).toBeTruthy();
    expect(actor(s)).toBe('p1');
    const t = eliminate(s, 'p1');
    expect(t.players.find(p => p.id === 'p1')!.alive).toBe(false);
    expect(actor(t)).not.toBe('p1');
    const who = actor(t);
    expect(who).toBeTruthy();
    expect(botCommand(t, who!, Math.random)).not.toBeNull();
  });

  it('renamePlayer premenuje hraca a zvysi verziu', () => {
    const s = setup(4);
    const t = renamePlayer(s, 'p2', 'Jozef');
    expect(t.players.find(p => p.id === 'p2')!.name).toBe('Jozef');
    expect(t.version).toBe(s.version + 1);
    expect(s.players.find(p => p.id === 'p2')!.name).toBe('Hrac2');
  });

  for (const [label, opts] of [['zaklad', {}], ['Gold Rush + tiene', { goldRush: true, shadows: true }]] as const) {
    it(`${label}: nahodne vyradenia hracov pocas hry nikdy nezlomia stav (120 partii)`, () => {
      let finished = 0, killed = 0, refused = 0;
      for (let g = 0; g < 120; g++) {
        let seed = g * 7919 + 13;
        const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
        let s = started(4 + (g % 4), g + 1, rand, opts);
        for (let step = 0; step < 12000 && !s.winner; step++) {
          if (step % 23 === 11 && rand() < 0.6) {
            const live = s.players.filter(p => p.alive || p.ghost);
            const victim = live[Math.floor(rand() * live.length)];
            try { s = eliminate(s, victim.id); killed++; } catch (e) { if (!(e instanceof RuleError)) throw e; refused++; }
            expect(countCards(s), `hra ${g} krok ${step} po vyradeni`).toBe(80);
            if (s.winner) break;
          }
          const who = actor(s)!;
          const cmd = botCommand(s, who, rand);
          expect(cmd, `hra ${g} krok ${step}: bot nema tah`).not.toBeNull();
          s = applyCommand(s, who, cmd!);
          expect(countCards(s), `hra ${g} krok ${step}`).toBe(80);
        }
        if (s.winner) finished++;
      }
      expect(finished).toBe(120);
      expect(killed).toBeGreaterThan(50);
    });
  }
});

describe('zaklad: balicek, postavy a roly podla fyzickej hry', () => {
  const R: Record<string, number> = { J: 11, Q: 12, K: 13, A: 14 };
  const rk = (s: string) => R[s] ?? Number(s);
  const range = (a: string, b: string) => Array.from({ length: rk(b) - rk(a) + 1 }, (_, i) => rk(a) + i);
  const E: Record<string, [number, number[]]> = {
    barile: [2, [12, 13]], dinamite: [1, [2]], prigione: [3, [11, 4, 10]], mustang: [2, [8, 9]], remington: [1, [13]], carabine: [1, [14]],
    schofield: [3, [11, 12, 13]], mirino: [1, [14]], volcanic: [2, [10, 10]], winchester: [1, [8]],
    bang: [25, [14, ...range('2', 'A'), ...range('2', '9'), ...range('Q', 'A')]],
    birra: [6, range('6', 'J')], catbalou: [4, [13, ...range('9', 'J')]], duello: [3, [12, 11, 8]], gatling: [1, [10]], emporio: [2, [9, 12]],
    indiani: [2, [13, 14]], mancato: [12, [...range('10', 'A'), ...range('2', '8')]], panico: [4, [11, 12, 14, 8]], saloon: [1, [5]], diligenza: [2, [9, 9]], wellsfargo: [1, [3]],
  };
  it('80 kariet, pocty a hodnoty kazdeho druhu sedia so zoznamom z fyzickeho balicka, 20 od kazdej farby', () => {
    const d = buildDeckT();
    expect(d.length).toBe(80);
    expect([...new Set(d.map(c => c.type))].sort()).toEqual(Object.keys(E).sort());
    for (const [t, [n, vals]] of Object.entries(E)) {
      const got = d.filter(c => c.type === t).map(c => c.rank).sort((a, b) => a - b);
      expect(vals.length, `${t} zoznam`).toBe(n);
      expect(got, t).toEqual([...vals].sort((a, b) => a - b));
    }
    for (const suit of ['hearts', 'diamonds', 'clubs', 'spades']) expect(d.filter(c => c.suit === suit).length, suit).toBe(20);
  });

  it('16 zakladnych postav a rozdelenie rol pre 4 az 7 hracov', () => {
    expect(BASE_CHARS.map(k => CHARACTERS[k].name).sort()).toEqual([
      'Bart Cassidy', 'Black Jack', 'Calamity Janet', 'El Gringo', 'Jesse Jones', 'Jourdonnais', 'Kit Carlson', 'Lucky Duke',
      'Paul Regret', 'Pedro Ramirez', 'Rose Doolan', 'Sid Ketchum', 'Slab the Killer', 'Suzy Lafayette', 'Vulture Sam', 'Willy the Kid',
    ]);
    const cnt = (n: number, r: Role) => ROLES_BY_COUNT[n].filter(x => x === r).length;
    expect(ROLES_BY_COUNT[7].length).toBe(7);
    expect([cnt(7, 'sceriffo'), cnt(7, 'vice'), cnt(7, 'fuorilegge'), cnt(7, 'rinnegato')]).toEqual([1, 2, 3, 1]);
    for (const n of [4, 5, 6, 7]) { expect(ROLES_BY_COUNT[n].length).toBe(n); expect(cnt(n, 'sceriffo')).toBe(1); }
  });
});

describe('Gold Rush: balicek vybavenia a postavy podla fyzickej hry', () => {
  it('24 kariet vybavenia, pocty podla zoznamu fyzickeho balicka', () => {
    const want: Record<string, number> = {
      stivali: 1, bicchierino: 3, calumet: 1, setaccio: 1, corsa_all_oro: 1, cinturone: 1, ferro_di_cavallo: 1, talismano: 1,
      complice: 3, piccone: 1, rum: 2, zaino: 1, bottiglia: 3, union_pacific: 1, ricercato: 3,
    };
    const got: Record<string, number> = {};
    for (const e of buildEquipDeck()) got[e.type] = (got[e.type] ?? 0) + 1;
    expect(got).toEqual(want);
    expect(buildEquipDeck().length).toBe(24);
  });

  it('8 postav rozsirenia', () => {
    expect(GR_CHARS.map(k => CHARACTERS[k].name).sort()).toEqual(
      ['Don Bell', 'Dutch Will', 'Jacky Murieta', 'Josh McCloud', 'Madam Yto', 'Pretty Luzena', 'Raddie Snake', 'Simeon Picos'].sort());
  });
});

describe('Jesse Jones: prvá karta z ruky hráča', () => {
  function jesseTurn(handOfP1: CardType[]) {
    const s0 = setup(4, { 0: 'jessejones' });
    s0.turn.player = 'p3';
    const given = handOfP1.map(t => giveCard(s0, 'p1', t));
    const s = applyCommand(s0, 'p3', { type: 'endTurn' });
    return { s, ids: given.map(c => c.id) };
  }

  it('s viac kartami: obeť ich zamieša a Jesse si vyberie ľubovoľnú rubom, potom potiahne 1 z balíka', () => {
    let { s, ids } = jesseTurn(['bang', 'birra', 'mancato']);
    expect(s.pending).toMatchObject({ kind: 'jesse', player: 'p0' });
    s = applyCommand(s, 'p0', { type: 'choose', option: 'p1' });
    expect(s.pending).toMatchObject({ kind: 'arrange', player: 'p1', src: 'p0', card: 'jesse' });
    s = applyCommand(s, 'p1', { type: 'arrange', order: [ids[2], ids[0], ids[1]] });
    expect(s.pending).toMatchObject({ kind: 'steal', player: 'p0', victim: 'p1', card: 'jesse' });
    const before = s.players[0].hand.length;
    s = applyCommand(s, 'p0', { type: 'steal', index: 1 });   // druha zo zamiesanych = ids[0]
    expect(s.pending).toBeNull();
    expect(s.turn.phase).toBe('play');
    expect(s.players[0].hand.some(c => c.id === ids[0])).toBe(true);
    expect(s.players[0].hand.length).toBe(before + 2);        // vybrana + 1 z balika
    expect(s.players[1].hand.length).toBe(2);
  });

  it('s jednou kartou ju vezme hneď bez výberu', () => {
    let { s, ids } = jesseTurn(['bang']);
    s = applyCommand(s, 'p0', { type: 'choose', option: 'p1' });
    expect(s.pending).toBeNull();
    expect(s.turn.phase).toBe('play');
    expect(s.players[0].hand.some(c => c.id === ids[0])).toBe(true);
    expect(s.players[0].hand.length).toBe(2);
  });

  it('ak obeť zmizne počas výberu, Jesse dotiahne obe karty z balíka a hra nezamrzne', () => {
    let { s } = jesseTurn(['bang', 'birra']);
    s = applyCommand(s, 'p0', { type: 'choose', option: 'p1' });
    s = eliminate(s, 'p1');
    expect(s.pending).toBeNull();
    expect(s.turn.phase).toBe('play');
    expect(s.turn.player).toBe('p0');
    expect(s.players[0].hand.length).toBe(2);
  });

  it('berie sa len z ruky: karty vyložené na stole ostávajú neporušené', () => {
    const s0 = setup(4, { 0: 'jessejones' });
    s0.turn.player = 'p3';
    const inPlay = [giveCard(s0, 'p1', 'barile', 'inPlay'), giveCard(s0, 'p1', 'mustang', 'inPlay')];
    const hand = [giveCard(s0, 'p1', 'bang'), giveCard(s0, 'p1', 'birra')];
    let s = applyCommand(s0, 'p3', { type: 'endTurn' });
    s = applyCommand(s, 'p0', { type: 'choose', option: 'p1' });
    s = applyCommand(s, 'p1', { type: 'arrange', order: [hand[0].id, hand[1].id] });
    expect(() => applyCommand(s, 'p0', { type: 'steal', index: 2 })).toThrow();   // index mimo ruky (vyložené karty nie sú volitelné)
    s = applyCommand(s, 'p0', { type: 'steal', index: 0 });
    const taken = s.players[0].hand.map(c => c.id);
    expect(taken.some(id => hand.some(h => h.id === id))).toBe(true);
    expect(taken.some(id => inPlay.some(c => c.id === id))).toBe(false);
    expect(s.players[1].inPlay.map(c => c.id).sort()).toEqual(inPlay.map(c => c.id).sort());
  });

  it('hráč len s vyloženými kartami (prázdna ruka) nie je platný cieľ', () => {
    const s0 = setup(4, { 0: 'jessejones' });
    s0.turn.player = 'p3';
    s0.players[1].hand = [];
    giveCard(s0, 'p1', 'barile', 'inPlay');
    const s = applyCommand(s0, 'p3', { type: 'endTurn' });
    expect(() => applyCommand(s, 'p0', { type: 'choose', option: 'p1' })).toThrow();
    expect(s.players[1].inPlay.length).toBeGreaterThan(0);
  });

  it('ťahanie z balíka funguje ako predtým', () => {
    let { s } = jesseTurn(['bang', 'birra']);
    s = applyCommand(s, 'p0', { type: 'choose', option: 'deck' });
    expect(s.players[0].hand.length).toBe(2);
    expect(s.players[1].hand.length).toBe(2);
  });
});
