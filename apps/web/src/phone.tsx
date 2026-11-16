import type { CSSProperties, ReactNode } from 'react';
import { isBlue, type Card, type Equip } from '@bang/engine';
import { Heart, Layers } from 'lucide-react';
import { useLang } from './i18n';
import { cardName, equipName } from './i18nData';
import { CardInner, EquipView, Gold, Icon, Portrait, ROLE_KEY, cardTitle } from './Cards';
import type { OppProps } from './Mobile';

// ---------- orbit: supernici na elipse okolo stola, ja som dole ----------

/** Poloha supernika na elipse: dx, dy v rozsahu -1..1 od stredu. Poradie ide od mojho laveho suseda v smere hodinovych ruciciek. */
export function orbitPos(i: number, n: number) {
  const phi = (2 * Math.PI * (i + 1)) / (n + 1);
  return { dx: -Math.sin(phi), dy: Math.cos(phi) };
}

export function Orbit({ children, center }: { children: ReactNode; center: ReactNode }) {
  const { tr } = useLang();
  return (
    <section className="orb" aria-label={tr('Stôl', 'Table')}>
      <div className="orb__ring" aria-hidden="true" />
      <div className="orb__center">{center}</div>
      <nav className="orb__seats" aria-label={tr('Súperi', 'Opponents')}>{children}</nav>
    </section>
  );
}

export function OppToken({ p, role, states, tag, clickable, shout, label, onClick, open, gold, pos }: OppProps & { pos: { dx: number; dy: number } }) {
  const { tr } = useLang();
  const hidden = !role;
  const key = role ? ROLE_KEY[role] : null;
  const inPlay = p.inPlay.length + p.equip.length;
  return (
    <button
      type="button" className={`ot ${shout?.kind === 'hit' ? 'is-shaking' : ''}`} data-state={states.join(' ')}
      style={{ ['--dx' as string]: pos.dx.toFixed(3), ['--dy' as string]: pos.dy.toFixed(3) } as CSSProperties}
      onClick={e => onClick(e.currentTarget)} aria-label={label} data-seat={p.id} data-click={clickable ? 'target' : 'info'} aria-expanded={!!open}
    >
      {tag && <span className="ot__tag">{tag}</span>}
      <span className="ot__av">
        <Portrait ch={p.character} name={p.name} />
        <span className="ot__hp" title={tr('Životy', 'Lives')}><b>{Math.max(0, p.hp)}</b><Heart size={8} fill="currentColor" strokeWidth={0} /></span>
        {p.alive && <span className="ot__dist" title={tr('Vzdialenosť od teba', 'Distance from you')}>{p.distance}</span>}
        <span className={`ot__role ${hidden ? 'is-hidden' : `is-${key}`}`} title={hidden ? tr('Skrytá rola', 'Hidden role') : undefined}>
          {hidden ? '?' : <Icon name={key!} />}
        </span>
        {states.includes('turn') && <span className="ot__turn" aria-hidden="true"><Icon name="turn" /></span>}
      </span>
      <span className="ot__pill">
        <span className="ot__name">{p.name}</span>
        <span className="ot__n" title={tr('Karty v ruke', 'Cards in hand')}><Icon name="cards" />{p.handCount}</span>
        {inPlay > 0 && <span className="ot__n ot__n--blue" title={tr('Vyložené karty', 'Cards in play')}><Icon name="cards" />{inPlay}</span>}
        {gold && <Gold size={11} n={p.gold} className="ot__gold" />}
      </span>
      {shout && <span className={`bang-shout stage-shout is-small is-${shout.kind}`}>{shout.text}</span>}
    </button>
  );
}

// ---------- panel vylozenych kariet ----------

export function ShelfPanel({ cards, equip, onPreview, onEquip }: {
  cards: Card[]; equip: Equip[]; onPreview: (c: Card) => void; onEquip: (e: Equip) => void;
}) {
  const { tr } = useLang();
  const n = cards.length + equip.length;
  return (
    <section className={`pn pn--shelf ${n ? '' : 'is-empty'}`} aria-label={tr('Vyložené karty', 'Cards in play')}>
      <header className="pn__head">
        <Layers size={14} aria-hidden="true" />
        <h3>{tr('Vyložené karty', 'Cards in play')}</h3>
        <span>{n ? tr(`${n} na stole`, `${n} on the table`) : tr('Zatiaľ nič', 'Nothing yet')}</span>
      </header>
      {n > 0 && (
        <div className="shelf" role="list">
          {cards.map(c => {
            return (
              <div key={c.id} className={`shelf__it`} role="listitem">
                <button type="button" className="bang-card shelf__card" data-kind={isBlue(c.type) ? 'blue' : 'brown'} title={cardTitle(c)} onClick={() => onPreview(c)}
                  aria-label={cardTitle(c)}>
                  <CardInner card={c} />
                </button>
                <span className="shelf__name">{cardName(c.type)}</span>
              </div>
            );
          })}
          {equip.map(e => (
            <div key={e.id} className="shelf__it" role="listitem">
              <button type="button" className="shelf__card shelf__card--eq" onClick={() => onEquip(e)} aria-label={equipName(e.type)}>
                <EquipView card={e} size="table" className="shelf__eq" />
              </button>
              <span className="shelf__name">{equipName(e.type)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function HandPanel({ count, hint, children }: { count: number; hint: string; children: ReactNode }) {
  const { tr } = useLang();
  return (
    <section className="pn pn--hand" aria-label={tr('Tvoja ruka', 'Your hand')}>
      <header className="pn__head">
        <Icon name="cards" />
        <h3>{tr('Tvoja ruka', 'Your hand')} · {count}</h3>
        <span>{hint}</span>
      </header>
      {children}
    </section>
  );
}
