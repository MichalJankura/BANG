import { useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, Beer, Crosshair, Ghost, RotateCcw, ShoppingBag, Trash2 } from 'lucide-react';
import { CHARACTERS, EQUIP, GR_CHARS, type EquipType } from '@bang/engine';
import { NavBar } from './Characters';
import { Gold, SpriteFace } from './Cards';
import { useLang } from './i18n';
import { charText, equipName, equipText, nuggets } from './i18nData';

/*
 * Pravidla rozsirenia BANG! Gold Rush (dV Giochi, 2011), prerozpravane vlastnymi slovami.
 * Kazdy text je dvojica [slovensky, anglicky].
 */

type P<T = string> = readonly [T, T];

const SECTIONS: [string, P][] = [
  ['gr-priprava', ['1. Príprava', '1. Setup']],
  ['gr-nugety', ['2. Nugety', '2. Nuggets']],
  ['gr-akcie', ['3. Nové akcie', '3. New actions']],
  ['gr-vybavenie', ['4. Vybavenie', '4. Equipment']],
  ['gr-postavy', ['5. Postavy', '5. Characters']],
  ['gr-tiene', ['6. Tieňoví pištoľníci', '6. Shadow gunslingers']],
  ['gr-vynimky', ['7. Výnimky', '7. Exceptions']],
];

const TYPES = Object.keys(EQUIP) as EquipType[];

/** Poznamky k jednotlivym kartam z pravidiel. */
const NOTES: Partial<Record<EquipType, P>> = {
  bottiglia: ['Neráta sa ako Panika!, Pivo ani BANG!. Madam Yto za ňu kartu neťahá.', 'Does not count as a Panic!, Beer or BANG!. Madam Yto draws nothing for it.'],
  complice: ['Neráta sa ako Hokynárstvo, Duel ani Cat Balou.', 'Does not count as a General Store, Duel or Cat Balou.'],
  setaccio: ['Zaplatené nugety sa po ťahu vracajú na kôpku.', 'The nuggets you pay return to the heap after the turn.'],
  talismano: ['Neplatí pri strate posledného života. Nuget je vždy z kôpky, nie od strelca.', 'Does not apply to your last life. The nugget always comes from the heap, not from the shooter.'],
  stivali: ['Neplatí pri strate posledného života.', 'Does not apply to your last life.'],
  rum: ['S Podkovou alebo ako Lucky Duke otáčaš o kartu viac. Otočené karty sa odhodia.', 'With a Horseshoe or as Lucky Duke you flip one more card. Flipped cards are discarded.'],
  ricercato: ['Odmena sa pripočíta k ostatným: za Hľadaného banditu je to 3 + 2 karty a 1 nuget.', 'The reward adds to any other: a Wanted outlaw gives 3 + 2 cards and 1 nugget.'],
  zaino: ['Jediné vybavenie, ktoré použiješ aj mimo svojho ťahu.', 'The only equipment you can use out of your turn.'],
};

