import { Card, CharKey, Role, Equip, EQUIP } from './data';
import { AbilityInfo, EquipOption, Why, whyNotCard, whyNotTarget, heapLeft, LogEntry, Options, Player, State, Winner, abilitiesFor, actor, equipOptions, priceOf, setupActors, eligible, targetsFor, distance, weaponRange } from './engine';

export interface PlayerView {
  id: string;
  name: string;
  character: CharKey;
  hp: number;
  maxHp: number;
  alive: boolean;
  handCount: number;
  inPlay: Card[];
  /** null = skryta role */
  role: Role | null;
  /** vzdalenost ode me (jak ho vidim ja) */
  distance: number;
  /** Gold Rush */
  gold: number;
  equip: Equip[];
  /** vyradeny hrac (s tienmi sa vracia na svoj tah) */
  dead: boolean;
  /** prave hra ako tien */
  ghost: boolean;
  side: 'law' | 'outlaw' | null;
  /** po skonceni hry: patri k vitazom */
  won: boolean;
}

/** Karta v ponuke vybavenia: cena pre mna a ako ju viem pouzit (prazdne = teraz sa neda kupit). */
export interface ShopItem { card: Equip; price: number; options: EquipOption[] }

export function didWin(s: State, p: Player): boolean {
  if (!s.winner) return false;
  const shadow = p.role === 'rinnegato' && p.dead ? p.side : null;
  if (s.winner === 'sceriffo') return p.role === 'sceriffo' || p.role === 'vice' || shadow === 'law';
  if (s.winner === 'fuorilegge') return p.role === 'fuorilegge' || shadow === 'outlaw';
  return p.role === 'rinnegato' && !p.dead;
}

export interface PendingView {
  kind: string;
  player: string;
  src?: string;
  needed?: number;
  count?: number;
  /** jen pro hrace, ktery rozhoduje */
  cards?: Card[];
  options?: string[];
  /** Josh McCloud: potiahnute vybavenie a moznosti pouzitia */
  equip?: Equip;
  equipOptions?: EquipOption[];
  /** Panika!/Cat Balou z ruky: obet, pocet jej kariet a druh karty */
  victim?: string;
  card?: 'panico' | 'catbalou' | 'jesse';
}

/** Pohlad pocas vyberu rol a postav. Nikto nevidi cudzie karty okrem odkryteho Serifa. */
export interface SetupView {
  stage: 'setup';
  version: number;
  me: string;
  phase: 'roles' | 'chars';
  opts: Options;
  players: { id: string; name: string; role: Role | null; hasRole: boolean; picks: number; chosen: boolean; waiting: boolean }[];
  roles: { taken: string | null; role: Role | null }[];
  chars: { taken: string | null; ch: CharKey | null }[];
  myPicks: CharKey[];
  myChoice: CharKey | null;
  log: LogEntry[];
}

export function setupViewFor(s: State, pid: string): SetupView {
  const st = s.setup!;
  const waiting = new Set(setupActors(s));
  const roleOf = (id: string) => st.roles.find(r => r.taken === id)?.role ?? null;
  return {
    stage: 'setup',
    version: s.version,
    me: pid,
    phase: st.phase,
    opts: s.opts,
    players: s.players.map(p => {
      const r = roleOf(p.id);
      return {
        id: p.id, name: p.name,
        role: r && (p.id === pid || r === 'sceriffo') ? r : null,
        hasRole: !!r,
        picks: (st.picked[p.id] ?? []).length,
        chosen: !!st.chosen[p.id],
        waiting: waiting.has(p.id),
      };
    }),
    roles: st.roles.map(r => ({ taken: r.taken, role: r.taken && (r.taken === pid || r.role === 'sceriffo') ? r.role : null })),
    chars: st.chars.map(c => ({ taken: c.taken, ch: c.taken === pid ? c.ch : null })),
    myPicks: (st.picked[pid] ?? []).map(i => st.chars[i].ch),
    myChoice: st.chosen[pid] ?? null,
    log: s.log.slice(-40),
  };
}

export interface GameView {
  stage: 'game';
  version: number;
  me: string;
  myRole: Role;
  hand: Card[];
  players: PlayerView[];
  deckCount: number;
  discardTop: Card | null;
  /** poslednych 8 odhodenych kariet, vrch je posledny */
  discardPile: Card[];
  discardCount: number;
  store: Card[];
  turn: { player: string; phase: string; bangs: number; extra?: boolean };
  actor: string | null;
  pending: PendingView | null;
  /** karty, kterymi muzu odpovedet na cekajici rozhodnuti */
  eligible: number[];
  /** karty, ktere muzu zahrat ve svem tahu: id -> cile (null = bez cile) */
  playable: Record<number, string[] | null>;
  range: number;
  winner: Winner | null;
  log: LogEntry[];
  opts: Options;
  /** Gold Rush: ponuka vybavenia, pocet kariet v baliku, moje schopnosti a Piva hratelne za nuget */
  shop: ShopItem[];
  equipDeckCount: number;
  abilities: AbilityInfo[];
  beerGold: number[];
  myGold: number;
  /** preco sa karta z ruky neda zahrat: id karty -> dovod */
  why: Record<number, Why>;
  /** preco hrac nemoze byt cielom: druh ucinku (bang, panico..., alebo id karty z ruky) -> id hraca -> dovod */
  targetWhy: Record<string, Record<string, Why>>;
  /** nugety, ktore este lezia na kopke (spolu je ich 30) */
  heap: number;
}

