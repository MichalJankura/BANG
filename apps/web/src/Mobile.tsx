import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { SUIT_SYMBOL, isBlue, rankLabel, type Card, type PlayerView, type Role } from '@bang/engine';
import { X } from 'lucide-react';
import { useLang } from './i18n';
import { cardName, cardText, equipName } from './i18nData';
import { CardInner, CardView, Gold, Hp, Icon, Portrait, RoleBadge, SpriteFace, cardTitle } from './Cards';
import { vibrate } from './device';
import { EquipChips } from './Table';

// ---------- ruka: vejar s horizontalnym swipe, dlhe podrzanie = nahlad ----------

export type Preview = { card?: Card; faceKey?: string; kind?: 'blue' | 'brown'; title: string; sub?: string; text: string };

export const LONG_PRESS_MS = 400;

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Posunie len dany vodorovny kontajner. scrollIntoView by pohol aj skrytymi predkami (cela hra by "ujazdila"). */
export function centerIn(box: HTMLElement, el: HTMLElement) {
  const b = box.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const delta = r.left + r.width / 2 - (b.left + b.width / 2);
  if (Math.abs(delta) < 4) return;
  box.scrollTo({ left: box.scrollLeft + delta, behavior: reduced() ? 'auto' : 'smooth' });
}

interface HandProps {
  cards: Card[];
  markOf: (c: Card) => string;
  ariaOf: (c: Card, mark: string) => string;
  onTap: (c: Card) => void;
  onPreview: (c: Card) => void;
  /** wide = pevny vejar podla sirky, swipe = prekryvanie a posun prstom. */
  variant: 'wide' | 'swipe';
  empty?: string;
}

