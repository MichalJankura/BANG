import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Bomb, Crosshair, Flame, LogIn, LogOut, Pencil, Shield, Swords, Timer, Trophy, UserPlus } from 'lucide-react';
import { RANKS, rankFor, rankProgress, type DbRole, type Rank, type Role } from '@bang/engine';
import { useLang } from './i18n';
import { Icon, RoleBadge } from './Cards';
import { trErr } from './i18nData';
import { changeRole, login, logout, register, type MatchResult, type Profile } from './account';

export const DB_TO_ROLE: Record<DbRole, Role> = { sheriff: 'sceriffo', deputy: 'vice', outlaw: 'fuorilegge', renegade: 'rinnegato' };
const ROLES: DbRole[] = ['sheriff', 'deputy', 'outlaw', 'renegade'];

const rankById = (id: number): Rank => RANKS.find(r => r.id === id) ?? RANKS[0];
const tierOf = (id: number) => (id >= 13 ? 'legend' : id >= 9 ? 'gold' : id >= 5 ? 'silver' : 'bronze');
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useRankName() {
  const { lang } = useLang();
  return (r: Rank) => (lang === 'en' ? r.nameEn : r.name);
}

/**
 * Ikona hodnosti. Obrazky zatial nie su: odznak (hviezda) s cislom hodnosti, farba podla stupna.
 * `data-icon` nesie kluc (rank-01 … rank-13), podla ktoreho sa neskor doplni obrazok.
 */
export function RankBadge({ rankId, size = 'md' }: { rankId: number; size?: 'sm' | 'md' | 'lg' }) {
  const r = rankById(rankId);
  const name = useRankName()(r);
  return (
    <span className={`rk-badge rk-badge--${size}`} data-icon={r.iconKey} data-tier={tierOf(r.id)} role="img" aria-label={name} title={name}>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="22" className="rk-badge__ring" />
        <path className="rk-badge__star" d="M24 5l5.3 11.6 12.7 1.3-9.5 8.5 2.8 12.5L24 32.4 12.7 38.9l2.8-12.5L6 17.9l12.7-1.3z" />
      </svg>
      <b>{r.id}</b>
    </span>
  );
}

/** Postup k dalsej hodnosti. */
export function RankProgress({ xp }: { xp: number }) {
  const { tr } = useLang();
  const rn = useRankName();
  const pr = rankProgress(xp);
  return (
    <div className="rk-progress">
      <div className="rk-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pr.ratio * 100)}
        aria-label={tr('Postup k ďalšej hodnosti', 'Progress to the next rank')}>
        <i style={{ width: `${pr.ratio * 100}%` }} />
      </div>
      <div className="rk-progress__txt">
        {pr.next
          ? <><b>{pr.into}</b> / {pr.span} XP · {tr('ďalej', 'next')}: {rn(pr.next)}</>
          : tr('Najvyššia hodnosť', 'Highest rank')}
      </div>
    </div>
  );
}

function RolePicker({ value, onPick, compact }: { value: DbRole | null; onPick: (r: DbRole) => void; compact?: boolean }) {
  const { tr } = useLang();
  return (
    <div className={`rk-roles ${compact ? 'rk-roles--compact' : ''}`} role="radiogroup" aria-label={tr('Preferovaná rola', 'Preferred role')}>
      {ROLES.map(r => (
        <button key={r} type="button" role="radio" aria-checked={value === r} className={`rk-role ${value === r ? 'is-on' : ''}`} data-role={r} onClick={() => onPick(r)}>
          <span className="rk-role__ico"><Icon name={r} /></span>
          <RoleName role={r} />
        </button>
      ))}
    </div>
  );
}

function RoleName({ role }: { role: DbRole }) {
  const { tr } = useLang();
  const t: Record<DbRole, [string, string]> = { sheriff: ['Šerif', 'Sheriff'], deputy: ['Pomocník', 'Deputy'], outlaw: ['Bandita', 'Outlaw'], renegade: ['Odpadlík', 'Renegade'] };
  return <span>{tr(...t[role])}</span>;
}

