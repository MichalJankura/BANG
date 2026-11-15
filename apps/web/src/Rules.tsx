import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, Ban, Cake, Coins, Crosshair, Shield, Skull, Star, Swords, Timer, TriangleAlert, Users, Wind, X, Zap } from 'lucide-react';
import { CHARACTERS, ROLES_BY_COUNT, type Role } from '@bang/engine';
import { NavBar } from './Characters';
import { RangeDemo } from './RangeDemo';
import { RuleTabs } from './GoldRush';
import { SpriteFace } from './Cards';
import { useLang } from './i18n';
import { charText } from './i18nData';

/*
 * Texty su overene proti oficialnym pravidlam zakladnej hry (ALBI, 2020):
 * https://albi.cz/data/files/products/24327/1603711687-bang-pravidla-zakladni-hry.pdf
 * Kazdy text je dvojica [slovensky, anglicky].
 */

type P<T = string> = readonly [T, T];

const SECTIONS: [string, P][] = [
  ['sekcia-role', ['1. Úlohy a role', '1. Roles and goals']],
  ['sekcia-postavy', ['2. Postavy a životy', '2. Characters and lives']],
  ['sekcia-tah', ['3. Fázy ťahu', '3. Turn phases']],
  ['sekcia-dostrel', ['4. Dostrel a zbrane', '4. Range and weapons']],
  ['sekcia-karty', ['5. Karty (hnedé a modré)', '5. Cards (brown and blue)']],
  ['sekcia-tresty', ['6. Tresty a výnimky', '6. Penalties and exceptions']],
];

const TAGS: P[] = [['Dynamit', 'Dynamite'], ['Väzenie', 'Jail'], ['Barel', 'Barrel'], ['Volcanic', 'Volcanic'], ['Duel', 'Duel'], ['Odmena', 'Bounty']];

const STATS: [ReactNode, P, P, boolean?][] = [
  [<Users size={20} />, ['Počet hráčov', 'Players'], ['4 – 7', '4 – 7']],
  [<Timer size={20} />, ['Herná doba', 'Play time'], ['20 – 40 min', '20 – 40 min']],
  [<Cake size={20} />, ['Vek hráčov', 'Age'], ['10+ rokov', '10+ years']],
  [<Zap size={20} />, ['Náročnosť', 'Complexity'], ['Rýchle osvojenie', 'Quick to learn'], true],
];

type Tone = 'brass' | 'red' | 'plain';

const ROLE_CARDS: { role: Role; c: string; badge: P; title: P; perk: P; text: P; win: P }[] = [
  { role: 'sceriffo', c: 'sheriff', badge: ['Odhalená rola', 'Revealed role'], title: ['Šerif (Sheriff)', 'Sheriff'], perk: ['+1 život navyše', '+1 extra life'],
    text: ['Zákon v meste. Svoju kartu otočí lícom nahor, takže jeho identitu poznajú od začiatku všetci. Musí zabiť všetkých banditov aj odpadlíka.', 'The law in town. They flip their card face up, so everyone knows their identity from the start. They must kill all outlaws and the renegade.'],
    win: ['Všetci banditi a odpadlík sú mŕtvi.', 'All outlaws and the renegade are dead.'] },
  { role: 'vice', c: 'deputy', badge: ['Tajná rola', 'Secret role'], title: ['Zástupca šerifa', 'Deputy'], perk: ['Kryje chrbát zákonu', 'Watches the sheriff\'s back'],
    text: ['Bojuje inkognito po boku šerifa a chráni ho za každú cenu. Víťazí spoločne so šerifom.', 'Fights incognito at the sheriff\'s side and protects them at all costs. Wins together with the sheriff.'],
    win: ['Šerif prežije a porazí nepriateľov.', 'The sheriff survives and defeats the enemies.'] },
  { role: 'fuorilegge', c: 'outlaw', badge: ['Tajná rola', 'Secret role'], title: ['Bandita (Outlaw)', 'Outlaw'], perk: ['Odmena za hlavu: 3 karty', 'Bounty on their head: 3 cards'],
    text: ['Bezohľadní pištoľníci túžiaci po krvi zákona. Kvôli odmene sa neváhajú zabíjať ani navzájom.', 'Ruthless gunslingers hungry for the law\'s blood. For the bounty they do not hesitate to kill each other.'],
    win: ['Šerif je zabitý (okrem prípadu, keď zostane nažive len odpadlík).', 'The sheriff is killed (unless only the renegade is left alive).'] },
  { role: 'rinnegato', c: 'renegade', badge: ['Tajná rola', 'Secret role'], title: ['Odpadlík (Renegade)', 'Renegade'], perk: ['Osamelý vlk', 'Lone wolf'],
    text: ['Hrá na obe strany a sleduje vlastný cieľ: stať sa novým šerifom. V závere musí čeliť šerifovi sám.', 'Plays both sides and follows their own goal: to become the new sheriff. In the end they must face the sheriff alone.'],
    win: ['Zostane posledný živý v hre.', 'Is the last one alive in the game.'] },
];