function Sec({ id, n, title, sub, aside, children }: { id: string; n: string; title: string; sub: string; aside?: string; children: ReactNode }) {
  return (
    <section className="ru-sec" id={id}>
      <div className="ru-sec__head">
        <span className="ru-num">{n}</span>
        <div className="ru-sec__t">
          <h2 className="t-title">{title}</h2>
          <p>{sub}</p>
        </div>
        {aside && <span className="ru-aside">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

const Face = ({ k, title }: { k: string; title: string }) => <span className="gr-face"><SpriteFace k={k} title={title} /></span>;

/** Prepinac medzi pravidlami zakladnej hry a rozsirenia. */
export function RuleTabs({ active }: { active: 'base' | 'goldrush' }) {
  const { tr } = useLang();
  return (
    <div className="ru-tabs" role="navigation" aria-label={tr('Pravidlá', 'Rules')}>
      <a href="#/pravidla" className={active === 'base' ? 'is-active' : ''} aria-current={active === 'base' ? 'page' : undefined}>{tr('Základná hra', 'Base game')}</a>
      <a href="#/pravidla/gold-rush" className={`is-gold ${active === 'goldrush' ? 'is-active' : ''}`} aria-current={active === 'goldrush' ? 'page' : undefined}><Gold size={15} />Gold Rush</a>
    </div>
  );
}

// ---------- demo: obchod s vybavenim ----------

const HEAP = 30;
const DEMO_ORDER: EquipType[] = ['bicchierino', 'ferro_di_cavallo', 'piccone', 'bottiglia', 'stivali', 'union_pacific', 'ricercato', 'zaino', 'rum', 'calumet'];

function ShopDemo() {
  const { tr } = useLang();
  const [gold, setGold] = useState(2);
  const [pos, setPos] = useState(0);
  const [mine, setMine] = useState<EquipType[]>([]);
  const [rival, setRival] = useState<EquipType | null>('talismano');
  const [msg, setMsg] = useState<P>(['Začínaš s 2 nugetmi. Zasiahni súpera alebo premeň Pivo na nuget a nakupuj.', 'You start with 2 nuggets. Hit a rival or turn a Beer into a nugget and go shopping.']);
  // V hre je 30 nugetov: co nemas ty, lezi na kopke (super v ukazke ziadne nema).
  const heap = HEAP - gold;
  const earn = (m: P) => {
    if (heap <= 0) return setMsg(['Kôpka je prázdna. V hre je len 30 nugetov, ďalší dostaneš, až keď nejaké miniete.', 'The heap is empty. There are only 30 nuggets in the game, you get more once some are spent.']);
    setGold(g => Math.min(HEAP, g + 1)); setMsg(m);
  };
  const shop = useMemo(() => [0, 1, 2].map(i => DEMO_ORDER[(pos + i) % DEMO_ORDER.length]), [pos]);

  const buy = (t: EquipType) => {
    const d = EQUIP[t];
    if (gold < d.cost) return setMsg([`Na kartu ${EQUIP[t].name} treba ${d.cost}, máš ${gold}.`, `${equipName(t)} costs ${d.cost}, you have ${gold}.`]);
    if (d.black && mine.includes(t)) return setMsg(['Dve rovnaké karty pred sebou mať nemôžeš.', 'You cannot have two cards with the same name in front of you.']);
    setGold(g => g - d.cost);
    // kupena karta sa hned nahradi dalsou z balika
    setPos(p => p + 1);
    if (d.black) { setMine(m => [...m, t]); setMsg(['Čierna karta ostáva vyložená pred tebou a platí, kým ti ju niekto neodhodí.', 'A black card stays in front of you and works until someone makes you discard it.']); }
    else setMsg(['Hnedá karta sa použije hneď a ide naspodok balíka vybavenia.', 'A brown card is used right away and goes to the bottom of the equipment deck.']);
  };
  const scrap = () => {
    if (!rival) return;
    const cost = EQUIP[rival].cost + 1;
    if (gold < cost) return setMsg([`Odhodenie stojí cenu karty + 1, teda ${cost}. Máš ${gold}.`, `Discarding costs the card price + 1, so ${cost}. You have ${gold}.`]);
    setGold(g => g - cost); setRival(null);
    setMsg(['Súper kartu odhodil a nemôže tomu zabrániť.', 'Your rival discarded the card and cannot prevent it.']);
  };
  const reset = () => { setGold(2); setPos(0); setMine([]); setRival('talismano'); setMsg(['Začínaš s 2 nugetmi. Zasiahni súpera alebo premeň Pivo na nuget a nakupuj.', 'You start with 2 nuggets. Hit a rival or turn a Beer into a nugget and go shopping.']); };

  return (
    <div className="gr-demo" aria-label={tr('Ukážka: obchod s vybavením', 'Demo: equipment shop')}>
      <div className="gr-demo__bar">
        <span className="gr-demo__gold" aria-live="polite"><Gold size={30} /><b>{gold}</b><span>{tr('tvoje nugety', 'your nuggets')}</span><em className="gr-demo__heap">{tr(`na kôpke ${heap} z ${HEAP}`, `${heap} of ${HEAP} in the heap`)}</em></span>
        <div className="gr-demo__earn">
          <button type="button" className="bang-btn" aria-disabled={heap <= 0} onClick={() => earn(['Zásah: súper stratil život, berieš si 1 nuget z kôpky.', 'Hit: your rival lost a life, you take 1 nugget from the heap.'])}><Crosshair size={16} />{tr('Zasiahni súpera', 'Hit a rival')}</button>
          <button type="button" className="bang-btn" aria-disabled={heap <= 0} onClick={() => earn(['Pivo zahrané za nuget ti život nevylieči.', 'A Beer played for a nugget does not heal you.'])}><Beer size={16} />{tr('Pivo za nuget', 'Beer for a nugget')}</button>
          <button type="button" className="gr-demo__reset" onClick={reset} aria-label={tr('Začať odznova', 'Start over')} title={tr('Začať odznova', 'Start over')}><RotateCcw size={16} /></button>
        </div>
      </div>
      <p className="gr-demo__msg" role="status">{tr(msg)}</p>
      <div className="gr-demo__table">
        <div>
          <span className="bang-label">{tr('Ponuka (klikni a kúp)', 'On offer (click to buy)')}</span>
          <div className="gr-demo__row">
            {shop.map((t, i) => (
              <button key={`${pos}-${i}`} type="button" className={`gr-demo__card ${gold >= EQUIP[t].cost ? 'can' : ''}`} onClick={() => buy(t)}
                aria-label={tr(`Kúpiť ${EQUIP[t].name} za ${EQUIP[t].cost}`, `Buy ${equipName(t)} for ${EQUIP[t].cost}`)}>
                <Face k={t} title={equipName(t)} />
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="bang-label">{tr('Pred tebou', 'In front of you')}</span>
          <div className="gr-demo__row is-small">
            {mine.length === 0 ? <span className="gr-demo__empty">{tr('Zatiaľ nič. Kúp čiernu kartu.', 'Nothing yet. Buy a black card.')}</span>
              : mine.map(t => <span key={t} className="gr-demo__card is-static"><Face k={t} title={equipName(t)} /></span>)}
          </div>
        </div>
        <div>
          <span className="bang-label">{tr('Pred súperom', 'In front of your rival')}</span>
          <div className="gr-demo__row is-small">
            {rival ? (
              <button type="button" className={`gr-demo__card is-rival ${gold >= EQUIP[rival].cost + 1 ? 'can' : ''}`} onClick={scrap}
                aria-label={tr(`Odhodiť súperovi ${EQUIP[rival].name} za ${EQUIP[rival].cost + 1}`, `Make the rival discard ${equipName(rival)} for ${EQUIP[rival].cost + 1}`)}>
                <Face k={rival} title={equipName(rival)} />
                <span className="gr-demo__scrap"><Trash2 size={13} />{EQUIP[rival].cost + 1}</span>
              </button>
            ) : <span className="gr-demo__empty">{tr('Súper prišiel o Talizman.', 'The rival lost the Lucky Charm.')}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- stranka ----------

export function GoldRushPage() {
  const { tr, lang } = useLang();
  const pk = <T,>(x: P<T>): T => x[lang === 'sk' ? 0 : 1];
  const [kind, setKind] = useState<'all' | 'brown' | 'black'>('all');
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const shown = TYPES.filter(t => kind === 'all' || (kind === 'black') === EQUIP[t].black);

  return (
    <div className="ch-page ru-page gr-page">
      <NavBar active="rules" />

      <section className="ch-hero ru-hero gr-hero">
        <div className="gr-hero__in">
          <div className="gr-hero__txt">
            <RuleTabs active="goldrush" />
            <h1 className="t-display ru-h1">{tr('Gold Rush: zlatá horúčka', 'Gold Rush')}</h1>
            <p className="ch-lead">
              {tr('Za každý zásah dostaneš zlatý nuget. Za nugety kupuješ vybavenie, ktoré ti nikto neukradne Panikou ani Cat Balou.',
                'Every hit earns you a gold nugget. Nuggets buy equipment that no Panic! or Cat Balou can take away.')}
            </p>
            <div className="gr-facts">
              <div><b>24</b><span>{tr('kariet vybavenia', 'equipment cards')}</span></div>
              <div><b>8</b><span>{tr('nových postáv', 'new characters')}</span></div>
              <div><b>30</b><span>{tr('zlatých nugetov', 'gold nuggets')}</span></div>
              <div><b>1</b><span>{tr('variant s tieňmi', 'shadow variant')}</span></div>
            </div>
            <a className="bang-btn bang-btn--primary" href="#/">{tr('Zapnúť v lobby', 'Turn it on in the lobby')}<ArrowRight size={16} /></a>
          </div>
          <div className="gr-hero__art" aria-hidden="true">
            <span className="gr-hero__card c1"><Face k="setaccio" title="" /></span>
            <span className="gr-hero__card c2"><Face k="corsa_all_oro" title="" /></span>
            <span className="gr-hero__card c3"><Face k="ricercato" title="" /></span>
            <img className="gr-hero__nug n1" src="/cards/04_gold_piece.webp" alt="" />
            <img className="gr-hero__nug n2" src="/cards/04_gold_piece.webp" alt="" />
            <img className="gr-hero__nug n3" src="/cards/04_gold_piece.webp" alt="" />
          </div>
        </div>
      </section>

      <nav className="ru-subnav" aria-label={tr('Sekcie pravidiel', 'Rule sections')}>
        {SECTIONS.map(([id, label]) => <button key={id} type="button" onClick={() => go(id)}>{pk(label)}</button>)}
      </nav>

      <div className="ru-content">
        <Sec id="gr-priprava" n="01" title={tr('Príprava hry', 'Setup')} aside={tr('Platia všetky pravidlá základnej hry', 'All base game rules apply')}
          sub={tr('Na stole pribudne balík vybavenia, tri odkryté karty a kôpka nugetov.', 'The table gains an equipment deck, three face-up cards and a heap of nuggets.')}>
          <div className="gr-setup">
            <ol className="gr-steps">
              <li><b>{tr('Balík vybavenia', 'Equipment deck')}</b><span>{tr('Zamieša sa zvlášť a leží bokom od hracieho balíka.', 'Shuffled separately and placed apart from the playing deck.')}</span></li>
              <li><b>{tr('Ponuka', 'The offer')}</b><span>{tr('Tri vrchné karty vybavenia sa odkryjú do radu. Kúpená karta sa hneď nahradí novou.', 'The top three equipment cards are turned face up in a row. A bought card is replaced at once.')}</span></li>
              <li><b>{tr('Kôpka nugetov', 'Nugget heap')}</b><span>{tr('V strede stola leží 30 nugetov. Keď sa kôpka minie, ďalšie nedostane nikto, kým sa nejaké nevrátia zaplatením.', 'A heap of 30 nuggets lies in the middle of the table. Once it is empty, nobody gets more until some are paid back.')}</span></li>
              <li><b>{tr('Začiatok', 'The start')}</b><span>{tr('Každý začína bez vybavenia a bez nugetov. Nugety má každý viditeľne pred sebou.', 'Everyone starts with no equipment and no nuggets. Nuggets are kept in plain sight.')}</span></li>
            </ol>
            <div className="gr-setup__art" aria-hidden="true">
              <span className="gr-mini is-back" />
              <span className="gr-mini"><Face k="bicchierino" title="" /></span>
              <span className="gr-mini"><Face k="cinturone" title="" /></span>
              <span className="gr-mini"><Face k="rum" title="" /></span>
              <img src="/cards/04_gold_piece.webp" alt="" />
            </div>
          </div>
        </Sec>

        <Sec id="gr-nugety" n="02" title={tr('Ako získaš nugety', 'How you earn nuggets')}
          sub={tr('Zlato je odmena za každý život, o ktorý pripravíš iného hráča.', 'Gold is the reward for every life you take from another player.')}>
          <div className="gr-earn">
            <div className="gr-earn__main">
              <Gold size={64} />
              <div>
                <h3 className="t-title">{tr('1 zásah = 1 nuget', '1 hit = 1 nugget')}</h3>
                <p>{tr('Je jedno, čím súpera zraníš: BANG!, Indiáni!, Duel, Guľomet. Ak jednou kartou zraníš viac hráčov, berieš nuget za každý stratený život.',
                  'It does not matter how you wound a rival: BANG!, Indians!, Duel, Gatling. If one card wounds several players, you take a nugget for every life lost.')}</p>
              </div>
            </div>
            <div className="ru-warn is-calm gr-example">
              <b>{tr('Príklad', 'Example')}</b>
              {tr('Pri piatich hráčoch zahráš Guľomet. Jeden súper zahrá Vedľa!, traja zásah prijmú. Berieš si 3 nugety.',
                'With five players you play a Gatling. One rival plays a Missed!, three take the hit. You take 3 nuggets.')}
            </div>
          </div>
        </Sec>

        <Sec id="gr-akcie" n="03" title={tr('Tri nové akcie v 2. fáze ťahu', 'Three new actions in phase 2')}
          sub={tr('Môžeš ich robiť ľubovoľne veľakrát a v ľubovoľnom poradí, kým máš čím platiť.', 'You may take them any number of times, in any order, as long as you can pay.')}>
          <div className="gr-actions">
            <div className="ru-box gr-act is-main">
              <span className="gr-act__ico"><ShoppingBag size={22} /></span>
              <h3 className="t-title">{tr('Kúp vybavenie', 'Buy equipment')}</h3>
              <p>{tr('Zaplať cenu vytlačenú na karte a vezmi si ju z ponuky. Zaplatené nugety sa vracajú na kôpku.', 'Pay the price printed on the card and take it from the offer. The nuggets you pay return to the heap.')}</p>
              <ul className="gr-kinds">
                <li className="is-brown"><b>{tr('Hnedý okraj', 'Brown border')}</b>{tr('Účinok nastane hneď a karta ide lícom nahor naspodok balíka vybavenia.', 'The effect happens at once and the card goes face up to the bottom of the equipment deck.')}</li>
                <li className="is-black"><b>{tr('Čierny okraj', 'Black border')}</b>{tr('Karta ostáva vyložená pred tebou. Dve karty s rovnakým názvom mať nemôžeš.', 'The card stays face up in front of you. You cannot have two cards with the same name.')}</li>
              </ul>
            </div>
            <div className="ru-box gr-act">
              <span className="gr-act__ico"><Trash2 size={22} /></span>
              <h3 className="t-title">{tr('Odhoď cudzie vybavenie', 'Discard a rival\'s equipment')}</h3>
              <p>{tr('Zaplať cenu karty a 1 nuget navyše. Majiteľ kartu odhodí a nemôže tomu zabrániť.', 'Pay the card price plus 1 nugget. The owner discards it and cannot prevent this.')}</p>
            </div>
            <div className="ru-box gr-act">
              <span className="gr-act__ico"><Beer size={22} /></span>
              <h3 className="t-title">{tr('Pivo za nuget', 'Beer for a nugget')}</h3>
              <p>{tr('Zahraj Pivo z ruky a namiesto života si vezmi 1 nuget. So Saloonom ani inou kartou to nejde.', 'Play a Beer from your hand and take 1 nugget instead of a life. It does not work with a Saloon or any other card.')}</p>
            </div>
          </div>
          <ShopDemo />
        </Sec>

        <Sec id="gr-vybavenie" n="04" title={tr('Karty vybavenia', 'Equipment cards')} aside={tr('15 druhov, 24 kariet', '15 kinds, 24 cards')}
          sub={tr('Vybavenie sa nedá ukradnúť ani zničiť Panikou, Cat Balou či schopnosťou postavy.', 'Equipment cannot be stolen or destroyed by Panic!, Cat Balou or any character ability.')}>
          <div className="ch-chips gr-kindchips" role="group" aria-label={tr('Druh vybavenia', 'Kind of equipment')}>
            {([['all', ['Všetko', 'All']], ['brown', ['Hnedé: použi hneď', 'Brown: use at once']], ['black', ['Čierne: ostávajú vyložené', 'Black: stay in play']]] as const).map(([k, l]) => (
              <button key={k} type="button" className={kind === k ? 'is-active' : ''} aria-pressed={kind === k} onClick={() => setKind(k)}>{pk(l)}</button>
            ))}
          </div>
          <div className="gr-equip">
            {shown.map(t => {
              const d = EQUIP[t];
              return (
                <article key={t} className={`gr-eq ${d.black ? 'is-black' : 'is-brown'}`}>
                  <span className="gr-eq__img"><Face k={t} title={equipName(t)} /></span>
                  <div className="gr-eq__txt">
                    <div className="gr-eq__head">
                      <h3 className="t-title">{equipName(t)}</h3>
                      <span className="gr-eq__cost" title={tr(`Cena ${nuggets(d.cost)}`, `Costs ${nuggets(d.cost)}`)}><Gold size={18} n={d.cost} /></span>
                    </div>
                    <span className="gr-eq__meta">{d.black ? tr('Čierna, trvalá', 'Black, permanent') : tr('Hnedá, okamžitá', 'Brown, instant')} · {d.count}×</span>
                    <p>{equipText(t)}</p>
                    {NOTES[t] && <p className="gr-eq__note">{pk(NOTES[t]!)}</p>}
                  </div>
                </article>
              );
            })}
          </div>
        </Sec>

        <Sec id="gr-postavy" n="05" title={tr('Postavy rozšírenia', 'Expansion characters')} aside={tr('Všetky majú 4 životy', 'All have 4 lives')}
          sub={tr('Osem pištoľníkov, ktorí vedia narábať so zlatom. Do výberu sa primiešajú k šestnástim zo základnej hry.', 'Eight gunslingers who know their way around gold. They are mixed in with the sixteen from the base game.')}>
          <div className="gr-chars">
            {GR_CHARS.map(k => (
              <article key={k} className="gr-char">
                <span className="gr-char__img"><Face k={k} title={CHARACTERS[k].name} /></span>
                <div>
                  <h3 className="t-title">{CHARACTERS[k].name}</h3>
                  <p>{charText(k)}</p>
                </div>
              </article>
            ))}
          </div>
          <a className="gr-more" href="#/postavy">{tr('Všetky postavy s poznámkami', 'All characters with notes')}<ArrowRight size={15} /></a>
        </Sec>

        <Sec id="gr-tiene" n="06" title={tr('Variant: Tieňoví pištoľníci', 'Variant: Shadow gunslingers')} aside={tr('Zapína sa zvlášť', 'Turned on separately')}
          sub={tr('Vyradený hráč nekončí. Na každý svoj ťah sa do hry vráti ako tieň.', 'An eliminated player is not done. On each of their turns they return as a shadow.')}>
          <div className="gr-shadow">
            <div className="ru-box gr-shadow__main">
              <span className="gr-act__ico"><Ghost size={22} /></span>
              <h3 className="t-title">{tr('Ťah tieňa', 'A shadow\'s turn')}</h3>
              <ul className="gr-list">
                <li>{tr('Vyradenie prebehne ako vždy: odhodíš karty aj vybavenie, ukážeš rolu, strelec dostane odmenu. Nugety ti ostávajú.', 'Elimination works as usual: you discard cards and equipment, reveal your role, the shooter gets the reward. You keep your nuggets.')}</li>
                <li>{tr('Keď by si bol na ťahu, vrátiš sa s 0 životmi, potiahneš si 2 karty a hráš normálne, so všetkými schopnosťami.', 'When your turn would come, you return with 0 lives, draw 2 cards and play normally, with all your abilities.')}</li>
                <li>{tr('Ako tieň životy nezískaš ani nestratíš. Môžeš zarábať nugety a nakupovať.', 'As a shadow you neither gain nor lose lives. You can earn nuggets and shop.')}</li>
                <li>{tr('Na konci ťahu odhodíš všetky karty z ruky aj zo stola, vrátane práve kúpeného vybavenia, a z hry zmizneš.', 'At the end of the turn you discard every card in hand and in play, including equipment bought that turn, and leave the game.')}</li>
                <li>{tr('Mimo svojho ťahu v hre nie si: nerátaš sa do vzdialeností, Hokynárstva ani pri Dynamite.', 'Outside your turn you are not in the game: you do not count for distances, the General Store or Dynamite.')}</li>
              </ul>
            </div>
            <div className="ru-box gr-shadow__ren">
              <span className="gr-shadow__card"><Face k="rinnegato_ombra" title={tr('Tieň Odpadlíka', 'Shadow Renegade')} /></span>
              <div>
                <h3 className="t-title">{tr('Tieň Odpadlíka', 'The shadow Renegade')}</h3>
                <p>{tr('Na začiatku každého svojho ťahu spočíta odkryté role ostatných (vyradení hráči a Šerif). Pridá sa k strane, ktorá ich má viac. Pri rovnosti hrá za banditov. Vyhráva s tímom, ku ktorému práve patrí.',
                  'At the start of each of their turns they count the other face-up roles (eliminated players and the Sheriff). They join the side with more of them. On a tie they play for the outlaws. They win with the team they currently belong to.')}</p>
                <div className="ru-warn is-calm gr-example">
                  <b>{tr('Príklad', 'Example')}</b>
                  {tr('Odkrytý je len Šerif: tieň hrá za zákon. Padne bandita, je to 1 : 1: tieň hrá za banditov.', 'Only the Sheriff is face up: the shadow plays for the law. An outlaw falls, it is 1 : 1: the shadow plays for the outlaws.')}
                </div>
              </div>
            </div>
          </div>
        </Sec>

        <Sec id="gr-vynimky" n="07" title={tr('Výnimky a časté otázky', 'Exceptions and common questions')}
          sub={tr('Situácie, v ktorých sa rozšírenie stretáva s kartami a postavami zo základnej hry.', 'Where the expansion meets cards and characters from the base game.')}>
          <div className="gr-faq">
            {([
              [['Vybavenie po vyradení', 'Equipment after elimination'], ['Vyradený hráč odhodí všetko vybavenie naspodok balíka. Vulture Sam si ho nevezme.', 'An eliminated player discards all equipment to the bottom of the deck. Vulture Sam does not take it.']],
              [['Šerif zabije Hľadaného pomocníka', 'The Sheriff kills a Wanted deputy'], ['Najprv si potiahne 2 karty za odmenu, potom odhodí všetky karty. Nugety si necháva.', 'First they draw the 2 reward cards, then discard all cards. They keep their nuggets.']],
              [['Dynamit a tiene', 'Dynamite and shadows'], ['Dynamit putuje vždy k najbližšiemu živému hráčovi. Tiene preskakuje.', 'Dynamite always passes to the next living player. It skips shadows.']],
              [['Vulture Sam a tiene', 'Vulture Sam and shadows'], ['Karty, ktoré tieň odhodí na konci ťahu, si Vulture Sam neberie.', 'Vulture Sam does not take the cards a shadow discards at the end of the turn.']],
              [['Kalumet v Dueli', 'Calumet in a Duel'], ['Kalumet pred károvým Duelom nechráni. Proti ostatným károvým kartám súperov áno.', 'The Calumet does not protect from a Duel of Diamonds. It does against other rival cards of Diamonds.']],
              [['Prázdna kôpka', 'Empty heap'], ['Papierové pravidlá dovoľujú náhradu. Tu platí pevný limit 30 nugetov: z prázdnej kôpky sa neberie a Pivo sa za nuget zahrať nedá.', 'The printed rules allow a substitute. Here the limit of 30 nuggets is fixed: nothing is taken from an empty heap and a Beer cannot be played for a nugget.']],
              [['Don Bell', 'Don Bell'], ['Po ťahu navyše už znova neťahá, takže odohrá najviac dva ťahy za sebou.', 'After the extra turn he does not draw again, so he plays at most two turns in a row.']],
            ] as [P, P][]).map(([q, a]) => (
              <div key={q[0]} className="gr-faq__item">
                <h3>{pk(q)}</h3>
                <p>{pk(a)}</p>
              </div>
            ))}
          </div>
        </Sec>

        <div className="ru-cta">
          <span className="ru-cta__ico" aria-hidden="true"><Gold size={34} /></span>
          <div>
            <h3 className="t-title">{tr('Zlato čaká v lobby', 'The gold is waiting in the lobby')}</h3>
            <p>{tr('Zakladateľ stola zapne Gold Rush pred štartom hry. Tieňových pištoľníkov možno pridať zvlášť.', 'The table host turns on Gold Rush before the game starts. Shadow gunslingers can be added separately.')}</p>
          </div>
          <a className="bang-btn bang-btn--primary" href="#/">{tr('Vstúpiť do lobby', 'Enter the lobby')}</a>
        </div>
      </div>
    </div>
  );
}
