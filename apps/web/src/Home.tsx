import { useEffect, useState } from 'react';
import { Crosshair, Dices, DoorOpen, Gavel, IdCard, Medal, Star, Zap } from 'lucide-react';
import { call, saveMode, saveName, savedMode, savedName, socket } from './net';
import { useAccount } from './account';
import { AuthPanel, ProfileCard } from './Ranked';
import { trErr } from './i18nData';
import { NavBar } from './Characters';
import { useLang } from './i18n';
import { roomFromUrl, stripRoomFromUrl } from './Invite';

type Act = (event: string, ...args: unknown[]) => Promise<{ ok?: boolean; error?: string; pending?: boolean }>;

/** Stav ziadosti o pripojenie do rozbehnutej hry: caka sa na schvalenie, alebo skoncila zamietnutim / vyprsanim. */
type Wait = { asking: string | null; host: boolean; error?: string };

const HANDLES = [
  'Doc Durango', 'Calamity Cole', 'Wild Bill Tex', 'Black Bart Logan', 'Kid Cassidy', 'Dollar Sam',
  'Josey Wales', 'Belle Starling', 'Rio Bravo Dan', 'Pecos Pete', 'Deadwood Dixon', 'Apache Annie',
];

const BACKDROPS = ['/cards/webart2.webp', '/cards/webart3.webp'];
const BACKDROP_MS = 5000;

/** Pozadie: obrazky sa po 5 s plynule prelinaju v slucke. */
function Backdrop() {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setI(x => (x + 1) % BACKDROPS.length), BACKDROP_MS);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="hm-bg" aria-hidden="true">
      {BACKDROPS.map((src, k) => (
        <img key={src} src={src} alt="" className={k === i ? 'is-on' : ''} draggable={false} />
      ))}
      <div className="hm-bg__shade" />
    </div>
  );
}