export function HandFan({ cards, markOf, ariaOf, onTap, onPreview, variant, empty }: HandProps) {
  const n = cards.length;
  const box = useRef<HTMLDivElement>(null);
  const [m, setM] = useState({ avail: 0, cw: 80 });
  const press = useRef<{ id: number; x: number; y: number; t: number; fired: boolean } | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => {
      const first = el.querySelector<HTMLElement>('.bang-card');
      const cs = getComputedStyle(el);
      const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      setM(o => {
        const next = { avail: el.clientWidth - pad, cw: first?.offsetWidth || o.cw };
        return Math.abs(next.avail - o.avail) < 1 && next.cw === o.cw ? o : next;
      });
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [n]);

  // Vybrana karta sa dostane do viditelnej casti (posuva sa len ruka, nie cela stranka).
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('.is-selected');
    if (el && box.current && variant === 'swipe') centerIn(box.current, el);
  }, [cards, markOf, variant]);

  let overlap: number;
  const rotStep = 0;
  if (variant === 'wide') {
    // Karty vedla seba s medzerou; prekryvaju sa az ked sa do sirky nezmestia.
    const gap = 10;
    overlap = n > 1 ? Math.max(-gap, (n * m.cw - m.avail) / (n - 1)) : 0;
    if (overlap > m.cw * 0.55) overlap = m.cw * 0.55;
  } else {
    const slice = n > 1 ? Math.min(m.cw + 6, Math.max(m.cw * 0.5, (m.avail - m.cw) / (n - 1))) : m.cw;
    overlap = m.cw + 6 - slice;
  }

  const clear = () => { if (press.current) { clearTimeout(press.current.t); } };

  return (
    <div className={`gb-hand gb-hand--${variant}`} role="group" ref={box}>
      <div className="gb-hand__in">
        {n === 0 && <span className="bang-caption empty-hand">{empty}</span>}
        {cards.map((c, i) => {
          const off = i - (n - 1) / 2;
          const mark = markOf(c);
          return (
            <button
              key={c.id} type="button" className={`bang-card ${mark}`} data-kind={isBlue(c.type) ? 'blue' : 'brown'}
              aria-label={ariaOf(c, mark)} title={variant === 'wide' ? cardTitle(c) : undefined} aria-disabled={mark.includes('is-disabled')}
              style={{ marginLeft: i === 0 ? 0 : -overlap, zIndex: mark.includes('is-selected') ? 60 : i, ['--rot' as string]: `${variant === 'wide' ? off * rotStep : 0}deg` } as CSSProperties}
              onPointerDown={e => {
                if (e.button > 0) return;
                clear();
                const t = window.setTimeout(() => { if (press.current) { press.current.fired = true; vibrate(12); onPreview(c); } }, LONG_PRESS_MS);
                press.current = { id: c.id, x: e.clientX, y: e.clientY, t, fired: false };
              }}
              onPointerMove={e => { const p = press.current; if (p && !p.fired && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) clear(); }}
              onPointerUp={clear}
              onPointerCancel={() => { clear(); press.current = null; }}
              onContextMenu={e => { e.preventDefault(); if (!press.current?.fired) { clear(); press.current = null; onPreview(c); } }}
              onClick={() => {
                if (press.current?.fired) { press.current = null; return; }
                press.current = null;
                onTap(c);
              }}
            >
              <CardInner card={c} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- nahlad karty na celu obrazovku ----------

export function CardPreview({ data, onClose }: { data: Preview | null; onClose: () => void }) {
  const { tr } = useLang();
  useEffect(() => {
    if (!data) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [data, onClose]);
  if (!data) return null;
  return createPortal(
    <div className="pv" role="dialog" aria-modal="true" aria-label={data.title} onClick={onClose}>
      <div className="pv__body" onClick={e => e.stopPropagation()}>
        <span className="bang-card pv__card" data-kind={data.kind ?? (data.card && isBlue(data.card.type) ? 'blue' : 'brown')}>
          {data.card
            ? <CardInner card={data.card} />
            : <span className="bang-card__inner"><span className="bang-card__face has-img">{data.faceKey && <SpriteFace k={data.faceKey} title={data.title} />}</span></span>}
        </span>
        <div className="pv__txt">
          <h2 className="t-title">{data.title}</h2>
          {data.sub && <div className="pv__sub">{data.sub}</div>}
          <p>{data.text}</p>
          <button type="button" className="bang-btn bang-btn--primary pv__close" autoFocus onClick={onClose}><X size={18} />{tr('Zavrieť', 'Close')}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export const previewOfCard = (c: Card): Preview => ({ card: c, title: cardName(c.type), sub: `${rankLabel(c.rank)}${SUIT_SYMBOL[c.suit]}`, text: cardText(c.type) });

// ---------- vysuvaci panel (denník a zoznam hracov) ----------

export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const { tr } = useLang();
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open, onClose]);
  return (
    <div className={`dr ${open ? 'is-open' : ''}`} aria-hidden={!open}>
      <div className="dr__scrim" onClick={onClose} />
      <aside className="dr__panel" role="dialog" aria-modal={open} aria-label={title} {...(open ? {} : { inert: '' as unknown as boolean })}>
        <header className="dr__head">
          <h2 className="t-title">{title}</h2>
          <button type="button" className="gb-ico" onClick={onClose} aria-label={tr('Zavrieť', 'Close')}><X size={20} /></button>
        </header>
        <div className="dr__body">{children}</div>
      </aside>
    </div>
  );
}

// ---------- odpocet reakcie: bar bezi na GPU, cislo sa obnovuje po 250 ms ----------

export function Countdown({ at, total, after }: { at: number; total: number; after: string }) {
  const { tr } = useLang();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [at]);
  const left = Math.min(total, Math.max(0, at - now));
  const startLeft = Math.min(total, Math.max(0, at - Date.now()));
  return (
    <>
      <div className="bang-prompt__bar" aria-hidden="true"><i className="drain" key={at} style={{ animationDuration: `${startLeft}ms` }} /></div>
      <p className="bang-caption on-paper bang-prompt__time" role="timer" aria-live="off">
        <b className="secs">{Math.ceil(left / 1000)} s</b> {tr('do automatického rozhodnutia', 'until it is decided automatically')}
        <span className="sr-only">, {after}</span>
      </p>
    </>
  );
}

// ---------- supernik v pase hore (telefon na vysku) ----------

export interface OppProps {
  p: PlayerView;
  role: Role | null;
  states: string[];
  tag?: string;
  clickable: boolean;
  shout?: { text: string; kind: 'hit' | 'heal' } | null;
  label: string;
  onClick: (el: HTMLElement) => void;
  open?: boolean;
  gold?: boolean;
  innerRef?: (el: HTMLButtonElement | null) => void;
}

export function OppChip({ p, role, states, tag, clickable, shout, label, onClick, open, gold, innerRef }: OppProps) {
  const { tr } = useLang();
  return (
    <button
      type="button" ref={innerRef} className={`opp ${shout?.kind === 'hit' ? 'is-shaking' : ''}`} data-state={states.join(' ')}
      onClick={e => onClick(e.currentTarget)} aria-label={label} data-seat={p.id} data-click={clickable ? 'target' : 'info'} aria-expanded={!!open}
    >
      {tag && <span className="opp__tag">{tag}</span>}
      <span className="opp__top">
        <span className="opp__pic">
          <Portrait ch={p.character} name={p.name} />
          {role === 'sceriffo' && <span className="opp__star" title={tr('Šerif', 'Sheriff')}><Icon name="sheriff" /></span>}
        </span>
        <span className="opp__meta">
          <span className="opp__name">{p.name}</span>
          <span className="opp__hand" title={tr('Karty v ruke', 'Cards in hand')}><Icon name="cards" />{p.handCount}{gold && <Gold size={13} n={p.gold} className="opp__gold" />}</span>
        </span>
      </span>
      <span className="opp__hp"><Hp hp={p.hp} max={p.maxHp} /></span>
      <span className="opp__equip">
        <EquipChips cards={p.inPlay} />
        {p.equip.map(e => <span key={e.id} className="eq__chip is-equip">{equipName(e.type)}</span>)}
        {p.alive && <span className="opp__dist" title={tr('Vzdialenosť od teba', 'Distance from you')}>{tr('Vzd.', 'Dist.')} {p.distance}</span>}
      </span>
      {role && role !== 'sceriffo' && <span className="opp__role"><RoleBadge role={role} /></span>}
      {shout && <span className={`bang-shout stage-shout is-small is-${shout.kind}`}>{shout.text}</span>}
    </button>
  );
}

/** Pas supernikov: posuva sa do strany, hrac na tahu a vybrane ciele sa dostanu do zorneho pola. */
export function useScrollToActive(ref: React.RefObject<HTMLElement>, deps: unknown[]) {
  const go = useCallback(() => {
    const box = ref.current;
    const el = box?.querySelector<HTMLElement>('[data-state~="inrange"], [data-state~="target"], [data-state~="turn"]');
    if (box && el) centerIn(box, el);
  }, [ref]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(go, deps);
}
