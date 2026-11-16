import type { CharKey } from '@bang/engine';

export type Cat = 'combat' | 'defense' | 'draw' | 'range' | 'gold';

/** Doplnkove udaje k postavam pre stranku Karty postav. **tucne** a *kurziva* sa vykreslia ako zvyraznenie. */
export const CHAR_META: Record<CharKey, { title: string; cats: Cat[]; ability: string; note: string }> = {
  willythekid: { title: 'Útočný pištoľník', cats: ['combat'], ability: 'Môže zahrať ľubovoľný počet kariet **BANG!** za ťah.', note: 'Nepotrebuje zbraň Volcanic; je postrachom každého prestrelkového stola.' },
  calamityjanet: { title: 'Všestranná pištoľníčka', cats: ['combat'], ability: 'Môže hrať karty **BANG!** ako *Vedľa!* a karty *Vedľa!* ako **BANG!**.', note: 'Ak zahrá Vedľa! ako BANG!, stále platí pravidlo max 1 BANG! za ťah, pokiaľ nemá Volcanic.' },
  slab: { title: 'Smrtonosný strelec', cats: ['combat'], ability: 'Na odvrátenie jeho karty **BANG!** musí cieľový hráč zahrať **2 karty Vedľa!**.', note: 'Karta Barel sa počíta iba ako 1 Vedľa!, druhú musí hráč doložiť z ruky.' },
  bartcassidy: { title: 'Húževnatý samotár', cats: ['draw'], ability: 'Zakaždým, keď stratí život (je zranený), okamžite si potiahne **jednu kartu** z doberacieho balíčka.', note: 'Neplatí, ak by stratil svoj posledný život. Funguje aj v súperovom ťahu.' },
  paulregret: { title: 'Opatrný utečenec', cats: ['defense', 'range'], ability: 'Všetci ostatní hráči ho vidia na vzdialenosť zvýšenú o **+1**.', note: "Má prirodzeného 'Mustanga'. Ak má vyloženého aj Mustanga, vzdialenosť sa sčítava na +2." },
  rosedoolan: { title: 'Ostreľovačka', cats: ['range'], ability: 'Vidí všetkých ostatných hráčov na vzdialenosť zníženú o **-1**.', note: "Má prirodzený 'Hľadáčik / Appaloosu'. V kombinácii so skutočným hľadáčikom vidí ciele o -2 bližšie." },
  jourdonnais: { title: 'Obranný veterán', cats: ['defense'], ability: 'Vždy, keď sa stane cieľom **BANG!**, môže si **„ťahať!“**: ak potiahne srdce, útok ho minul (efekt Vedľa!).', note: 'Ak má na stole vyložený aj Barel, má dve nezávislé šance na únik pred zásahom.' },
  elgringo: { title: 'Pomstychtivý tulák', cats: ['defense', 'draw'], ability: 'Zakaždým, keď ho zraní iný hráč, vezme si z ruky tohto útočníka **náhodnú kartu za každý stratený život**.', note: 'Neplatí pre zranenie dynamitom ani pri strate posledného života. Ak útočník nemá karty, má smolu.' },
  sidketchum: { title: 'Húževnatý rančer', cats: ['defense'], ability: 'Kedykoľvek môže odhodiť 2 karty z ruky a **obnoviť si 1 stratený život**.', note: 'Schopnosť môže použiť aj viackrát za sebou, no nesmie prekročiť svoj maximálny počet životov.' },
  kitcarlson: { title: 'Skaut & Prieskumník', cats: ['draw'], ability: 'Vo fáze ťahania sa pozrie na **vrchné 3 karty**, 2 si vyberie do ruky a 1 vráti navrch balíčka lícom nadol.', note: 'Má mimoriadnu kontrolu nad prichádzajúcimi kartami pre seba aj nasledujúceho hráča.' },
  luckyduke: { title: 'Hazardný hráč', cats: ['draw'], ability: 'Zakaždým, keď musí „ťahať!“, otočí **2 vrchné karty balíčka** a vyberie si tú, ktorá mu vyhovuje.', note: 'Extrémne odolný voči Dynamitu, Väzeniu a majster v uskakovaní za Barelom.' },
  jessejones: { title: 'Zlodej & Vydierač', cats: ['draw'], ability: 'Pri ťahaní na začiatku ťahu si môže prvú kartu potiahnuť **z ruky iného hráča** (druhú normálne z balíčka).', note: 'Oslabuje protihráčov odčerpávaním ich obranných prostriedkov z ruky.' },
  pedroramirez: { title: 'Mrchožrút & Hrobár', cats: ['draw'], ability: 'Pri ťahaní kariet si môže prvú kartu vziať priamo **z vrchu odhadzovacieho balíčka** (druhú z doberacieho).', note: 'Umožňuje recyklovať kľúčové karty zahrané hráčom priamo pred ním.' },
  suzylafayette: { title: 'Rýchla pištoľníčka', cats: ['draw', 'combat'], ability: 'Akonáhle nemá v ruke žiadnu kartu, **okamžite si potiahne 1 novú kartu** z doberacieho balíčka.', note: 'Funguje aj počas cudzieho ťahu, ale nie počas Duelu. V kombinácii s Volcanic dokáže reťaziť útoky.' },
  vulturesam: { title: 'Mrchožrút', cats: ['draw'], ability: 'Zakaždým, keď je ktorýkoľvek hráč vyradený z hry, Sam zoberie do ruky **všetky karty vyradeného hráča**.', note: 'Získava karty z ruky aj vyložené karty zo stola mŕtveho pištoľníka.' },
  blackjack: { title: 'Kartár zo salónu', cats: ['draw'], ability: 'Pri ťahaní ukáže druhú kartu. Ak je **červená (srdce/káro)**, okamžite si potiahne **tretiu kartu navyše**.', note: 'Štatisticky má 50% šancu získať v každom ťahu 3 karty namiesto dvoch.' },
  don_bell: { title: 'Neúnavný zvonár', cats: ['gold', 'combat'], ability: 'Na konci svojho ťahu **„ťahá!“**: pri srdci alebo káre hrá hneď **ešte jeden ťah**.', note: 'Po ťahu navyše už znova neťahá. Šanca je presne 50 %.' },
  dutch_will: { title: 'Zlatokop s váhami', cats: ['gold', 'draw'], ability: 'Potiahne si 2 karty, **jednu z nich odhodí** a vezme si **1 nuget**.', note: 'Odhodiť musí jednu z dvoch práve potiahnutých kariet. Má menej kariet, ale istý príjem zlata.' },
  jacky_murieta: { title: 'Platený strelec', cats: ['gold', 'combat'], ability: 'Vo svojom ťahu môže zaplatiť **2 nugety** a vystreliť **1 BANG! navyše**.', note: 'Nepotrebuje na to kartu a môže to zopakovať, kým má čím platiť.' },
  josh_mccloud: { title: 'Lovec pokladov', cats: ['gold'], ability: 'Za **2 nugety** si môže potiahnuť **vrchnú kartu z balíka vybavenia**.', note: 'Len vo svojom ťahu. Čiernu kartu, ktorú už má, musí odhodiť.' },
  madame_yto: { title: 'Majiteľka salónu', cats: ['gold', 'draw'], ability: 'Vždy, keď ktokoľvek zahrá **Pivo**, potiahne si **1 kartu**.', note: 'Platí aj pre Pivo zahrané za nuget a pre jej vlastné Pivá. Fľaša použitá ako Pivo sa neráta.' },
  pretty_luzena: { title: 'Šikovná obchodníčka', cats: ['gold'], ability: 'Raz za ťah kúpi jedno vybavenie **o 1 nuget lacnejšie**.', note: 'Kartu s cenou 1 tak dostane zadarmo. Ďalšie nákupy v tom istom ťahu platí naplno.' },
  raddie_snake: { title: 'Prefíkaný had', cats: ['gold', 'draw'], ability: 'Vo svojom ťahu môže odhodiť **1 nuget** a potiahnuť si **1 kartu**, najviac 2-krát.', note: 'Zlato mení priamo na karty, vybavenie na to nepotrebuje.' },
  claus_the_saint: { title: 'Štedrý rozdávač', cats: ['draw'], ability: 'V 1. fáze ťahá o **1 kartu viac, než je hráčov**. **2 si nechá** a ostatným rozdá po jednej.', note: 'Karty rozdeľuje sám: komu dá ktorú, je na ňom. Pri 2 hráčoch ťahá 3 karty.' },
  johnny_kisch: { title: 'Čistič stola', cats: ['combat'], ability: 'Keď vyloží kartu, všetky **rovnomenné karty**, ktoré už sú v hre, sa odhodia.', note: 'Platí aj pre karty pred inými hráčmi, napríklad ich Barel či Mustang.' },
  uncle_will: { title: 'Tajný obchodník', cats: ['draw'], ability: 'Raz za ťah môže zahrať **ľubovoľnú kartu z ruky** ako *Hokynárstvo*.', note: 'Hokynárstvo sa týmto zahrá aj ako náhrada za zbytočnú kartu v ruke.' },
  simeon_picos: { title: 'Tvrdohlavý baník', cats: ['gold', 'defense'], ability: 'Za každý stratený život si vezme **1 nuget**.', note: 'Nuget berie vždy z kôpky, nie od hráča, ktorý ho zranil.' },
};