/** Uvodna obrazovka: prezyvka, pripojenie k stolu kodom alebo zalozenie noveho stola. */
export function Home({ act }: { act: Act }) {
  const { tr } = useLang();
  const [name, setName] = useState(savedName());
  const [code, setCode] = useState(roomFromUrl);
  const [invited] = useState(() => roomFromUrl().length >= 4);
  const [trap, setTrap] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [mode, setModeState] = useState(savedMode);
  const setMode = (m: 'quick' | 'ranked') => { setModeState(m); saveMode(m); };
  const acc = useAccount();
  const ranked = mode === 'ranked';
  const ready = ranked ? !!acc.profile : name.trim().length > 0;
  const [wait, setWait] = useState<Wait | null>(null);

  useEffect(() => { stripRoomFromUrl(); }, []);

  useEffect(() => {
    const onStatus = (s: { asking?: string; host?: boolean }) => setWait(w => (w ? { ...w, asking: s?.asking ? String(s.asking).slice(0, 24) : null, host: !!s?.host } : w));
    const onResult = (r: { ok?: boolean; error?: string }) => setWait(w => (w && !r?.ok ? { ...w, error: String(r?.error ?? 'Pripojenie sa nepodarilo') } : w));
    socket.on('joinStatus', onStatus);
    socket.on('joinResult', onResult);
    return () => { socket.off('joinStatus', onStatus); socket.off('joinResult', onResult); };
  }, []);

  const go = async (kind: 'create' | 'join') => {
    if (busy) return;
    setBusy(kind);
    if (!ranked) saveName(name.trim());
    const nm = ranked && acc.profile ? acc.profile.nickname : name.trim();
    if (kind === 'join') setWait({ asking: null, host: true });
    const r = await (kind === 'create'
      ? act('create', { name: nm, hp: trap, ...(ranked ? { ranked: true } : {}) })
      : act('join', { code, name: nm, hp: trap }));
    // Hra uz bezi: server ma zaznam o ziadosti, caka sa na schvalenie (joinStatus / joinResult). Inak overlay netreba.
    if (kind === 'join' && !r.pending) setWait(null);
    setBusy(null);
  };

  const cancelWait = () => {
    setWait(null);
    void call('joinCancel');
  };

  const random = () => {
    const others = HANDLES.filter(h => h !== name);
    setName(others[Math.floor(Math.random() * others.length)]);
  };

  return (
    <div className="ch-page hm-page">
      <NavBar active="lobby" />
      <main className="hm-main">
        <Backdrop />
        <div className="hm-glow hm-glow--gold" aria-hidden="true" />
        <div className="hm-glow hm-glow--red" aria-hidden="true" />

        <div className="hm-wrap">
          <header className="hm-title">
            <div className="hm-star" aria-hidden="true"><i /><Star size={14} fill="currentColor" /><i /></div>
            <h1 className="t-display">{tr('Začať hru', 'Start a game')}</h1>
            <p>{tr('Podpíš sa prezývkou, prisadni si k stolu alebo zvolaj svoju bandu.', 'Sign in with a nickname, take a seat at a table or gather your gang.')}</p>
          </header>

          {/* Honeypot: neviditelne pole, vyplnia ho len boty. Server za to zablokuje IP. */}
          <input className="hm-hp" name="website" type="text" value={trap} onChange={e => setTrap(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" />

          <div className="rk-mode" role="tablist" aria-label={tr('Režim hry', 'Game mode')}>
            <button type="button" role="tab" aria-selected={!ranked} className={!ranked ? 'is-on' : ''} onClick={() => setMode('quick')}>
              <Zap size={18} /><span><b>{tr('Rýchla hra', 'Quick game')}</b><small>{tr('bez účtu, s botmi, bez XP', 'no account, bots allowed, no XP')}</small></span>
            </button>
            <button type="button" role="tab" aria-selected={ranked} className={ranked ? 'is-on' : ''} onClick={() => setMode('ranked')}>
              <Medal size={18} /><span><b>Ranked</b><small>{tr('účet, XP, rating a hodnosti', 'account, XP, rating and ranks')}</small></span>
            </button>
          </div>

          {ranked && acc.enabled === false && (
            <section className="hm-card"><p className="hm-hint">{tr('Ranked režim nie je na tomto serveri zapnutý. Zahraj si zatiaľ rýchlu hru.', 'Ranked mode is not enabled on this server. Play a quick game for now.')}</p></section>
          )}
          {ranked && acc.enabled !== false && !acc.profile && <AuthPanel />}
          {ranked && acc.profile && <ProfileCard profile={acc.profile} />}

          {!ranked && <section className="hm-card hm-nick" aria-label={tr('Prezývka', 'Nickname')}>
            <span className="bang-label hm-nick__label"><IdCard size={16} />{tr('Prezývka', 'Nickname')}</span>
            <div className="hm-nick__row">
              <input
                value={name} maxLength={16} onChange={e => setName(e.target.value)}
                placeholder={tr('Zadaj prezývku…', 'Enter a nickname…')} aria-label={tr('Prezývka', 'Nickname')} autoFocus
              />
              <button type="button" className="hm-mini" onClick={random} title={tr('Vygenerovať náhodnú prezývku', 'Generate a random nickname')}><Dices size={16} /><span>{tr('Náhodne', 'Random')}</span></button>
            </div>
          </section>}

          {(!ranked || acc.profile) && <div className="hm-grid">
            <section className="hm-card" aria-labelledby="hm-join">
              <div className="hm-card__head"><span id="hm-join" className="bang-label"><DoorOpen size={16} />{tr('Pripojiť sa k stolu', 'Join a table')}</span><span className="bang-label hm-dim">{tr('6-znakový kód', '6-character code')}</span></div>
              <label className="hm-field">
                <span className="bang-label hm-dim">{tr('Kód miestnosti', 'Room code')}</span>
                <input
                  className="hm-code" value={code} maxLength={6} placeholder={tr('KÓD', 'CODE')} autoComplete="off"
                  onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                  onKeyDown={e => { if (e.key === 'Enter' && ready && code.length >= 4) go('join'); }}
                />
              </label>
              {invited && <p className="hm-hint hm-invited" role="status">{ranked ? tr('Dostal si pozvánku do stola. Ak je to ranked stôl, pripoj sa so svojím účtom.', 'You got an invite to a table. If it is a ranked table, join with your account.') : tr('Dostal si pozvánku do stola. Zadaj prezývku a pripoj sa.', 'You got an invite to a table. Enter a nickname and join.')}</p>}
              <p className="hm-hint">{tr('Kód ti pošle zakladateľ stola. Ukáže sa v strede stola v lobby.', 'The table host will send you the code. It shows in the middle of the table in the lobby.')}</p>
              <button type="button" className="bang-btn bang-btn--primary hm-big" disabled={!ready || code.length < 4 || !!busy} onClick={() => go('join')}>
                {busy === 'join' ? tr('Pripájam…', 'Joining…') : <><Gavel size={18} />{tr('Pripojiť sa k stolu', 'Join the table')}</>}
              </button>
            </section>

            <section className="hm-card" aria-labelledby="hm-create">
              <div className="hm-card__head"><span id="hm-create" className="bang-label"><Crosshair size={16} />{tr('Alebo založ vlastný súboj', 'Or start your own showdown')}</span></div>
              {ranked ? (
                <ul className="hm-facts">
                  <li><b>4 – 7</b><span>{tr('prihlásených hráčov', 'logged-in players')}</span></li>
                  <li><b>XP</b><span>{tr('za zásahy, úniky, dynamit, prežitie a výsledok', 'for hits, dodges, dynamite, survival and the result')}</span></li>
                  <li><b>{tr('Bez botov', 'No bots')}</b><span>{tr('a bez prisadania počas hry', 'and no joining mid-game')}</span></li>
                </ul>
              ) : (
                <ul className="hm-facts">
                  <li><b>4 – 7</b><span>{tr('hráčov pri stole', 'players at the table')}</span></li>
                  <li><b>{tr('Boti', 'Bots')}</b><span>{tr('na skúšanie, pridáš ich v lobby', 'for testing, add them in the lobby')}</span></li>
                  <li><b>{tr('Kód', 'Code')}</b><span>{tr('pošleš kamarátom', 'send it to your friends')}</span></li>
                </ul>
              )}
              <p className="hm-hint">{tr('Po založení stola uvidíš v lobby jeho kód. Hru spustíš, keď budete mať aspoň 4 hráčov.', 'After creating the table you will see its code in the lobby. You can start once you have at least 4 players.')}</p>
              <button type="button" className="bang-btn bang-btn--primary hm-big hm-big--gold" disabled={!ready || !!busy} onClick={() => go('create')}>
                {busy === 'create' ? tr('Rozdávam karty…', 'Dealing cards…') : ranked ? tr('Otvoriť ranked stôl', 'Open a ranked table') : tr('Otvoriť nový stôl v salóne', 'Open a new table in the saloon')}
              </button>
            </section>
          </div>}
        </div>
      </main>
      {wait && (
        <div className="gb-modal join-wait" role="presentation">
          <div className="gb-dialog" role="alertdialog" aria-modal="true" aria-labelledby="jw-t" aria-describedby="jw-d">
            <div className="bang-prompt__kicker">{tr('Hra už beží', 'The game is already running')}</div>
            <h2 id="jw-t" className="bang-prompt__title">{wait.error ? tr('Pripojenie sa nepodarilo', 'Could not join') : tr('Čakáš na schválenie', 'Waiting for approval')}</h2>
            <p id="jw-d" className="bang-prompt__body" role="status">
              {wait.error
                ? trErr(wait.error)
                : wait.asking
                  ? (wait.host
                    ? tr(`Zakladateľ ${wait.asking} rozhoduje o tvojom pripojení.`, `The host ${wait.asking} is deciding whether you can join.`)
                    : tr(`Zakladateľ neodpovedal, rozhoduje ${wait.asking}.`, `The host did not answer, ${wait.asking} is deciding.`))
                  : tr('Posielam žiadosť hráčom pri stole…', 'Sending the request to the players at the table…')}
            </p>
            {!wait.error && <div className="join-wait__dots" aria-hidden="true"><i /><i /><i /></div>}
            <div className="bang-prompt__actions">
              <button className="bang-btn bang-btn--on-paper" type="button" autoFocus onClick={cancelWait}>{wait.error ? tr('Zavrieť', 'Close') : tr('Zrušiť žiadosť', 'Cancel request')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
