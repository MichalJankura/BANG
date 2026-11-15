import { CARD_NAME, CARD_TEXT, CHARACTERS, EQUIP, ROLE_GOAL, ROLE_NAME, type CardType, type CharKey, type EquipType, type Role } from '@bang/engine';
import { getLang } from './i18n';

const EN_CARD_NAME: Record<CardType, string> = {
  bang: 'BANG!', mancato: 'Missed!', birra: 'Beer', panico: 'Panic!', catbalou: 'Cat Balou',
  duello: 'Duel', diligenza: 'Stagecoach', wellsfargo: 'Wells Fargo', gatling: 'Gatling',
  indiani: 'Indians!', emporio: 'General Store', saloon: 'Saloon', prigione: 'Jail',
  dinamite: 'Dynamite', barile: 'Barrel', mirino: 'Scope', mustang: 'Mustang',
  volcanic: 'Volcanic', schofield: 'Schofield', remington: 'Remington',
  carabine: 'Rev. Carabine', winchester: 'Winchester',
};

const EN_CARD_TEXT: Record<CardType, string> = {
  bang: 'Shoot a player within range. If they do not defend, they lose 1 life. Once per turn.',
  mancato: 'Play out of turn when someone shoots at you. The shot misses.',
  birra: 'Heal 1 life. Also saves you from a lethal hit. Does not work when 2 players are left.',
  panico: 'Take a card from a player at distance 1 (random from hand, or one in play).',
  catbalou: 'Any player discards a card (random from hand, or one in play, your choice).',
  duello: 'Challenge a player. You take turns discarding BANG!, the challenged player first. Whoever fails loses 1 life.',
  diligenza: 'Draw 2 cards.',
  wellsfargo: 'Draw 3 cards.',
  gatling: 'Shoots all other players regardless of distance.',
  indiani: 'Every other player discards a BANG! or loses 1 life.',
  emporio: 'Reveal as many cards as there are players. Each takes one in turn, starting with you.',
  saloon: 'All living players heal 1 life.',
  prigione: 'Put it in front of another player (not the Sheriff). At the start of their turn they draw: heart = free, otherwise they skip the turn.',
  dinamite: 'At the start of your turn draw a card: spades 2-9 = explosion, you lose 3 lives. Otherwise it passes to the left.',
  barile: 'When someone shoots at you, draw a card: heart = the shot misses.',
  mirino: 'You see other players 1 closer.',
  mustang: 'Other players see you 1 farther away.',
  volcanic: 'Weapon, range 1. You may play any number of BANG! per turn.',
  schofield: 'Weapon, range 2.',
  remington: 'Weapon, range 3.',
  carabine: 'Weapon, range 4.',
  winchester: 'Weapon, range 5.',
};

