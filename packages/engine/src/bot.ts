import { Command, State, heapLeft, abilitiesFor, eligible, equipOptions, priceOf, setupActors, targetsFor } from './engine';
import { EQUIP } from './data';

/**
 * Jednoduchy nahodny bot. Slouzi k lokalnimu testovani a k fuzz testum enginu,
 * neni to souper, ktery by hral dobre.
 */
export function botCommand(s: State, pid: string, rand: () => number = Math.random): Command | null {
  const p = s.players.find(x => x.id === pid);
  if (!p || !p.alive || s.winner) return null;
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  /** ciel a vyber karty pre vybavenie (Flasa ako Panika, Komplic ako Cat Balou) */
  const aim = (as: string | undefined, targets: string[] | null): { target?: string; pick?: 'hand' | number } => {
    if (!targets) return {};
    const target = pick(targets);
    if (as !== 'panico' && as !== 'catbalou') return { target };
    const o = s.players.find(x => x.id === target)!;
    const opts: ('hand' | number)[] = [...o.inPlay.map(x => x.id)];
    if (o.hand.length) opts.push('hand');
    return { target, pick: pick(opts) };
  };
  const st = s.setup;
  if (st) {
    if (!setupActors(s).includes(pid)) return null;
    if (st.phase === 'roles') return { type: 'pickRole', slot: pick(st.roles.map((r, i) => (r.taken ? -1 : i)).filter(i => i >= 0)) };
    const mine = st.picked[pid] ?? [];
    if (mine.length < 2) return { type: 'pickChar', slot: pick(st.chars.map((c, i) => (c.taken ? -1 : i)).filter(i => i >= 0)) };
    return { type: 'chooseChar', ch: st.chars[pick(mine)].ch };
  }
  const pd = s.pending;
  if (pd) {
    if (pd.player !== pid) return null;
    const el = eligible(s, pid);
    switch (pd.kind) {
      case 'bang': case 'indians': case 'duel':
        return el.length && rand() < 0.85 ? { type: 'respond', cardId: pick(el) } : { type: 'pass' };
      case 'lethal':
        if (el.length) return { type: 'respond', cardId: el[0] };
        if (abilitiesFor(s, pid).some(a => a.name === 'zaino')) return { type: 'ability', name: 'zaino' };
        if (p.character === 'sidketchum' && p.hand.length >= 2) return { type: 'sid', cardIds: [p.hand[0].id, p.hand[1].id] };
        return { type: 'pass' };
      case 'discard': return { type: 'discard', cardIds: p.hand.slice(0, pd.count).map(c => c.id) };
      case 'jesse': case 'pedro': return { type: 'choose', option: rand() < 0.5 ? 'deck' : pd.kind === 'pedro' ? 'discard' : 'deck' };
      case 'kit': return { type: 'kit', cardIds: pd.cards.slice(0, 2).map(c => c.id) };
      case 'store': return { type: 'storePick', cardId: pick(el) };
      case 'arrange': return { type: 'arrange', shuffle: true };
      case 'dutch': return { type: 'discard', cardIds: [pick(pd.cards)] };
      case 'josh': {
        const o = pick(equipOptions(s, p, pd.card.type));
        return o ? { type: 'equipUse', as: o.as, ...aim(o.as, o.targets) } : { type: 'pass' };
      }
      case 'steal': {
        const n = s.players.find(x => x.id === pd.victim)!.hand.length;
        return { type: 'steal', index: Math.floor(rand() * n) };
      }
    }
  }
  if (s.turn.player !== pid || s.turn.phase !== 'play') return null;
  const plays: Command[] = [];
  if (s.opts.goldRush) {
    for (const e of s.shop) {
      if (p.gold < priceOf(s, p, e.type)) continue;
      // zbytocne nakupy vynechaj: Hladany a lieky maju zmysel len niekedy
      const opts = equipOptions(s, p, e.type);
      if (!opts.length || (EQUIP[e.type].cost >= 4 && rand() < 0.3)) continue;
      const o = pick(opts);
      plays.push({ type: 'buy', equipId: e.id, as: o.as, ...aim(o.as, o.targets) });
    }
    for (const a of abilitiesFor(s, pid)) {
      if (a.name === 'zaino' && p.hp > 1) continue;
      plays.push({ type: 'ability', name: a.name, target: a.targets ? pick(a.targets) : undefined });
    }
    if (heapLeft(s) > 0 && (p.hp >= p.maxHp || rand() < 0.3)) for (const c of p.hand) if (c.type === 'birra') plays.push({ type: 'play', cardId: c.id, gold: true });
  }
  for (const c of p.hand) {
    const t = targetsFor(s, p, c);
    if (t === false) continue;
    if (t === null) { plays.push({ type: 'play', cardId: c.id }); continue; }
    const target = pick(t);
    const o = s.players.find(x => x.id === target)!;
    let pk: 'hand' | number | undefined;
    if (c.type === 'panico' || c.type === 'catbalou') {
      const opts: ('hand' | number)[] = [...o.inPlay.map(x => x.id)];
      if (o.hand.length) opts.push('hand');
      pk = pick(opts);
    }
    plays.push({ type: 'play', cardId: c.id, target, pick: pk });
  }
  if (plays.length && rand() < 0.8) return pick(plays);
  return { type: 'endTurn' };
}
