import { useState, type CSSProperties, type ReactNode } from 'react';
import {
  Card, CharKey, Role, CHARACTERS, SUIT_SYMBOL, isBlue, rankLabel, spriteFile, EQUIP, type Equip,
} from '@bang/engine';
import { getLang, useLang } from './i18n';
import { cardName, cardText, charText, equipName, equipText, roleName } from './i18nData';

/** Obrazky, ktore sa nepodarilo nacitat. Potom sa kresli zastupna karta z design systemu. */
const missing = new Set<string>();

function useSprite(key: string) {
  const [, bump] = useState(0);
  return {
    src: `/cards/${spriteFile(key)}`,
    ok: !missing.has(key),
    fail: () => { missing.add(key); bump(n => n + 1); },
  };
}

const red = (c: Card) => c.suit === 'hearts' || c.suit === 'diamonds';
export const cardTitle = (c: Card) => `${cardName(c.type)} (${rankLabel(c.rank)}${SUIT_SYMBOL[c.suit]}): ${cardText(c.type)}`;

/** Vnutro karty: tvoj obrazok typu karty + stitok so skutocnou hodnotou tejto kopie. */
export function CardInner({ card }: { card: Card }) {
  const sp = useSprite(card.type);
  const name = cardName(card.type);
  return (
    <span className="bang-card__inner">
      <span className={`bang-card__face ${sp.ok ? 'has-img' : ''}`}>
        {sp.ok
          ? <img src={sp.src} alt="" onError={sp.fail} draggable={false} loading="lazy" decoding="async" />
          : <><span className="bang-card__title">{name}</span><span className="bang-card__abbr">{name[0]}</span></>}
        <span className={`bang-card__corner ${red(card) ? 'is-red' : ''}`}>{rankLabel(card.rank)}{SUIT_SYMBOL[card.suit]}</span>
      </span>
      <span className="bang-card__back" />
    </span>
  );
}

type Size = 'hand' | 'table' | 'mini';

export function CardView({ card, size = 'hand', className = '', style }: { card: Card; size?: Size; className?: string; style?: CSSProperties }) {
  return (
    <span className={`bang-card bang-card--${size} ${className}`} data-kind={isBlue(card.type) ? 'blue' : 'brown'} title={cardTitle(card)} style={style}>
      <CardInner card={card} />
    </span>
  );
}

/** Karta vybavenia z Gold Rush. Cena je vytlacena na obrazku; price ukaze zlavnenu cenu. */
export function EquipView({ card, size = 'table', className = '', price }: { card: Equip; size?: Size; className?: string; price?: number }) {
  const sp = useSprite(card.type);
  const def = EQUIP[card.type];
  return (
    <span className={`bang-card bang-card--${size} is-equip ${className}`} data-kind={def.black ? 'black' : 'brown'} title={`${equipName(card.type)} (${def.cost}): ${equipText(card.type)}`}>
      <span className="bang-card__inner">
        <span className={`bang-card__face ${sp.ok ? 'has-img' : ''}`}>
          {sp.ok
            ? <img src={sp.src} alt="" onError={sp.fail} draggable={false} loading="lazy" decoding="async" />
            : <><span className="bang-card__title">{equipName(card.type)}</span><span className="bang-card__abbr">{def.cost}</span></>}
          {price !== undefined && price !== def.cost && <span className="equip-price">{price}</span>}
        </span>
      </span>
    </span>
  );
}

/** Zlaty nuget s poctom. */
export function Gold({ n, size = 18, className = '' }: { n?: number; size?: number; className?: string }) {
  return (
    <span className={`gold ${className}`}>
      <img src="/cards/04_gold_piece.webp" alt="" width={size} height={Math.round(size * 0.87)} draggable={false} />
      {n !== undefined && <b>{n}</b>}
    </span>
  );
}

export function CardBack({ size = 'table' }: { size?: Size }) {
  return (
    <span className={`bang-card bang-card--${size} is-down`} aria-hidden="true">
      <span className="bang-card__inner"><span className="bang-card__face" /><span className="bang-card__back" /></span>
    </span>
  );
}