const EN_ROLE_NAME: Record<Role, string> = { sceriffo: 'Sheriff', vice: 'Deputy', fuorilegge: 'Outlaw', rinnegato: 'Renegade' };
const EN_ROLE_GOAL: Record<Role, string> = {
  sceriffo: 'Kill all the Outlaws and the Renegade.',
  vice: 'Protect the Sheriff and help kill the Outlaws and the Renegade.',
  fuorilegge: 'Kill the Sheriff.',
  rinnegato: 'Be the last one alive. The Sheriff must fall last.',
};
const EN_CHAR_TEXT: Record<CharKey, string> = {
  bartcassidy: 'Draws a card for each life he loses.',
  blackjack: 'Shows his second drawn card. If it is a heart or diamond, he draws one more.',
  calamityjanet: 'Can use BANG! as Missed! and vice versa.',
  elgringo: 'For each life lost to a player, takes a random card from that player\'s hand.',
  jessejones: 'May take his first card at random from another player\'s hand.',
  jourdonnais: 'Always has a Barrel available.',
  kitcarlson: 'Looks at the top 3 cards, keeps 2 and returns the third to the deck.',
  luckyduke: 'When checking a card, flips 2 and picks the better one.',
  paulregret: 'Other players see him 1 farther away.',
  pedroramirez: 'May take his first card from the top of the discard pile.',
  rosedoolan: 'Sees other players 1 closer.',
  sidketchum: 'May discard 2 cards from hand to heal 1 life.',
  slab: 'His BANG! needs 2 Missed! to cancel.',
  suzylafayette: 'When she has no cards in hand, she draws one.',
  vulturesam: 'When someone is killed, takes all of their cards.',
  willythekid: 'May play any number of BANG! per turn.',
  don_bell: 'At the end of his turn he "draws!": on a heart or diamond he plays an extra turn.',
  dutch_will: 'Draws 2 cards, discards one of them and takes 1 nugget.',
  jacky_murieta: 'During his turn he may pay 2 nuggets to shoot 1 extra BANG!.',
  josh_mccloud: 'May pay 2 nuggets to draw the top card of the equipment deck.',
  madame_yto: 'Each time anyone plays a Beer, she draws 1 card.',
  pretty_luzena: 'Once per turn she buys one equipment card for 1 nugget less.',
  raddie_snake: 'During his turn he may discard 1 nugget to draw 1 card (up to 2 times).',
  simeon_picos: 'Takes 1 nugget for each life he loses.',
};

const en = () => getLang() === 'en';
export const cardName = (t: CardType) => (en() ? EN_CARD_NAME : CARD_NAME)[t];
export const cardText = (t: CardType) => (en() ? EN_CARD_TEXT : CARD_TEXT)[t];
export const roleName = (r: Role) => (en() ? EN_ROLE_NAME : ROLE_NAME)[r];
export const roleGoal = (r: Role) => (en() ? EN_ROLE_GOAL : ROLE_GOAL)[r];
const EN_EQUIP: Record<EquipType, { name: string; text: string }> = {
  bicchierino: { name: 'Shot', text: 'A player of your choice (even you) heals 1 life.' },
  bottiglia: { name: 'Bottle', text: 'Use as a Panic!, Beer or BANG!. This BANG! does not count towards the limit.' },
  complice: { name: 'Pardner', text: 'Use as a General Store, Duel or Cat Balou.' },
  corsa_all_oro: { name: 'Gold Rush', text: 'Your turn ends. Heal all your lives and play another turn.' },
  rum: { name: 'Rhum', text: 'Flip 4 cards from the deck: heal 1 life for each different suit.' },
  union_pacific: { name: 'Union Pacific', text: 'Draw 4 cards.' },
  calumet: { name: 'Calumet', text: 'Cards of Diamonds played by other players have no effect on you. Does not apply in a Duel.' },
  cinturone: { name: 'Gun Belt', text: 'At the end of your turn you may keep up to 8 cards in hand.' },
  ferro_di_cavallo: { name: 'Horseshoe', text: 'Each time you "draw!", flip one more card and choose the result.' },
  piccone: { name: 'Pickaxe', text: 'Draw 1 extra card at the start of your turn.' },
  ricercato: { name: 'Wanted', text: 'Put it in front of another player. Whoever eliminates them draws 2 cards and takes 1 nugget.' },
  setaccio: { name: 'Gold Pan', text: 'Pay 1 nugget and draw a card. Up to 2 times per turn.' },
  stivali: { name: 'Boots', text: 'Draw 1 card for each life you lose.' },
  talismano: { name: 'Lucky Charm', text: 'Take 1 nugget for each life you lose.' },
  zaino: { name: 'Rucksack', text: 'Pay 2 nuggets and heal 1 life. Also works on a lethal hit.' },
};
export const equipName = (t: EquipType) => (en() ? EN_EQUIP[t].name : EQUIP[t].name);
export const equipText = (t: EquipType) => (en() ? EN_EQUIP[t].text : EQUIP[t].text);
/** 1 nuget, 2 nugety, 5 nugetov / 1 nugget, 2 nuggets */
export const nuggets = (n: number) => (en() ? `${n} nugget${n === 1 ? '' : 's'}` : `${n} ${n === 1 ? 'nuget' : n >= 2 && n <= 4 ? 'nugety' : 'nugetov'}`);