export const CAT_LABEL: Record<'all' | Cat, string> = {
  all: 'Všetky postavy',
  combat: 'Útočné / Prestrelka',
  defense: 'Obranné & Životy',
  draw: 'Ťahanie & Zlodeji',
  range: 'Dostrel & Pozícia',
  gold: 'Gold Rush',
};

export const CAT_LABEL_EN: Record<'all' | Cat, string> = {
  all: 'All characters',
  combat: 'Offensive / Shootout',
  defense: 'Defense & Lives',
  draw: 'Drawing & Thieves',
  range: 'Range & Position',
  gold: 'Gold Rush',
};

/** Anglicke texty k postavam (meno postavy ostava povodne). */
export const CHAR_META_EN: Record<CharKey, { title: string; ability: string; note: string }> = {
  willythekid: { title: 'Aggressive Gunslinger', ability: 'May play any number of **BANG!** cards per turn.', note: 'Does not need a Volcanic; the terror of every shootout table.' },
  calamityjanet: { title: 'Versatile Gunslinger', ability: 'May play **BANG!** cards as *Missed!* and *Missed!* cards as **BANG!**.', note: 'If she plays Missed! as BANG!, the limit of 1 BANG! per turn still applies unless she has a Volcanic.' },
  slab: { title: 'Deadly Shooter', ability: 'To cancel his **BANG!**, the target must play **2 Missed! cards**.', note: 'A Barrel counts as only 1 Missed!, the player must supply the second from hand.' },
  bartcassidy: { title: 'Tough Loner', ability: 'Each time he loses a life (is wounded), he immediately draws **one card** from the deck.', note: "Does not apply if he would lose his last life. Works on opponents' turns too." },
  paulregret: { title: 'Cautious Fugitive', ability: 'All other players see him at a distance increased by **+1**.', note: 'Has a natural Mustang. With a Mustang in play too, the distance adds up to +2.' },
  rosedoolan: { title: 'Sharpshooter', ability: 'Sees all other players at a distance reduced by **-1**.', note: 'Has a natural Scope. Combined with a real Scope she sees targets -2 closer.' },
  jourdonnais: { title: 'Defensive Veteran', ability: 'Whenever he is the target of a **BANG!**, he may **"draw!"**: if he draws a heart, the attack misses (Missed! effect).', note: 'With a Barrel in play too, he has two independent chances to escape the hit.' },
  elgringo: { title: 'Vengeful Drifter', ability: "Each time another player wounds him, he takes **a random card from that attacker's hand for each life lost**.", note: 'Does not apply to Dynamite damage or when losing his last life. If the attacker has no cards, tough luck.' },
  sidketchum: { title: 'Hardy Rancher', ability: 'At any time he may discard 2 cards from hand to **restore 1 lost life**.', note: 'He can use this repeatedly, but may not exceed his maximum life points.' },
  kitcarlson: { title: 'Scout & Explorer', ability: 'In the draw phase he looks at the **top 3 cards**, takes 2 into his hand and puts 1 back on top of the deck face down.', note: 'Gives extra control over the incoming cards for himself and the next player.' },
  luckyduke: { title: 'Gambler', ability: 'Each time he must "draw!", he flips **the top 2 cards of the deck** and picks the one that suits him.', note: 'Extremely resistant to Dynamite and Jail, and a master of dodging behind a Barrel.' },
  jessejones: { title: 'Thief & Extortionist', ability: "When drawing at the start of his turn, he may draw the first card **from another player's hand** (the second normally from the deck).", note: 'Weakens opponents by draining their defenses from hand.' },
  pedroramirez: { title: 'Scavenger & Gravedigger', ability: 'When drawing, he may take the first card straight **from the top of the discard pile** (the second from the deck).', note: 'Lets him recycle key cards just played by the player before him.' },
  suzylafayette: { title: 'Quick Gunslinger', ability: 'As soon as she has no cards in hand, she **immediately draws 1 new card** from the deck.', note: "Works during other players' turns too, but not during a Duel. With a Volcanic she can chain attacks." },
  vulturesam: { title: 'Scavenger', ability: "Each time any player is eliminated, Sam takes **all of that player's cards** into his hand.", note: 'He gets both the hand cards and the cards in play of the dead gunslinger.' },
  blackjack: { title: 'Saloon Card Shark', ability: 'When drawing, he shows his second card. If it is **red (heart/diamond)**, he immediately draws **a third card**.', note: 'Statistically has a 50% chance each turn to get 3 cards instead of two.' },
  don_bell: { title: 'Tireless Bell-Ringer', ability: 'At the end of his turn he **"draws!"**: on a heart or diamond he immediately plays **one more turn**.', note: 'After the extra turn he does not draw again. The odds are exactly 50%.' },
  dutch_will: { title: 'Prospector with Scales', ability: 'Draws 2 cards, **discards one of them** and takes **1 nugget**.', note: 'He must discard one of the two cards just drawn. Fewer cards, but a steady income of gold.' },
  jacky_murieta: { title: 'Hired Gun', ability: 'During his turn he may pay **2 nuggets** to shoot **1 extra BANG!**.', note: 'He needs no card for it and may repeat it as long as he can pay.' },
  josh_mccloud: { title: 'Treasure Hunter', ability: 'For **2 nuggets** he may draw the **top card of the equipment deck**.', note: 'Only during his turn. A black card he already has must be discarded.' },
  madame_yto: { title: 'Saloon Owner', ability: 'Each time anyone plays a **Beer**, she draws **1 card**.', note: 'Also counts for a Beer played for a nugget and for her own Beers. A Bottle used as a Beer does not count.' },
  pretty_luzena: { title: 'Shrewd Trader', ability: 'Once per turn she buys one equipment card for **1 nugget less**.', note: 'A card that costs 1 is free for her. Other purchases in the same turn cost the full price.' },
  raddie_snake: { title: 'Cunning Snake', ability: 'During his turn he may discard **1 nugget** to draw **1 card**, up to 2 times.', note: 'He turns gold straight into cards, no equipment needed.' },
  claus_the_saint: { title: 'Generous Dealer', ability: 'In phase 1 he draws **1 card more than there are players**. He **keeps 2** and deals one to each other player.', note: 'He decides who gets which card. With 2 players he draws 3 cards.' },
  johnny_kisch: { title: 'Table Sweeper', ability: 'When he puts a card into play, all **cards of the same name** already in play are discarded.', note: 'Also hits cards in front of other players, such as their Barrel or Mustang.' },
  uncle_will: { title: 'Secret Trader', ability: 'Once per turn he may play **any card from his hand** as *General Store*.', note: 'A way to turn a useless card into a General Store.' },
  simeon_picos: { title: 'Stubborn Miner', ability: 'Takes **1 nugget** for each life he loses.', note: 'The nugget always comes from the heap, not from the player who wounded him.' },
};