/** Pohled jednoho hrace. Nic, co hrac nema videt, se ven nedostane. */
export function viewFor(s: State, pid: string): GameView {
  const me = s.players.find(p => p.id === pid)!;
  const over = !!s.winner;
  const playable: Record<number, string[] | null> = {};
  const myTurn = !over && !s.pending && s.turn.player === pid && s.turn.phase === 'play';
  const why: Record<number, Why> = {};
  const targetWhy: Record<string, Record<string, Why>> = {};
  const others = s.players.filter(p => p.id !== pid);
  const blocks = (kind: string, card: Card | null) => {
    const out: Record<string, Why> = {};
    for (const o of others) { const w = whyNotTarget(s, me, kind, o, card); if (w) out[o.id] = w; }
    return out;
  };
  if (myTurn) {
    for (const c of me.hand) {
      const t = targetsFor(s, me, c);
      if (t !== false) playable[c.id] = t;
      else { const w = whyNotCard(s, me, c); if (w) why[c.id] = w; }
      // dovody podla hracov: aj pri karte bez platneho ciela, aby sa dalo ukazat, co komu chyba
      const kind = c.type === 'bang' || (me.character === 'calamityjanet' && c.type === 'mancato') ? 'bang' : c.type;
      if (['bang', 'panico', 'catbalou', 'duello', 'prigione'].includes(kind) && why[c.id]?.code !== 'bang-limit') targetWhy[c.id] = blocks(kind, c);
    }
    if (s.opts.goldRush) for (const k of ['bang', 'panico', 'catbalou', 'duello', 'bicchierino', 'ricercato']) targetWhy[k] = blocks(k, null);
  }
  let pending: PendingView | null = null;
  if (s.pending) {
    const pd = s.pending;
    pending = { kind: pd.kind, player: pd.player };
    if ('src' in pd && pd.src) pending.src = pd.src;
    if (pd.kind === 'bang') pending.needed = pd.needed;
    if (pd.kind === 'discard') pending.count = pd.count;
    if (pd.kind === 'duel') pending.src = pd.other;
    if (pd.kind === 'arrange') pending.card = pd.card;
    if (pd.kind === 'josh') pending.equip = pd.card;
    if (pd.kind === 'steal') { pending.victim = pd.victim; pending.card = pd.card; }
    if (pd.player === pid) {
      if (pd.kind === 'kit') pending.cards = pd.cards;
      if (pd.kind === 'dutch') pending.cards = me.hand.filter(c => pd.cards.includes(c.id));
      if (pd.kind === 'josh') pending.equipOptions = equipOptions(s, me, pd.card.type);
      if (pd.kind === 'steal') pending.count = s.players.find(p => p.id === pd.victim)!.hand.length;
      if (pd.kind === 'jesse') pending.options = s.players.filter(p => p.alive && p.id !== pid && p.hand.length > 0).map(p => p.id);
    }
  }
  return {
    stage: 'game',
    version: s.version,
    me: pid,
    myRole: me.role,
    hand: me.hand,
    players: s.players.map(p => ({
      id: p.id, name: p.name, character: p.character, hp: p.hp, maxHp: p.maxHp, alive: p.alive,
      handCount: p.hand.length, inPlay: p.inPlay,
      role: p.id === pid || p.role === 'sceriffo' || !p.alive || p.dead || over ? p.role : null,
      distance: p.id === pid || !p.alive || !me.alive ? 0 : distance(s, pid, p.id),
      gold: p.gold, equip: p.equip, dead: p.dead, ghost: p.ghost, side: p.side, won: didWin(s, p),
    })),
    deckCount: s.deck.length,
    discardTop: s.discard[s.discard.length - 1] ?? null,
    discardPile: s.discard.slice(-8),
    discardCount: s.discard.length,
    store: s.store,
    turn: { player: s.turn.player, phase: s.turn.phase, bangs: s.turn.bangs, extra: s.turn.extra },
    actor: actor(s),
    pending,
    eligible: eligible(s, pid),
    playable,
    range: weaponRange(me),
    winner: s.winner,
    log: s.log.slice(-60),
    opts: s.opts,
    shop: s.shop.map(card => {
      const price = priceOf(s, me, card.type);
      return { card, price, options: myTurn && me.gold >= price ? equipOptions(s, me, card.type) : [] };
    }),
    equipDeckCount: s.equipDeck.length + s.equipUsed.length,
    abilities: abilitiesFor(s, pid),
    beerGold: myTurn && s.opts.goldRush && heapLeft(s) > 0 ? me.hand.filter(c => c.type === 'birra').map(c => c.id) : [],
    myGold: me.gold,
    why, targetWhy,
    heap: heapLeft(s),
  };
}
