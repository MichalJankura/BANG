export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

export type CardType =
  | 'bang' | 'mancato' | 'birra' | 'panico' | 'catbalou' | 'duello' | 'diligenza'
  | 'wellsfargo' | 'gatling' | 'indiani' | 'emporio' | 'saloon'
  | 'prigione' | 'dinamite' | 'barile' | 'mirino' | 'mustang'
  | 'volcanic' | 'schofield' | 'remington' | 'carabine' | 'winchester';

export type Role = 'sceriffo' | 'vice' | 'fuorilegge' | 'rinnegato';

export type CharKey =
  | 'bartcassidy' | 'blackjack' | 'calamityjanet' | 'elgringo' | 'jessejones'
  | 'jourdonnais' | 'kitcarlson' | 'luckyduke' | 'paulregret' | 'pedroramirez'
  | 'rosedoolan' | 'sidketchum' | 'slab' | 'suzylafayette' | 'vulturesam' | 'willythekid'
  // rozsirenie Gold Rush
  | 'don_bell' | 'dutch_will' | 'jacky_murieta' | 'josh_mccloud' | 'madame_yto' | 'pretty_luzena' | 'raddie_snake' | 'simeon_picos'
  // bonusove postavy zo zakladnych pravidiel
  | 'claus_the_saint' | 'johnny_kisch' | 'uncle_will';

/** Jedna konkretni kopie karty v balicku. rank: 2-10, J=11, Q=12, K=13, A=14 */
export interface Card {
  id: number;
  type: CardType;
  suit: Suit;
  rank: number;
}

export const WEAPON_RANGE: Partial<Record<CardType, number>> = {
  volcanic: 1, schofield: 2, remington: 3, carabine: 4, winchester: 5,
};

export const BLUE: CardType[] = [
  'prigione', 'dinamite', 'barile', 'mirino', 'mustang',
  'volcanic', 'schofield', 'remington', 'carabine', 'winchester',
];

export const isBlue = (t: CardType) => BLUE.includes(t);
export const isWeapon = (t: CardType) => t in WEAPON_RANGE;

/** Slovenske nazvy kariet (hlas design systemu BANG Saloon). */
export const CARD_NAME: Record<CardType, string> = {
  bang: 'BANG!', mancato: 'Vedľa!', birra: 'Pivo', panico: 'Panika!', catbalou: 'Cat Balou',
  duello: 'Duel', diligenza: 'Dostavník', wellsfargo: 'Wells Fargo', gatling: 'Guľomet',
  indiani: 'Indiáni!', emporio: 'Hokynárstvo', saloon: 'Saloon', prigione: 'Väzenie',
  dinamite: 'Dynamit', barile: 'Barel', mirino: 'Mieridlo', mustang: 'Mustang',
  volcanic: 'Volcanic', schofield: 'Schofield', remington: 'Remington',
  carabine: 'Rev. Carabine', winchester: 'Winchester',
};

/** Kratke popisy efektu (vlastni formulace). */
export const CARD_TEXT: Record<CardType, string> = {
  bang: 'Vystreľ na hráča v dostrele. Ak sa neubráni, stratí 1 život. Iba raz za ťah.',
  mancato: 'Zahraj mimo svojho ťahu, keď na teba niekto strieľa. Výstrel minie.',
  birra: 'Vylieč si 1 život. Zachráni aj pri smrteľnom zásahu. Nefunguje, keď ostali 2 hráči.',
  panico: 'Vezmi si kartu od hráča vo vzdialenosti 1 (náhodnú z ruky alebo vyloženú).',
  catbalou: 'Ľubovoľný hráč odhodí kartu (náhodnú z ruky alebo vyloženú podľa tvojho výberu).',
  duello: 'Vyzvi hráča. Striedavo odhadzujete BANG!, začína vyzvaný. Kto neodhodí, stratí 1 život.',
  diligenza: 'Potiahni si 2 karty.',
  wellsfargo: 'Potiahni si 3 karty.',
  gatling: 'Výstrel na všetkých ostatných hráčov bez ohľadu na vzdialenosť.',
  indiani: 'Každý ostatný hráč odhodí BANG!, inak stratí 1 život.',
  emporio: 'Odkry toľko kariet, koľko je hráčov. Každý si postupne jednu vezme, začínaš ty.',
  saloon: 'Všetci živí hráči si vyliečia 1 život.',
  prigione: 'Vylož pred iného hráča (nie Šerifa). Na začiatku ťahu ťahá kartu: srdce = voľný, inak vynechá ťah.',
  dinamite: 'Na začiatku ťahu ťahaj kartu: piky 2-9 = výbuch, strácaš 3 životy. Inak putuje doľava.',
  barile: 'Keď na teba niekto strieľa, ťahaj kartu: srdce = výstrel minie.',
  mirino: 'Ostatných hráčov vidíš o 1 bližšie.',
  mustang: 'Ostatní hráči ťa vidia o 1 ďalej.',
  volcanic: 'Zbraň, dostrel 1. Môžeš hrať ľubovoľný počet BANG! za ťah.',
  schofield: 'Zbraň, dostrel 2.',
  remington: 'Zbraň, dostrel 3.',
  carabine: 'Zbraň, dostrel 4.',
  winchester: 'Zbraň, dostrel 5.',
};