export const charText = (k: CharKey) => (en() ? EN_CHAR_TEXT[k] : CHARACTERS[k].text);

// ---------- preklad hlasok zo servera (denník, chyby) ----------

const CARD_RE = Object.entries(CARD_NAME).sort((a, b) => b[1].length - a[1].length)
  .map(([k, sk]) => [new RegExp(sk.replace(/[.*+?^${}()|[\]\\!]/g, '\\$&') + '(?=[ ,.(]|$)', 'g'), EN_CARD_NAME[k as CardType]] as const);
/** Nazvy kariet v texte (aj "Pivo (5♥)") na anglicke. */
const EQUIP_RE = (Object.keys(EQUIP) as EquipType[]).sort((a, b) => EQUIP[b].name.length - EQUIP[a].name.length)
  .map(k => [new RegExp(EQUIP[k].name + '(?=[ ,.(]|$)', 'g'), EN_EQUIP[k].name] as const);
const cn = (s: string) => [...CARD_RE, ...EQUIP_RE].reduce((x, [re, to]) => x.replace(re, to), s);
const ng = (n: string) => `${n} nugget${n === '1' ? '' : 's'}`;
const rn = (s: string) => (Object.keys(ROLE_NAME) as Role[]).reduce((x, r) => (x === ROLE_NAME[r] ? EN_ROLE_NAME[r] : x), s);