/** Prihlasenie a registracia: len prezyvka a heslo, bez e-mailu. */
export function AuthPanel() {
  const { tr } = useLang();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [nick, setNick] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [role, setRole] = useState<DbRole | null>(null);
  const [trap, setTrap] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const nickOk = /^[\p{L}\p{N}][\p{L}\p{N} _.-]{1,14}[\p{L}\p{N}]$/u.test(nick.trim());
  const ok = mode === 'login' ? nickOk && pw.length > 0 : nickOk && pw.length >= 8 && pw === pw2 && !!role;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true); setErr('');
    const r = mode === 'login' ? await login(nick.trim(), pw, trap) : await register(nick.trim(), pw, role!, trap);
    setBusy(false);
    if (r) { setErr(r); setPw(''); setPw2(''); }
  };

  return (
    <section className="hm-card rk-auth" aria-labelledby="rk-auth-t">
      <div className="rk-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'is-on' : ''} onClick={() => { setMode('login'); setErr(''); }}>
          <LogIn size={16} />{tr('Prihlásenie', 'Log in')}
        </button>
        <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'is-on' : ''} onClick={() => { setMode('register'); setErr(''); }}>
          <UserPlus size={16} />{tr('Nový účet', 'New account')}
        </button>
      </div>
      <h2 id="rk-auth-t" className="rk-auth__title t-title">
        {mode === 'login' ? tr('Ukáž sa šerifovi', 'Show yourself to the sheriff') : tr('Zapíš sa do knihy hľadaných', 'Sign the wanted book')}
      </h2>
      <form className="rk-form" onSubmit={submit} noValidate>
        <input className="hm-hp" name="website" type="text" value={trap} onChange={e => setTrap(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" />
        <label className="hm-field">
          <span className="bang-label hm-dim">{tr('Prezývka', 'Nickname')}</span>
          <input value={nick} maxLength={16} autoComplete="username" spellCheck={false} onChange={e => setNick(e.target.value)} placeholder={tr('3 – 16 znakov', '3 – 16 characters')} />
        </label>
        <label className="hm-field">
          <span className="bang-label hm-dim">{tr('Heslo', 'Password')}</span>
          <input type="password" value={pw} maxLength={128} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} onChange={e => setPw(e.target.value)}
            placeholder={mode === 'register' ? tr('aspoň 8 znakov', 'at least 8 characters') : ''} />
        </label>
        {mode === 'register' && (
          <>
            <label className="hm-field">
              <span className="bang-label hm-dim">{tr('Heslo znova', 'Repeat password')}</span>
              <input type="password" value={pw2} maxLength={128} autoComplete="new-password" onChange={e => setPw2(e.target.value)}
                aria-invalid={pw2.length > 0 && pw2 !== pw} />
            </label>
            {pw2.length > 0 && pw2 !== pw && <p className="rk-err" role="alert">{tr('Heslá sa nezhodujú', 'Passwords do not match')}</p>}
            <div className="hm-field">
              <span className="bang-label hm-dim">{tr('Preferovaná rola (odznak, na hru nemá vplyv)', 'Preferred role (a badge, does not affect the game)')}</span>
              <RolePicker value={role} onPick={setRole} />
            </div>
          </>
        )}
        {err && <p className="rk-err" role="alert">{trErr(err)}</p>}
        <button type="submit" className="bang-btn bang-btn--primary hm-big hm-big--gold" disabled={!ok || busy}>
          {busy ? tr('Overujem…', 'Checking…') : mode === 'login' ? tr('Prihlásiť sa', 'Log in') : tr('Vytvoriť účet', 'Create account')}
        </button>
        <p className="hm-hint">{tr('Bez e-mailu a telefónu. Heslo si zapamätaj, obnoviť sa nedá.', 'No e-mail or phone. Remember your password, it cannot be recovered.')}</p>
      </form>
    </section>
  );
}

