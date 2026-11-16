# BANG! online

Webová verzia kartovej hry BANG! (základná hra a rozšírenie Gold Rush, 4-7 hráčov) na hranie s kamarátmi.
Vzhľad a texty podľa design systému BANG Saloon: saloonový stôl so súknom, lampa nad hráčom
na ťahu, fázy Ťahaj · Hraj · Odhoď, plagát na reakcie. Texty v hre sú po slovensky a po anglicky, v hre je hlasový a textový chat.

## Spustenie (lokálne)

Treba Node.js 20 alebo novší (https://nodejs.org).

V priečinku `bang-online`:

    npm install
    npm run dev

Potom otvor http://localhost:5173. Kamaráti v rovnakej sieti sa pripoja na
`http://<tvoja-IP>:5173` (adresu vypíše Vite pri štarte ako "Network").

Jeden hráč založí miestnosť, ostatní zadajú 6-písmenový kód. Na skúšanie osamote
pridaj botov tlačidlom "Pridaj bota" (hrajú náhodne, sú len na testovanie).

Priebeh hry:

1. **Roly:** karty rolí ležia rubom na stole, každý hráč klikne na jednu. Šerif sa hneď otočí
   všetkým, ostatné roly vidí len ich majiteľ.
2. **Postavy:** všetkých 16 postáv leží rubom cez celú plochu. Každý si otočí presne 2
   a z nich si vyberie jednu.
3. **Rozdanie** a hra. Začína Šerif.

Pri výbere sa klikanie nečaká na poradie: ak dvaja kliknú na tú istú kartu naraz, server ju
dá prvému a druhému ohlási, že je obsadená.

**Panika! a Cat Balou z ruky:** hráč, ktorému sa berie karta, si svoje karty preusporiada
ťahaním myšou alebo prstom (alebo šípkami), prípadne stlačí Zamiešaj, a potvrdí poradie.
Útočník potom vidí karty rubom presne v tomto poradí a jednu si vyberie. Ak má hráč v ruke
len jednu kartu, berie sa hneď. Vyloženú kartu (zbraň, Barel...) si útočník vyberá priamo.

## Rozšírenie Gold Rush

Zakladateľ stola ho zapne prepínačom v lobby pred štartom hry (zvlášť sa dá pridať variant
Tieňoví pištoľníci). Pravidlá sú v hre na stránke Pravidlá hry, záložka Gold Rush.

- **Nugety:** za každý život, o ktorý pripravíš iného hráča, dostaneš 1 nuget. Počet nugetov
  vidno na tabuľke každého hráča, tvoje sú vpravo dole pri „Pred tebou“.
- **Ponuka vybavenia** leží na stole vpravo od balíkov: balík vybavenia a 3 odkryté karty.
  Klik na kartu ukáže jej text a tlačidlo na kúpu. Karty, na ktoré máš, svietia.
- **Čierne vybavenie** ostáva pred hráčom (u súperov vykúka spoza tabuľky, tvoje je v zóne
  „Pred tebou“). Klikom naň ho môžeš komukoľvek odhodiť za cenu + 1.
- **Pivo:** po kliknutí si vyberieš, či chceš život alebo nuget.
- **Schopnosti za nugety** (Ryžovacia panvica, Batoh, Raddie Snake, Jacky Murieta, Josh McCloud)
  majú vlastné tlačidlá pod stolom, keď sa dajú použiť.
- Do výberu postáv pribudne 8 postáv rozšírenia (spolu 24).
- **Tiene:** vyradený hráč sa na svoj ťah vracia s 0 životmi a 2 kartami, po ťahu zmizne.

Zjednodušenia oproti papierovým pravidlám: zľava Pretty Luzeny sa uplatní automaticky na prvý
nákup v ťahu, Kalumet chránených hráčov rovno vyradí z cieľov károvej karty a v hre je
pevne 30 nugetov (z prázdnej kôpky sa neberie; bez tieňov sa nugety vyradeného vracajú na kôpku). Obrázky kariet rozšírenia sú v `assets/cards` s predponou `04_`.

Na reakciu (Vedľa!, Indiáni!, Duel, smrteľný zásah, miešanie kariet) má hráč 8 sekúnd. Potom server rozhodne
za neho: pri smrteľnom zásahu zahrá Pivo, ak ho má, pri miešaní karty zamieša, inak zásah prijme. Dĺžku zmeníš premennou
`RESPONSE_MS` (v ms, `0` = bez limitu), napr. v PowerShelli: `$env:RESPONSE_MS=15000; npm run dev`

## Hranie z telefónu a tabletu

Hra má vlastné rozloženie pre telefón na výšku (pás súperov hore, stôl, ruka dole), pre telefón na šírku
a pre tablet. Ide v iOS Safari aj v Androide (Chrome).

1. Počítač a telefón musia byť v rovnakej Wi-Fi.
2. Na počítači spusti `npm run dev`. Vite aj server počúvajú na všetkých rozhraniach (`0.0.0.0`), takže nič ďalšie netreba.
3. Zisti IP adresu počítača: v PowerShelli `ipconfig` (riadok "IPv4 Address", napr. `192.168.1.23`), na macOS/Linuxe `ifconfig` alebo `ip a`.
4. Na telefóne otvor `http://<IP>:5173` (napr. `http://192.168.1.23:5173`). Ak Windows pri prvom štarte pýta povolenie brány firewall, povoľ ho pre súkromnú sieť.
5. Pre zostavenú verziu (`npm run build`, potom `npm start`) je adresa `http://<IP>:3001`.

Čo funguje na telefóne: ťuk na kartu ju vyberie a zväčší, druhý ťuk alebo tlačidlo "Zahraj" ju zahrá, podržanie
(400 ms) otvorí náhľad karty s textom. Ruka sa posúva prstom do strany. Na dotyku ide aj preusporiadanie kariet pri
Panike! a Cat Balou. Po návrate z pozadia sa hra sama znova pripojí. Vibrácia (zásah, začiatok tvojho ťahu) ide na Androide,
iOS ju ignoruje.

Obmedzenie pri hraní cez `http://<IP>` v lokálnej sieti: prehliadače povoľujú **zámku proti zhasnutiu obrazovky**
(Screen Wake Lock) a **inštaláciu ako aplikáciu (PWA)** len v zabezpečenom kontexte, teda cez HTTPS alebo na `localhost`.
Bez HTTPS sa obrazovka môže zhasnúť a "Pridať na plochu" vytvorí len záložku. Nasadená verzia za HTTPS (alebo tunel typu
`cloudflared` / `ngrok`) má oboje. Na ploche sa potom hra otvára ako "BANG!" bez lišty prehliadača.

Testy na emulovaných zariadeniach (Playwright: iPhone SE a 15, Android 360x800, iPad Mini/Air/Pro, na výšku aj na šírku):

    npm install
    npx playwright install chromium
    npm run build
    # server s TRUST_PROXY_HOPS=1, aby každý test mal vlastnú IP (limity na IP).
    # PowerShell: $env:TRUST_PROXY_HOPS=1; $env:PORT=3101; $env:BOT_DELAY=250; $env:IDLE_MS=0; npm start
    npm run test:mobile -- --url http://localhost:3101

Screenshoty a `report.json` (pretečenie, orezané prvky, malé ciele dotyku) sa ukladajú do `docs/mobile-shots`.
Celú hru so 4 botmi odohrá `--full se` (iPhone SE).

Ďalšie príkazy:

    npm test         testy enginu (pravidlá + 500 náhodných partií)
    npm run build    zostaví web do apps/web/dist
    npm start        server na :3001, ktorý podáva aj zostavený web (jeden port)

## Obrázky kariet

Server hľadá obrázky v priečinku `assets/cards` v projekte
(súbory `01_<kľúč>.webp`, napr. `01_bang.webp`). Inú cestu nastavíš premennou `CARDS_DIR`.
Ak obrázok chýba, vykreslí sa zástupná karta z design systému s názvom.
Portréty na tabuľkách hráčov sú výrezy z obrázkov postáv.

Obrázok je jeden na typ karty. Skutočnú farbu a hodnotu konkrétnej kópie ukazuje
biely štítok v ľavom dolnom rohu, ktorý prekrýva hodnotu natlačenú na obrázku.

Obrázky sú v projekte vo formáte WebP (`assets/cards`), vrátane rubov kariet (`back-playing`, `back-character`, `back-role`).
Pôvodná grafika hry patrí vydavateľovi (dV Giochi); pred verejným nasadením treba jeho súhlas alebo vlastnú grafiku.

## Hlas a chat

V miestnosti je hlasový chat (WebRTC, zvuk ide priamo medzi hráčmi, server ho nevidí) a textový chat s označením `@Meno`.
Mikrofón sa zapína tlačidlom vpravo od vlajky na každej obrazovke miestnosti. V hre je vľavo dole riadok ikon
(mikrofón, stlmenie všetkých, hráči) a pod ním chat; na telefóne je to isté v paneli. Každému hráčovi sa dá nastaviť hlasitosť
a stlmenie. Mikrofón funguje len cez HTTPS alebo na `localhost`.

Cez prísne siete (mobilné dáta, firemný NAT) sa hráči spoja len cez relay, ktorý sa nastavuje premennými `TURN_*`.

## Nasadenie a premenné prostredia

Render: build `npm install && npm run build`, štart `npm run start`. Miestnosti sú len v pamäti, reštart ich zmaže.

- `COOKIE_SECRET`: tajomstvo na podpis tokenu pre obrázky kariet. Bez neho sa tokeny po reštarte zneplatnia.
- `TURN_URL`, `TURN_USER`, `TURN_PASS` alebo `TURN_API_URL`: relay pre hlas.
- `TRUST_PROXY_HOPS`: počet proxy pred serverom. Na Renderi sa nastaví sám na 3.
- `RESPONSE_MS` (čas na reakciu), `IDLE_MS` (ťah za neaktívneho hráča), `RECONNECT_MS` (kedy odpojeného nahradí bot),
  `MIN_PLAYERS`, `BOT_DELAY`, `MAX_ROOMS`, `MAX_SOCKETS_PER_IP`, `ALLOWED_ORIGINS`, `CARDS_DIR`, `PORT`.

Hráč, ktorý odíde alebo sa do `RECONNECT_MS` nevráti, je v rozohranej hre nahradený botom. Zakladateľ môže hráča vyhodiť;
ak odíde zakladateľ, stane sa ním iný hráč.

## Štruktúra

    packages/engine   pravidlá hry, čistý TypeScript bez siete (data.ts, engine.ts, view.ts, bot.ts)
    apps/server       Node + Socket.IO: miestnosti, poradie príkazov, filtrovanie pohľadov
    apps/web          React + Vite: lobby a herný stôl
      src/ds/         kópia tokenov a štýlov BANG Saloon (tokens.css, bundle.css)
      src/styles.css  úpravy pre appku (rozmery kariet podľa obrázkov, rozloženie, animácie)
      src/geometry.ts rozmiestnenie stola a miest pre 4-7 hráčov (layout.md z design systému)

- Server je jediný, kto pozná celý stav. Každému hráčovi posiela len jeho pohľad
  (`viewFor`): cudzie karty v ruke, balíček ani skryté roly sa ku klientovi nedostanú.
- Príkazy sa spracúvajú po jednom a každý nesie číslo verzie stavu. Príkaz nad starým
  stavom alebo od hráča, na ktorého sa nečaká, server odmietne.
- Náhoda (miešanie, sejmutie) beží len na serveri.

## Čo je hotové a čo nie

Hotové: všetkých 22 typov kariet, 16 postáv, roly, vzdialenosti a dostrel, reakcie mimo ťahu,
odmeny a tresty, koniec hry, doplnenia z oficiálneho FAQ, opätovné pripojenie do rozohranej hry.

Zjednodušenia oproti stolovej hre:
- Sejmutie (Barel, Väzenie, Dynamit) prebieha automaticky. Lucky Duke si automaticky berie lepšiu kartu.
- Hráč bez karty, ktorou by mohol odpovedať, dostane zásah hneď, bez pýtania.
- Poradie odhodenia kariet zabitého hráča je pevné (vyložené, potom ruka).
- Kartu nejde zahrať na seba (Panika!, Cat Balou).

Zatiaľ chýba: 3 bonusové postavy, ďalšie rozšírenia okrem Gold Rush (Dodge City...),
lietanie kariet medzi rukou a stolom (zatiaľ je len dopad na odhadzovací balík, otrasenie
tabuľky pri zásahu, výkriky "−1" / "+1 život" a čiara výstrelu), trvalé uloženie hier
(po reštarte servera sa rozohrané hry stratia).

Na overenie: hodnoty troch typov kariet v `packages/engine/src/data.ts` označené `(?)`
(Panika!, Indiáni!, Hokynářství) porovnaj s fyzickým balíčkom. Farby sedia (20 z každej),
na pravidlá tieto hodnoty vplyv nemajú.