type Rule = [RegExp, (m: string[]) => string];
const LOG: Rule[] = [
  [/^Balík došiel, odhadzovací balík sa zamiešal\.$/, () => 'The deck ran out, the discard pile was reshuffled.'],
  [/^(.+?) ťahá kartu \((.+?)\): (.+) - (úspech|neúspech)\.$/, m => `${m[1]} draws a card (${cn(m[2])}): ${cn(m[3])} - ${m[4] === 'úspech' ? 'success' : 'failure'}.`],
  [/^Vyberte si roly\. Klikni na jednu kartu rubom\.$/, () => 'Pick your roles. Click one face-down card.'],
  [/^(.+?) otočil Šerifa\.$/, m => `${m[1]} flipped the Sheriff.`],
  [/^(.+?) si vzal rolu\.$/, m => `${m[1]} took a role.`],
  [/^Roly sú rozdané\. Otoč si 2 postavy a jednu si vyber\.$/, () => 'Roles are dealt. Flip 2 characters and pick one.'],
  [/^(.+?) hrá za postavu (.+)\.$/, m => `${m[1]} plays as ${m[2]}.`],
  [/^Rozdané\. Šerif (.+) začína\.$/, m => `Cards dealt. Sheriff ${m[1]} starts.`],
  [/^Na ťahu je (.+)\.$/, m => `It is ${m[1]}'s turn.`],
  [/^(.+?) nemá karty a ťahá jednu\.$/, m => `${m[1]} has no cards and draws one.`],
  [/^Dynamit putuje k hráčovi (.+)\.$/, m => `The Dynamite passes to ${m[1]}.`],
  [/^Dynamit vybuchol pri hráčovi (.+)\.$/, m => `The Dynamite exploded at ${m[1]}.`],
  [/^(.+?) ostáva vo väzení a vynecháva ťah\.$/, m => `${m[1]} stays in jail and skips the turn.`],
  [/^(.+?) ušiel z väzenia\.$/, m => `${m[1]} escaped from jail.`],
  [/^(.+?) ukazuje druhú kartu: (.+)\.$/, m => `${m[1]} shows the second card: ${cn(m[2])}.`],
  [/^(.+?) ťahá kartu navyše\.$/, m => `${m[1]} draws an extra card.`],
  [/^(.+?) sa výstrelu vyhol\.$/, m => `${m[1]} dodged the shot.`],
  [/^(.+?): zásah, −(\d+) (život|životy)\.$/, m => `${m[1]}: hit, −${m[2]} ${m[2] === '1' ? 'life' : 'lives'}.`],
  [/^(.+?) je vyradený\. Rola: (.+)\.$/, m => `${m[1]} is eliminated. Role: ${rn(m[2])}.`],
  [/^(.+?) si berie karty vyradeného\.$/, m => `${m[1]} takes the eliminated player's cards.`],
  [/^(.+?) získava odmenu 3 karty\.$/, m => `${m[1]} gets a bounty of 3 cards.`],
  [/^Šerif zabil svojho Pomocníka a odhadzuje všetky karty\.$/, () => 'The Sheriff killed their Deputy and discards all cards.'],
  [/^(.+?) ťahá kartu za stratený život\.$/, m => `${m[1]} draws a card for the lost life.`],
  [/^(.+?) berie kartu z ruky hráča (.+)\.$/, m => `${m[1]} takes a card from ${m[2]}'s hand.`],
  [/^(.+?) si berie kartu z ruky hráča (.+)\.$/, m => `${m[1]} takes a card from ${m[2]}'s hand.`],
  [/^(.+?) si berie (.+) z odhadzovacieho balíka\.$/, m => `${m[1]} takes ${cn(m[2])} from the discard pile.`],
  [/^Koniec hry\. Vyhráva Šerif s Pomocníkmi\.$/, () => 'Game over. The Sheriff and Deputies win.'],
  [/^Koniec hry\. Vyhrávajú Banditi\.$/, () => 'Game over. The Outlaws win.'],
  [/^Koniec hry\. Vyhráva Odpadlík\.$/, () => 'Game over. The Renegade wins.'],
  [/^(.+?) odhodil 2 karty: \+1 život\.$/, m => `${m[1]} discarded 2 cards: +1 life.`],
  [/^(.+?) odhodil (.+) proti Indiánom\.$/, m => `${m[1]} discarded ${cn(m[2])} against the Indians.`],
  [/^(.+?) v dueli odhodil (.+)\.$/, m => `${m[1]} discarded ${cn(m[2])} in the duel.`],
  [/^(.+?) sa zachránil Pivom: \+1 život\.$/, m => `${m[1]} was saved by a Beer: +1 life.`],
  [/^(.+?) odhodil (\d+) (kartu|karty)\.$/, m => `${m[1]} discarded ${m[2]} card${m[2] === '1' ? '' : 's'}.`],
  [/^(.+?) si zamiešal karty\.$/, m => `${m[1]} shuffled their cards.`],
  [/^(.+?) odhadzuje (.+) \(Cat Balou\)\.$/, m => `${m[1]} discards ${cn(m[2])} (Cat Balou).`],
  [/^(.+?) poslal hráča (.+) do väzenia\.$/, m => `${m[1]} sent ${m[2]} to jail.`],
  [/^(.+?) zahral BANG! na hráča (.+)\.$/, m => `${m[1]} played BANG! on ${m[2]}.`],
  [/^(.+?) zahral Pivo: \+1 život\.$/, m => `${m[1]} played Beer: +1 life.`],
  [/^(.+?) zahral Saloon: všetci \+1 život\.$/, m => `${m[1]} played Saloon: everyone +1 life.`],
  [/^(.+?) zahral Dostavník a ťahá 2 karty\.$/, m => `${m[1]} played Stagecoach and draws 2 cards.`],
  [/^(.+?) zahral Wells Fargo a ťahá 3 karty\.$/, m => `${m[1]} played Wells Fargo and draws 3 cards.`],
  [/^(.+?) páli z Guľometu na všetkých\.$/, m => `${m[1]} fires the Gatling at everyone.`],
  [/^(.+?) zahral Indiánov!$/, m => `${m[1]} played Indians!`],
  [/^(.+?) vyzval hráča (.+) na duel\.$/, m => `${m[1]} challenged ${m[2]} to a duel.`],
  [/^(.+?) otvoril Hokynárstvo: (.+)\.$/, m => `${m[1]} opened the General Store: ${cn(m[2])}.`],
  [/^(.+?) zahral (.+) na hráča (.+)\. (.+) si mieša karty\.$/, m => `${m[1]} played ${cn(m[2])} on ${m[3]}. ${m[4]} is shuffling their cards.`],
  [/^(.+?) zahral Paniku! a berie hráčovi (.+?) (kartu z ruky|.+ \(.+\))\.$/, m => `${m[1]} played Panic! and takes ${m[3] === 'kartu z ruky' ? 'a card from hand' : cn(m[3])} from ${m[2]}.`],
  [/^(.+?) zahral Cat Balou: (.+?) odhadzuje (.+)\.$/, m => `${m[1]} played Cat Balou: ${m[2]} discards ${cn(m[3])}.`],
  [/^(.+?) získava (\d+) nuget\w*\.$/, m => `${m[1]} gets ${ng(m[2])}.`],
  [/^(.+?) si berie (\d+) nuget\w* za stratený život\.$/, m => `${m[1]} takes ${ng(m[2])} for the lost life.`],
  [/^(.+?) ťahá kartu za stratený život \(Čižmy\)\.$/, m => `${m[1]} draws a card for the lost life (Boots).`],
  [/^(.+?) berie odmenu za Hľadaného: 2 karty a 1 nuget\.$/, m => `${m[1]} collects the Wanted reward: 2 cards and 1 nugget.`],
  [/^Kôpka nugetov je prázdna\.$/, () => 'The nugget heap is empty.'],
  [/^(.+?) zahral Pivo za 1 nuget\.$/, m => `${m[1]} played a Beer for 1 nugget.`],
  [/^(.+?) ťahá kartu za zahrané Pivo\.$/, m => `${m[1]} draws a card for the played Beer.`],
  [/^(.+?) ťahá kartu navyše \(Krompáč\)\.$/, m => `${m[1]} draws an extra card (Pickaxe).`],
  [/^(.+?) odhadzuje (.+) a berie si 1 nuget\.$/, m => `${m[1]} discards ${cn(m[2])} and takes 1 nugget.`],
  [/^(.+?) kupuje (.+) za (\d+) nuget\w*\.$/, m => `${m[1]} buys ${cn(m[2])} for ${ng(m[3])}.`],
  [/^(.+?) vyhlásil hráča (.+) za Hľadaného\.$/, m => `${m[1]} declared ${m[2]} Wanted.`],
  [/^(.+?) si vykladá (.+)\.$/, m => `${m[1]} puts ${cn(m[2])} into play.`],
  [/^(.+?) si lieči 1 život \(Panák\)\.$/, m => `${m[1]} heals 1 life (Shot).`],
  [/^(.+?) ťahá 4 karty \(Union Pacific\)\.$/, m => `${m[1]} draws 4 cards (Union Pacific).`],
  [/^(.+?) otáča karty \(Rum\): (.+)\. \+(\d+) život\w*\.$/, m => `${m[1]} flips cards (Rhum): ${cn(m[2])}. +${m[3]} ${m[3] === '1' ? 'life' : 'lives'}.`],
  [/^(.+?) platí (\d+) nuget\w*: (.+) odhadzuje (.+)\.$/, m => `${m[1]} pays ${ng(m[2])}: ${m[3]} discards ${cn(m[4])}.`],
  [/^(.+?) platí 2 nugety: \+1 život \(Batoh\)\.$/, m => `${m[1]} pays 2 nuggets: +1 life (Rucksack).`],
  [/^(.+?) platí 1 nuget a ťahá kartu \(Ryžovacia panvica\)\.$/, m => `${m[1]} pays 1 nugget and draws a card (Gold Pan).`],
  [/^(.+?) platí 1 nuget a ťahá kartu\.$/, m => `${m[1]} pays 1 nugget and draws a card.`],
  [/^(.+?) platí 2 nugety a strieľa na hráča (.+)\.$/, m => `${m[1]} pays 2 nuggets and shoots at ${m[2]}.`],
  [/^(.+?) platí 2 nugety a ťahá z balíka vybavenia: (.+)\.$/, m => `${m[1]} pays 2 nuggets and draws from the equipment deck: ${cn(m[2])}.`],
  [/^(.+?) kartu (.+) nevyužije a odhadzuje ju\.$/, m => `${m[1]} cannot use ${cn(m[2])} and discards it.`],
  [/^(.+?) odhadzuje (.+)\.$/, m => `${m[1]} discards ${cn(m[2])}.`],
  [/^(.+?) strieľa na hráča (.+)\.$/, m => `${m[1]} shoots at ${m[2]}.`],
  [/^Hráča (.+) chráni Kalumet\.$/, m => `${m[1]} is protected by the Calumet.`],
  [/^(.+?) si lieči všetky životy\.$/, m => `${m[1]} heals all lives.`],
  [/^(.+?) hrá ďalší ťah \(Zlatá horúčka\)\.$/, m => `${m[1]} plays another turn (Gold Rush).`],
  [/^(.+?) hrá ťah navyše\.$/, m => `${m[1]} plays an extra turn.`],
  [/^Tieň Odpadlíka (.+) hrá tento ťah (za zákon|za Banditov)\.$/, m => `The shadow Renegade ${m[1]} plays this turn ${m[2] === 'za zákon' ? 'for the law' : 'for the Outlaws'}.`],
  [/^(.+?) sa vracia ako tieň\.$/, m => `${m[1]} returns as a shadow.`],
  [/^Tieň (.+) mizne\.$/, m => `The shadow of ${m[1]} fades away.`],
  [/^(.+?) je tieň, zásah mu neublíži\.$/, m => `${m[1]} is a shadow, the hit does no harm.`],
  [/^(.+?) zahral (.+)\.$/, m => `${m[1]} played ${cn(m[2])}.`],
  [/^(.+?) vyložil (.+)\.$/, m => `${m[1]} put ${cn(m[2])} into play.`],
  [/^(.+?) si berie (.+)\.$/, m => `${m[1]} takes ${cn(m[2])}.`],
];