/** Profil hraca: hodnost, postup, rating, preferovana rola. Pouziva sa na uvode aj v lobby. */
export function ProfileCard({ profile, compact, editable = true }: { profile: Profile; compact?: boolean; editable?: boolean }) {
  const { tr } = useLang();
  const rn = useRankName();
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState('');
  const rank = rankFor(profile.xp);
  const winPct = profile.gamesPlayed ? Math.round((profile.gamesWon / profile.gamesPlayed) * 100) : 0;

  const pick = async (r: DbRole) => {
    setErr('');
    const e = await changeRole(r);
    if (e) setErr(e); else setEditing(false);
  };
  const out = async () => { const e = await logout(); if (e) setErr(e); };

  return (
    <section className={`rk-profile ${compact ? 'rk-profile--compact' : 'hm-card'}`} aria-label={tr('Profil hráča', 'Player profile')}>
      <div className="rk-profile__head">
        <RankBadge rankId={rank.id} size={compact ? 'md' : 'lg'} />
        <div className="rk-profile__who">
          <div className="rk-profile__nick">{profile.nickname}</div>
          <div className="rk-profile__rank">{rn(rank)} <small>· {tr(`hodnosť ${rank.id} z 13`, `rank ${rank.id} of 13`)}</small></div>
        </div>
        {!compact && editable && (
          <button type="button" className="hm-mini rk-profile__out" onClick={out} title={tr('Odhlásiť sa', 'Log out')}><LogOut size={15} /><span>{tr('Odhlásiť', 'Log out')}</span></button>
        )}
      </div>
      <RankProgress xp={profile.xp} />
      <dl className="rk-stats">
        <div><dt>XP</dt><dd>{profile.xp}</dd></div>
        <div><dt>{tr('Rating', 'Rating')}</dt><dd>{profile.rating}</dd></div>
        <div><dt>{tr('Hry', 'Games')}</dt><dd>{profile.gamesPlayed}</dd></div>
        <div><dt>{tr('Výhry', 'Wins')}</dt><dd>{profile.gamesWon}{profile.gamesPlayed > 0 && <small> ({winPct} %)</small>}</dd></div>
      </dl>
      <div className="rk-profile__role">
        <span className="bang-label hm-dim">{tr('Preferovaná rola', 'Preferred role')}</span>
        <RoleBadge role={DB_TO_ROLE[profile.preferredRole]} />
        {editable && !editing && <button type="button" className="hm-mini" onClick={() => setEditing(true)}><Pencil size={13} /><span>{tr('Zmeniť', 'Change')}</span></button>}
      </div>
      {editing && <RolePicker value={profile.preferredRole} onPick={r => void pick(r)} compact />}
      {err && <p className="rk-err" role="alert">{trErr(err)}</p>}
    </section>
  );
}

/** Maly profilovy widget do lobby: hodnost, postup, XP, rating a preferovana rola v jednom bloku. */
export function ProfileMini({ profile }: { profile: Profile }) {
  const { tr } = useLang();
  const rn = useRankName();
  const pr = rankProgress(profile.xp);
  return (
    <section className="rk-mini" aria-label={tr('Tvoj profil', 'Your profile')}>
      <RankBadge rankId={pr.rank.id} size="md" />
      <div className="rk-mini__body">
        <div className="rk-mini__top">
          <b>{profile.nickname}</b>
          <span className="rk-seat__role" data-role={profile.preferredRole} title={tr('Preferovaná rola', 'Preferred role')}><Icon name={profile.preferredRole} /></span>
        </div>
        <div className="rk-profile__rank">{rn(pr.rank)}</div>
        <div className="rk-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pr.ratio * 100)} aria-label={tr('Postup k ďalšej hodnosti', 'Progress to the next rank')}>
          <i style={{ width: `${pr.ratio * 100}%` }} />
        </div>
        <div className="rk-progress__txt">{profile.xp} XP · {tr('rating', 'rating')} <b>{profile.rating}</b>{pr.next && <> · {tr('ďalšia od', 'next at')} {pr.next.minXp} XP</>}</div>
      </div>
    </section>
  );
}

/** Odznak hraca pri stole v ranked lobby: hodnost a preferovana rola. */
export function SeatBadge({ badge }: { badge: { rankId: number; preferredRole: DbRole; rating: number } }) {
  const rn = useRankName();
  return (
    <span className="rk-seat" title={`${rn(rankById(badge.rankId))} · ${badge.rating}`}>
      <RankBadge rankId={badge.rankId} size="sm" />
      <span className="rk-seat__role" data-role={badge.preferredRole}><Icon name={badge.preferredRole} /></span>
      <span className="rk-seat__rating">{badge.rating}</span>
    </span>
  );
}

