import { CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Card, GameView } from '@bang/engine';
import { CardBack, CardView, Gold } from './Cards';

/**
 * Letiace karty a nugety. Porovna predchadzajuci a novy stav hry a pre kazdy presun nakresli kratky let:
 *  - zahrana/odhodena karta -> odhadzovaci balik (z ruky, alebo od hraca, ktoremu ubudla karta),
 *  - potiahnute karty: balik -> hrac (alebo ruka),
 *  - ukradnuta karta: hrac -> hrac (rubom),
 *  - nugety: kopka <-> hrac.
 * Zivy stav hry sa nemeni, let je len kozmeticka vrstva. Pri prefers-reduced-motion sa nehra.
 */

type Pt = { x: number; y: number };
type Flight =
  | { id: number; kind: 'card'; card: Card; from: Pt; to: Pt; s0: number; s1: number; delay: number; ms: number }
  | { id: number; kind: 'back'; from: Pt; to: Pt; s0: number; s1: number; delay: number; ms: number }
  | { id: number; kind: 'gold'; from: Pt; to: Pt; delay: number; ms: number };

interface Snap {
  hand: Map<number, DOMRect>;
  pileIds: Set<number>;
  deck: number;
  discardCount: number;
  hands: Record<string, number>;
  inPlay: Record<string, number>;
  gold: Record<string, number>;
  version: number;
}

const centre = (r: DOMRect): Pt => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

let seq = 1;
/** Spomalenie vsetkych letov (trvanie aj rozostupy). */
const SLOW = 1.7;