const PHASES: { n: number; title: P; text: P<ReactNode>; warn?: P; calm?: boolean; list?: P<ReactNode>[]; foot: P }[] = [
  { n: 1, title: ['Potiahnutie kariet', 'Draw cards'],
    text: [<>Na začiatku ťahu si vezmete do ruky <b>2 vrchné karty</b> z doberacieho balíčka. Keď balíček dôjde, odhadzovací sa zamieša a vytvorí nový.</>, <>At the start of your turn you take the <b>top 2 cards</b> of the draw pile into your hand. When the pile runs out, the discard pile is shuffled to make a new one.</>],
    warn: ['Pozor: ak máte pred sebou Dynamit alebo Väzenie, „ťahá sa“ na ich efekt ešte pred dobratím kariet (najskôr Dynamit, potom Väzenie).', 'Careful: if you have Dynamite or Jail in front of you, you "draw!" for their effect before drawing cards (Dynamite first, then Jail).'],
    foot: ['Trvanie: okamžité', 'Duration: instant'] },
  { n: 2, title: ['Zahratie kariet', 'Play cards'],
    text: [<>Môžete zahrať ľubovoľný počet kariet (alebo žiadnu). Platia len tri obmedzenia:</>, <>You may play any number of cards (or none). Only three restrictions apply:</>],
    list: [
      [<>Iba <b>1 karta BANG!</b> za ťah (nie však pri Volcanic alebo Willy the Kid).</>, <>Only <b>1 BANG! card</b> per turn (except with a Volcanic or Willy the Kid).</>],
      [<>Pred sebou smiete mať vyloženú len <b>jednu kópiu</b> karty s rovnakým názvom.</>, <>You may have only <b>one copy</b> of a card with the same name in play in front of you.</>],
      [<>Iba <b>1 zbraň</b> v hre. Nová zbraň odhodí tú pôvodnú.</>, <>Only <b>1 weapon</b> in play. A new weapon discards the old one.</>],
    ],
    foot: ['Trvanie: hlavná akčná fáza', 'Duration: main action phase'] },
  { n: 3, title: ['Odhodenie prebytku', 'Discard excess'],
    text: [<>Na konci ťahu nesmiete mať v ruke viac kariet, než koľko máte <b>práve teraz životov</b>. Prebytok odhodíte lícom nahor.</>, <>At the end of your turn you may not hold more cards than you have <b>lives right now</b>. Discard the excess face up.</>],
    warn: ['Príklad: máte 2 životy, no v ruke 5 kariet. Musíte odhodiť 3 karty.', 'Example: you have 2 lives but 5 cards in hand. You must discard 3 cards.'], calm: true,
    foot: ['Trvanie: ukončenie ťahu', 'Duration: end of turn'] },
];

const WEAPONS: { k: string | null; name: string; desc: P; range: number; tone: Tone }[] = [
  { k: null, name: 'Colt .45', desc: ['Základ každého hráča', 'Every player\'s default'], range: 1, tone: 'plain' },
  { k: 'volcanic', name: 'Volcanic', desc: ['∞ kariet BANG!', '∞ BANG! cards'], range: 1, tone: 'brass' },
  { k: 'schofield', name: 'Schofield', desc: ['Cieľ o 2 miesta', 'Target 2 seats away'], range: 2, tone: 'plain' },
  { k: 'remington', name: 'Remington', desc: ['Stredná diaľka', 'Medium range'], range: 3, tone: 'plain' },
  { k: 'carabine', name: 'Rev. Carabine', desc: ['Vzdialené ciele', 'Distant targets'], range: 4, tone: 'plain' },
  { k: 'winchester', name: 'Winchester', desc: ['Celý stôl', 'Whole table'], range: 5, tone: 'red' },
];

