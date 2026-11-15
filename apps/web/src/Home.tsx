import { useEffect, useState } from 'react';
import { Crosshair, Dices, DoorOpen, Gavel, IdCard, Star } from 'lucide-react';
import { saveName, savedName } from './net';
import { NavBar } from './Characters';
import { useLang } from './i18n';

type Act = (event: string, ...args: unknown[]) => Promise<{ ok?: boolean; error?: string }>;

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
  const [code, setCode] = useState('');
  const [trap, setTrap] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const ready = name.trim().length > 0;

  const go = async (kind: 'create' | 'join') => {
    if (busy) return;
    setBusy(kind);
    saveName(name.trim());
    await (kind === 'create' ? act('create', { name: name.trim(), hp: trap }) : act('join', { code, name: name.trim(), hp: trap }));
    setBusy(null);
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

          {/* Honeypot: neviditelne pole, vyplnia ho len boty. Server taku poziadavku odmietne. Nazov a atributy branie automatickemu doplnaniu. */}
          <input className="hm-hp" name="bs-extra-note" type="text" value={trap} onChange={e => setTrap(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" data-lpignore="true" data-1p-ignore="true" data-form-type="other" />

          <section className="hm-card hm-nick" aria-label={tr('Prezývka', 'Nickname')}>
            <span className="bang-label hm-nick__label"><IdCard size={16} />{tr('Prezývka', 'Nickname')}</span>
            <div className="hm-nick__row">
              <input
                value={name} maxLength={16} onChange={e => setName(e.target.value)}
                placeholder={tr('Zadaj prezývku…', 'Enter a nickname…')} aria-label={tr('Prezývka', 'Nickname')} autoFocus
              />
              <button type="button" className="hm-mini" onClick={random} title={tr('Vygenerovať náhodnú prezývku', 'Generate a random nickname')}><Dices size={16} /><span>{tr('Náhodne', 'Random')}</span></button>
            </div>
          </section>

          <div className="hm-grid">
            <section className="hm-card" aria-labelledby="hm-join">
              <div className="hm-card__head"><span id="hm-join" className="bang-label"><DoorOpen size={16} />{tr('Pripojiť sa k stolu', 'Join a table')}</span><span className="bang-label hm-dim">{tr('4-znakový kód', '4-character code')}</span></div>
              <label className="hm-field">
                <span className="bang-label hm-dim">{tr('Kód miestnosti', 'Room code')}</span>
                <input
                  className="hm-code" value={code} maxLength={4} placeholder={tr('KÓD', 'CODE')} autoComplete="off"
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === 'Enter' && ready && code.length === 4) go('join'); }}
                />
              </label>
              <p className="hm-hint">{tr('Kód ti pošle zakladateľ stola. Ukáže sa v strede stola v lobby.', 'The table host will send you the code. It shows in the middle of the table in the lobby.')}</p>
              <button type="button" className="bang-btn bang-btn--primary hm-big" disabled={!ready || code.length !== 4 || !!busy} onClick={() => go('join')}>
                {busy === 'join' ? tr('Pripájam…', 'Joining…') : <><Gavel size={18} />{tr('Pripojiť sa k stolu', 'Join the table')}</>}
              </button>
            </section>

            <section className="hm-card" aria-labelledby="hm-create">
              <div className="hm-card__head"><span id="hm-create" className="bang-label"><Crosshair size={16} />{tr('Alebo založ vlastný súboj', 'Or start your own showdown')}</span></div>
              <ul className="hm-facts">
                <li><b>4 – 7</b><span>{tr('hráčov pri stole', 'players at the table')}</span></li>
                <li><b>{tr('Boti', 'Bots')}</b><span>{tr('na skúšanie, pridáš ich v lobby', 'for testing, add them in the lobby')}</span></li>
                <li><b>{tr('Kód', 'Code')}</b><span>{tr('pošleš kamarátom', 'send it to your friends')}</span></li>
              </ul>
              <p className="hm-hint">{tr('Po založení stola uvidíš v lobby jeho kód. Hru spustíš, keď budete mať aspoň 4 hráčov.', 'After creating the table you will see its code in the lobby. You can start once you have at least 4 players.')}</p>
              <button type="button" className="bang-btn bang-btn--primary hm-big hm-big--gold" disabled={!ready || !!busy} onClick={() => go('create')}>
                {busy === 'create' ? tr('Rozdávam karty…', 'Dealing cards…') : tr('Otvoriť nový stôl v salóne', 'Open a new table in the saloon')}
              </button>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
