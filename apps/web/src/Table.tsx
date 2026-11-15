import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CHARACTERS, EQUIP, SUIT_SYMBOL, WEAPON_RANGE, rankLabel, spriteFile, type Card, type Equip, type PlayerView, type Role } from '@bang/engine';
import { X } from 'lucide-react';
import { useLang } from './i18n';
import { cardName, cardText, charText, equipName, equipText } from './i18nData';
import { CardView, EquipView, Gold, Hp, Icon, RoleBadge, SpriteFace } from './Cards';

// ---------- vylozene modre karty ako citatelne stitky ----------

const DANGER = new Set(['prigione', 'dinamite']);

/** Vylozena karta ako stitok: vyrez obrazka, nazov, pri zbrani dostrel. Cita sa aj pri malom stole. */
export function EquipChips({ cards, className = '' }: { cards: Card[]; className?: string }) {
  const { tr } = useLang();
  if (!cards.length) return null;
  return (
    <span className={`eq ${className}`}>
      {cards.map(c => {
        const range = WEAPON_RANGE[c.type];
        return (
          <span key={c.id} className={`eq__chip ${DANGER.has(c.type) ? 'is-danger' : ''} ${range ? 'is-weapon' : ''}`}
            title={`${cardName(c.type)} (${rankLabel(c.rank)}${SUIT_SYMBOL[c.suit]}): ${cardText(c.type)}`}>
            <i className="eq__pic" style={{ backgroundImage: `url(/cards/${spriteFile(c.type)})` } as CSSProperties} aria-hidden="true" />
            <span className="eq__name">{cardName(c.type)}</span>
            {range !== undefined && <b className="eq__range" aria-label={tr(`dostrel ${range}`, `range ${range}`)}>{range}</b>}
          </span>
        );
      })}
    </span>
  );
}

// ---------- detail hraca: rozbali sa pod jeho tabulkou ----------

export interface DetailAnchor { id: string; rect: { left: number; top: number; right: number; bottom: number } }

interface DetailProps {
  p: PlayerView;
  role: Role | null;
  isMe: boolean;
  onTurn: boolean;
  anchor: DetailAnchor['rect'];
  onClose: () => void;
  onPreview: (c: Card) => void;
  /** Gold Rush: ukaz nugety a vybavenie */
  gold?: boolean;
  onEquip?: (e: Equip) => void;
  /** doplnkove ovladanie v hlavicke (napr. vyhodenie hraca) */
  extra?: ReactNode;
}

const GAP = 8;

