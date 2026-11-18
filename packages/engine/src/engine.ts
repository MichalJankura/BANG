import {
  Card, CardType, CharKey, Role, CHARACTERS, ROLES_BY_COUNT, ROLE_NAME, WEAPON_RANGE,
  buildDeck, cardLabel, isBlue, isWeapon, CARD_NAME,
  BASE_CHARS, GR_CHARS, EQUIP, Equip, EquipType, buildEquipDeck,
} from './data';

/** Volby hry. goldRush = rozsirenie Gold Rush, shadows = variant Tienovi pistolnici. */
export interface Options { goldRush: boolean; shadows: boolean }

export interface Player {
  id: string;
  name: string;
  role: Role;
  character: CharKey;
  hp: number;
  maxHp: number;
  hand: Card[];
  inPlay: Card[];
  /** je prave v hre (aj tien pocas svojho tahu) */
  alive: boolean;
  /** Gold Rush: nugety a vylozene vybavenie (aj Hladany od inych) */
  gold: number;
  equip: Equip[];
  /** bol vyradeny; s variantom tienov sa vracia na svoj tah */
  dead: boolean;
  /** prave hra tah ako tien */
  ghost: boolean;
  /** tien Odpadlika: strana, za ktoru prave hra */
  side: 'law' | 'outlaw' | null;
}

export type Winner = 'sceriffo' | 'fuorilegge' | 'rinnegato';

/** Zaznam dennika. Druh urcuje ikonu a farbu v UI. */
export type LogKind = 'meta' | 'hit' | 'defend' | 'heal' | 'turn';
export interface LogEntry { k: LogKind; t: string }

/** Kroky, ktere engine provadi postupne. Vse jsou cista data, stav jde serializovat. */
type Task =
  | { t: 'dynamite'; player: string }
  | { t: 'jail'; player: string }
  | { t: 'drawPhase'; player: string }
  | { t: 'bang'; src: string; target: string; needed: number; barrels?: boolean; via?: 'bang' }
  | { t: 'indians'; src: string; target: string }
  | { t: 'duel'; challenger: string; who: string; other: string }
  | { t: 'damage'; target: string; amount: number; src: string | null; via?: 'bang' }
  | { t: 'death'; target: string; killer: string | null }
  | { t: 'store'; order: string[] };

/** Rozhodnuti, na ktere se ceka. Vzdy presne jeden hrac. */
export type Pending =
  | { kind: 'bang'; player: string; src: string; needed: number; via?: 'bang' }
  | { kind: 'indians'; player: string; src: string }
  | { kind: 'duel'; player: string; other: string; challenger: string }
  | { kind: 'lethal'; player: string; src: string | null; amount: number }
  | { kind: 'discard'; player: string; count: number }
  | { kind: 'jesse'; player: string }
  | { kind: 'pedro'; player: string }
  | { kind: 'kit'; player: string; cards: Card[] }
  /** Dutch Will odhadzuje jednu z dvoch potiahnutych kariet */
  | { kind: 'dutch'; player: string; cards: number[] }
  /** Josh McCloud si potiahol vybavenie a rozhoduje, ako ho pouzije */
  | { kind: 'josh'; player: string; card: Equip }
  | { kind: 'store'; player: string; order: string[] }
  /** obet Paniky!/Cat Balou si preusporiada karty v ruke */
  /** card 'jesse' = Jesse Jones berie prvu kartu z ruky hraca: obet karty zamiesa, Jesse vyberie rubom (ako pri Panike!) */
  | { kind: 'arrange'; player: string; src: string; card: 'panico' | 'catbalou' | 'jesse' }
  /** utocnik si vyberie kartu rubom podla poradia, ktore urcila obet */
  | { kind: 'steal'; player: string; victim: string; card: 'panico' | 'catbalou' | 'jesse' };

/** Vyber rol a postav pred hrou. Karty lezia rubom, hraci beru subezne. */
export interface Setup {
  phase: 'roles' | 'chars';
  roles: { role: Role; taken: string | null }[];
  chars: { ch: CharKey; taken: string | null }[];
  /** indexy kariet postav, ktore si hrac otocil (najviac 2) */
  picked: Record<string, number[]>;
  chosen: Record<string, CharKey>;
}

export interface State {
  version: number;
  rng: number;
  players: Player[];
  deck: Card[];      // vrch = posledni prvek
  discard: Card[];   // vrch = posledni prvek
  store: Card[];     // odkryte karty Hokynarstvi
  turn: {
    player: string; phase: 'draw' | 'play' | 'discard'; bangs: number; skipped: boolean;
    /** Gold Rush: pouzitia Panvice a Raddieho, zlava Luzeny, tah navyse, Zlata horucka */
    goldPan: number; raddie: number; luzena: boolean; extra: boolean; again: boolean;
  };
  opts: Options;
  equipDeck: Equip[];  // vrch = posledny prvok
  equipUsed: Equip[];  // odhodene vybavenie, zamiesa sa ked balik dojde
  shop: Equip[];       // 3 odkryte karty vybavenia
  queue: Task[];
  pending: Pending | null;
  setup: Setup | null;
  winner: Winner | null;
  log: LogEntry[];
  /** Statistiky pre XP (ranked). Volitelne kvoli starsim snimkom. */
  stats?: Record<string, PlayerStats>;
  /** id karty Dynamitu -> id hraca, ktory ho vylozil */
  dynOwner?: Record<number, string>;
}

/** Herne statistiky hraca, zbiera ich engine pri vykonavani pravidiel. */
export interface PlayerStats {
  /** zahrate karty (play + respond) */
  cards: number;
  /** zivoty ubrane nespojencom (priamo, bez Dynamitu) */
  dmg: number;
  /** zasahy kartou BANG!: takticky / neutralny / spojenec */
  hitsValid: number;
  hitsNeutral: number;
  hitsAlly: number;
  /** BANG!/Gulomet, ktory hrac odvratil (Vedla!, Barel, Jourdonnais) */
  dodges: number;
  /** Dynamit vylozeny hracom vybuchol inemu */
  dynHits: number;
  /** Dynamit vylozeny hracom vybuchol jemu */
  dynSelf: boolean;
}

export type Relation = 'valid' | 'neutral' | 'ally';

export function emptyStats(): PlayerStats {
  return { cards: 0, dmg: 0, hitsValid: 0, hitsNeutral: 0, hitsAlly: 0, dodges: 0, dynHits: 0, dynSelf: false };
}

function st(s: State, id: string): PlayerStats {
  const all = (s.stats ??= {});
  return (all[id] ??= emptyStats());
}

/** Vztah utocnika k cielu podla skutocnych roli (pre XP za zasah). */
export function relation(s: State, attacker: string, target: string): Relation {
  const a = P(s, attacker).role, t = P(s, target).role;
  if (a === 'sceriffo' || a === 'vice') return t === 'sceriffo' || t === 'vice' ? 'ally' : 'valid';
  if (a === 'fuorilegge') return t === 'fuorilegge' ? 'ally' : t === 'rinnegato' ? 'neutral' : 'valid';
  // Odpadlik: Serif je takticky ciel az v suboji jeden na jedneho.
  if (t === 'vice' || t === 'fuorilegge') return 'valid';
  if (t === 'sceriffo') {
    const live = s.players.filter(x => x.alive && !x.ghost && x.id !== attacker && x.id !== target);
    return live.length === 0 ? 'valid' : 'neutral';
  }
  return 'neutral';
}

export type Command =
  | { type: 'play'; cardId: number; target?: string; pick?: 'hand' | number; gold?: boolean }
  | { type: 'buy'; equipId: number; as?: string; target?: string; pick?: 'hand' | number }
  | { type: 'equipUse'; as?: string; target?: string; pick?: 'hand' | number }
  | { type: 'scrap'; target: string; equipId: number }
  | { type: 'ability'; name: AbilityName; target?: string }
  | { type: 'endTurn' }
  | { type: 'discard'; cardIds: number[] }
  | { type: 'respond'; cardId: number }
  | { type: 'pass' }
  | { type: 'sid'; cardIds: number[] }
  | { type: 'choose'; option: string }
  | { type: 'kit'; cardIds: number[] }
  | { type: 'storePick'; cardId: number }
  | { type: 'pickRole'; slot: number }
  | { type: 'pickChar'; slot: number }
  | { type: 'chooseChar'; ch: CharKey }
  | { type: 'arrange'; order?: number[]; shuffle?: boolean }
  | { type: 'steal'; index: number };

export type AbilityName = 'setaccio' | 'raddie' | 'jacky' | 'josh' | 'zaino';