const BROWN: { k: string; name: P; tag: P; tone: Tone; text: P }[] = [
  { k: 'bang', name: ['BANG!', 'BANG!'], tag: ['Útok', 'Attack'], tone: 'red', text: ['Zásah na cieľ v dostrele zbrane. Zoberie súperovi 1 život, ak ho neodvráti kartou Vedľa!.', 'A shot at a target within weapon range. Takes 1 life from the opponent unless they cancel it with a Missed! card.'] },
  { k: 'mancato', name: ['Vedľa!', 'Missed!'], tag: ['Obrana', 'Defense'], tone: 'plain', text: ['Zruší účinok vystreleného BANG! na vás. Dá sa zahrať aj mimo vlastného ťahu.', 'Cancels the effect of a BANG! fired at you. Can be played outside your own turn.'] },
  { k: 'birra', name: ['Pivo (Beer)', 'Beer'], tag: ['Liečba', 'Healing'], tone: 'brass', text: ['Doplní 1 život (najviac po počiatočný počet). Pri smrteľnom zásahu sa smie zahrať aj mimo ťahu.', 'Restores 1 life (up to the starting number). On a lethal hit it may be played outside your turn.'] },
  { k: 'saloon', name: ['Saloon', 'Saloon'], tag: ['Všetci', 'Everyone'], tone: 'brass', text: ['Všetci hráči pri stole si vyliečia 1 život. Pred smrťou ťa nezachráni, Saloon nie je Pivo!', 'All players at the table heal 1 life. It does not save you from death, Saloon is not a Beer!'] },
  { k: 'wellsfargo', name: ['Wells Fargo', 'Wells Fargo'], tag: ['+3 karty', '+3 cards'], tone: 'brass', text: ['Okamžite si potiahnete 3 karty z doberacieho balíčka.', 'You immediately draw 3 cards from the draw pile.'] },
  { k: 'diligenza', name: ['Dostavník', 'Stagecoach'], tag: ['+2 karty', '+2 cards'], tone: 'brass', text: ['Okamžite si potiahnete 2 karty z doberacieho balíčka.', 'You immediately draw 2 cards from the draw pile.'] },
  { k: 'panico', name: ['Panika!', 'Panic!'], tag: ['Krádež', 'Theft'], tone: 'plain', text: ['Vezmete si kartu z ruky alebo zo stola hráča na vzdialenosť 1. Zbrane vzdialenosť nemenia, len Mustang a Hľadáčik.', 'You take a card from the hand or table of a player at distance 1. Weapons do not change distance, only Mustang and Scope do.'] },
  { k: 'catbalou', name: ['Cat Balou', 'Cat Balou'], tag: ['Zahodenie', 'Discard'], tone: 'plain', text: ['Ľubovoľný hráč odhodí 1 kartu z ruky (náhodnú) alebo zo stola (vami vybranú), bez ohľadu na vzdialenosť.', 'Any player discards 1 card from hand (random) or from the table (your choice), regardless of distance.'] },
  { k: 'indiani', name: ['Indiáni!', 'Indians!'], tag: ['Všetci', 'Everyone'], tone: 'red', text: ['Každý ostatný hráč musí odhodiť kartu BANG!, inak stráca 1 život. Vedľa! ani Barel nepomôžu.', 'Every other player must discard a BANG! card or lose 1 life. Missed! and Barrel do not help.'] },
  { k: 'gatling', name: ['Gatling', 'Gatling'], tag: ['Dávka', 'Volley'], tone: 'red', text: ['Efekt BANG! na všetkých ostatných bez ohľadu na vzdialenosť. Pomôže Vedľa! aj Barel. Nie je to karta BANG!, limit sa neráta.', 'A BANG! effect on all other players regardless of distance. Missed! and Barrel help. It is not a BANG! card, so the limit does not count.'] },
  { k: 'emporio', name: ['Obchod', 'General Store'], tag: ['Výber', 'Choice'], tone: 'brass', text: ['Otočí sa toľko kariet, koľko je hráčov. Každý si jednu vyberie, začína zahrávajúci a pokračuje sa v smere hodín.', 'As many cards are revealed as there are players. Each picks one, starting with the player who played it and continuing clockwise.'] },
  { k: 'duello', name: ['Duel', 'Duel'], tag: ['Súboj', 'Showdown'], tone: 'red', text: ['Vyzvaný hráč začína odhadzovať BANG!, potom vy a tak ďalej. Kto nemá, stráca 1 život. Vedľa! ani Barel nepomôžu.', 'The challenged player starts discarding BANG!, then you, and so on. Whoever cannot loses 1 life. Missed! and Barrel do not help.'] },
];