export function useFlights(view: GameView) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [hidden, setHidden] = useState<number[]>([]);
  const snap = useRef<Snap | null>(null);

  useLayoutEffect(() => {
    const prev = snap.current;
    const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);
    const seatRect = (id: string) => q(`[data-seat="${id}"]`)?.getBoundingClientRect() ?? null;
    const handBox = () => q('.gb-hand')?.getBoundingClientRect() ?? null;
    const pileEl = q<HTMLElement>('.bang-pile');
    const deckEl = q<HTMLElement>('.bang-deck');
    // prirodzena velkost stolovej karty (mimo skalovania javiska) a mierka javiska
    // pozor: karty na odhadzovacom baliku su natocene, ich obrys by mierku skreslil; meria sa balik (bez natocenia)
    const refCard = deckEl?.querySelector<HTMLElement>('.bang-card') ?? pileEl?.querySelector<HTMLElement>('.bang-card');
    const natW = refCard?.offsetWidth || 80;
    const stageK = refCard ? refCard.getBoundingClientRect().width / natW : 1;

    // snimka pre dalsi krok: pozicie kariet v ruke (pred zmenou stavu uz neexistuju)
    const next: Snap = {
      hand: new Map(),
      pileIds: new Set(view.discardPile.map(c => c.id)),
      deck: view.deckCount,
      discardCount: view.discardCount,
      hands: Object.fromEntries(view.players.map(p => [p.id, p.handCount])),
      inPlay: Object.fromEntries(view.players.map(p => [p.id, p.inPlay.length + p.equip.length])),
      gold: Object.fromEntries(view.players.map(p => [p.id, p.gold])),
      version: view.version,
    };
    document.querySelectorAll<HTMLElement>('[data-hand-card]').forEach(el => next.hand.set(Number(el.dataset.handCard), el.getBoundingClientRect()));
    snap.current = next;

    if (!prev || reduced() || document.hidden || view.version - prev.version > 3 || view.version <= prev.version) return;
    if (!pileEl || !refCard) return;

    const out: Flight[] = [];
    const pileC = centre(pileEl.getBoundingClientRect());
    const deckC = deckEl ? centre(deckEl.getBoundingClientRect()) : pileC;
    const seatC = (id: string): Pt | null => { const r = seatRect(id); return r ? centre(r) : null; };
    const myHandC = (): Pt | null => { const r = handBox(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; };
    const where = (id: string) => (id === view.me ? myHandC() ?? seatC(id) : seatC(id));

    // kto stratil karty (nie z ruky nasej, ktoru poznas presne)
    const drop: [string, number][] = view.players
      .map(p => [p.id, (prev.hands[p.id] ?? p.handCount) - p.handCount + Math.max(0, (prev.inPlay[p.id] ?? 0) - (p.inPlay.length + p.equip.length))] as [string, number])
      .filter(([, d]) => d > 0)
      .sort((a, b) => b[1] - a[1]);
    const gain = new Map<string, number>(view.players.map(p => [p.id, p.handCount - (prev.hands[p.id] ?? p.handCount)] as [string, number]).filter(([, d]) => d > 0));

    // 1) nove karty na odhadzovacom baliku
    const landed = view.discardPile.filter(c => !prev.pileIds.has(c.id)).slice(-4);
    const hide: number[] = [];
    landed.forEach((c, i) => {
      let from: Pt | null = null;
      let s0 = 0.9 * stageK;
      const hr = prev.hand.get(c.id);
      if (hr) { from = centre(hr); s0 = hr.width / natW; }
      else {
        const d = drop.find(x => x[1] > 0);
        if (d) { d[1]--; from = where(d[0]); s0 = 0.6 * stageK; }
        else from = seatC(view.turn.player) ?? myHandC();
      }
      if (!from) return;
      hide.push(c.id);
      out.push({ id: seq++, kind: 'card', card: c, from, to: pileC, s0, s1: stageK, delay: i * 90 * SLOW, ms: 460 * SLOW });
    });

    // 2) potiahnute karty: balik -> hrac (len ked sa balik zmensil)
    const deckDrop = prev.deck - view.deckCount;
    if (deckDrop > 0) {
      let budget = Math.min(6, deckDrop);
      let i = 0;
      for (const [id, n] of gain) {
        for (let k = 0; k < n && budget > 0; k++, budget--) {
          const to = where(id);
          if (!to) continue;
          out.push({ id: seq++, kind: 'back', from: deckC, to, s0: stageK, s1: id === view.me ? stageK * 0.9 : stageK * 0.5, delay: (120 + i++ * 110) * SLOW, ms: 420 * SLOW });
        }
      }
    } else if (!landed.length) {
      // 3) karta presla od hraca k hracovi (Panika!, Hokynarstvo...): rubom
      for (const [id, n] of gain) {
        const d = drop.find(x => x[0] !== id && x[1] > 0);
        if (!d) continue;
        const from = where(d[0]), to = where(id);
        if (!from || !to) continue;
        for (let k = 0; k < Math.min(n, d[1], 3); k++) out.push({ id: seq++, kind: 'back', from, to, s0: stageK * 0.6, s1: stageK * 0.6, delay: k * 120 * SLOW, ms: 480 * SLOW });
        d[1] -= n;
      }
    }

    // 4) nugety: kopka <-> hrac
    const heap = q('.gshop__heap')?.getBoundingClientRect();
    const heapC = heap ? centre(heap) : pileC;
    let gi = 0;
    for (const p of view.players) {
      const dg = p.gold - (prev.gold[p.id] ?? p.gold);
      if (!dg) continue;
      const sc = where(p.id) && seatC(p.id);
      if (!sc) continue;
      for (let k = 0; k < Math.min(Math.abs(dg), 5); k++) {
        out.push({ id: seq++, kind: 'gold', from: dg > 0 ? heapC : sc, to: dg > 0 ? sc : heapC, delay: (80 + (gi++ % 8) * 90) * SLOW, ms: 560 * SLOW });
      }
    }

    if (!out.length) return;
    setFlights(f => [...f, ...out]);
    if (hide.length) {
      setHidden(h => [...h, ...hide]);
      const end = Math.max(...out.filter(f => f.kind === 'card').map(f => f.delay + f.ms)) + 40;
      setTimeout(() => setHidden(h => h.filter(x => !hide.includes(x))), end);
    }
  }, [view.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = (id: number) => setFlights(f => f.filter(x => x.id !== id));
  return { flights, hidden, done };
}

function FlyingThing({ f, w, h, done }: { f: Flight; w: number; h: number; done: (id: number) => void }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const size = f.kind === 'gold' ? { w: 22, h: 19 } : { w, h };
    const tf = (p: Pt, s: number, r: number) => `translate(${p.x - size.w / 2}px, ${p.y - size.h / 2}px) scale(${s}) rotate(${r}deg)`;
    const s0 = f.kind === 'gold' ? 1 : f.s0, s1 = f.kind === 'gold' ? 0.8 : f.s1;
    const mid: Pt = { x: (f.from.x + f.to.x) / 2, y: Math.min(f.from.y, f.to.y) - 26 - Math.abs(f.to.x - f.from.x) * 0.06 };
    const rot = f.kind === 'gold' ? 180 : (f.to.x >= f.from.x ? 1 : -1) * 9;
    const a = node.animate(
      [
        { transform: tf(f.from, s0, 0), opacity: 0.95, offset: 0 },
        { transform: tf(mid, (s0 + s1) / 2 * (f.kind === 'gold' ? 1.1 : 1.06), rot), opacity: 1, offset: 0.55 },
        { transform: tf(f.to, s1, f.kind === 'gold' ? 360 : 0), opacity: f.kind === 'card' ? 1 : 0.9, offset: 1 },
      ],
      { duration: f.ms, delay: f.delay, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'both' },
    );
    a.onfinish = () => done(f.id);
    a.oncancel = () => done(f.id);
    return () => a.cancel();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const base: CSSProperties = { position: 'fixed', left: 0, top: 0, pointerEvents: 'none', zIndex: 9000, transformOrigin: 'center', opacity: 0, willChange: 'transform' };
  if (f.kind === 'gold') return <div ref={el} className="fl-fly" style={{ ...base, width: 22, height: 19 }} aria-hidden="true"><Gold size={22} /></div>;
  const inner: CSSProperties = { width: '100%', height: '100%' };
  return (
    <div ref={el} className="fl-fly" style={{ ...base, width: w, height: h, filter: 'drop-shadow(0 6px 8px rgba(0,0,0,.45))' }} aria-hidden="true">
      {f.kind === 'card' ? <CardView card={f.card} size="table" style={inner} /> : <CardBack />}
    </div>
  );
}

/** Vrstva nad celou obrazovkou; velkost karty sa precita zo skutocnej stolovej karty. */
export function FlightLayer({ flights, done }: { flights: Flight[]; done: (id: number) => void }) {
  if (!flights.length || typeof document === 'undefined') return null;
  const ref = document.querySelector<HTMLElement>('.bang-deck .bang-card') ?? document.querySelector<HTMLElement>('.bang-pile .bang-card');
  const w = ref?.offsetWidth || 80, h = ref?.offsetHeight || 124;
  return createPortal(<>{flights.map(f => <FlyingThing key={f.id} f={f} w={w} h={h} done={done} />)}</>, document.body);
}
