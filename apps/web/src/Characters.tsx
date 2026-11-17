import { Fragment, useMemo, useState } from 'react';
import { Maximize } from 'lucide-react';
import { CHARACTERS, GR_CHARS, isGoldRushChar, type CharKey } from '@bang/engine';
import { Gold, SpriteFace } from './Cards';
import { CAT_LABEL, CAT_LABEL_EN, CHAR_META, CHAR_META_EN, type Cat } from './charactersData';
import { LangSwitch, useLang } from './i18n';
import { charText } from './i18nData';
import { SoundSwitch } from './SoundSwitch';

const KEYS = Object.keys(CHARACTERS) as CharKey[];
const BASE_N = KEYS.length - GR_CHARS.length;

/** **tucne** a *kurziva* z jednoducheho znackovania. */
function rich(s: string) {
  return s.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((p, i) =>
    p.startsWith('**') ? <b key={i} className="ch-em">{p.slice(2, -2)}</b>
    : p.startsWith('*') ? <i key={i}>{p.slice(1, -1)}</i>
    : <Fragment key={i}>{p}</Fragment>);
}

function Bullets({ hp }: { hp: number }) {
  const { tr } = useLang();
  return (
    <span className="ch-bullets" title={tr(`${hp} životy / náboje`, `${hp} lives / bullets`)} aria-label={tr(`${hp} životy`, `${hp} lives`)}>
      {[0, 1, 2, 3].map(i => <i key={i} className={i < hp ? 'is-full' : ''} />)}
    </span>
  );
}

export function NavBar({ active }: { active: 'lobby' | 'rules' | 'characters' }) {
  const { tr } = useLang();
  return (
    <header className="ch-nav">
      <a className="ch-logo" href="#/" aria-label={tr('BANG! Online, úvod', 'BANG! Online, home')}>
        <img src="/cards/bang_bandita.webp" alt="" draggable={false} />
        <span className="t-title brand">BANG! Online</span>
      </a>
      <nav>
        <a href="#/" className={active === 'lobby' ? 'is-active' : ''}>{tr('Lobby hry', 'Game lobby')}</a>
        <a href="#/pravidla" className={active === 'rules' ? 'is-active' : ''}>{tr('Pravidlá hry', 'Rules')}</a>
        <a href="#/postavy" className={active === 'characters' ? 'is-active' : ''}>{tr('Karty postáv', 'Characters')}</a>
      </nav>
      <div className="ch-tools">
        <button type="button" className="gb-ico" title={tr('Celá obrazovka', 'Fullscreen')} aria-label={tr('Celá obrazovka', 'Fullscreen')}
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())}><Maximize size={18} /></button>
        <LangSwitch />
        <SoundSwitch />
      </div>
    </header>
  );
}