const BLUE: { k: string[]; name: P; tag: P; edge: string; text: P<ReactNode> }[] = [
  { k: ['barile'], name: ['Barel (Barrel)', 'Barrel'], tag: ['Krytie', 'Cover'], edge: 'var(--card-edge-blue)',
    text: [<>Keď ste cieľom BANG!, môžete „ťahať!“. Ak padne <b className="ru-red">♥ srdce</b>, útok minul (ako Vedľa!). Inak sa môžete brániť aj inak.</>, <>When you are the target of a BANG!, you may "draw!". If a <b className="ru-red">♥ heart</b> comes up, the attack misses (like Missed!). Otherwise you can still defend another way.</>] },
  { k: ['dinamite'], name: ['Dynamit', 'Dynamite'], tag: ['Riziko', 'Risk'], edge: 'var(--bang)',
    text: [<>Na začiatku ťahu „ťaháte!“: ak padne <b className="ru-red">♠ pika 2–9</b>, vybuchne za <b>3 životy</b>. Inak sa posúva hráčovi po vašej ľavici.</>, <>At the start of your turn you "draw!": if a <b className="ru-red">♠ spade 2–9</b> comes up, it explodes for <b>3 lives</b>. Otherwise it passes to the player on your left.</>] },
  { k: ['prigione'], name: ['Väzenie (Jail)', 'Jail'], tag: ['Blok', 'Block'], edge: 'var(--parchment-muted)',
    text: [<>Vyložíte ho pred ľubovoľného hráča okrem šerifa. Na začiatku ťahu ťahá: ak nepadne <b className="ru-red">♥ srdce</b>, svoj ťah vynechá.</>, <>You put it in front of any player except the sheriff. At the start of their turn they draw: if no <b className="ru-red">♥ heart</b> comes up, they skip their turn.</>] },
  { k: ['mustang', 'mirino'], name: ['Mustang a Hľadáčik', 'Mustang and Scope'], tag: ['Optika', 'Optics'], edge: 'var(--brass)',
    text: [<><b>Mustang</b> zvyšuje vzdialenosť k vám o <b>+1</b>, <b>Hľadáčik</b> vám približuje ciele o <b>−1</b>.</>, <><b>Mustang</b> increases the distance to you by <b>+1</b>, <b>Scope</b> brings targets <b>−1</b> closer.</>] },
];

const PENALTIES: { title: P; text: P<ReactNode>; note?: P; icon?: 'coins' | 'warn'; danger?: boolean }[] = [
  { title: ['Odmena za banditu (Bounty)', 'Bounty for an outlaw'],
    text: [<>Hráč, ktorý vyradí banditu (aj keď je sám bandita), <b>okamžite ťahá 3 karty</b> z doberacieho balíčka.</>, <>A player who eliminates an outlaw (even if they are an outlaw themselves) <b>immediately draws 3 cards</b> from the draw pile.</>],
    icon: 'coins', note: ['Odmenu nikto nedostane, ak bandita zahrá Duel a sám v ňom prehrá, ani keď ho zabije Dynamit.', 'Nobody gets the bounty if the outlaw plays a Duel and loses it, or if Dynamite kills them.'] },
  { title: ['Krutý trest pre šerifa', 'Harsh penalty for the sheriff'],
    text: [<>Ak šerif zabije svojho <b>zástupcu</b>, musí <b>odhodiť všetky karty z ruky aj zo stola</b>.</>, <>If the sheriff kills their <b>deputy</b>, they must <b>discard all cards from hand and table</b>.</>],
    icon: 'warn', note: ['Šerif ostane len so základným Coltom .45.', 'The sheriff is left with only the basic Colt .45.'], danger: true },
  { title: ['Pivo v dueli 1 na 1', 'Beer in a 1-on-1 duel'],
    text: [<>Keď v hre zostanú už len <b>2 hráči</b>, karta <b>Pivo nemá žiadny účinok</b> a život nevylieči.</>, <>When only <b>2 players</b> remain in the game, the <b>Beer card has no effect</b> and does not heal.</>] },
  { title: ['Pivo na pokraji smrti', 'Beer on the brink of death'],
    text: [<>Ak hráč utrpí <b>smrteľný zásah</b> (o posledný život), môže <b>aj mimo svojho ťahu zahrať Pivo</b> a zostať v hre. Pri väčšej strate môže zahrať aj viac Pív, ak bude jeho konečný počet životov väčší ako 0.</>, <>If a player suffers a <b>lethal hit</b> (their last life), they may <b>play a Beer even outside their turn</b> and stay in the game. For a bigger loss they may play several Beers if their final number of lives is above 0.</>] },
];

const ROLE_C: Record<Role, string> = { sceriffo: 'sheriff', vice: 'deputy', fuorilegge: 'outlaw', rinnegato: 'renegade' };