/** Prikazy vyberu rol a postav. Hraci ich posielaju subezne, preto sa na ne neviaze verzia stavu. */
export const SETUP_COMMANDS = ['pickRole', 'pickChar', 'chooseChar'];

export class RuleError extends Error {}
const fail = (m: string): never => { throw new RuleError(m); };

// ---------- pomocne funkce ----------

function rnd(s: State): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = Math.imul(s.rng ^ (s.rng >>> 15), 1 | s.rng);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function shuffle<T>(s: State, a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd(s) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const P = (s: State, id: string): Player => s.players.find(p => p.id === id) ?? fail('Neznámy hráč');
export const alivePlayers = (s: State) => s.players.filter(p => p.alive);
const has = (p: Player, t: CardType) => p.inPlay.some(c => c.type === t);
const hasEq = (p: Player, t: EquipType) => p.equip.some(e => e.type === t);
const nug = (n: number) => `${n} ${n === 1 ? 'nuget' : n < 5 ? 'nugety' : 'nugetov'}`;
/** Kalumet: karove karty inych hracov na majitela neposobia. */
const immune = (o: Player, c: Card | null) => !!c && c.suit === 'diamonds' && hasEq(o, 'calumet');
/** Gold Rush: v hre je presne 30 nugetov. Co nie je u hracov, lezi na kopke. */
export const NUGGETS = 30;
export const heapLeft = (s: State) => NUGGETS - s.players.reduce((n, p) => n + p.gold, 0);
/** Hrac si berie nugety z kopky; vrati, kolko ich naozaj dostal. */
function gain(s: State, p: Player, n: number): number {
  const got = Math.max(0, Math.min(n, heapLeft(s)));
  p.gold += got;
  if (got < n) say(s, 'Kôpka nugetov je prázdna.');
  return got;
}
function heal(p: Player, n: number): number {
  if (p.ghost || !p.alive) return 0;
  const got = Math.min(n, p.maxHp - p.hp);
  p.hp += Math.max(0, got);
  return Math.max(0, got);
}
function drawEquip(s: State): Equip | undefined {
  if (!s.equipDeck.length && s.equipUsed.length) { s.equipDeck = shuffle(s, s.equipUsed); s.equipUsed = []; }
  return s.equipDeck.pop();
}
function refillShop(s: State) {
  while (s.shop.length < 3) { const c = drawEquip(s); if (!c) break; s.shop.push(c); }
}
const say = (s: State, t: string, k: LogKind = 'meta') => { s.log.push({ k, t }); if (s.log.length > 200) s.log.shift(); };

function nextAlive(s: State, id: string): Player {
  const i = s.players.findIndex(p => p.id === id);
  for (let k = 1; k <= s.players.length; k++) {
    const p = s.players[(i + k) % s.players.length];
    if (p.alive) return p;
  }
  return s.players[i];
}

/** Ostatni zivi hraci po smeru hry, pocinaje hracem po levici. */
function othersInOrder(s: State, id: string): Player[] {
  const out: Player[] = [];
  let p = nextAlive(s, id);
  while (p.id !== id && !out.includes(p)) { out.push(p); p = nextAlive(s, p.id); }
  return out;
}

function drawCard(s: State): Card | undefined {
  if (s.deck.length === 0) {
    if (s.discard.length === 0) return undefined;
    s.deck = shuffle(s, s.discard);
    s.discard = [];
    say(s, 'Balík došiel, odhadzovací balík sa zamiešal.');
  }
  return s.deck.pop();
}

function give(s: State, p: Player, n: number): Card[] {
  const got: Card[] = [];
  for (let i = 0; i < n; i++) { const c = drawCard(s); if (c) { p.hand.push(c); got.push(c); } }
  return got;
}

function takeFromHand(p: Player, cardId: number): Card {
  const i = p.hand.findIndex(c => c.id === cardId);
  if (i < 0) fail('Túto kartu nemáš v ruke');
  return p.hand.splice(i, 1)[0];
}

function randomFromHand(s: State, p: Player): Card | undefined {
  if (!p.hand.length) return undefined;
  return p.hand.splice(Math.floor(rnd(s) * p.hand.length), 1)[0];
}

/** "Sejmuti". Lucky Duke otaci dve karty a bere tu lepsi. */
function flip(s: State, p: Player, good: (c: Card) => boolean, why: string): boolean {
  const n = 1 + (p.character === 'luckyduke' ? 1 : 0) + (hasEq(p, 'ferro_di_cavallo') ? 1 : 0);
  const cs: Card[] = [];
  for (let i = 0; i < n; i++) { const c = drawCard(s); if (c) cs.push(c); }
  s.discard.push(...cs);
  const ok = cs.some(good);
  say(s, `${p.name} ťahá kartu (${why}): ${cs.map(cardLabel).join(', ')} - ${ok ? 'úspech' : 'neúspech'}.`, ok ? 'defend' : 'meta');
  return ok;
}

const asBang = (p: Player, c: Card) => c.type === 'bang' || (p.character === 'calamityjanet' && c.type === 'mancato');
const asMissed = (p: Player, c: Card) => c.type === 'mancato' || (p.character === 'calamityjanet' && c.type === 'bang');

export function distance(s: State, fromId: string, toId: string): number {
  const live = alivePlayers(s);
  const a = live.findIndex(p => p.id === fromId);
  const b = live.findIndex(p => p.id === toId);
  if (a < 0 || b < 0) return 99;
  const d = Math.abs(a - b);
  let dist = Math.min(d, live.length - d);
  const from = live[a], to = live[b];
  dist += (has(to, 'mustang') ? 1 : 0) + (to.character === 'paulregret' ? 1 : 0);
  dist -= (has(from, 'mirino') ? 1 : 0) + (from.character === 'rosedoolan' ? 1 : 0);
  return Math.max(1, dist);
}

export function weaponRange(p: Player): number {
  const w = p.inPlay.find(c => isWeapon(c.type));
  return w ? WEAPON_RANGE[w.type]! : 1;
}

// ---------- zalozeni hry ----------

export function createGame(players: { id: string; name: string }[], seed: number, opts: Partial<Options> = {}): State {
  const roles = ROLES_BY_COUNT[players.length];
  if (!roles) throw new RuleError('Hra je pre 4 až 7 hráčov');
  const s: State = {
    version: 0, rng: seed | 0, players: [], deck: [], discard: [], store: [],
    turn: { player: '', phase: 'draw', bangs: 0, skipped: false, goldPan: 0, raddie: 0, luzena: false, extra: false, again: false },
    queue: [], pending: null, setup: null, winner: null, log: [],
    opts: { goldRush: !!opts.goldRush, shadows: !!opts.shadows },
    equipDeck: [], equipUsed: [], shop: [],
  };
  s.setup = {
    phase: 'roles',
    roles: shuffle(s, [...roles]).map(role => ({ role, taken: null })),
    chars: shuffle(s, [...BASE_CHARS, ...(s.opts.goldRush ? GR_CHARS : [])]).map(ch => ({ ch, taken: null })),
    picked: {},
    chosen: {},
  };
  s.deck = shuffle(s, buildDeck());
  // Rola a postava sa doplnia pri vybere; do vtedy su to len zastupne hodnoty, ktore pohlad neukazuje.
  for (const pl of players) {
    s.players.push({ id: pl.id, name: pl.name, role: 'fuorilegge', character: 'bartcassidy', hp: 0, maxHp: 0, hand: [], inPlay: [], alive: true, gold: 0, equip: [], dead: false, ghost: false, side: null });
  }
  say(s, 'Vyberte si roly. Klikni na jednu kartu rubom.', 'turn');
  return s;
}

/** Hraci, ktori este maju co vybrat (pre botov a server). */
export function setupActors(s: State): string[] {
  const st = s.setup;
  if (!st) return [];
  if (st.phase === 'roles') return s.players.filter(p => !st.roles.some(r => r.taken === p.id)).map(p => p.id);
  return s.players.filter(p => !st.chosen[p.id]).map(p => p.id);
}

function setupCommand(s: State, p: Player, cmd: Command) {
  const st = s.setup!;
  if (cmd.type === 'pickRole') {
    if (st.phase !== 'roles') fail('Roly sú už rozdané');
    if (st.roles.some(r => r.taken === p.id)) fail('Rolu už máš');
    const slot = st.roles[cmd.slot] ?? fail('Neplatná karta');
    if (slot.taken) fail('Túto kartu už niekto vzal, vyber inú');
    slot.taken = p.id;
    p.role = slot.role;
    say(s, slot.role === 'sceriffo' ? `${p.name} otočil Šerifa.` : `${p.name} si vzal rolu.`, slot.role === 'sceriffo' ? 'turn' : 'meta');
    if (st.roles.every(r => r.taken)) {
      st.phase = 'chars';
      say(s, 'Roly sú rozdané. Otoč si 2 postavy a jednu si vyber.', 'turn');
    }
    return;
  }
  if (cmd.type === 'pickChar') {
    if (st.phase !== 'chars') fail('Najprv si vyber rolu');
    const mine = st.picked[p.id] ?? (st.picked[p.id] = []);
    if (mine.length >= 2) fail('Už máš otočené 2 postavy');
    const slot = st.chars[cmd.slot] ?? fail('Neplatná karta');
    if (slot.taken) fail('Túto kartu už niekto vzal, vyber inú');
    slot.taken = p.id;
    mine.push(cmd.slot);
    return;
  }
  if (cmd.type === 'chooseChar') {
    if (st.phase !== 'chars') fail('Najprv si vyber rolu');
    if (st.chosen[p.id]) fail('Postavu už máš');
    const mine = (st.picked[p.id] ?? []).map(i => st.chars[i].ch);
    if (mine.length < 2) fail('Najprv si otoč 2 postavy');
    if (!mine.includes(cmd.ch)) fail('Vyber jednu z tvojich dvoch postáv');
    st.chosen[p.id] = cmd.ch;
    say(s, `${p.name} hrá za postavu ${CHARACTERS[cmd.ch].name}.`);
    if (s.players.every(x => st.chosen[x.id])) finishSetup(s);
    return;
  }
  fail('Hra sa ešte nezačala');
}

function finishSetup(s: State) {
  const st = s.setup!;
  for (const p of s.players) {
    p.character = st.chosen[p.id];
    const hp = CHARACTERS[p.character].hp;
    p.hp = p.maxHp = hp + (p.role === 'sceriffo' ? 1 : 0);
    give(s, p, hp);
  }
  s.setup = null;
  if (s.opts.goldRush) { s.equipDeck = shuffle(s, buildEquipDeck()); refillShop(s); }
  const sheriff = s.players.find(p => p.role === 'sceriffo')!;
  say(s, `Rozdané. Šerif ${sheriff.name} začína.`);
  beginTurn(s, sheriff.id);
  run(s);
}

function beginTurn(s: State, id: string, extra = false) {
  s.turn = { player: id, phase: 'draw', bangs: 0, skipped: false, goldPan: 0, raddie: 0, luzena: false, extra, again: false };
  const p = P(s, id);
  if (p.dead) {
    // Tien: na svoj tah sa vracia do hry s 0 zivotmi.
    p.alive = true; p.ghost = true; p.hp = 0;
    if (p.role === 'rinnegato') {
      const up = s.players.filter(x => x.id !== p.id && (x.dead || x.role === 'sceriffo'));
      const law = up.filter(x => x.role === 'sceriffo' || x.role === 'vice').length;
      const out = up.filter(x => x.role === 'fuorilegge').length;
      p.side = law > out ? 'law' : 'outlaw';
      say(s, `Tieň Odpadlíka ${p.name} hrá tento ťah ${p.side === 'law' ? 'za zákon' : 'za Banditov'}.`);
    }
    say(s, `${p.name} sa vracia ako tieň.`, 'turn');
  }
  say(s, `Na ťahu je ${p.name}.`, 'turn');
  s.queue.push({ t: 'dynamite', player: id }, { t: 'jail', player: id }, { t: 'drawPhase', player: id });
}

function ghostExit(s: State, p: Player) {
  s.discard.push(...p.inPlay, ...p.hand);
  s.equipUsed.push(...p.equip);
  p.inPlay = []; p.hand = []; p.equip = [];
  p.alive = false; p.ghost = false;
  say(s, `Tieň ${p.name} mizne.`);
}

function advance(s: State) {
  const cur = P(s, s.turn.player);
  if (cur.ghost) ghostExit(s, cur);
  const i = s.players.findIndex(p => p.id === cur.id);
  for (let k = 1; k <= s.players.length; k++) {
    const p = s.players[(i + k) % s.players.length];
    if (p.alive || (s.opts.shadows && p.dead)) return beginTurn(s, p.id);
  }
  beginTurn(s, cur.id);
}

/** Koniec fazy hrania: odhodenie nad limit, potom koniec tahu. */
function endTurn(s: State, p: Player) {
  const limit = p.ghost ? Infinity : hasEq(p, 'cinturone') ? 8 : p.hp;
  if (p.hand.length > limit) { s.turn.phase = 'discard'; s.pending = { kind: 'discard', player: p.id, count: p.hand.length - limit }; }
  else finishTurn(s, p);
}

function finishTurn(s: State, p: Player) {
  const again = s.turn.again, extra = s.turn.extra;
  if (p.ghost) ghostExit(s, p);
  if (again) {
    if (heal(p, p.maxHp)) say(s, `${p.name} si lieči všetky životy.`, 'heal');
    say(s, `${p.name} hrá ďalší ťah (Zlatá horúčka).`);
    return beginTurn(s, p.id);
  }
  if (p.character === 'don_bell' && !extra && (p.alive || p.dead)) {
    if (flip(s, p, c => c.suit === 'hearts' || c.suit === 'diamonds', 'Don Bell')) {
      say(s, `${p.name} hrá ťah navyše.`);
      return beginTurn(s, p.id, true);
    }
  }
  advance(s);
}

function endDraw(s: State, p: Player) {
  if (hasEq(p, 'piccone') && give(s, p, 1).length) say(s, `${p.name} ťahá kartu navyše (Krompáč).`);
  s.turn.phase = 'play';
}

function beerPlayed(s: State) {
  for (const y of s.players) {
    if (y.alive && y.character === 'madame_yto' && give(s, y, 1).length) say(s, `${y.name} ťahá kartu za zahrané Pivo.`);
  }
}

// ---------- smycka ----------

function run(s: State) {
  for (let guard = 0; guard < 100000; guard++) {
    if (s.winner) { s.queue = []; s.pending = null; s.store = []; return; }
    if (s.pending) return;
    suzy(s);
    const t = s.queue.shift();
    if (!t) {
      if (!P(s, s.turn.player).alive) { advance(s); continue; }
      return;
    }
    exec(s, t);
  }
  throw new Error('Engine: nekonečná smyčka');
}

function suzy(s: State) {
  if (s.queue.some(t => t.t === 'duel')) return;
  for (const p of s.players) {
    if (p.alive && p.character === 'suzylafayette' && p.hand.length === 0) {
      if (give(s, p, 1).length) say(s, `${p.name} nemá karty a ťahá jednu.`); else return;
    }
  }
}

function exec(s: State, t: Task) {
  switch (t.t) {
    case 'dynamite': {
      const p = P(s, t.player);
      const i = p.inPlay.findIndex(c => c.type === 'dinamite');
      if (!p.alive || i < 0) return;
      const safe = flip(s, p, c => !(c.suit === 'spades' && c.rank >= 2 && c.rank <= 9), 'Dynamit');
      const card = p.inPlay.splice(i, 1)[0];
      if (safe) {
        const n = nextAlive(s, p.id);
        n.inPlay.push(card);
        say(s, `Dynamit putuje k hráčovi ${n.name}.`);
      } else {
        s.discard.push(card);
        say(s, `Dynamit vybuchol pri hráčovi ${p.name}.`, 'hit');
        const owner = s.dynOwner?.[card.id];
        if (owner) {
          if (owner === p.id) st(s, owner).dynSelf = true; else st(s, owner).dynHits++;
          delete s.dynOwner![card.id];
        }
        s.queue.unshift({ t: 'damage', target: p.id, amount: 3, src: null });
      }
      return;
    }
    case 'jail': {
      const p = P(s, t.player);
      const i = p.inPlay.findIndex(c => c.type === 'prigione');
      if (!p.alive || i < 0) return;
      s.discard.push(p.inPlay.splice(i, 1)[0]);
      if (!flip(s, p, c => c.suit === 'hearts', 'Väzenie')) {
        say(s, `${p.name} ostáva vo väzení a vynecháva ťah.`);
        s.turn.skipped = true;
      } else say(s, `${p.name} ušiel z väzenia.`);
      return;
    }
    case 'drawPhase': {
      const p = P(s, t.player);
      if (!p.alive || s.turn.skipped) { advance(s); return; }
      const others = alivePlayers(s).filter(o => o.id !== p.id && o.hand.length > 0);
      if (p.character === 'jessejones' && others.length) { s.pending = { kind: 'jesse', player: p.id }; return; }
      if (p.character === 'pedroramirez' && s.discard.length) { s.pending = { kind: 'pedro', player: p.id }; return; }
      if (p.character === 'kitcarlson') {
        const cards: Card[] = [];
        for (let i = 0; i < 3; i++) { const c = drawCard(s); if (c) cards.push(c); }
        if (cards.length <= 2) p.hand.push(...cards);
        else { s.pending = { kind: 'kit', player: p.id, cards }; return; }
      } else if (p.character === 'blackjack') {
        const got = give(s, p, 2);
        const second = got[1];
        if (second) {
          say(s, `${p.name} ukazuje druhú kartu: ${cardLabel(second)}.`);
          if (second.suit === 'hearts' || second.suit === 'diamonds') { give(s, p, 1); say(s, `${p.name} ťahá kartu navyše.`); }
        }
      } else if (p.character === 'dutch_will') {
        const got = give(s, p, 2);
        if (got.length === 2) { s.pending = { kind: 'dutch', player: p.id, cards: got.map(c => c.id) }; return; }
        gain(s, p, 1);
      } else give(s, p, 2);
      endDraw(s, p);
      return;
    }
    case 'bang': {
      const tg = P(s, t.target);
      if (!tg.alive) return;
      if (!t.barrels) {
        t.barrels = true;
        let n = (has(tg, 'barile') ? 1 : 0) + (tg.character === 'jourdonnais' ? 1 : 0);
        while (n-- > 0 && t.needed > 0) if (flip(s, tg, c => c.suit === 'hearts', 'Barel')) t.needed--;
      }
      if (t.needed <= 0) { st(s, tg.id).dodges++; say(s, `${tg.name} sa výstrelu vyhol.`, 'defend'); return; }
      const can = tg.hand.filter(c => asMissed(tg, c)).length;
      if (can === 0 || (can < t.needed && tg.character !== 'suzylafayette')) {
        s.queue.unshift({ t: 'damage', target: tg.id, amount: 1, src: t.src, via: t.via });
        return;
      }
      s.pending = { kind: 'bang', player: tg.id, src: t.src, needed: t.needed, via: t.via };
      return;
    }
    case 'indians': {
      const tg = P(s, t.target);
      if (!tg.alive) return;
      if (!tg.hand.some(c => asBang(tg, c))) { s.queue.unshift({ t: 'damage', target: tg.id, amount: 1, src: t.src }); return; }
      s.pending = { kind: 'indians', player: tg.id, src: t.src };
      return;
    }
    case 'duel': {
      const p = P(s, t.who), o = P(s, t.other);
      if (!p.alive || !o.alive) return;
      if (!p.hand.some(c => asBang(p, c))) { duelLost(s, p.id, t.challenger); return; }
      s.pending = { kind: 'duel', player: p.id, other: o.id, challenger: t.challenger };
      return;
    }
    case 'damage': {
      const p = P(s, t.target);
      if (!p.alive) return;
      if (p.ghost) { say(s, `${p.name} je tieň, zásah mu neublíži.`, 'defend'); return; }
      p.hp -= t.amount;
      say(s, `${p.name}: zásah, −${t.amount} ${t.amount === 1 ? 'život' : 'životy'}.`, 'hit');
      if (t.src && t.src !== p.id) {
        const rel = relation(s, t.src, p.id), a = st(s, t.src);
        if (rel !== 'ally') a.dmg += t.amount;
        if (t.via === 'bang') {
          if (rel === 'valid') a.hitsValid++; else if (rel === 'neutral') a.hitsNeutral++; else a.hitsAlly++;
        }
      }
      if (s.opts.goldRush && t.src && t.src !== p.id) {
        const k = P(s, t.src);
        const got = k.alive ? gain(s, k, t.amount) : 0;
        if (got) say(s, `${k.name} získava ${nug(got)}.`);
      }
      if (p.hp > 0) { afterDamage(s, p, t.src, t.amount); return; }
      if (canSave(s, p)) s.pending = { kind: 'lethal', player: p.id, src: t.src, amount: t.amount };
      else s.queue.unshift({ t: 'death', target: p.id, killer: t.src });
      return;
    }
    case 'death': {
      const p = P(s, t.target);
      if (!p.alive) return;
      p.alive = false; p.hp = 0; p.dead = true;
      say(s, `${p.name} je vyradený. Rola: ${ROLE_NAME[p.role]}.`, 'hit');
      const wanted = hasEq(p, 'ricercato');
      s.equipUsed.push(...p.equip); p.equip = [];
      // Bez tienov sa nugety vyradeneho vracaju na kopku; tien si ich necháva.
      if (!s.opts.shadows) p.gold = 0;
      const cards = [...p.inPlay, ...p.hand];
      p.inPlay = []; p.hand = [];
      const sam = alivePlayers(s).find(x => x.character === 'vulturesam');
      if (sam) { sam.hand.push(...cards); if (cards.length) say(s, `${sam.name} si berie karty vyradeného.`); }
      else s.discard.push(...cards);
      const k = t.killer ? P(s, t.killer) : null;
      if (k && k.alive && k.id !== p.id) {
        if (wanted) { give(s, k, 2); say(s, `${k.name} berie odmenu za Hľadaného: 2 karty a 1 nuget.`); gain(s, k, 1); }
        if (p.role === 'fuorilegge') { give(s, k, 3); say(s, `${k.name} získava odmenu 3 karty.`); }
        if (k.role === 'sceriffo' && p.role === 'vice') {
          s.discard.push(...k.inPlay, ...k.hand); k.inPlay = []; k.hand = [];
          say(s, `Šerif zabil svojho Pomocníka a odhadzuje všetky karty.`);
        }
      }
      checkWin(s);
      return;
    }
    case 'store': {
      while (t.order.length && (!P(s, t.order[0]).alive)) t.order.shift();
      if (!t.order.length || !s.store.length) { s.discard.push(...s.store); s.store = []; return; }
      const p = P(s, t.order[0]);
      if (s.store.length === 1) {
        const c = s.store.pop()!; p.hand.push(c);
        say(s, `${p.name} si berie ${cardLabel(c)}.`);
        return;
      }
      s.pending = { kind: 'store', player: p.id, order: t.order };
      return;
    }
  }
}

function duelLost(s: State, loser: string, challenger: string) {
  // Kdyz prohraje vyzyvatel, zraneni se nepripisuje nikomu (zadna odmena, El Gringo nebere).
  s.queue.unshift({ t: 'damage', target: loser, amount: 1, src: loser === challenger ? null : challenger });
}

function healOptions(s: State, p: Player) {
  const beers = alivePlayers(s).length > 2 ? p.hand.filter(c => c.type === 'birra').length : 0;
  return { beers, sid: p.character === 'sidketchum', sack: hasEq(p, 'zaino') ? Math.floor(p.gold / 2) : 0 };
}

function canSave(s: State, p: Player): boolean {
  const need = 1 - p.hp;
  const { beers, sid, sack } = healOptions(s, p);
  const max = beers + (sid ? Math.floor((p.hand.length - beers) / 2) : 0) + sack;
  return max >= need;
}

function afterDamage(s: State, p: Player, src: string | null, amount: number) {
  if (p.character === 'bartcassidy') { give(s, p, amount); say(s, `${p.name} ťahá kartu za stratený život.`); }
  if (hasEq(p, 'stivali')) { give(s, p, amount); say(s, `${p.name} ťahá kartu za stratený život (Čižmy).`); }
  const g = (hasEq(p, 'talismano') ? amount : 0) + (p.character === 'simeon_picos' ? amount : 0);
  if (g) { const got = gain(s, p, g); if (got) say(s, `${p.name} si berie ${nug(got)} za stratený život.`); }
  if (p.character === 'elgringo' && src && src !== p.id) {
    const from = P(s, src);
    for (let i = 0; i < amount; i++) {
      const c = randomFromHand(s, from);
      if (c) { p.hand.push(c); say(s, `${p.name} berie kartu z ruky hráča ${from.name}.`); }
    }
  }
}

function checkWin(s: State) {
  const live = alivePlayers(s).filter(p => !p.ghost);
  const sheriff = s.players.find(p => p.role === 'sceriffo')!;
  if (!sheriff.alive) {
    s.winner = live.length === 1 && live[0].role === 'rinnegato' ? 'rinnegato' : 'fuorilegge';
  } else if (!live.some(p => p.role === 'fuorilegge' || p.role === 'rinnegato')) {
    s.winner = 'sceriffo';
  }
  if (s.winner) say(s, `Koniec hry. ${s.winner === 'sceriffo' ? 'Vyhráva Šerif s Pomocníkmi' : s.winner === 'fuorilegge' ? 'Vyhrávajú Banditi' : 'Vyhráva Odpadlík'}.`, 'turn');
}

// ---------- co smi hrac zahrat ----------

/** false = nelze zahrat, null = bez cile, pole = mozne cile. */
export function targetsFor(s: State, p: Player, c: Card): string[] | null | false {
  const others = alivePlayers(s).filter(o => o.id !== p.id);
  const some = (a: Player[]) => (a.length ? a.map(o => o.id) : false);
  const withCards = (o: Player) => o.hand.length + o.inPlay.length > 0;
  if (asBang(p, c)) {
    if (s.turn.bangs >= 1 && !has(p, 'volcanic') && p.character !== 'willythekid') return false;
    return some(others.filter(o => distance(s, p.id, o.id) <= weaponRange(p) && !immune(o, c)));
  }
  switch (c.type) {
    case 'mancato': return false;
    case 'birra': return !p.ghost && p.hp < p.maxHp && alivePlayers(s).length > 2 ? null : false;
    case 'panico': return some(others.filter(o => distance(s, p.id, o.id) <= 1 && withCards(o) && !immune(o, c)));
    case 'catbalou': return some(others.filter(o => withCards(o) && !immune(o, c)));
    case 'duello': return some(others);
    case 'prigione': return some(others.filter(o => o.role !== 'sceriffo' && !has(o, 'prigione')));
    case 'saloon': case 'diligenza': case 'wellsfargo': case 'gatling': case 'indiani': case 'emporio':
      return null;
    default:
      return has(p, c.type) ? false : null; // modre karty pred sebe
  }
}

/** Dovod, preco sa karta alebo ciel neda pouzit. a, b su cisla do textu (napr. vzdialenost a dostrel). */
export interface Why { code: string; a?: number; b?: number }

/** Preco hrac o nemoze byt cielom ucinku (bang, panico, catbalou, duello, prigione...). null = moze. */
export function whyNotTarget(s: State, p: Player, kind: string, o: Player, card: Card | null): Why | null {
  if (o.id === p.id) return { code: 'self' };
  if (!o.alive) return { code: 'dead' };
  const d = distance(s, p.id, o.id);
  const none = o.hand.length + o.inPlay.length === 0;
  switch (kind) {
    case 'bang':
      if (d > weaponRange(p)) return { code: 'range', a: d, b: weaponRange(p) };
      break;
    case 'panico':
      if (d > 1) return { code: 'dist1', a: d };
      if (none) return { code: o.equip.length ? 'only-equip' : 'no-cards' };
      break;
    case 'catbalou':
      if (none) return { code: o.equip.length ? 'only-equip' : 'no-cards' };
      break;
    case 'prigione':
      if (o.role === 'sceriffo') return { code: 'sheriff' };
      if (has(o, 'prigione')) return { code: 'jailed' };
      break;
    case 'bicchierino':
      if (o.ghost) return { code: 'ghost' };
      if (o.hp >= o.maxHp) return { code: 'full-hp-other' };
      break;
    case 'ricercato':
      if (hasEq(o, 'ricercato')) return { code: 'wanted' };
      break;
  }
  if (kind !== 'duello' && immune(o, card)) return { code: 'calumet' };
  return null;
}

/** Preco sa karta z ruky neda zahrat (vo vlastnom tahu). null = da sa, alebo dovod nie je v karte. */
export function whyNotCard(s: State, p: Player, c: Card): Why | null {
  if (targetsFor(s, p, c) !== false) return null;
  if (asBang(p, c)) {
    if (s.turn.bangs >= 1 && !has(p, 'volcanic') && p.character !== 'willythekid') return { code: 'bang-limit' };
    return { code: 'no-target' };
  }
  switch (c.type) {
    case 'mancato': return { code: 'missed' };
    case 'birra':
      if (p.ghost) return { code: 'ghost-heal' };
      if (p.hp >= p.maxHp) return { code: 'full-hp' };
      return { code: 'two-players' };
    case 'panico': case 'catbalou': case 'duello': case 'prigione': return { code: 'no-target' };
    default: return { code: 'dup' };
  }
}

/** Kdo je prave na rade s rozhodnutim. */
export function actor(s: State): string | null {
  if (s.winner || s.setup) return null;
  return s.pending ? s.pending.player : s.turn.player;
}

/** Karty, kterymi lze odpovedet na aktualni cekajici rozhodnuti. */
export function eligible(s: State, pid: string): number[] {
  const pd = s.pending;
  if (!pd || pd.player !== pid) return [];
  const p = P(s, pid);
  switch (pd.kind) {
    case 'bang': return p.hand.filter(c => asMissed(p, c)).map(c => c.id);
    case 'indians': case 'duel': return p.hand.filter(c => asBang(p, c)).map(c => c.id);
    case 'lethal': return healOptions(s, p).beers ? p.hand.filter(c => c.type === 'birra').map(c => c.id) : [];
    case 'kit': return pd.cards.map(c => c.id);
    case 'store': return s.store.map(c => c.id);
    case 'discard': case 'arrange': return p.hand.map(c => c.id);
    case 'dutch': return pd.cards;
    default: return [];
  }
}

// ---------- prikazy ----------

export function applyCommand(prev: State, pid: string, cmd: Command): State {
  const s: State = structuredClone(prev);
  if (s.winner) fail('Hra sa skončila');
  const p = P(s, pid);
  if (!p.alive) fail('Si mimo hry');

  if (s.setup) {
    setupCommand(s, p, cmd);
    s.version++;
    return s;
  }
  if (SETUP_COMMANDS.includes(cmd.type)) fail('Hra už beží');
  if (cmd.type === 'sid') {
    sidAbility(s, p, cmd.cardIds);
  } else if (cmd.type === 'ability' && cmd.name === 'zaino' && s.pending?.kind === 'lethal' && s.pending.player === pid) {
    rucksack(s, p);
    afterLethal(s, p);
  } else if (s.pending) {
    if (s.pending.player !== pid) fail('Čaká sa na iného hráča');
    resolvePending(s, p, cmd);
  } else {
    if (s.turn.player !== pid) fail('Nie si na ťahu');
    if (s.turn.phase !== 'play') fail('Teraz sa nedá hrať');
    if (cmd.type === 'play') play(s, p, cmd);
    else if (cmd.type === 'endTurn') endTurn(s, p);
    else if (cmd.type === 'buy') buy(s, p, cmd);
    else if (cmd.type === 'scrap') scrap(s, p, cmd);
    else if (cmd.type === 'ability') ability(s, p, cmd);
    else fail('Neplatný príkaz');
  }
  if (cmd.type === 'play' || cmd.type === 'respond') st(s, pid).cards++;
  run(s);
  s.version++;
  return s;
}

/**
 * Zakladatel vyhodil hraca z rozohratej hry a zvolil, ze ho vyradi (namiesto vymeny za bota).
 * Vyradeny nikomu nedava odmenu, jeho karty idu na odhadzovaci balik (alebo k Vulture Samovi).
 * Serifa nemozno vyradit, kym je v hre Bandita alebo Odpadlik.
 */
export function eliminate(prev: State, id: string): State {
  const s: State = structuredClone(prev);
  if (s.winner) fail('Hra sa skončila');
  if (s.setup) fail('Pred začiatkom hry sa hráč dá nahradiť len botom');
  const p = P(s, id);
  if (p.role === 'sceriffo' && alivePlayers(s).some(o => o.id !== id && !o.ghost && (o.role === 'fuorilegge' || o.role === 'rinnegato'))) {
    fail('Šerifa nemôžeš vyradiť, kým je v hre Bandita alebo Odpadlík');
  }
  const pd = s.pending;
  if (pd) {
    if (pd.kind === 'store' && pd.player === id) s.queue.unshift({ t: 'store', order: pd.order.filter(x => x !== id) });
    if (pd.kind === 'kit' && pd.player === id) s.discard.push(...pd.cards);
    if (pd.kind === 'josh' && pd.player === id) s.equipUsed.push(pd.card);
    const involved = pd.player === id
      || (pd.kind === 'duel' && (pd.other === id || pd.challenger === id))
      || (pd.kind === 'steal' && pd.victim === id)
      || (pd.kind === 'arrange' && pd.src === id);
    if (involved) {
      s.pending = null;
      // Jesse Jones bral prvu kartu z ruky hraca, ktory zmizol: potiahnutie dokonci z balika.
      const jid = pd.kind === 'arrange' ? pd.src : pd.kind === 'steal' ? pd.player : null;
      if ((pd.kind === 'arrange' || pd.kind === 'steal') && pd.card === 'jesse' && jid && jid !== id) {
        const j = s.players.find(x => x.id === jid);
        if (j?.alive && s.turn.phase === 'draw') { give(s, j, 2); endDraw(s, j); }
      }
    }
  }
  if (p.ghost) ghostExit(s, p);
  else if (p.alive) exec(s, { t: 'death', target: id, killer: null });
  p.dead = false;
  p.gold = 0;
  say(s, `${p.name} bol vyradený z hry zakladateľom.`);
  run(s);
  s.version++;
  return s;
}

/** Hrac sa pripojil namiesto bota: miesto v hre ostava, meno sa zmeni. */
export function renamePlayer(prev: State, id: string, name: string): State {
  const s: State = structuredClone(prev);
  const p = P(s, id);
  const old = p.name;
  p.name = name;
  say(s, `${name} sa pripojil do hry namiesto hráča ${old}.`);
  s.version++;
  return s;
}

function sidAbility(s: State, p: Player, ids: number[]) {
  if (p.character !== 'sidketchum') fail('Túto schopnosť nemáš');
  if (p.ghost) fail('Tieň si životy neliečí');
  const lethal = s.pending?.kind === 'lethal' && s.pending.player === p.id;
  if (s.pending && !lethal) fail('Teraz sa nedá');
  if (new Set(ids).size !== 2) fail('Odhoď presne 2 karty');
  if (p.hp >= p.maxHp) fail('Máš plný počet životov');
  for (const id of ids) s.discard.push(takeFromHand(p, id));
  p.hp++;
  say(s, `${p.name} odhodil 2 karty: +1 život.`, 'heal');
  if (lethal) afterLethal(s, p);
}

function afterLethal(s: State, p: Player) {
  const pd = s.pending as Extract<Pending, { kind: 'lethal' }>;
  if (p.hp > 0) { s.pending = null; afterDamage(s, p, pd.src, pd.amount); }
  else if (!canSave(s, p)) { s.pending = null; s.queue.unshift({ t: 'death', target: p.id, killer: pd.src }); }
}

function resolvePending(s: State, p: Player, cmd: Command) {
  const pd = s.pending!;
  switch (pd.kind) {
    case 'bang': {
      if (cmd.type === 'pass') { s.pending = null; s.queue.unshift({ t: 'damage', target: p.id, amount: 1, src: pd.src, via: pd.via }); return; }
      if (cmd.type !== 'respond') return fail('Zahraj Vedľa! alebo prijmi zásah');
      const c = takeFromHand(p, cmd.cardId);
      if (!asMissed(p, c)) fail('Touto kartou sa výstrelu nevyhneš');
      s.discard.push(c);
      say(s, `${p.name} zahral ${CARD_NAME[c.type]}.`, 'defend');
      s.pending = null;
      if (pd.needed > 1) s.queue.unshift({ t: 'bang', src: pd.src, target: p.id, needed: pd.needed - 1, barrels: true, via: pd.via });
      else { st(s, p.id).dodges++; say(s, `${p.name} sa výstrelu vyhol.`, 'defend'); }
      return;
    }
    case 'indians': {
      s.pending = null;
      if (cmd.type === 'pass') { s.queue.unshift({ t: 'damage', target: p.id, amount: 1, src: pd.src }); return; }
      if (cmd.type !== 'respond') return fail('Odhoď BANG! alebo prijmi zásah');
      const c = takeFromHand(p, cmd.cardId);
      if (!asBang(p, c)) fail('Treba odhodiť BANG!');
      s.discard.push(c);
      say(s, `${p.name} odhodil ${CARD_NAME[c.type]} proti Indiánom.`, 'defend');
      return;
    }
    case 'duel': {
      s.pending = null;
      if (cmd.type === 'pass') { duelLost(s, p.id, pd.challenger); return; }
      if (cmd.type !== 'respond') return fail('Odhoď BANG! alebo sa vzdaj');
      const c = takeFromHand(p, cmd.cardId);
      if (!asBang(p, c)) fail('Treba odhodiť BANG!');
      s.discard.push(c);
      say(s, `${p.name} v dueli odhodil ${CARD_NAME[c.type]}.`, 'defend');
      s.queue.unshift({ t: 'duel', challenger: pd.challenger, who: pd.other, other: p.id });
      return;
    }
    case 'lethal': {
      if (cmd.type === 'pass') { s.pending = null; s.queue.unshift({ t: 'death', target: p.id, killer: pd.src }); return; }
      if (cmd.type !== 'respond') return fail('Zahraj Pivo alebo sa vzdaj');
      if (!healOptions(s, p).beers) fail('Pivo teraz nepomôže');
      const c = takeFromHand(p, cmd.cardId);
      if (c.type !== 'birra') fail('Zachrániť ťa môže len Pivo');
      s.discard.push(c); p.hp++;
      say(s, `${p.name} sa zachránil Pivom: +1 život.`, 'heal');
      beerPlayed(s);
      afterLethal(s, p);
      return;
    }
    case 'discard': {
      if (cmd.type !== 'discard') return fail('Odhoď karty nad limit');
      if (new Set(cmd.cardIds).size !== pd.count || cmd.cardIds.length !== pd.count) fail(`Odhoď presne ${pd.count}`);
      for (const id of cmd.cardIds) s.discard.push(takeFromHand(p, id));
      say(s, `${p.name} odhodil ${pd.count} ${pd.count === 1 ? 'kartu' : 'karty'}.`);
      s.pending = null;
      finishTurn(s, p);
      return;
    }
    case 'dutch': {
      if (cmd.type !== 'discard' || cmd.cardIds.length !== 1 || !pd.cards.includes(cmd.cardIds[0])) return fail('Odhoď jednu z dvoch potiahnutých kariet');
      const c = takeFromHand(p, cmd.cardIds[0]);
      s.discard.push(c);
      say(s, `${p.name} odhadzuje ${cardLabel(c)} a berie si 1 nuget.`);
      gain(s, p, 1);
      s.pending = null;
      endDraw(s, p);
      return;
    }
    case 'josh': {
      s.pending = null;
      if (cmd.type === 'pass') { s.equipUsed.push(pd.card); say(s, `${p.name} odhadzuje ${EQUIP[pd.card.type].name}.`); return; }
      if (cmd.type !== 'equipUse') return fail('Použi kartu alebo ju odhoď');
      resolveEquip(s, p, pd.card, cmd);
      return;
    }
    case 'jesse': {
      if (cmd.type !== 'choose') return fail('Vyber, odkiaľ berieš prvú kartu');
      if (cmd.option === 'deck') give(s, p, 2);
      else {
        const o = P(s, cmd.option);
        if (!o.alive || o.id === p.id || !o.hand.length) fail('Od tohto hráča sa brať nedá');
        if (o.hand.length > 1) {
          // Rovnako ako pri Panike!: obet si karty zamiesa a Jesse vyberie ktorukolvek rubom. Potiahnutie pokracuje po vybere.
          say(s, `${p.name} chce prvú kartu z ruky hráča ${o.name}. ${o.name} si mieša karty.`);
          s.pending = { kind: 'arrange', player: o.id, src: p.id, card: 'jesse' };
          return;
        }
        p.hand.push(o.hand.pop()!);
        say(s, `${p.name} si berie kartu z ruky hráča ${o.name}.`);
        give(s, p, 1);
      }
      s.pending = null; endDraw(s, p);
      return;
    }
    case 'pedro': {
      if (cmd.type !== 'choose') return fail('Vyber, odkiaľ berieš prvú kartu');
      if (cmd.option === 'discard' && s.discard.length) {
        const c = s.discard.pop()!; p.hand.push(c);
        say(s, `${p.name} si berie ${cardLabel(c)} z odhadzovacieho balíka.`);
        give(s, p, 1);
      } else give(s, p, 2);
      s.pending = null; endDraw(s, p);
      return;
    }
    case 'kit': {
      if (cmd.type !== 'kit') return fail('Vyber 2 karty');
      if (new Set(cmd.cardIds).size !== 2) fail('Vyber presne 2 karty');
      const keep = pd.cards.filter(c => cmd.cardIds.includes(c.id));
      if (keep.length !== 2) fail('Neplatný výber');
      p.hand.push(...keep);
      s.deck.push(...pd.cards.filter(c => !cmd.cardIds.includes(c.id)));
      s.pending = null; endDraw(s, p);
      return;
    }
    case 'arrange': {
      if (cmd.type !== 'arrange') return fail('Zamiešaj si karty a potvrď poradie');
      if (cmd.shuffle) shuffle(s, p.hand);
      else {
        const order = cmd.order ?? [];
        const ids = p.hand.map(c => c.id);
        if (order.length !== ids.length || new Set(order).size !== ids.length || !order.every(id => ids.includes(id))) fail('Neplatné poradie kariet');
        p.hand = order.map(id => p.hand.find(c => c.id === id)!);
      }
      say(s, `${p.name} si zamiešal karty.`);
      s.pending = { kind: 'steal', player: pd.src, victim: p.id, card: pd.card };
      return;
    }
    case 'steal': {
      if (cmd.type !== 'steal') return fail('Vyber kartu');
      const o = P(s, pd.victim);
      if (!Number.isInteger(cmd.index) || cmd.index < 0 || cmd.index >= o.hand.length) fail('Neplatná karta');
      const c = o.hand.splice(cmd.index, 1)[0];
      s.pending = null;
      if (pd.card === 'jesse') {
        p.hand.push(c);
        say(s, `${p.name} si berie kartu z ruky hráča ${o.name}.`);
        give(s, p, 1);
        endDraw(s, p);
        return;
      }
      if (pd.card === 'panico') { p.hand.push(c); say(s, `${p.name} berie hráčovi ${o.name} kartu z ruky.`); }
      else { s.discard.push(c); say(s, `${o.name} odhadzuje ${cardLabel(c)} (Cat Balou).`); }
      return;
    }
    case 'store': {
      if (cmd.type !== 'storePick') return fail('Vyber si kartu');
      const i = s.store.findIndex(c => c.id === cmd.cardId);
      if (i < 0) fail('Táto karta nie je v ponuke');
      const c = s.store.splice(i, 1)[0];
      p.hand.push(c);
      say(s, `${p.name} si berie ${cardLabel(c)}.`);
      s.pending = null;
      s.queue.unshift({ t: 'store', order: pd.order.slice(1) });
      return;
    }
  }
}

function play(s: State, p: Player, cmd: Extract<Command, { type: 'play' }>) {
  const card = p.hand.find(c => c.id === cmd.cardId) ?? fail('Túto kartu nemáš v ruke');
  if (cmd.gold) {
    // Gold Rush: Pivo zahrane za nuget (bez liecenia).
    if (!s.opts.goldRush || card.type !== 'birra') fail('Za nuget sa dá zahrať len Pivo');
    if (heapLeft(s) < 1) fail('Kôpka nugetov je prázdna');
    takeFromHand(p, card.id);
    s.discard.push(card);
    p.gold++;
    say(s, `${p.name} zahral Pivo za 1 nuget.`);
    beerPlayed(s);
    return;
  }
  const targets = targetsFor(s, p, card);
  if (targets === false) fail('Túto kartu teraz nemôžeš zahrať');
  let tg: Player | null = null;
  if (targets) {
    if (!cmd.target || !targets.includes(cmd.target)) fail('Neplatný cieľ');
    tg = P(s, cmd.target!);
  }
  takeFromHand(p, card.id);
  const name = CARD_NAME[card.type];

  // Modre karty zustavaji ve hre.
  if (isBlue(card.type)) {
    if (card.type === 'prigione') { tg!.inPlay.push(card); say(s, `${p.name} poslal hráča ${tg!.name} do väzenia.`); return; }
    if (isWeapon(card.type)) {
      const i = p.inPlay.findIndex(c => isWeapon(c.type));
      if (i >= 0) s.discard.push(p.inPlay.splice(i, 1)[0]);
    }
    p.inPlay.push(card);
    if (card.type === 'dinamite') (s.dynOwner ??= {})[card.id] = p.id;
    say(s, `${p.name} vyložil ${name}.`);
    return;
  }

  s.discard.push(card);
  if (asBang(p, card)) {
    s.turn.bangs++;
    say(s, `${p.name} zahral BANG! na hráča ${tg!.name}.`, 'hit');
    s.queue.unshift({ t: 'bang', src: p.id, target: tg!.id, needed: p.character === 'slab' ? 2 : 1, via: 'bang' });
    return;
  }
  effect(s, p, card.type, tg, cmd.pick, card);
  if (card.type === 'birra') beerPlayed(s);
}

/** Ucinok hnedej karty. Pouziva ho aj vybavenie (Flasa, Komplic), vtedy card = null. */
function effect(s: State, p: Player, type: CardType, tg: Player | null, pick: 'hand' | number | undefined, card: Card | null) {
  const others = othersInOrder(s, p.id).filter(o => {
    if ((type === 'gatling' || type === 'indiani') && immune(o, card)) { say(s, `Hráča ${o.name} chráni Kalumet.`, 'defend'); return false; }
    return true;
  });
  switch (type) {
    case 'bang':
      say(s, `${p.name} strieľa na hráča ${tg!.name}.`, 'hit');
      s.queue.unshift({ t: 'bang', src: p.id, target: tg!.id, needed: 1 });
      break;
    case 'birra': heal(p, 1); say(s, `${p.name} zahral Pivo: +1 život.`, 'heal'); break;
    case 'saloon':
      for (const o of alivePlayers(s)) heal(o, 1);
      say(s, `${p.name} zahral Saloon: všetci +1 život.`, 'heal');
      break;
    case 'diligenza': give(s, p, 2); say(s, `${p.name} zahral Dostavník a ťahá 2 karty.`); break;
    case 'wellsfargo': give(s, p, 3); say(s, `${p.name} zahral Wells Fargo a ťahá 3 karty.`); break;
    case 'gatling':
      say(s, `${p.name} páli z Guľometu na všetkých.`, 'hit');
      s.queue.unshift(...others.map(o => ({ t: 'bang' as const, src: p.id, target: o.id, needed: 1 })));
      break;
    case 'indiani':
      say(s, `${p.name} zahral Indiánov!`, 'hit');
      s.queue.unshift(...others.map(o => ({ t: 'indians' as const, src: p.id, target: o.id })));
      break;
    case 'duello':
      say(s, `${p.name} vyzval hráča ${tg!.name} na duel.`, 'hit');
      s.queue.unshift({ t: 'duel', challenger: p.id, who: tg!.id, other: p.id });
      break;
    case 'emporio': {
      const order = [p, ...others];
      for (let i = 0; i < order.length; i++) { const c = drawCard(s); if (c) s.store.push(c); }
      say(s, `${p.name} otvoril Hokynárstvo: ${s.store.map(cardLabel).join(', ')}.`);
      s.queue.unshift({ t: 'store', order: order.map(o => o.id) });
      break;
    }
    case 'panico': case 'catbalou': {
      const o = tg!;
      let c: Card | undefined;
      if (pick === undefined || pick === 'hand') {
        if (!o.hand.length) fail('Hráč nemá karty v ruke, vyber vyloženú kartu');
        if (o.hand.length > 1) {
          // Obet si karty preusporiada, utocnik potom vyberie jednu rubom.
          say(s, `${p.name} zahral ${CARD_NAME[type]} na hráča ${o.name}. ${o.name} si mieša karty.`);
          s.pending = { kind: 'arrange', player: o.id, src: p.id, card: type };
          break;
        }
        c = o.hand.pop();
      } else {
        const i = o.inPlay.findIndex(x => x.id === pick);
        if (i < 0) fail('Túto kartu hráč nemá vyloženú');
        c = o.inPlay.splice(i, 1)[0];
      }
      const what = pick === undefined || pick === 'hand' ? 'kartu z ruky' : cardLabel(c!);
      if (type === 'panico') { p.hand.push(c!); say(s, `${p.name} zahral Paniku! a berie hráčovi ${o.name} ${what}.`); }
      else { s.discard.push(c!); say(s, `${p.name} zahral Cat Balou: ${o.name} odhadzuje ${cardLabel(c!)}.`); }
      break;
    }
  }
}

// ---------- Gold Rush ----------

export interface EquipOption { as?: string; targets: string[] | null }

/** Ako sa da karta vybavenia prave pouzit. Prazdne pole = neda sa. */
export function equipOptions(s: State, p: Player, type: EquipType): EquipOption[] {
  const all = alivePlayers(s);
  const others = all.filter(o => o.id !== p.id);
  const ids = (a: Player[]) => a.map(o => o.id);
  const withCards = (o: Player) => o.hand.length + o.inPlay.length > 0;
  const out: EquipOption[] = [];
  const add = (as: string | undefined, a: Player[] | null) => { if (a === null) out.push({ as, targets: null }); else if (a.length) out.push({ as, targets: ids(a) }); };
  const canHeal = !p.ghost && p.hp < p.maxHp;
  switch (type) {
    case 'bicchierino': add(undefined, all.filter(o => !o.ghost && o.hp < o.maxHp)); break;
    case 'bottiglia':
      add('bang', others.filter(o => distance(s, p.id, o.id) <= weaponRange(p)));
      add('panico', others.filter(o => distance(s, p.id, o.id) <= 1 && withCards(o)));
      if (canHeal && all.length > 2) add('birra', null);
      break;
    case 'complice':
      add('emporio', null);
      add('duello', others);
      add('catbalou', others.filter(withCards));
      break;
    case 'rum': if (canHeal) add(undefined, null); break;
    case 'corsa_all_oro': case 'union_pacific': add(undefined, null); break;
    case 'ricercato': add(undefined, others.filter(o => !hasEq(o, 'ricercato'))); break;
    default: if (!hasEq(p, type)) add(undefined, null);
  }
  return out;
}

export function priceOf(s: State, p: Player, type: EquipType): number {
  const off = p.character === 'pretty_luzena' && !s.turn.luzena ? 1 : 0;
  return Math.max(0, EQUIP[type].cost - off);
}

function buy(s: State, p: Player, cmd: Extract<Command, { type: 'buy' }>) {
  if (!s.opts.goldRush) fail('Rozšírenie Gold Rush nie je zapnuté');
  const i = s.shop.findIndex(e => e.id === cmd.equipId);
  if (i < 0) fail('Táto karta nie je v ponuke');
  const card = s.shop[i];
  const price = priceOf(s, p, card.type);
  if (p.gold < price) fail('Nemáš dosť nugetov');
  p.gold -= price;
  if (p.character === 'pretty_luzena') s.turn.luzena = true;
  s.shop.splice(i, 1);
  refillShop(s);
  say(s, `${p.name} kupuje ${EQUIP[card.type].name} za ${nug(price)}.`);
  resolveEquip(s, p, card, cmd);
}

function resolveEquip(s: State, p: Player, card: Equip, cmd: { as?: string; target?: string; pick?: 'hand' | number }) {
  const opts = equipOptions(s, p, card.type);
  if (!opts.length) fail('Túto kartu teraz nevyužiješ');
  const o = opts.find(x => x.as === (cmd.as ?? undefined)) ?? fail('Vyber, ako kartu použiješ');
  let tg: Player | null = null;
  if (o.targets) {
    if (!cmd.target || !o.targets.includes(cmd.target)) fail('Neplatný cieľ');
    tg = P(s, cmd.target!);
  }
  const def = EQUIP[card.type];
  if (def.black) {
    if (card.type === 'ricercato') { tg!.equip.push(card); say(s, `${p.name} vyhlásil hráča ${tg!.name} za Hľadaného.`, 'hit'); }
    else { p.equip.push(card); say(s, `${p.name} si vykladá ${def.name}.`); }
    return;
  }
  s.equipUsed.push(card);
  switch (card.type) {
    case 'bicchierino': heal(tg!, 1); say(s, `${tg!.name} si lieči 1 život (Panák).`, 'heal'); break;
    case 'bottiglia': case 'complice': effect(s, p, o.as as CardType, tg, cmd.pick, null); break;
    case 'union_pacific': give(s, p, 4); say(s, `${p.name} ťahá 4 karty (Union Pacific).`); break;
    case 'rum': {
      const n = 4 + (p.character === 'luckyduke' ? 1 : 0) + (hasEq(p, 'ferro_di_cavallo') ? 1 : 0);
      const cs: Card[] = [];
      for (let k = 0; k < n; k++) { const c = drawCard(s); if (c) cs.push(c); }
      s.discard.push(...cs);
      const got = heal(p, new Set(cs.map(c => c.suit)).size);
      say(s, `${p.name} otáča karty (Rum): ${cs.map(cardLabel).join(', ')}. +${got} ${got === 1 ? 'život' : got >= 2 && got <= 4 ? 'životy' : 'životov'}.`, 'heal');
      break;
    }
    case 'corsa_all_oro':
      s.turn.again = true;
      endTurn(s, p);
      break;
  }
}

function scrap(s: State, p: Player, cmd: Extract<Command, { type: 'scrap' }>) {
  if (!s.opts.goldRush) fail('Rozšírenie Gold Rush nie je zapnuté');
  const o = P(s, cmd.target);
  const i = o.equip.findIndex(e => e.id === cmd.equipId);
  if (i < 0) fail('Túto kartu hráč nemá vyloženú');
  const cost = EQUIP[o.equip[i].type].cost + 1;
  if (p.gold < cost) fail('Nemáš dosť nugetov');
  p.gold -= cost;
  const c = o.equip.splice(i, 1)[0];
  s.equipUsed.push(c);
  say(s, `${p.name} platí ${nug(cost)}: ${o.name} odhadzuje ${EQUIP[c.type].name}.`);
}

function rucksack(s: State, p: Player) {
  if (!hasEq(p, 'zaino')) fail('Túto schopnosť nemáš');
  if (p.ghost) fail('Tieň si životy neliečí');
  if (p.hp >= p.maxHp) fail('Máš plný počet životov');
  if (p.gold < 2) fail('Nemáš dosť nugetov');
  p.gold -= 2; p.hp++;
  say(s, `${p.name} platí 2 nugety: +1 život (Batoh).`, 'heal');
}

export interface AbilityInfo { name: AbilityName; cost: number; targets?: string[]; left?: number }

/** Platene schopnosti, ktore moze hrac prave pouzit (vo svojom tahu alebo Batoh pri smrtelnom zasahu). */
export function abilitiesFor(s: State, pid: string): AbilityInfo[] {
  const p = s.players.find(x => x.id === pid);
  if (!p || !p.alive || s.winner || s.setup || !s.opts.goldRush) return [];
  const sack = hasEq(p, 'zaino') && !p.ghost && p.gold >= 2 && p.hp < p.maxHp;
  if (s.pending) return s.pending.kind === 'lethal' && s.pending.player === pid && sack ? [{ name: 'zaino', cost: 2 }] : [];
  if (s.turn.player !== pid || s.turn.phase !== 'play') return [];
  const out: AbilityInfo[] = [];
  if (hasEq(p, 'setaccio') && s.turn.goldPan < 2 && p.gold >= 1) out.push({ name: 'setaccio', cost: 1, left: 2 - s.turn.goldPan });
  if (p.character === 'raddie_snake' && s.turn.raddie < 2 && p.gold >= 1) out.push({ name: 'raddie', cost: 1, left: 2 - s.turn.raddie });
  if (p.character === 'jacky_murieta' && p.gold >= 2) {
    const t = alivePlayers(s).filter(o => o.id !== pid && distance(s, pid, o.id) <= weaponRange(p)).map(o => o.id);
    if (t.length) out.push({ name: 'jacky', cost: 2, targets: t });
  }
  if (p.character === 'josh_mccloud' && p.gold >= 2 && s.equipDeck.length + s.equipUsed.length > 0) out.push({ name: 'josh', cost: 2 });
  if (sack) out.push({ name: 'zaino', cost: 2 });
  return out;
}

function ability(s: State, p: Player, cmd: Extract<Command, { type: 'ability' }>) {
  const a = abilitiesFor(s, p.id).find(x => x.name === cmd.name) ?? fail('Túto schopnosť teraz nemôžeš použiť');
  switch (a.name) {
    case 'setaccio': p.gold--; s.turn.goldPan++; give(s, p, 1); say(s, `${p.name} platí 1 nuget a ťahá kartu (Ryžovacia panvica).`); break;
    case 'raddie': p.gold--; s.turn.raddie++; give(s, p, 1); say(s, `${p.name} platí 1 nuget a ťahá kartu.`); break;
    case 'jacky': {
      if (!cmd.target || !a.targets!.includes(cmd.target)) fail('Neplatný cieľ');
      p.gold -= 2;
      say(s, `${p.name} platí 2 nugety a strieľa na hráča ${P(s, cmd.target!).name}.`, 'hit');
      s.queue.unshift({ t: 'bang', src: p.id, target: cmd.target!, needed: 1 });
      break;
    }
    case 'josh': {
      p.gold -= 2;
      const c = drawEquip(s)!;
      say(s, `${p.name} platí 2 nugety a ťahá z balíka vybavenia: ${EQUIP[c.type].name}.`);
      if (!equipOptions(s, p, c.type).length) { s.equipUsed.push(c); say(s, `${p.name} kartu ${EQUIP[c.type].name} nevyužije a odhadzuje ju.`); }
      else s.pending = { kind: 'josh', player: p.id, card: c };
      break;
    }
    case 'zaino': rucksack(s, p); break;
  }
}
