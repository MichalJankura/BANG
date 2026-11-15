import { useEffect, useState, type ReactNode } from 'react';
import { CHARACTERS, type CharKey, type Command, type Role, type SetupView } from '@bang/engine';
import { Lobby, sendCmd } from './net';
import { useLayout, useWakeLock } from './device';
import { Maximize, Minimize, Star } from 'lucide-react';
import { Hp, RoleBadge, SpriteFace } from './Cards';
import { LangSwitch, useLang } from './i18n';
import { charText, roleGoal, roleName } from './i18nData';

/** Prepinac celej obrazovky; na zariadeniach bez Fullscreen API (iPhone) sa nezobrazi. */
function FullscreenButton() {
  const { tr } = useLang();
  const [on, setOn] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const h = () => setOn(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);
  if (!document.fullscreenEnabled) return null;
  const label = on ? tr('Ukončiť celú obrazovku', 'Exit fullscreen') : tr('Celá obrazovka', 'Fullscreen');
  return (
    <button type="button" className="gb-ico" title={label} aria-label={label} aria-pressed={on}
      onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())}>
      {on ? <Minimize size={20} /> : <Maximize size={20} />}
    </button>
  );
}

/** Zlozenie rol pre dany pocet hracov (zakladna hra, 4-7 hracov). */
function roleCounts(n: number): { role: Role; n: number }[] {
  const deputy = (n >= 5 ? 1 : 0) + (n >= 7 ? 1 : 0);
  return ([
    { role: 'sceriffo', n: 1 }, { role: 'vice', n: deputy },
    { role: 'fuorilegge', n: n - 2 - deputy }, { role: 'rinnegato', n: 1 },
  ] as { role: Role; n: number }[]).filter(r => r.n > 0);
}

/**
 * Vyber rol a postav ako pexeso: karty lezia rubom cez celu plochu,
 * hraci beru subezne. Obsadenu kartu server odmietne tomu, kto bol pomalsi.
 */