export function trLog(t: string): string {
  if (!en()) return t;
  for (const [re, f] of LOG) {
    const m = t.match(re);
    if (m) return f(m);
  }
  return t;
}

const ERR: Record<string, string> = {
  'Neznámy hráč': 'Unknown player', 'Túto kartu nemáš v ruke': 'You do not have this card in hand', 'Roly sú už rozdané': 'Roles are already dealt',
  'Za nuget sa dá zahrať len Pivo': 'Only a Beer can be played for a nugget', 'Rozšírenie Gold Rush nie je zapnuté': 'The Gold Rush expansion is not enabled',
  'Kôpka nugetov je prázdna': 'The nugget heap is empty',
  'Nemáš dosť nugetov': 'You do not have enough nuggets', 'Túto kartu teraz nevyužiješ': 'You cannot use this card now', 'Vyber, ako kartu použiješ': 'Choose how to use the card',
  'Tieň si životy neliečí': 'A shadow cannot heal', 'Túto schopnosť teraz nemôžeš použiť': 'You cannot use this ability now', 'Odhoď jednu z dvoch potiahnutých kariet': 'Discard one of the two cards you drew',
  'Použi kartu alebo ju odhoď': 'Use the card or discard it',
  'Rolu už máš': 'You already have a role', 'Neplatná karta': 'Invalid card', 'Túto kartu už niekto vzal, vyber inú': 'Someone already took this card, pick another',
  'Najprv si vyber rolu': 'Pick a role first', 'Už máš otočené 2 postavy': 'You already flipped 2 characters', 'Postavu už máš': 'You already have a character',
  'Najprv si otoč 2 postavy': 'Flip 2 characters first', 'Vyber jednu z tvojich dvoch postáv': 'Pick one of your two characters', 'Hra sa ešte nezačala': 'The game has not started yet',
  'Hra sa skončila': 'The game is over', 'Si mimo hry': 'You are out of the game', 'Hra už beží': 'The game is already running', 'Čaká sa na iného hráča': 'Waiting for another player',
  'Nie si na ťahu': 'It is not your turn', 'Teraz sa nedá hrať': 'You cannot play now', 'Neplatný príkaz': 'Invalid command', 'Túto schopnosť nemáš': 'You do not have this ability',
  'Teraz sa nedá': 'Not possible now', 'Odhoď presne 2 karty': 'Discard exactly 2 cards', 'Máš plný počet životov': 'You have full health',
  'Zahraj Vedľa! alebo prijmi zásah': 'Play Missed! or take the hit', 'Touto kartou sa výstrelu nevyhneš': 'This card cannot dodge the shot',
  'Odhoď BANG! alebo prijmi zásah': 'Discard a BANG! or take the hit', 'Treba odhodiť BANG!': 'You must discard a BANG!', 'Odhoď BANG! alebo sa vzdaj': 'Discard a BANG! or give up',
  'Zahraj Pivo alebo sa vzdaj': 'Play a Beer or give up', 'Pivo teraz nepomôže': 'A Beer will not help now', 'Zachrániť ťa môže len Pivo': 'Only a Beer can save you',
  'Odhoď karty nad limit': 'Discard cards over the limit', 'Vyber, odkiaľ berieš prvú kartu': 'Choose where to take the first card from', 'Od tohto hráča sa brať nedá': 'You cannot take from this player',
  'Vyber 2 karty': 'Pick 2 cards', 'Vyber presne 2 karty': 'Pick exactly 2 cards', 'Neplatný výber': 'Invalid selection', 'Zamiešaj si karty a potvrď poradie': 'Shuffle your cards and confirm the order',
  'Neplatné poradie kariet': 'Invalid card order', 'Vyber kartu': 'Pick a card', 'Vyber si kartu': 'Pick a card', 'Táto karta nie je v ponuke': 'This card is not on offer',
  'Túto kartu teraz nemôžeš zahrať': 'You cannot play this card now', 'Neplatný cieľ': 'Invalid target', 'Hráč nemá karty v ruke, vyber vyloženú kartu': 'The player has no cards in hand, pick a card in play',
  'Túto kartu hráč nemá vyloženú': 'The player does not have this card in play', 'Miestnosť neexistuje': 'Room does not exist', 'Miestnosť je plná': 'Room is full',
  'Nie si v miestnosti': 'You are not in a room', 'Toto môže len zakladateľ': 'Only the host can do this', 'Hra ešte beží': 'The game is still running', 'Hra nebeží': 'The game is not running',
  'Stav sa medzitým zmenil, skús znova': 'The state changed in the meantime, try again', 'Chyba servera': 'Server error', 'Príliš veľa požiadaviek, skús o chvíľu': 'Too many requests, try again in a moment', 'Server je plný, skús neskôr': 'Server is full, try again later', 'Už si v miestnosti': 'You are already in a room', 'Túto kartu teraz nemôžeš zahrať.': 'You cannot play this card now',
};

export function trErr(t: string): string {
  if (!en()) return t;
  if (ERR[t]) return ERR[t];
  let m = t.match(/^Treba aspoň (\d+) hráčov$/); if (m) return `At least ${m[1]} players are needed`;
  m = t.match(/^Odhoď presne (\d+)$/); if (m) return `Discard exactly ${m[1]}`;
  return t;
}