function Sec({ id, n, title, sub, aside, children }: { id: string; n: string; title: string; sub: string; aside?: string; children: ReactNode }) {
  return (
    <section className="ru-sec rule-card" id={id}>
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

/** Miniatura karty z obrazka hry. */
function Face({ k, title }: { k: string; title: string }) {
  return <span className="ru-face"><SpriteFace k={k} title={title} /></span>;
}

export function RulesPage() {
  const { tr, lang } = useLang();
  const pk = <T,>(x: P<T>): T => x[lang === 'sk' ? 0 : 1];
  const pl = (n: number) => (lang === 'en' ? `${n} players` : n === 4 ? '4 hráči' : `${n} hráčov`);
  const [q, setQ] = useState('');
  const root = useRef<HTMLDivElement>(null);

  // Hladanie: skryje sekcie, v ktorych sa text nenachadza.
  useEffect(() => {
    const s = q.trim().toLowerCase();
    root.current?.querySelectorAll<HTMLElement>('.rule-card').forEach(el => {
      el.hidden = !!s && !(el.textContent ?? '').toLowerCase().includes(s);
    });
  }, [q, lang]);

  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const cnt = (n: number, r: Role) => ROLES_BY_COUNT[n].filter(x => x === r).length;
  const sample = ['willythekid', 'slab', 'calamityjanet'] as const;

  return (
    <div className="ch-page ru-page" ref={root}>
      <NavBar active="rules" />

      <section className="ch-hero ru-hero">
        <div className="ru-hero__in">
          <RuleTabs active="base" />
          <h1 className="t-display ru-h1">{tr('Pravidlá hry BANG!', 'BANG! game rules')}</h1>
          <p className="ch-lead">
            {tr('Základné pravidlá svetoznámej kartovej hry z Divokého západu. Spoznajte utajené role, systém dostrelu zbraní, 3 fázy každého ťahu, trvalé modré karty a neľútostné prestrelky v salóne.',
              'The basic rules of the world-famous Wild West card game. Learn about secret roles, the weapon range system, the 3 phases of every turn, permanent blue cards and merciless saloon shootouts.')}
          </p>
          <div className="ru-stats">
            {STATS.map(([ico, k, v, hl], i) => (
              <div key={i}>
                <span className="ru-stats__ico" aria-hidden="true">{ico}</span>
                <span><span className="bang-label">{pk(k)}</span><b className={hl ? 'ch-em' : ''}>{pk(v)}</b></span>
              </div>
            ))}
          </div>
          <div className="ch-filters">
            <input type="search" value={q} onChange={e => setQ(e.target.value)} aria-label={tr('Hľadať v pravidlách', 'Search the rules')}
              placeholder={tr('Hľadať v pravidlách (napr. Barel, Dynamit)…', 'Search the rules (e.g. Barrel, Dynamite)…')} />
            <div className="ch-chips" role="group" aria-label={tr('Rýchle hľadanie', 'Quick search')}>
              {TAGS.map((t, i) => <button key={i} type="button" onClick={() => setQ(pk(t))}>#{pk(t)}</button>)}
            </div>
          </div>
        </div>
      </section>

      <nav className="ru-subnav" aria-label={tr('Sekcie pravidiel', 'Rule sections')}>
        {SECTIONS.map(([id, label]) => <button key={id} type="button" onClick={() => go(id)}>{pk(label)}</button>)}
      </nav>

      <div className="ru-content">
        {/* 01 ------------------------------------------------------------ */}
        <Sec id="sekcia-role" n="01" title={tr('Cieľ hry a tajné role', 'Goal of the game and secret roles')} aside={tr('Základná mechanika', 'Core mechanic')}
          sub={tr('Každý hráč dostane na začiatku tajnú kartu role. Iba šerif svoju kartu hneď odhalí.', 'Every player gets a secret role card at the start. Only the sheriff reveals theirs right away.')}>
          <div className="ru-grid4">
            {ROLE_CARDS.map(r => (
              <div key={r.role} className="ru-role" style={{ '--c': `var(--role-${r.c})` } as CSSProperties}>
                <div className="ru-role__img"><SpriteFace k={r.role} title={`${tr('Karta role', 'Role card')} ${pk(r.title)}`} /></div>
                <span className="ru-badge">{pk(r.badge)}</span>
                <h3 className="t-title">{pk(r.title)}</h3>
                <div className="ru-perk">{pk(r.perk)}</div>
                <p>{pk(r.text)}</p>
                <div className="ru-win"><span className="bang-label">{tr('Podmienka víťazstva', 'Victory condition')}</span><b>{pk(r.win)}</b></div>
              </div>
            ))}
          </div>
          <div className="ru-box">
            <div className="ru-box__head">
              <h4 className="t-title">{tr('Rozdelenie rolí podľa počtu hráčov pri stole', 'Role distribution by number of players')}</h4>
              <span className="bang-label">{tr('Od 4 do 7 kovbojov', 'From 4 to 7 cowboys')}</span>
            </div>
            <div className="ru-scroll">
              <table className="ru-table">
                <thead><tr>
                  <th>{tr('Počet hráčov', 'Players')}</th>
                  <th><span className="ic"><Star size={14} />{tr('Šerif', 'Sheriff')}</span></th>
                  <th><span className="ic"><Shield size={14} />{tr('Zástupca šerifa', 'Deputy')}</span></th>
                  <th><span className="ic"><Skull size={14} />{tr('Banditi', 'Outlaws')}</span></th>
                  <th><span className="ic"><Swords size={14} />{tr('Odpadlík', 'Renegade')}</span></th>
                </tr></thead>
                <tbody>
                  {[4, 5, 6, 7].map(n => (
                    <tr key={n}>
                      <td>{pl(n)}</td>
                      {(['sceriffo', 'vice', 'fuorilegge', 'rinnegato'] as Role[]).map(r => (
                        <td key={r} style={{ color: cnt(n, r) ? `var(--role-${ROLE_C[r]})` : undefined }}>{cnt(n, r) || '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Sec>

        {/* 02 ------------------------------------------------------------ */}
        <Sec id="sekcia-postavy" n="02" title={tr('Postavy, životy a náboje', 'Characters, lives and bullets')} sub={tr('Unikátne schopnosti legendárnych pištoľníkov a mechanizmus životov.', 'Unique abilities of legendary gunslingers and the life mechanic.')}>
          <div className="ru-split">
            <div className="ru-box">
              <h3 className="t-title ch-em">{tr('Životy a náboje', 'Lives and bullets')}</h3>
              <p>{tr('Každá postava má zobrazený počet nábojov (zvyčajne 3 alebo 4). Ten určuje:', 'Each character shows a number of bullets (usually 3 or 4). It determines:')}</p>
              <ul className="ru-list">
                {lang === 'sk' ? <>
                  <li><b>Počiatočné životy:</b> koľko zásahov znesiete, kým vypadnete z hry.</li>
                  <li><b>Limit kariet v ruke:</b> na konci ťahu nesmiete mať viac kariet, než je váš <i>aktuálny</i> počet životov.</li>
                  <li><b>Bonus pre šerifa:</b> šerif hrá s <b className="ch-em">+1 nábojom</b> navyše. Na začiatku hry ale dostane len toľko kariet, koľko je nábojov na jeho postave.</li>
                </> : <>
                  <li><b>Starting lives:</b> how many hits you can take before you are out of the game.</li>
                  <li><b>Hand limit:</b> at the end of your turn you may not hold more cards than your <i>current</i> number of lives.</li>
                  <li><b>Sheriff bonus:</b> the sheriff plays with <b className="ch-em">+1 bullet</b>. At the start of the game, however, they get only as many cards as there are bullets on their character.</li>
                </>}
              </ul>
              <div className="ru-mag" aria-label={tr('Vzor zásobníka so 4 životmi', 'Example magazine with 4 lives')}>
                <span className="bang-label">{tr('Vzor zásobníka (4 životy)', 'Magazine example (4 lives)')}</span>
                <div>
                  {[1, 2, 3, 4].map(i => <span key={i} className="ru-mag__on"><Crosshair size={12} />{i}</span>)}
                  <span className="ru-mag__off"><X size={12} />0</span>
                </div>
              </div>
            </div>
            <div className="ru-chars">
              {sample.map(k => (
                <div key={k} className="ru-char">
                  <div className="ru-char__img"><SpriteFace k={k} title={`${tr('Karta postavy', 'Character card')} ${CHARACTERS[k].name}`} /></div>
                  <div className="ru-char__row"><b>{CHARACTERS[k].name}</b><span>{CHARACTERS[k].hp} HP</span></div>
                  <p>{lang === 'sk' ? '„' : '"'}{charText(k)}{lang === 'sk' ? '“' : '"'}</p>
                </div>
              ))}
              <a className="ru-more" href="#/postavy">{tr('Všetkých 16 postáv', 'All 16 characters')}<ArrowRight size={14} /></a>
            </div>
          </div>
        </Sec>

        {/* 03 ------------------------------------------------------------ */}
        <Sec id="sekcia-tah" n="03" title={tr('Priebeh ťahu hráča', 'A player\'s turn')} sub={tr('Začína šerif, ťahy idú v smere hodinových ručičiek a každý sa delí na 3 fázy.', 'The sheriff starts, turns go clockwise and each is divided into 3 phases.')}>
          <div className="ru-grid3">
            {PHASES.map(p => (
              <div key={p.n} className="ru-phase">
                <span className="bang-label ch-kicker">{p.n}. {tr('fáza', 'phase')}</span>
                <h3 className="t-title">{pk(p.title)}</h3>
                <p>{pk(p.text)}</p>
                {p.list && <ul className="ru-bans">{p.list.map((x, i) => <li key={i}><Ban size={14} className="ru-ban" /><span>{pk(x)}</span></li>)}</ul>}
                {p.warn && <div className={`ru-warn ${p.calm ? 'is-calm' : ''}`}>{!p.calm && <TriangleAlert size={16} className="ru-warn__ico" />}<span>{pk(p.warn)}</span></div>}
                <div className="ru-foot">{pk(p.foot)}</div>
              </div>
            ))}
          </div>
        </Sec>

        {/* 04 ------------------------------------------------------------ */}
        <Sec id="sekcia-dostrel" n="04" title={tr('Vzdialenosť a dostrel zbraní', 'Distance and weapon range')} sub={tr('Na Divokom západe nerozhoduje len zbraň, ale najmä vzdialenosť cieľa.', 'In the Wild West it is not only the weapon that matters, but above all the distance to the target.')}>
          <div className="ru-split ru-split--even">
            <div>
              <RangeDemo />
              <p className="rg-note">{tr('Vzdialenosť je najmenší počet miest medzi hráčmi, počítaný v ľubovoľnom smere okolo stola. Mŕtvi hráči sa už nepočítajú, ostatní sa tak môžu dostať bližšie.', 'Distance is the smallest number of seats between players, counted in either direction around the table. Dead players are no longer counted, so the others can get closer.')}</p>
            </div>
            <div className="ru-weapons">
              <div className="ru-box__head">
                <h3 className="t-title ch-em">{tr('Zbrane v hre a ich dosah', 'Weapons in the game and their reach')}</h3>
                <span className="bang-label">{tr('6 zbraní', '6 weapons')}</span>
              </div>
              <div className="ru-wcards">
                {WEAPONS.map(w => (
                  <div key={w.name} className="ru-wcard">
                    <div className="ru-wcard__img">
                      {w.k ? <Face k={w.k} title={`${tr('Karta', 'Card')} ${w.name}`} /> : <span className="ru-colt">{tr('Bez karty', 'No card')}<small>{tr('imaginárny revolver', 'imaginary revolver')}</small></span>}
                    </div>
                    <div className="ru-wcard__row">
                      <div><b className={w.tone === 'brass' ? 'ch-em' : w.tone === 'red' ? 'ru-red' : ''}>{w.name}</b><small>{pk(w.desc)}</small></div>
                      <span className={`ru-range is-${w.tone}`}>{tr('Dosah', 'Range')} {w.range}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="rg-note">{tr('Zbraň nahrádza Colt .45, kým ju niekto neodstráni. Zbrane menia iba dostrel pre BANG!, nie skutočnú vzdialenosť, preto Panika! stále siaha len na vzdialenosť 1.', 'A weapon replaces the Colt .45 until someone removes it. Weapons change only the range for BANG!, not the actual distance, so Panic! still reaches only distance 1.')}</p>
              <div className="ru-mods">
                <div><b className="ic"><Wind size={15} />Mustang</b><p>{lang === 'sk' ? <>Všetci ostatní vás vidia o <b>+1 vzdialenosť ďalej</b> (ste ťažší terč).</> : <>All others see you <b>+1 distance farther</b> (you are a harder target).</>}</p></div>
                <div><b className="ic"><Crosshair size={15} />{tr('Hľadáčik (Scope)', 'Scope')}</b><p>{lang === 'sk' ? <>Vy vidíte všetkých ostatných o <b>−1 vzdialenosť bližšie</b>. Vzdialenosť pod 1 sa berie ako 1.</> : <>You see all others <b>−1 distance closer</b>. A distance below 1 counts as 1.</>}</p></div>
              </div>
            </div>
          </div>
        </Sec>

        {/* 05 ------------------------------------------------------------ */}
        <Sec id="sekcia-karty" n="05" title={tr('Karty a herné symboly', 'Cards and game symbols')} sub={tr('Prehľad akčných kariet s hnedým okrajom a trvalých predmetov s modrým okrajom.', 'Overview of action cards with a brown border and permanent items with a blue border.')}>
          <div className="ru-sub">
            <div className="ru-sub__head">
              <span className="ru-badge">{tr('Hnedý okraj', 'Brown border')}</span>
              <h3 className="t-title ch-em">{tr('Akčné karty (okamžitý efekt)', 'Action cards (instant effect)')}</h3>
              <span className="bang-label">{tr('12 akčných kariet', '12 action cards')}</span>
            </div>
            <p>{tr('Hnedé karty zahráte lícom nahor na odhadzovací balíček a ich efekt sa vyhodnotí okamžite.', 'You play brown cards face up onto the discard pile and their effect is resolved immediately.')}</p>
            <div className="ru-cgrid">
              {BROWN.map(c => (
                <div key={c.k} className="ru-ccard">
                  <div className="ru-ccard__img"><Face k={c.k} title={`${tr('Karta', 'Card')} ${pk(c.name)}`} /></div>
                  <div className="ru-ccard__row">
                    <b className={c.tone === 'brass' ? 'ch-em' : c.tone === 'red' ? 'ru-red' : ''}>{pk(c.name)}</b>
                    <span className={`ru-range is-${c.tone}`}>{pk(c.tag)}</span>
                  </div>
                  <p>{pk(c.text)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="ru-sub is-blue">
            <div className="ru-sub__head">
              <span className="ru-badge">{tr('Modrý okraj', 'Blue border')}</span>
              <h3 className="t-title">{tr('Trvalé predmety (vyložené na stole)', 'Permanent items (laid on the table)')}</h3>
              <span className="bang-label">{tr('Trvalý pasívny efekt', 'Permanent passive effect')}</span>
            </div>
            <p>{tr('Modré karty vykladáte pred seba (okrem Väzenia) a ich efekt trvá, kým ich niekto neodstráni, napríklad kartou Cat Balou alebo Panika!. Môžete ich mať viac, ak majú rôzne názvy.', 'You lay blue cards in front of you (except Jail) and their effect lasts until someone removes them, for example with Cat Balou or Panic!. You may have several if they have different names.')}</p>
            <div className="ru-bgrid">
              {BLUE.map(c => (
                <div key={c.name[0]} className="ru-bcard" style={{ '--e': c.edge } as CSSProperties}>
                  {c.k.length > 1 ? (
                    <div className="ru-bcard__img is-flip">
                      <div className="ru-flip">
                        {c.k.map(k => (
                          <div key={k} className="ru-flip__face">
                            <Face k={k} title={`${tr('Karta', 'Card')} ${k === 'mustang' ? 'Mustang' : tr('Hľadáčik', 'Scope')}`} />
                            <span className="ru-swap">{k === 'mustang' ? 'Mustang +1' : tr('Hľadáčik −1', 'Scope −1')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="ru-bcard__img">
                      {c.k.map(k => <Face key={k} k={k} title={`${tr('Karta', 'Card')} ${k}`} />)}
                    </div>
                  )}
                  <div className="ru-ccard__row"><h4 className="t-title">{pk(c.name)}</h4><span className="ru-range is-plain">{pk(c.tag)}</span></div>
                  <p>{pk(c.text)}</p>
                </div>
              ))}
            </div>
          </div>
        </Sec>

        {/* 06 ------------------------------------------------------------ */}
        <Sec id="sekcia-tresty" n="06" title={tr('Špeciálne pravidlá a tresty', 'Special rules and penalties')} sub={tr('Kritické situácie, odmeny za banditov a fatálne chyby šerifa.', 'Critical situations, bounties for outlaws and the sheriff\'s fatal mistakes.')}>
          <div className="ru-grid2">
            {PENALTIES.map(p => (
              <div key={p.title[0]} className={`ru-box ${p.danger ? 'is-danger' : ''}`}>
                <h3 className="t-title">{pk(p.title)}</h3>
                <p>{pk(p.text)}</p>
                {p.note && (
                  <div className="ru-warn is-calm ic">
                    {p.icon === 'coins' ? <Coins size={16} /> : <TriangleAlert size={16} />}<span>{pk(p.note)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="ru-box">
            <h3 className="t-title">{tr('Vyradenie z hry a koniec partie', 'Elimination and end of the game')}</h3>
            <p>
              {tr('Hráč, ktorý stratí posledný život, vypadáva (ak nezahrá Pivo): ukáže svoju rolu a odhodí všetky karty z ruky aj zo stola. Hra končí, keď padne šerif (vyhrávajú banditi, ale ak zostal len odpadlík, vyhráva on), alebo keď padnú všetci banditi a odpadlík (vyhráva šerif a zástupcovia).',
                'A player who loses their last life is eliminated (unless they play a Beer): they reveal their role and discard all cards from hand and table. The game ends when the sheriff falls (the outlaws win, but if only the renegade is left, the renegade wins), or when all outlaws and the renegade have fallen (the sheriff and deputies win).')}
            </p>
          </div>
        </Sec>

        <div className="ru-cta">
          <span className="ru-cta__ico" aria-hidden="true"><Crosshair size={28} /></span>
          <div>
            <h3 className="t-title">{tr('Pripravený nabiť svoj revolver?', 'Ready to load your revolver?')}</h3>
            <p>{tr('Pravidlá máte v malíčku. Pripojte sa k otvorenému stolu v hernom lobby a vyskúšajte svoje šťastie.', 'You have the rules down. Join an open table in the game lobby and try your luck.')}</p>
          </div>
          <a className="bang-btn bang-btn--primary" href="#/">{tr('Vstúpiť do lobby', 'Enter the lobby')}</a>
        </div>
      </div>
    </div>
  );
}