export function SeatDetail({ p, role, isMe, onTurn, anchor, onClose, onPreview, gold, onEquip, extra }: DetailProps) {
  const { tr } = useLang();
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; maxH: number; up: boolean } | null>(null);
  const ch = CHARACTERS[p.character];

  // Panel sa rozroluje pod tabulkou; ak dole nie je miesto, otvori sa nahor.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = el.offsetWidth, h = el.scrollHeight;
    const below = vh - anchor.bottom - GAP * 2;
    const above = anchor.top - GAP * 2;
    const up = h > below && above > below;
    const cx = (anchor.left + anchor.right) / 2;
    const left = Math.max(GAP, Math.min(vw - w - GAP, cx - w / 2));
    setPos(up ? { left, bottom: vh - anchor.top + GAP, maxH: above, up } : { left, top: anchor.bottom + GAP, maxH: below, up });
  }, [anchor.left, anchor.top, anchor.right, anchor.bottom, p.inPlay.length, p.equip.length]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const down = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (box.current?.contains(t)) return;
      if (t?.closest?.(`[data-seat="${p.id}"]`)) return; // klik na tu istu tabulku ho zavrie sam
      if (t?.closest?.('.pv')) return;
      onClose();
    };
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', down, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', down, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose, p.id]);

  const style: CSSProperties = pos
    ? { left: pos.left, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH, transformOrigin: pos.up ? '50% 100%' : '50% 0' }
    : { left: -9999, top: 0, visibility: 'hidden' };

  return createPortal(
    <div ref={box} className={`sd ${pos?.up ? 'is-up' : ''} ${p.alive ? '' : 'is-dead'}`} style={style}
      role="dialog" aria-label={tr(`Hráč ${p.name}`, `Player ${p.name}`)}>
      <header className="sd__head">
        <div className="sd__who">
          <span className="sd__name t-title">{p.name}{isMe && tr(' (ty)', ' (you)')}</span>
          <span className="sd__meta">
            <RoleBadge role={role} />
            <span className="sd__stat" title={tr('Karty v ruke', 'Cards in hand')}><Icon name="cards" />{p.handCount}</span>
            {gold && <span className="sd__stat" title={tr('Nugety', 'Nuggets')}><Gold size={15} n={p.gold} /></span>}
            {p.side && <span className="sd__stat">{p.side === 'law' ? tr('tieň za zákon', 'shadow for the law') : tr('tieň za banditov', 'shadow for the outlaws')}</span>}
            {!isMe && p.alive && p.distance > 0 && <span className="sd__stat">{tr('Vzdialenosť', 'Distance')} <b>{p.distance}</b></span>}
            {onTurn && <span className="sd__turn">{tr('Na ťahu', 'On turn')}</span>}
            {p.ghost && <span className="sd__turn is-dead">{tr('Tieň', 'Shadow')}</span>}
            {!p.alive && <span className="sd__turn is-dead">{tr('Vyradený', 'Eliminated')}</span>}
          </span>
        </div>
        {extra}
        <button type="button" className="sd__close" onClick={onClose} aria-label={tr('Zavrieť', 'Close')} autoFocus><X size={18} /></button>
      </header>

      <div className="sd__body">
        <section className="sd__char">
          <span className="bang-card sd__card" data-kind="brown">
            <span className="bang-card__inner"><span className="bang-card__face has-img"><SpriteFace k={p.character} title={ch.name} /></span></span>
          </span>
          <div className="sd__chartxt">
            <span className="sd__kick">{tr('Postava', 'Character')}</span>
            <h3 className="t-title">{ch.name}</h3>
            <div className="sd__hp"><Hp hp={p.hp} max={p.maxHp} /><span>{Math.max(0, p.hp)} / {p.maxHp}</span></div>
            <p>{charText(p.character)}</p>
          </div>
        </section>

        <section className="sd__eq">
          <span className="sd__kick">{tr('Vyložené karty', 'Cards in play')} · {p.inPlay.length + p.equip.length}</span>
          {p.equip.length > 0 && (
            <ul>
              {p.equip.map(e => (
                <li key={e.id}>
                  <button type="button" className="sd__eqcard" onClick={() => onEquip?.(e)} aria-label={equipName(e.type)}>
                    <EquipView card={e} size="table" />
                  </button>
                  <div>
                    <b>{equipName(e.type)}</b>
                    <span className="sd__range is-gold">{tr('vybavenie', 'equipment')} · {EQUIP[e.type].cost}</span>
                    <p>{equipText(e.type)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {p.inPlay.length + p.equip.length === 0
            ? <p className="sd__none">{tr('Nemá pred sebou žiadne modré karty.', 'No blue cards in play.')}</p>
            : p.inPlay.length > 0 && (
              <ul>
                {p.inPlay.map(c => {
                  const range = WEAPON_RANGE[c.type];
                  return (
                    <li key={c.id}>
                      <button type="button" className="sd__eqcard" onClick={() => onPreview(c)} aria-label={tr(`Zväčšiť ${cardName(c.type)}`, `Enlarge ${cardName(c.type)}`)}>
                        <CardView card={c} size="table" />
                      </button>
                      <div>
                        <b>{cardName(c.type)}</b>
                        {range !== undefined && <span className="sd__range">{tr('dostrel', 'range')} {range}</span>}
                        <p>{cardText(c.type)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
        </section>
      </div>
    </div>,
    document.body,
  );
}