export function CharactersPage() {
  const { tr, lang } = useLang();
  const labels = lang === 'en' ? CAT_LABEL_EN : CAT_LABEL;
  const meta = (k: CharKey) => (lang === 'en' ? { ...CHAR_META[k], ...CHAR_META_EN[k] } : CHAR_META[k]);
  const [cat, setCat] = useState<'all' | Cat>('all');
  const [q, setQ] = useState('');

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return KEYS.filter(k => {
      const m = meta(k);
      if (cat !== 'all' && !m.cats.includes(cat)) return false;
      if (!s) return true;
      return [CHARACTERS[k].name, m.title, m.ability, charText(k)].join(' ').toLowerCase().includes(s);
    });
  }, [cat, q, lang]);

  return (
    <div className="ch-page">
      <NavBar active="characters" />

      <section className="ch-hero">
        <div className="bang-label ch-kicker">{tr('Galéria pištoľníkov a hrdinov frontieru', 'Gallery of gunslingers and heroes of the frontier')}</div>
        <h1 className="t-display ch-title">{tr('Karty postáv', 'Character cards')} <em>{tr('Základná hra a Gold Rush', 'Base game and Gold Rush')}</em></h1>
        <p className="ch-lead">
          {tr(`Všetkých ${KEYS.length} pištoľníkov: ${BASE_N} zo základnej hry, ${GR_CHARS.length} z rozšírenia Gold Rush. Postavy z rozšírenia majú zlatý štítok a do výberu sa dostanú len vtedy, keď zakladateľ stola rozšírenie zapne.`,
            `All ${KEYS.length} gunslingers: ${BASE_N} from the base game, ${GR_CHARS.length} from Gold Rush. Expansion characters carry a tag and enter the pick only when the table host turns the expansion on.`)}
        </p>
        <div className="ch-badges">
          <span>{tr(`${BASE_N} postáv základnej hry`, `${BASE_N} base game characters`)}</span>
          <span className="is-gold"><Gold size={16} />{tr(`${GR_CHARS.length} postáv Gold Rush`, `${GR_CHARS.length} Gold Rush characters`)}</span>
          <span>{tr('3 až 4 náboje (životy)', '3 to 4 bullets (lives)')}</span>
          <span className="is-sheriff">{tr('+1 život pre Šerifa', '+1 life for the Sheriff')}</span>
        </div>

        <div className="ch-filters">
          <input
            type="search" value={q} onChange={e => setQ(e.target.value)}
            placeholder={tr('Hľadať pištoľníka alebo schopnosť…', 'Search a gunslinger or ability…')} aria-label={tr('Hľadať pištoľníka alebo schopnosť', 'Search a gunslinger or ability')}
          />
          <div className="ch-chips" role="group" aria-label={tr('Kategória', 'Category')}>
            {(Object.keys(CAT_LABEL) as ('all' | Cat)[]).map(c => (
              <button key={c} type="button" className={`${c === cat ? 'is-active' : ''} ${c === 'gold' ? 'is-gold' : ''}`} aria-pressed={c === cat} onClick={() => setCat(c)}>
                {c === 'gold' && <Gold size={14} />}{labels[c]}{c === 'all' ? ` (${KEYS.length})` : c === 'gold' ? ` (${GR_CHARS.length})` : ''}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="ch-body">
        {shown.length === 0 ? (
          <div className="ch-empty">
            <h2 className="t-title">{tr('Žiadny pištoľník nenájdený', 'No gunslinger found')}</h2>
            <p>{tr('Podľa hľadania alebo zvolenej kategórie sme nenašli žiadnu kartu postavy.', 'No character card matches your search or the selected category.')}</p>
            <button className="bang-btn bang-btn--primary" type="button" onClick={() => { setQ(''); setCat('all'); }}>{tr('Obnoviť filtre', 'Reset filters')}</button>
          </div>
        ) : (
          <div className="ch-grid">
            {shown.map(k => {
              const c = CHARACTERS[k];
              const m = meta(k);
              return (
                <article key={k} className={`ch-card ${isGoldRushChar(k) ? 'is-goldrush' : ''}`}>
                  {isGoldRushChar(k) && (
                    <a className="ch-card__exp" href="#/pravidla/gold-rush" title={tr('Postava z rozšírenia Gold Rush. Hrá sa len so zapnutým rozšírením.', 'Gold Rush expansion character. Only in play with the expansion on.')}>
                      <Gold size={16} /><span>{tr('Rozšírenie Gold Rush', 'Gold Rush expansion')}</span>
                    </a>
                  )}
                  <div className="ch-card__head">
                    <span className="ch-card__role">{m.title}</span>
                    <Bullets hp={c.hp} />
                  </div>
                  <div className="ch-card__img">
                    <SpriteFace k={k} title={c.name} />
                    <span className={`ch-card__hp ${c.hp === 3 ? 'is-low' : ''}`}>{c.hp} HP</span>
                  </div>
                  <div className="ch-card__text">
                    <h3 className="t-title">{c.name}</h3>
                    <p>{rich(m.ability)}</p>
                    <p className="ch-card__note">{m.note}</p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="ch-body ch-rules">
        <h2 className="t-title">{tr('Taktické tipy & zlaté pravidlá BANG!', 'Tactical tips & golden rules of BANG!')}</h2>
        <div className="ch-rules__grid">
          <div className="ch-rule is-sheriff">
            <div className="bang-label">{tr('Kľúčové pravidlo identity', 'Key identity rule')}</div>
            <h3 className="t-title">{tr('Pravidlo Šerifa (+1 život)', 'Sheriff rule (+1 life)')}</h3>
            {lang === 'en' ? <p>If you play the <b className="ch-em">Sheriff</b>, your identity card is public from the start and you begin with <b>+1 bullet (life)</b> on top of the number on the character card. E.g. Willy the Kid has 5 lives as Sheriff, Paul Regret has 4.</p> : <p>Ak hráte za <b className="ch-em">Šerifa</b>, vaša karta identity je verejne odhalená od začiatku a začínate s <b>+1 nábojom (životom) navyše</b> k počtu uvedenému na karte postavy. Napr. Willy the Kid má ako Šerif 5 životov, Paul Regret má 4.</p>}
          </div>
          <div className="ch-rule">
            <div className="bang-label">{tr('Pravidlo odhadzovania', 'Discard rule')}</div>
            <h3 className="t-title">{tr('Limit kariet na konci ťahu', 'Hand limit at end of turn')}</h3>
            {lang === 'en' ? <p>At the end of your turn you may not hold more cards than your <b>current number of lives</b> (not the starting number of bullets). Excess cards must be discarded onto the discard pile.</p> : <p>Na konci ťahu nesmiete mať v ruke viac kariet, než je váš <b>aktuálny stav životov</b> (nie počiatočný počet nábojov). Prebytočné karty musíte odhodiť na vrch odhadzovacieho balíčka.</p>}
          </div>
        </div>
        <div className="ch-cta">
          <div>
            <h3 className="t-title">{tr('Ste pripravení tasiť zbraň?', 'Ready to draw your gun?')}</h3>
            <p>{tr('Pripojte sa k verejnému salónu a vyskúšajte si postavy v praxi.', 'Join a public saloon and try the characters in practice.')}</p>
          </div>
          <a className="bang-btn bang-btn--primary" href="#/">{tr('Vstúpiť do lobby', 'Enter the lobby')}</a>
        </div>
      </section>
    </div>
  );
}