/** Pozapasova obrazovka: rozpis XP, zmena ratingu a animacia postupu (aj povysenia). */
export function MatchResultModal({ result, onClose }: { result: MatchResult; onClose: () => void }) {
  const { tr } = useLang();
  const rn = useRankName();
  const x = result.xp;
  const before = rankProgress(result.xpBefore), after = rankProgress(result.xpAfter);
  const promoted = result.rankAfter > result.rankBefore;
  // Faza animacie: start (stary postup) -> fill (doplnenie) -> [up: povysenie, novy pas od nuly] -> done
  const [phase, setPhase] = useState<'start' | 'fill' | 'up' | 'done'>(() => (reduced() ? 'done' : 'start'));
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    btn.current?.focus();
    if (reduced()) return;
    const ts = [setTimeout(() => setPhase('fill'), 450)];
    if (promoted) { ts.push(setTimeout(() => setPhase('up'), 1700)); ts.push(setTimeout(() => setPhase('done'), 1800)); }
    else ts.push(setTimeout(() => setPhase('done'), 1700));
    return () => ts.forEach(clearTimeout);
  }, [promoted]);

  const width = phase === 'start' ? before.ratio
    : phase === 'fill' ? (promoted ? 1 : after.ratio)
    : phase === 'up' ? 0
    : after.ratio;
  const shownRank = phase === 'done' || phase === 'up' ? result.rankAfter : result.rankBefore;
  const delta = result.ratingAfter - result.ratingBefore;

  const rows: { icon: ReactNode; label: string; sub?: string; v: number; hide?: boolean }[] = [
    { icon: <Swords size={16} />, label: tr('Poškodenie', 'Damage'), sub: tr('5 XP za život', '5 XP per life'), v: x.damage },
    { icon: <Crosshair size={16} />, label: tr('Zásahy BANG!', 'BANG! hits'), sub: x.hitsValid ? tr(`taktické: ${x.hitsValid}`, `tactical: ${x.hitsValid}`) : undefined, v: x.hits },
    { icon: <Shield size={16} />, label: tr('Úniky', 'Dodges'), v: x.dodges },
    { icon: <Bomb size={16} />, label: tr('Dynamit', 'Dynamite'), v: x.dynamite },
    { icon: <Flame size={16} />, label: tr(`Kombo ×${x.multiplier.toFixed(2).replace(/0$/, '')}`, `Combo ×${x.multiplier.toFixed(2).replace(/0$/, '')}`), sub: tr(`${x.cards} zahratých kariet`, `${x.cards} cards played`), v: x.comboBonus, hide: x.comboBonus === 0 },
    { icon: <Timer size={16} />, label: tr('Prežitie', 'Survival'), sub: tr(`${x.minutes} min`, `${x.minutes} min`), v: x.survival },
    {
      icon: <Trophy size={16} />,
      label: result.abandoned ? tr('Odchod z hry', 'Left the game') : result.won ? tr('Výhra', 'Victory') : tr('Prehra', 'Defeat'),
      v: x.result,
    },
  ];

  return (
    <div className="gb-modal rk-result" role="presentation">
      <div className="gb-dialog rk-result__box" role="dialog" aria-modal="true" aria-labelledby="rk-res-t">
        <div className="bang-prompt__kicker">{tr('Ranked zápas · vyúčtovanie', 'Ranked match · payout')}</div>
        <h2 id="rk-res-t" className="bang-prompt__title">
          {result.abandoned ? tr('Odišiel si od stola', 'You left the table') : result.won ? tr('Vyhral si!', 'You won!') : tr('Tentoraz prehra', 'A loss this time')}
        </h2>
        <ul className="rk-rows">
          {rows.filter(r => !r.hide).map((r, i) => (
            <li key={i} style={{ animationDelay: `${120 + i * 90}ms` }}>
              <span className="rk-rows__ico">{r.icon}</span>
              <span className="rk-rows__lbl">{r.label}{r.sub && <small>{r.sub}</small>}</span>
              <span className={`rk-rows__v ${r.v > 0 ? 'is-plus' : ''}`}>+{r.v}</span>
            </li>
          ))}
          <li className="rk-rows__total" style={{ animationDelay: `${120 + rows.length * 90}ms` }}>
            <span className="rk-rows__lbl">{tr('Spolu', 'Total')}</span>
            <span className="rk-rows__v">+{x.total} XP</span>
          </li>
        </ul>
        <div className="rk-result__rating">
          <span>{tr('Rating', 'Rating')}</span>
          <b>{result.ratingBefore}</b> <span aria-hidden="true">→</span> <b>{result.ratingAfter}</b>
          <span className={`rk-delta ${delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : ''}`}>{delta > 0 ? `+${delta}` : delta}</span>
        </div>
        <div className={`rk-result__rank ${phase === 'done' && promoted ? 'is-promoted' : ''}`}>
          <RankBadge rankId={shownRank} size="lg" />
          <div className="rk-result__rankinfo">
            {phase === 'done' && promoted && <div className="rk-rankup" role="status">{tr('Povýšenie!', 'Rank up!')}</div>}
            <div className="rk-profile__rank">{rn(rankById(shownRank))}</div>
            <div className="rk-bar rk-bar--big" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(after.ratio * 100)}>
              <i className={phase === 'up' ? 'no-anim' : ''} style={{ width: `${width * 100}%` }} />
            </div>
            <div className="rk-progress__txt">
              {after.next ? <>{result.xpAfter} XP · {tr('do hodnosti', 'to')} {rn(after.next)}: {after.next.minXp - result.xpAfter} XP</> : `${result.xpAfter} XP`}
            </div>
          </div>
        </div>
        <div className="bang-prompt__actions">
          <button ref={btn} className="bang-btn bang-btn--primary" type="button" onClick={onClose}>{tr('Pokračovať', 'Continue')}</button>
        </div>
      </div>
    </div>
  );
}
