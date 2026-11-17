# BANG! online

Webová verzia kartovej hry BANG! (základná hra, 4-7 hráčov) na hranie s kamarátmi.
Vzhľad a texty podľa design systému BANG Saloon: saloonový stôl so súknom, lampa nad hráčom
na ťahu, fázy Ťahaj · Hraj · Odhoď, plagát na reakcie. Texty v hre sú po slovensky.

## Spustenie (lokálne)

Treba Node.js 20 alebo novší (https://nodejs.org).

V priečinku `bang-online`:

    npm install
    npm run dev

Potom otvor http://localhost:5173. Kamaráti v rovnakej sieti sa pripoja na
`http://<tvoja-IP>:5173` (adresu vypíše Vite pri štarte ako "Network").

Jeden hráč založí miestnosť, ostatní zadajú 6-písmenový kód. Na skúšanie osamote
pridaj botov tlačidlom "Přidat bota" (hrajú náhodne, sú len na testovanie).

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

    npm test         testy: engine (pravidlá + náhodné partie), server (bezpečnosť, uloženie), web (logika hlasu)
    npm run test:voice   hlas: socket test signalizácie a Playwright s dvoma stránkami a falošným mikrofónom
    npm run build    zostaví web do apps/web/dist
    npm start        server na :3001, ktorý podáva aj zostavený web (jeden port)

## Hlas a chat

Chat (textový aj hlasový) je v hre vľavo dole pri stole, v lobby tiež; na telefóne je to tlačidlo v hlavičke a zásuvka.
Tlačidlo mikrofónu: prvé ťuknutie pripojí do hlasu, ďalšie stlmujú vlastný mikrofón. Každého hráča možno stlmiť zvlášť
(hlas aj chat), je tu „stlmiť všetkých“, posuvník hlasitosti a výber mikrofónu. Hlas je WebRTC mesh (zvuk ide priamo medzi
hráčmi, šifrovaný), server prenáša len signalizáciu. Mimo lokálnej siete treba TURN (premenné nižšie).

**iPhone / Safari (opravené v kóde, čaká na skúšku na reálnych telefónoch):** pôvodný problém bol, že prehrávanie záviselo od
pozastaveného `AudioContext` a obnovilo sa až po odchode z prehliadača. Teraz na iOS hrá priamy `<audio playsinline>`, každé
ťuknutie kontext odomkne, ak zvuk nejde, ukáže sa výzva „Klepni, aby si počul ostatných“, prehrávanie sa samo prepne na záložný
režim a po návrate z pozadia sa hlas pripojí znova sám. Posuvník hlasitosti sa na iOS nezobrazuje (iOS ho ignoruje), stlmenie funguje.

Diagnostika: pridaj k adrese `?voicedebug=1`, v paneli hlasu uvidíš stav `AudioContext`, prehrávača, režim prehrávania, typ
spojenia (`relay` alebo priame) a hladinu prichádzajúceho zvuku. Protokol skúšky na iPhone je v `docs/AUDIT.md`.

## Nasadenie a nastavenie (Render)

Build `npm install && npm run build`, štart `npm run start`. Premenné prostredia:

| Premenná | Na čo | Poznámka |
| --- | --- | --- |
| `TRUST_PROXY_HOPS=1` | správne IP za proxy Renderu | bez nej platia limity na IP pre všetkých naraz |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | trvalý stav miestností | bez nich miestnosti po uspatí zmiznú |
| `TURN_API_URL` (Metered) alebo `TURN_URL` + `TURN_SECRET` / `TURN_USER` + `TURN_PASS` | TURN relay pre hlas | bez neho sa cez mobilné siete hráči často nespoja |
| `RESPONSE_MS` | limit na reakciu (predvolene 8000, `0` = bez limitu) | |
| `RECONNECT_MS`, `LOBBY_GRACE_MS`, `JOIN_ASK_MS`, `RESTORE_GRACE_MS` | lehoty pri výpadku, v lobby, pri schvaľovaní pripojenia, po reštarte | predvolene 45 s, 10 min, 20 s, 150 s |
| `DATA_DIR` | súbor `rooms.json` (predvolene `.data`, prázdne = vypnuté) | |

Heslá a tokeny patria len do Render Environment, nikdy do kódu. Bezpečnosť: `claude/bezpecnost.md` v Projecte.

## Obrázky kariet

Server hľadá obrázky v priečinku `assets/cards` v projekte
(súbory `01_<kľúč>.webp`, napr. `01_bang.webp`). Inú cestu nastavíš premennou `CARDS_DIR`.
Ak obrázok chýba, vykreslí sa zástupná karta z design systému s názvom.
Portréty na tabuľkách hráčov sú výrezy z obrázkov postáv.

Obrázok je jeden na typ karty. Skutočnú farbu a hodnotu konkrétnej kópie ukazuje
biely štítok v ľavom dolnom rohu, ktorý prekrýva hodnotu natlačenú na obrázku.

Obrázky nie sú súčasťou projektu. Pôvodná grafika hry patrí vydavateľovi (dV Giochi);
pred verejným nasadením treba jeho súhlas alebo vlastnú grafiku.

## Štruktúra

    packages/engine   pravidlá hry, čistý TypeScript bez siete (data.ts, engine.ts, view.ts, bot.ts)
    apps/server       Node + Socket.IO: miestnosti, poradie príkazov, filtrovanie pohľadov
      src/index.ts    pripájanie a udalosti; types.ts, limits.ts (limity rýchlosti), turn.ts, security.ts, persist.ts
    apps/web          React + Vite: lobby a herný stôl
      src/ds/         kópia tokenov a štýlov BANG Saloon (tokens.css, bundle.css)
      src/styles.css  úpravy pre appku (rozmery kariet podľa obrázkov, rozloženie, animácie)
      src/geometry.ts rozmiestnenie stola a miest pre 4-7 hráčov (layout.md z design systému)
      src/App.tsx     stav a spojenie so serverom; Layout, Dialogs, LobbyScreen, Posters, appTypes sú z neho vyňaté
      src/voice.ts    WebRTC hlas (spojenia, prehrávanie, samoliečba); voiceCore.ts je čistá, testovaná logika
    tools/            Playwright a socket skripty (mobile-e2e, voice-e2e, voice-sock)

- Server je jediný, kto pozná celý stav. Každému hráčovi posiela len jeho pohľad
  (`viewFor`): cudzie karty v ruke, balíček ani skryté roly sa ku klientovi nedostanú.
- Príkazy sa spracúvajú po jednom a každý nesie číslo verzie stavu. Príkaz nad starým
  stavom alebo od hráča, na ktorého sa nečaká, server odmietne.
- Náhoda (miešanie, sejmutie) beží len na serveri.

## Čo je hotové a čo nie

Stav z auditu 17. 11. 2026 (podrobnosti, hodnotenie a body opráv: `docs/AUDIT.md`). tsc čistý vo všetkých balíčkoch,
testy 62 (engine) + 11 (server) + 14 (web) prechádzajú, plus `npm run test:voice`, `npm audit` 0 zraniteľností.

### Hotové

- Základná hra: všetkých 22 typov kariet (80 kariet), 16 postáv, roly, vzdialenosti a dostrel, reakcie mimo ťahu, odmeny a tresty,
  koniec hry, doplnenia z oficiálneho FAQ; balíček overený podľa fyzickej hry.
- Rozšírenie Gold Rush (nugety, 24 kariet vybavenia, 8 postáv) a variant Tieňoví pištoľníci.
- Výber rolí a postáv pexesom pred hrou, Panika! / Cat Balou z ruky (obeť zoradí alebo zamieša, útočník vyberie rubom),
  Jesse Jones berie prvú kartu len z ruky a vyberie si ľubovoľnú.
- Online: miestnosti s 6-písmenovým kódom, reconnect, odchod = bot, prenos zakladateľa, vyhodenie hráča, dodatočné pripojenie
  do rozohranej hry so schválením, trvalý stav miestností (Upstash / súbor), držanie miesta v lobby po prepnutí karty.
- Hlas a textový chat (viď vyššie) vrátane opráv pre iPhone (kód a emulácia, reálny iPhone neoverený), letiace karty, živé miešanie, rozloženia pre desktop, tablet a telefón (výška aj šírka).
- Bezpečnosť: whitelist a validácia príkazov, limity na IP, tokeny na disku len ako hash, TURN len pre 2+ ľudí.

### Kritické (treba pred hraním s kamarátmi na mobiloch)

1. **Hlas na iPhone**: oprava je v kóde (viď Hlas a chat), ale overená je len emuláciou. Treba skúšku na dvoch reálnych iPhonoch
   podľa protokolu v `docs/AUDIT.md`.
2. **TURN** na Renderi nie je overený: bez neho sa cez mobilné siete (CGNAT) hlasové spojenia často nezostavia.
3. **Upstash** na Renderi nie je overený: bez neho miestnosti po uspatí free inštancie zmiznú.
4. `TRUST_PROXY_HOPS=1` nastavené, účinok treba overiť z dvoch zariadení.

### Nekritické, ale otvorené

- Skúška na reálnych telefónoch (dotyk, podržanie, posun panelov, okno schvaľovania pripojenia).
- Animácie: modré karty z ruky pred hráča, kôpka nugetov pri Hokynárstve.
- Do rozbehnutej hry sa nedá pripojiť, ak nie je v hre živý bot (divák zatiaľ nie je). Boti hrajú len náhodne.
- Na iPhone nejde hlasitosť nad 100 % ani posuvník (iOS ignoruje hlasitosť prehrávača), funguje stlmenie.
- Chýba CI (automatický tsc, testy, build pri pushi), robíme ho spolu s majiteľom. Testy rozložení klienta sú len Playwright report.
- Veľké súbory: `App.tsx` ~1340 riadkov (z 1800), `server/index.ts` ~750 (z 860), `engine.ts` ~1260 nerozdelený (vyžaduje návrh, nie mechanický rez).
- Písma z Google Fonts (externá požiadavka), závislosti o 1 až 2 hlavné verzie za (React 18, Vite 5, Vitest 2, bez zraniteľností).
- Grafika kariet patrí vydavateľovi (dV Giochi): pred verejným šírením treba súhlas alebo vlastné ilustrácie.
- Ďalšie rozšírenia (Dodge City...) nie sú špecifikované.

### Zjednodušenia oproti stolovej hre

- Sejmutie (Barel, Väzenie, Dynamit) prebieha automaticky. Lucky Duke si automaticky berie lepšiu kartu.
- Hráč bez karty, ktorou by mohol odpovedať, dostane zásah hneď, bez pýtania.
- Poradie odhodenia kariet zabitého hráča je pevné (vyložené, potom ruka).
- Kartu nejde zahrať na seba (Panika!, Cat Balou).
- Gold Rush: zľava Pretty Luzeny sa uplatní automaticky na prvý nákup v ťahu, Kalumet rovno vyradí chránených hráčov z cieľov
  károvej karty, v hre je pevne 30 nugetov.
