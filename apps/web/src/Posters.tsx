import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { isBlue, type Card, type Command, type HandPickSource, type LogEntry } from '@bang/engine';
import { socket } from './net';
import { useLang } from './i18n';
import { cardName, handPickName, trLog } from './i18nData';
import { CardBack, CardInner, Icon, SpriteFace, cardTitle } from './Cards';
import { vibrate } from './device';
import { Poster } from './Layout';

export function BigCard({ k, title }: { k: string; title: string }) {
  return (
    <span className="bang-card gb-bigcard" data-kind="brown">
      <span className="bang-card__inner"><span className="bang-card__face has-img"><SpriteFace k={k} title={title} /></span></span>
    </span>
  );
}

/**
 * Obet Paniky!/Cat Balou si preusporiada karty: tahanim (mys aj dotyk), sipkami na klavesnici
 * alebo tlacidlom Zamiesaj. Utocnik potom uvidi karty rubom presne v tomto poradi.
 *
 * Tahanie ide mimo Reactu: poloha karty a posuv susedov sa pisu priamo do style (transform),
 * stav sa meni az pri pusteni. Pri okraji riadku sa riadok sam posuva (autoscroll).
 */
/** Zivy pohlad utocnika na to, ako si obet prehadzuje karty (karty ostavaju rubom). */
export function LiveShuffle({ count }: { count: number }) {
  const [perm, setPerm] = useState<number[]>(() => Array.from({ length: count }, (_, i) => i));
  useEffect(() => {
    const on = (d: { perm?: number[] }) => { if (Array.isArray(d?.perm) && d.perm.length === count) setPerm(d.perm); };
    socket.on('shuffleLive', on);
    return () => { socket.off('shuffleLive', on); };
  }, [count]);
  return (
    <div className="live-shuffle" aria-hidden="true" style={{ ['--n' as string]: count }}>
      {Array.from({ length: count }, (_, k) => (
        <span key={k} className="live-shuffle__card" style={{ ['--slot' as string]: perm.indexOf(k) }}><CardBack /></span>
      ))}
    </div>
  );
}

export function ArrangePoster({ cards, attacker, card, timer, send }: { cards: Card[]; attacker: string; card: HandPickSource; timer: ReactNode; send: (cmd: Command) => void }) {
  const { tr } = useLang();
  const [order, setOrder] = useState<number[]>(() => cards.map(c => c.id));
  const [shuffled, setShuffled] = useState(0);
  const row = useRef<HTMLDivElement>(null);
  const els = useRef<Record<number, HTMLButtonElement | null>>({});
  const orderRef = useRef(order);
  orderRef.current = order;
  const drag = useRef<{ id: number; idx: number; pid: number; x0: number; s0: number; cx: number; slot: number; slotW: number; left0: number; raf: number } | null>(null);
  const byId = (id: number) => cards.find(c => c.id === id)!;
  // Utocnik vidi miesanie zivo: posielame len poradie pozicii (nie identitu kariet).
  const firstIds = useRef(cards.map(c => c.id));
  useEffect(() => {
    const t = setTimeout(() => socket.emit('shuffleLive', { perm: order.map(id => firstIds.current.indexOf(id)) }), 30);
    return () => clearTimeout(t);
  }, [order]);

  const move = (from: number, to: number) => setOrder(o => {
    if (to < 0 || to >= o.length || from === to) return o;
    const a = [...o];
    const [x] = a.splice(from, 1);
    a.splice(to, 0, x);
    return a;
  });

  const paint = () => {
    const d = drag.current;
    const r = row.current;
    if (!d || !r) return;
    const ord = orderRef.current;
    const dx = (d.cx - d.x0) + (r.scrollLeft - d.s0);
    const px = d.cx - r.getBoundingClientRect().left + r.scrollLeft;
    d.slot = Math.max(0, Math.min(ord.length - 1, Math.floor((px - d.left0) / d.slotW)));
    ord.forEach((id, i) => {
      const el = els.current[id];
      if (!el) return;
      if (id === d.id) { el.style.transform = `translate3d(${dx}px, -10px, 0) scale(1.06)`; return; }
      const shift = d.idx < i && i <= d.slot ? -d.slotW : d.slot <= i && i < d.idx ? d.slotW : 0;
      el.style.transform = shift ? `translate3d(${shift}px, 0, 0)` : '';
    });
  };

  const tick = () => {
    const d = drag.current;
    const r = row.current;
    if (!d || !r) return;
    const box = r.getBoundingClientRect();
    const edge = 56;
    let v = 0;
    if (d.cx < box.left + edge) v = -(1 - Math.max(0, d.cx - box.left) / edge);
    else if (d.cx > box.right - edge) v = 1 - Math.max(0, box.right - d.cx) / edge;
    if (v) { r.scrollLeft += Math.max(-1, Math.min(1, v)) * 14; paint(); }
    d.raf = requestAnimationFrame(tick);
  };

  const end = (commit: boolean) => {
    const d = drag.current;
    if (!d) return;
    cancelAnimationFrame(d.raf);
    drag.current = null;
    const ord = orderRef.current;
    const next = [...ord];
    if (commit && d.slot !== d.idx) { const [x] = next.splice(d.idx, 1); next.splice(d.slot, 0, x); }
    const all = ord.map(id => els.current[id]);
    all.forEach(el => { if (el) { el.style.transition = 'none'; el.classList.remove('is-dragging'); } });
    flushSync(() => setOrder(next));
    all.forEach(el => { if (el) { el.style.transform = ''; void el.offsetWidth; el.style.transition = ''; } });
  };

  useEffect(() => () => { if (drag.current) cancelAnimationFrame(drag.current.raf); }, []);

  const shuffleLocal = () => {
    setOrder(o => {
      const a = [...o];
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    });
    setShuffled(n => n + 1);
  };

  return (
    <Poster kicker={`Wanted · ${handPickName(card)}`} title={<><b>{attacker}</b> {tr('ti berie kartu', 'is taking your card')}</>} wide>
      <p className="bang-prompt__body">
        {tr(`Poprehadzuj si karty ťahaním alebo ich zamiešaj. ${attacker} ich uvidí rubom v tomto poradí a jednu si vyberie`, `Rearrange your cards by dragging or shuffle them. ${attacker} will see them face down in this order and pick one`)}
        {card === 'catbalou' ? tr(' (pôjde na odhadzovací balík).', ' (it goes to the discard pile).') : tr(' (zoberie si ju).', ' (they take it).')}
      </p>
      <div className={`choices arrange-row ${shuffled ? 'just-shuffled' : ''}`} key={shuffled} ref={row}>
        {order.map((id, i) => {
          const c = byId(id);
          return (
            <button
              key={id} type="button" ref={el => { els.current[id] = el; }}
              className="choice arrange-card"
              aria-label={`${cardTitle(c)} ${tr(`Pozícia ${i + 1} z ${order.length}. Šípkami doľava a doprava ju presunieš.`, `Position ${i + 1} of ${order.length}. Use the left and right arrow keys to move it.`)}`}
              title={cardTitle(c)}
              onPointerDown={e => {
                if (e.button > 0 || drag.current || order.length < 2) return;
                const el = e.currentTarget;
                const r = row.current!;
                const first = els.current[order[0]]!;
                const second = els.current[order[1]]!;
                el.setPointerCapture(e.pointerId);
                el.classList.add('is-dragging');
                drag.current = { id, idx: i, pid: e.pointerId, x0: e.clientX, s0: r.scrollLeft, cx: e.clientX, slot: i, slotW: second.offsetLeft - first.offsetLeft, left0: first.offsetLeft, raf: 0 };
                drag.current.raf = requestAnimationFrame(tick);
                paint();
                vibrate(8);
              }}
              onPointerMove={e => { const d = drag.current; if (d && d.pid === e.pointerId) { d.cx = e.clientX; paint(); } }}
              onPointerUp={e => { if (drag.current?.pid === e.pointerId) end(true); }}
              onPointerCancel={e => { if (drag.current?.pid === e.pointerId) end(false); }}
              onLostPointerCapture={e => { if (drag.current?.pid === e.pointerId) end(true); }}
              onContextMenu={e => e.preventDefault()}
              onKeyDown={e => {
                if (e.key === 'ArrowLeft') { e.preventDefault(); move(i, i - 1); }
                if (e.key === 'ArrowRight') { e.preventDefault(); move(i, i + 1); }
              }}
            >
              <span className="bang-card bang-card--table" data-kind={isBlue(c.type) ? 'blue' : 'brown'}><CardInner card={c} /></span>
              <span className="bang-caption on-paper">{i + 1}</span>
            </button>
          );
        })}
      </div>
      {timer}
      <div className="bang-prompt__actions">
        <button className="bang-btn bang-btn--on-paper" type="button" onClick={shuffleLocal}>{tr('Zamiešaj', 'Shuffle')}</button>
        <button className="bang-btn bang-btn--defend" type="button" autoFocus onClick={() => send({ type: 'arrange', order })}>{tr('Potvrď poradie', 'Confirm order')}</button>
      </div>
    </Poster>
  );
}