export const ROLE_NAME: Record<Role, string> = {
  sceriffo: 'Šerif', vice: 'Pomocník', fuorilegge: 'Bandita', rinnegato: 'Odpadlík',
};

export const ROLE_GOAL: Record<Role, string> = {
  sceriffo: 'Zabi všetkých Banditov a Odpadlíka.',
  vice: 'Chráň Šerifa a pomôž mu zabiť Banditov a Odpadlíka.',
  fuorilegge: 'Zabi Šerifa.',
  rinnegato: 'Ostaň posledný nažive. Šerif musí padnúť až ako posledný.',
};

export const CHARACTERS: Record<CharKey, { name: string; hp: number; text: string }> = {
  bartcassidy: { name: 'Bart Cassidy', hp: 4, text: 'Za každý stratený život si potiahne kartu.' },
  blackjack: { name: 'Black Jack', hp: 4, text: 'Druhú ťahanú kartu ukáže. Ak je srdcová alebo kárová, potiahne si ešte jednu.' },
  calamityjanet: { name: 'Calamity Janet', hp: 4, text: 'Môže používať BANG! ako Vedľa! a naopak.' },
  elgringo: { name: 'El Gringo', hp: 3, text: 'Za každý život stratený kvôli hráčovi si od neho vezme náhodnú kartu z ruky.' },
  jessejones: { name: 'Jesse Jones', hp: 4, text: 'Prvú kartu si môže vziať náhodne z ruky iného hráča.' },
  jourdonnais: { name: 'Jourdonnais', hp: 4, text: 'Má stále k dispozícii Barel.' },
  kitcarlson: { name: 'Kit Carlson', hp: 4, text: 'Pozrie sa na 3 vrchné karty, 2 si nechá a tretiu vráti na balík.' },
  luckyduke: { name: 'Lucky Duke', hp: 4, text: 'Pri kontrole karty otočí 2 karty a vyberie si lepšiu.' },
  paulregret: { name: 'Paul Regret', hp: 3, text: 'Ostatní hráči ho vidia o 1 ďalej.' },
  pedroramirez: { name: 'Pedro Ramirez', hp: 4, text: 'Prvú kartu si môže vziať z vrchu odhadzovacieho balíka.' },
  rosedoolan: { name: 'Rose Doolan', hp: 4, text: 'Ostatných hráčov vidí o 1 bližšie.' },
  sidketchum: { name: 'Sid Ketchum', hp: 4, text: 'Môže odhodiť 2 karty z ruky a vyliečiť si 1 život.' },
  slab: { name: 'Slab the Killer', hp: 4, text: 'Na zrušenie jeho BANG! treba 2 Vedľa!.' },
  suzylafayette: { name: 'Suzy Lafayette', hp: 4, text: 'Keď nemá v ruke žiadnu kartu, potiahne si jednu.' },
  vulturesam: { name: 'Vulture Sam', hp: 4, text: 'Keď je niekto zabitý, vezme si všetky jeho karty.' },
  willythekid: { name: 'Willy the Kid', hp: 4, text: 'Môže hrať ľubovoľný počet BANG! za ťah.' },
  don_bell: { name: 'Don Bell', hp: 4, text: 'Na konci svojho ťahu ťahá kartu: pri srdci alebo káre hrá ešte jeden ťah.' },
  dutch_will: { name: 'Dutch Will', hp: 4, text: 'Potiahne si 2 karty, jednu z nich odhodí a vezme si 1 nuget.' },
  jacky_murieta: { name: 'Jacky Murieta', hp: 4, text: 'Vo svojom ťahu môže zaplatiť 2 nugety a vystreliť 1 BANG! navyše.' },
  josh_mccloud: { name: 'Josh McCloud', hp: 4, text: 'Za 2 nugety si môže potiahnuť vrchnú kartu z balíka vybavenia.' },
  madame_yto: { name: 'Madam Yto', hp: 4, text: 'Vždy keď niekto zahrá Pivo, potiahne si 1 kartu.' },
  pretty_luzena: { name: 'Pretty Luzena', hp: 4, text: 'Raz za ťah kúpi jedno vybavenie o 1 nuget lacnejšie.' },
  raddie_snake: { name: 'Raddie Snake', hp: 4, text: 'Vo svojom ťahu môže odhodiť 1 nuget a potiahnuť si 1 kartu (najviac 2-krát).' },
  simeon_picos: { name: 'Simeon Picos', hp: 4, text: 'Za každý stratený život si vezme 1 nuget.' },
  claus_the_saint: { name: 'Claus „the Saint“', hp: 3, text: 'V 1. fáze ťahá o 1 kartu viac, než je hráčov. 2 si nechá a ostatným rozdá po jednej.' },
  johnny_kisch: { name: 'Johnny Kisch', hp: 4, text: 'Keď vyloží kartu, všetky rovnomenné karty, ktoré už sú v hre, sa odhodia.' },
  uncle_will: { name: 'Uncle Will', hp: 4, text: 'Raz za ťah môže zahrať ľubovoľnú kartu z ruky ako Hokynárstvo.' },
};