export function SetupScreen({ view, lobby, onError }: { view: SetupView; lobby: Lobby; onError: (m: string) => void }) {
  const { tr } = useLang();
  const layout = useLayout();
  const small = layout !== 'wide';
    const [busy, setBusy] = useState(false);
  useWakeLock(true);
  const send = async (cmd: Command) => {
    if (busy) return;
    setBusy(true);
    const r = await sendCmd(view, cmd);
    setBusy(false);
    if (r.error) onError(r.error);
  };

  const me = view.players.find(p => p.id === view.me)!;
  const name = (id: string | null) => (id === view.me ? tr('Ty', 'You') : view.players.find(p => p.id === id)?.name ?? '');
  const myRole = view.roles.find(r => r.taken === view.me)?.role ?? null;
  const roles = view.phase === 'roles';
  const done = roles ? me.hasRole : me.chosen;
  const canFlip = roles ? !me.hasRole : view.myPicks.length < 2;
  const ready = view.players.filter(p => (roles ? p.hasRole : p.chosen)).length;

  let board: ReactNode;
  if (roles) {
    board = (
      <div className="setup-grid roles">
        {view.roles.map((r, i) => {
          const mine = r.taken === view.me;
          const label = r.taken ? (r.role === 'sceriffo' && !mine ? `${name(r.taken)} · ${tr('Šerif', 'Sheriff')}` : name(r.taken)) : null;
          return (
            <SetupCard
              key={i} back="role" down={!r.role} faceKey={r.role} faceTitle={r.role ? roleName(r.role) : ''}
              mine={mine} taken={!!r.taken} label={label} clickable={!r.taken && canFlip && !busy}
              slot={small ? undefined : {
                badge: !r.taken ? null
                  : r.role === 'sceriffo' ? `${name(r.taken)} ${tr('otočil', 'flipped')}: ${roleName('sceriffo')}`
                  : mine ? `${tr('Ty si otočil', 'You flipped')}: ${r.role ? roleName(r.role) : ''}`
                  : `${name(r.taken)} ${tr('otočil', 'flipped')}`,
                sheriff: r.role === 'sceriffo',
                hint: tr('Vyber túto', 'Pick this'),
                caption: !r.taken ? tr('Voľná', 'Free') : r.role === 'sceriffo' || mine ? tr('Odhalená rola', 'Revealed role') : tr('Tajná rola', 'Secret role'),
              }}
              onClick={() => send({ type: 'pickRole', slot: i })}
              aria={r.taken ? tr(`Rola ${i + 1}: vzal ${name(r.taken)}`, `Role ${i + 1}: taken by ${name(r.taken)}`) + (r.role ? `, ${roleName(r.role)}` : '') : tr(`Rola ${i + 1}: voľná karta rubom`, `Role ${i + 1}: free face-down card`)}
            />
          );
        })}
      </div>
    );
  } else {
    board = (
      <div className={`setup-grid chars ${view.chars.length > 16 ? "is-24" : ""}`}>
        {view.chars.map((c, i) => {
          const mine = c.taken === view.me;
          return (
            <SetupCard
              key={i} back="char" down={!c.ch} faceKey={c.ch} faceTitle={c.ch ? CHARACTERS[c.ch].name : ''}
              mine={mine} taken={!!c.taken} label={c.taken ? name(c.taken) : null}
              chosen={!!c.ch && view.myChoice === c.ch}
              clickable={!c.taken && canFlip && !busy}
              onClick={() => send({ type: 'pickChar', slot: i })}
              aria={c.taken ? tr(`Postava ${i + 1}: otočil ${name(c.taken)}`, `Character ${i + 1}: flipped by ${name(c.taken)}`) + (c.ch ? `, ${CHARACTERS[c.ch].name}` : '') : tr(`Postava ${i + 1}: voľná karta rubom`, `Character ${i + 1}: free face-down card`)}
            />
          );
        })}
      </div>
    );
  }

  // Nadpis nad stolom, vyzva pod kartami a (len pri vybere postavy) ovladanie pod plochou.
  const waitingText = `${tr('Čaká sa na ostatných', 'Waiting for the others')} (${ready}/${view.players.length}).`;
  let head: { title: ReactNode; text: string };
  let pill: { label: string; text: string; wait: boolean };
  let extra: ReactNode = null;
  if (roles) {
    head = myRole
      ? { title: <>{tr('Si', 'You are')} {roleName(myRole)}</>, text: roleGoal(myRole) }
      : { title: tr('Vyber si rolu', 'Pick a role'), text: tr('Klikni na jednu kartu rubom. Šerif sa hneď ukáže celému salónu, ostatné roly pozná iba ich tajný majiteľ.', 'Click one face-down card. The Sheriff is revealed to everyone at once, other roles are seen only by their owner.') };
    pill = myRole
      ? { label: tr('Hotovo', 'Done'), text: waitingText, wait: true }
      : { label: tr('Tvoj ťah', 'Your turn'), text: tr('Kliknutím na kartu odhalíš svoju tajnú rolu.', 'Click a card to reveal your secret role.'), wait: false };
  } else if (view.myChoice) {
    const c = CHARACTERS[view.myChoice];
    head = { title: <>{tr('Hráš za', 'You play as')} {c.name}</>, text: tr('Potom sa rozdajú karty a začína Šerif.', 'Then the cards are dealt and the Sheriff starts.') };
    pill = { label: tr('Hotovo', 'Done'), text: waitingText, wait: true };
  } else if (view.myPicks.length < 2) {
    head = { title: <>{tr('Otoč si 2 postavy', 'Flip 2 characters')} ({view.myPicks.length}/2)</>, text: tr('Klikni na karty rubom. Z dvoch otočených si potom vyberieš jednu. Karty s menom už patria iným.', 'Click face-down cards. You then choose one of the two you flipped. Cards with a name already belong to others.') };
    pill = { label: tr('Tvoj ťah', 'Your turn'), text: tr(`Otoč ešte ${2 - view.myPicks.length} karty.`, `Flip ${2 - view.myPicks.length} more.`), wait: false };
  } else {
    head = { title: tr('Vyber si postavu', 'Choose a character'), text: tr('Z dvoch otočených kariet si vyber tú, za ktorú budeš hrať.', 'Choose which of your two flipped cards you will play.') };
    pill = { label: tr('Tvoj ťah', 'Your turn'), text: tr('Klikni na „Hraj za“ pri postave, ktorú chceš.', 'Press “Play as” under the character you want.'), wait: false };
    extra = (
      <div className="choose-row">
        {view.myPicks.map(ch => <CharChoice key={ch} ch={ch} sheriff={myRole === 'sceriffo'} busy={busy} onPick={() => send({ type: 'chooseChar', ch })} />)}
      </div>
    );
  }

  if (!roles && !view.myChoice && view.myPicks.length >= 2 && !small) {
    board = (
      <div className="setup-duel">
        {view.myPicks.map(ch => (
          <div className="duel-half" key={ch}>
            <CharChoice ch={ch} sheriff={myRole === 'sceriffo'} busy={busy} onPick={() => send({ type: 'chooseChar', ch })} duel />
          </div>
        ))}
      </div>
    );
    extra = null;
  }

  return (
    <main className={`game setup ${small ? 'is-small' : ''} ${!roles && !view.myChoice && view.myPicks.length >= 2 ? 'is-choosing' : ''}`}>
      <header className="topbar setup-bar">
        <span className="setup-logo">
          <img src="/cards/bang_bandita.webp" alt="" draggable={false} />
          <span className="t-title brand">BANG!</span>
          <span className="setup-sub">Online Saloon</span>
        </span>
        <span className="setup-room"><i className="pulse" aria-hidden="true" />{tr('Miestnosť', 'Room')} <b>#{lobby.code}</b></span>
        <ol className="setup-steps" aria-label={tr('Fázy výberu', 'Setup phases')}>
          <li className={roles ? 'is-active' : 'is-done'} aria-current={roles ? 'step' : undefined}>1. {tr('Roly', 'Roles')}</li>
          <li className={roles ? '' : 'is-active'} aria-current={roles ? undefined : 'step'}>2. {tr('Postavy', 'Characters')}</li>
          <li>3. {tr('Rozdanie kariet', 'The deal')}</li>
        </ol>
        {myRole && <span className="bang-caption goal"><RoleBadge role={myRole} /> {roleGoal(myRole)}</span>}
        <span className="setup-tools" style={{ marginLeft: 'auto' }}>
          <LangSwitch />
          <FullscreenButton />
        </span>
      </header>

      <section className="setup-board" aria-label={roles ? tr('Karty rolí', 'Role cards') : tr('Karty postáv', 'Character cards')}>
        <div className={`setup-felt ${roles ? 'is-roles' : 'is-chars'}`}>
          <div className="bang-label setup-step">
            <span className={roles ? 'is-active' : 'is-done'}>1 {tr('Roly', 'Roles')}</span>
            <span className="sep" aria-hidden="true" />
            <span className={roles ? '' : 'is-active'}>2 {tr('Postavy', 'Characters')}</span>
            <span className="sep" aria-hidden="true" />
            <span>3 {tr('Rozdanie', 'Deal')}</span>
          </div>
          <div className="setup-head">
            <h1 className="t-title setup-title">{head.title}</h1>
            <p className="setup-lede">{head.text}</p>
          </div>
          {board}
          <p className={`setup-pill ${pill.wait ? 'is-wait' : ''}`} role="status">
            <span className="pulse" aria-hidden="true" /><b>{pill.label}:</b> {pill.text}
          </p>
          <div className="setup-plate">
            <span>{tr('Stôl', 'Table')} #{lobby.code}</span>
            <span className="setup-legend">
              {roleCounts(view.roles.length).map(r => <span key={r.role} data-role={r.role}><i aria-hidden="true" />{r.n}× {roleName(r.role)}</span>)}
            </span>
            <span>{ready} / {view.players.length} {tr('hráčov pripravených', 'players ready')}</span>
          </div>
        </div>
      </section>

      <section className="band band--solo">
        <div className="band-center">
          {small && !extra && <><div className="t-banner" style={{ color: 'var(--brass)' }}>{head.title}</div><div className="bang-caption">{head.text} {pill.wait && waitingText}</div></>}
          {extra}{done && <span className="sr-only" role="status">{tr('Hotovo, čaká sa na ostatných.', 'Done, waiting for the others.')}</span>}</div>
      </section>
    </main>
  );
}