export function KitPoster({ cards, send }: { cards: Card[]; send: (cmd: Command) => void }) {
  const { tr } = useLang();
  const [sel, setSel] = useState<number[]>([]);
  const toggle = (id: number) => setSel(s => (s.includes(id) ? s.filter(x => x !== id) : s.length < 2 ? [...s, id] : s));
  return (
    <Poster kicker={tr('Kit Carlson · ťahaj', 'Kit Carlson · draw')} title={tr('Vyber 2 karty', 'Pick 2 cards')} wide>
      <p className="bang-prompt__body">{tr('Tretia sa vráti navrch balíka.', 'The third goes back on top of the deck.')}</p>
      <div className="choices">
        {cards.map(c => (
          <button key={c.id} type="button" className={`choice ${sel.includes(c.id) ? 'is-chosen' : ''}`} aria-pressed={sel.includes(c.id)} title={cardTitle(c)} onClick={() => toggle(c.id)}>
            <span className="bang-card bang-card--table" data-kind="brown"><CardInner card={c} /></span>
            <span className="bang-caption on-paper">{cardName(c.type)}</span>
          </button>
        ))}
      </div>
      <div className="bang-prompt__actions">
        <button className="bang-btn bang-btn--primary" type="button" disabled={sel.length !== 2} onClick={() => send({ type: 'kit', cardIds: sel })}>{tr('Vezmi vybrané', 'Take selected')}</button>
      </div>
    </Poster>
  );
}

/** Riadok dennika: mena hracov tucne, ikona podla druhu udalosti. */
const LOG_ICON = { meta: 'meta', hit: 'hit', defend: 'defend', heal: 'heal', turn: 'turn' } as const;

export function LogLine({ entry, names }: { entry: LogEntry; names: string[] }) {
  const { lang } = useLang();
  const text = trLog(entry.t);
  const parts = useMemo(() => {
    const sorted = [...names].sort((a, b) => b.length - a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!sorted.length) return [text];
    return text.split(new RegExp(`(${sorted.join('|')})`, 'g'));
  }, [text, names, lang]);
  return (
    <li className={`is-${entry.k}`}>
      <Icon name={LOG_ICON[entry.k]} />
      <span>{parts.map((p, i) => (names.includes(p) ? <b key={i}>{p}</b> : <Fragment key={i}>{p}</Fragment>))}</span>
    </li>
  );
}