/** Postavy z rozsirenia Gold Rush. Do vyberu idu len ked je rozsirenie zapnute. */
export const GR_CHARS: CharKey[] = ['don_bell', 'dutch_will', 'jacky_murieta', 'josh_mccloud', 'madame_yto', 'pretty_luzena', 'raddie_snake', 'simeon_picos'];
export const isGoldRushChar = (k: CharKey) => GR_CHARS.includes(k);
/** Bonusove postavy zo zakladnych pravidiel. Do vyberu idu len ked ich zakladatel zapne. */
export const BONUS_CHARS: CharKey[] = ['claus_the_saint', 'johnny_kisch', 'uncle_will'];
export const isBonusChar = (k: CharKey) => BONUS_CHARS.includes(k);
export const BASE_CHARS: CharKey[] = (Object.keys(CHARACTERS) as CharKey[]).filter(k => !GR_CHARS.includes(k) && !BONUS_CHARS.includes(k));

// ---------- Gold Rush: vybavenie ----------

export type EquipType =
  | 'bicchierino' | 'bottiglia' | 'complice' | 'corsa_all_oro' | 'rum' | 'union_pacific'
  | 'calumet' | 'cinturone' | 'ferro_di_cavallo' | 'piccone' | 'ricercato' | 'setaccio' | 'stivali' | 'talismano' | 'zaino';

/** Jedna kopia karty vybavenia. */
export interface Equip { id: number; type: EquipType }

/** black = ostava vylozena pred hracom, inak sa pouzije hned a odhodi. */
export const EQUIP: Record<EquipType, { name: string; cost: number; black: boolean; count: number; text: string }> = {
  bicchierino: { name: 'Panák', cost: 1, black: false, count: 3, text: 'Hráč podľa tvojho výberu (aj ty) si vylieči 1 život.' },
  bottiglia: { name: 'Fľaša', cost: 2, black: false, count: 3, text: 'Použi ako Paniku!, Pivo alebo BANG!. Tento BANG! sa neráta do limitu.' },
  complice: { name: 'Komplic', cost: 2, black: false, count: 3, text: 'Použi ako Hokynárstvo, Duel alebo Cat Balou.' },
  corsa_all_oro: { name: 'Zlatá horúčka', cost: 5, black: false, count: 1, text: 'Tvoj ťah sa končí. Vylieč si všetky životy a hraj ešte jeden ťah.' },
  rum: { name: 'Rum', cost: 3, black: false, count: 2, text: 'Otoč 4 karty z balíka: za každú rôznu farbu si vylieč 1 život.' },
  union_pacific: { name: 'Union Pacific', cost: 4, black: false, count: 1, text: 'Potiahni si 4 karty.' },
  calumet: { name: 'Kalumet', cost: 3, black: true, count: 1, text: 'Kárové karty, ktoré zahrajú ostatní, na teba nepôsobia. Neplatí v Dueli.' },
  cinturone: { name: 'Opasok', cost: 2, black: true, count: 1, text: 'Na konci ťahu si môžeš nechať v ruke až 8 kariet.' },
  ferro_di_cavallo: { name: 'Podkova', cost: 2, black: true, count: 1, text: 'Pri každej kontrole karty otoč o kartu viac a vyber si výsledok.' },
  piccone: { name: 'Krompáč', cost: 4, black: true, count: 1, text: 'Na začiatku ťahu si potiahni o 1 kartu viac.' },
  ricercato: { name: 'Hľadaný', cost: 2, black: true, count: 3, text: 'Vylož pred iného hráča. Kto ho vyradí, potiahne si 2 karty a vezme 1 nuget.' },
  setaccio: { name: 'Ryžovacia panvica', cost: 3, black: true, count: 1, text: 'Zaplať 1 nuget a potiahni si kartu. Najviac 2-krát za ťah.' },
  stivali: { name: 'Čižmy', cost: 3, black: true, count: 1, text: 'Za každý stratený život si potiahni 1 kartu.' },
  talismano: { name: 'Talizman', cost: 3, black: true, count: 1, text: 'Za každý stratený život si vezmi 1 nuget.' },
  zaino: { name: 'Batoh', cost: 3, black: true, count: 1, text: 'Zaplať 2 nugety a vylieč si 1 život. Funguje aj pri smrteľnom zásahu.' },
};