interface SetupCardProps {
  back: 'role' | 'char';
  down: boolean;
  faceKey: string | null;
  faceTitle: string;
  mine: boolean;
  taken: boolean;
  chosen?: boolean;
  label: string | null;
  /** Siroke rozlozenie (rola): odznak nad kartou a popis pod nou namiesto stitku na karte. */
  slot?: { badge: string | null; sheriff: boolean; hint: string; caption: string };
  clickable: boolean;
  onClick: () => void;
  aria: string;
}

function SetupCard({ back, down, faceKey, faceTitle, mine, taken, chosen, label, slot, clickable, onClick, aria }: SetupCardProps) {
  const card = (
    <button
      type="button" aria-label={aria} disabled={!clickable} onClick={onClick}
      className={`bang-card setup-card ${down ? 'is-down' : ''} ${mine ? 'is-mine' : ''} ${taken && !mine ? 'is-taken' : ''} ${chosen ? 'is-chosen' : ''}`}
    >
      <span className="bang-card__inner">
        <span className="bang-card__face has-img">{faceKey && <SpriteFace k={faceKey} title={faceTitle} />}</span>
        <span className={`bang-card__back bang-card__back--${back}`} />
      </span>
      {!slot && label && <span className="setup-tag">{label}</span>}
    </button>
  );
  if (!slot) return card;
  return (
    <div className={`setup-slot ${slot.sheriff ? 'is-sheriff' : ''} ${clickable ? 'is-free' : ''}`}>
      <div className="setup-badge" aria-hidden={!slot.badge && !clickable}>
        {slot.badge
          ? <span className="setup-badge__chip">{slot.sheriff && <Star size={16} fill="currentColor" aria-hidden="true" />}{slot.badge}</span>
          : <span className="setup-badge__hint">{slot.hint}</span>}
      </div>
      {card}
      <span className="setup-cap">{slot.caption}</span>
    </div>
  );
}