/** Lic karty roly alebo postavy podla kluca obrazka (sceriffo, bartcassidy...). */
export function SpriteFace({ k, title }: { k: string; title: string }) {
  const sp = useSprite(k);
  return sp.ok
    ? <img src={sp.src} alt={title} onError={sp.fail} draggable={false} decoding="async" />
    : <span className="bang-card__title">{title}</span>;
}

/** Portret na tabulke hraca: vyrez z karty postavy. */
export function Portrait({ ch, name }: { ch: CharKey; name: string }) {
  const sp = useSprite(ch);
  const c = CHARACTERS[ch];
  return (
    <span className="bang-seat__portrait" title={`${c.name} (${c.hp} ${getLang() === 'en' ? 'lives' : 'životy'}): ${charText(ch)}`}>
      {sp.ok ? <img className="portrait" src={sp.src} alt={c.name} onError={sp.fail} draggable={false} /> : name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Cela karta postavy (vlastna tabulka, detail). */
export function CharacterCard({ ch }: { ch: CharKey }) {
  const sp = useSprite(ch);
  const c = CHARACTERS[ch];
  return (
    <span className="bang-card bang-card--table" data-kind="brown" title={`${c.name}: ${charText(ch)}`}>
      <span className="bang-card__inner">
        <span className={`bang-card__face ${sp.ok ? 'has-img' : ''}`}>
          {sp.ok ? <img src={sp.src} alt={c.name} onError={sp.fail} draggable={false} /> : <span className="bang-card__title">{c.name}</span>}
        </span>
      </span>
    </span>
  );
}

export const ROLE_KEY: Record<Role, 'sheriff' | 'deputy' | 'outlaw' | 'renegade'> = {
  sceriffo: 'sheriff', vice: 'deputy', fuorilegge: 'outlaw', rinnegato: 'renegade',
};

type IconName = 'sheriff' | 'deputy' | 'outlaw' | 'renegade' | 'cards' | 'hit' | 'defend' | 'heal' | 'turn' | 'meta';

const ICON_PATH: Record<IconName, ReactNode> = {
  sheriff: <path d="M8 1l2 4.6 5 .5-3.8 3.3 1.2 4.9L8 11.7l-4.4 2.6 1.2-4.9L1 6.1l5-.5z" />,
  deputy: <path d="M8 1l6 2v5c0 4-3 6-6 7-3-1-6-3-6-7V3z" />,
  outlaw: <path d="M1 5h14v3c0 3-2 5-4 5-1.2 0-2-1-3-1s-1.8 1-3 1c-2 0-4-2-4-5z" />,
  renegade: <path d="M8 1l7 7-7 7-7-7z" />,
  cards: <rect x="3" y="1" width="10" height="14" rx="2" />,
  hit: <path d="M8 1l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />,
  defend: <path d="M8 1l6 2v5c0 4-3 6-6 7-3-1-6-3-6-7V3z" />,
  heal: <path d="M6 2h4v4h4v4h-4v4H6v-4H2V6h4z" />,
  turn: <path d="M4 2l9 6-9 6z" />,
  meta: <circle cx="8" cy="8" r="3" />,
};

export function Icon({ name }: { name: IconName }) {
  return <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">{ICON_PATH[name]}</svg>;
}

/** Odznak roly. Vzdy slovo + ikona; skryta rola ma "?". */
export function RoleBadge({ role }: { role: Role | null }) {
  const { tr } = useLang();
  if (!role) return <span className="bang-role" data-role="hidden">? {tr('Neznámy', 'Unknown')}</span>;
  const key = ROLE_KEY[role];
  return <span className="bang-role" data-role={key}><Icon name={key} />{roleName(role)}</span>;
}

export function Hp({ hp, max }: { hp: number; max: number }) {
  const left = Math.max(0, hp);
  return (
    <span className="bang-hp" role="img" aria-label={`${getLang() === 'en' ? 'Lives' : 'Životy'} ${left} / ${max}`}>
      {Array.from({ length: max }, (_, i) => <i key={i} className={`bang-hp__b ${i < left ? '' : 'is-empty'}`} />)}
    </span>
  );
}