export const isEquipType = (k: string): k is EquipType => k in EQUIP;

export function buildEquipDeck(): Equip[] {
  const out: Equip[] = [];
  let id = 201; // server prijima id < 1000
  for (const type of Object.keys(EQUIP) as EquipType[]) for (let i = 0; i < EQUIP[type].count; i++) out.push({ id: id++, type });
  return out;
}

/** Subor obrazka karty: zakladna hra ma predponu 01_, Gold Rush 04_, bonusove postavy 05_. */
export const spriteFile = (k: string) =>
  (BONUS_CHARS as string[]).includes(k) ? `05_${k}.webp` : `${k in EQUIP || (GR_CHARS as string[]).includes(k) || k === 'rinnegato_ombra' || k === 'gold_piece' ? '04' : '01'}_${k}.webp`;


export const ROLES_BY_COUNT: Record<number, Role[]> = {
  // 2 a 3 hraci nejsou podle pravidel, slouzi jen pro lokalni testovani
  2: ['sceriffo', 'fuorilegge'],
  3: ['sceriffo', 'fuorilegge', 'rinnegato'],
  4: ['sceriffo', 'rinnegato', 'fuorilegge', 'fuorilegge'],
  5: ['sceriffo', 'rinnegato', 'fuorilegge', 'fuorilegge', 'vice'],
  6: ['sceriffo', 'rinnegato', 'fuorilegge', 'fuorilegge', 'fuorilegge', 'vice'],
  7: ['sceriffo', 'rinnegato', 'fuorilegge', 'fuorilegge', 'fuorilegge', 'vice', 'vice'],
};

const R: Record<string, number> = { J: 11, Q: 12, K: 13, A: 14 };
const S: Record<string, Suit> = { H: 'hearts', D: 'diamonds', C: 'clubs', S: 'spades' };

/**
 * Zakladni balicek, 80 karet, 20 od kazde barvy.
 * Zapis: hodnota + barva (H srdce, D kara, C krize, S piky), "2-9C" je rozsah.
 * Pocty a hodnoty vsech druhu jsou overene proti seznamu fyzickeho balicku (test v engine.test.ts),
 * barvy souctem (20/20/20/20). Hodnota rozhoduje jen u pik 2-9 pro Dynamit.
 */
const DECK_SPEC: [CardType, string][] = [
  ['bang', 'AS 2-AD QH KH AH 2-9C'],
  ['mancato', '10-AC 2-8S'],
  ['birra', '6-JH'],
  ['panico', 'JH QH AH 8D'],
  ['catbalou', 'KH 9D 10D JD'],
  ['duello', 'QD JS 8C'],
  ['diligenza', '9S 9S'],
  ['wellsfargo', '3H'],
  ['gatling', '10H'],
  ['indiani', 'KD AD'],
  ['emporio', '9C QS'],
  ['saloon', '5H'],
  ['prigione', 'JS 4H 10S'],
  ['dinamite', '2H'],
  ['barile', 'QS KS'],
  ['mirino', 'AS'],
  ['mustang', '8H 9H'],
  ['volcanic', '10S 10C'],
  ['schofield', 'JC QC KS'],
  ['remington', 'KC'],
  ['carabine', 'AC'],
  ['winchester', '8S'],
];

const rankOf = (s: string) => R[s] ?? Number(s);

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  let id = 1;
  for (const [type, spec] of DECK_SPEC) {
    for (const tok of spec.split(' ')) {
      const suit = S[tok.slice(-1)];
      const body = tok.slice(0, -1);
      const [a, b] = body.split('-');
      const from = rankOf(a);
      const to = b ? rankOf(b) : from;
      for (let r = from; r <= to; r++) deck.push({ id: id++, type, suit, rank: r });
    }
  }
  return deck;
}

export const rankLabel = (r: number) => ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[r] ?? String(r);
export const SUIT_SYMBOL: Record<Suit, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
export const cardLabel = (c: Card) => `${CARD_NAME[c.type]} (${rankLabel(c.rank)}${SUIT_SYMBOL[c.suit]})`;