function CharChoice({ ch, sheriff, busy, onPick, duel }: { ch: CharKey; sheriff: boolean; busy: boolean; onPick: () => void; duel?: boolean }) {
  const { tr } = useLang();
  const c = CHARACTERS[ch];
  const hp = c.hp + (sheriff ? 1 : 0);
  const face = (
    <span className="bang-card char-big" data-kind="brown">
      <span className="bang-card__inner"><span className="bang-card__face has-img"><SpriteFace k={ch} title={c.name} /></span></span>
    </span>
  );
  const text = <>{charText(ch)}{sheriff && tr(' Ako Šerif máš život navyše.', ' As Sheriff you get an extra life.')}</>;
  const button = <button className="bang-btn bang-btn--primary" type="button" disabled={busy} onClick={onPick}>{tr('Hraj za', 'Play as')} {c.name}</button>;
  if (duel) {
    return (
      <div className="char-choice char-choice--duel">
        <div className="duel-head"><div className="t-title">{c.name}</div><Hp hp={hp} max={hp} /></div>
        {face}
        <p className="duel-text">{text}</p>
        {button}
      </div>
    );
  }
  return (
    <div className="char-choice">
      {face}
      <div className="char-info">
        <div className="t-title">{c.name}</div>
        <Hp hp={hp} max={hp} />
        <p className="bang-caption">{text}</p>
        {button}
      </div>
    </div>
  );
}
