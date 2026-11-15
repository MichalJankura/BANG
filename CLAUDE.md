# BANG! online

Webová verzia kartovej hry BANG! s rozšírením Gold Rush a variantom Tieňoví pištoľníci. TypeScript monorepo (npm workspaces). Nasadené na Render (free web service), repozitár GitHub MichalJankura/BANG.

## Pravidlá práce

- Odpovedaj po slovensky, stručne, bez emoji.
- V commitoch a pull requestoch nikdy nespomínaj AI ani Claude (žiadne Co-Authored-By, Generated with, odkazy na reláciu).
- Príkazy pre PowerShell vždy v jednom riadku.
- Väčšiu zmenu nerob bez zadania. Commituje a pushuje používateľ, ak nepovie inak.

## Príkazy

- `npm run dev` spustí server (:3001) aj web (:5173, Vite s proxy na `/socket.io` a `/cards`).
- `npm test` spustí testy enginu (45 testov vrátane fuzz partií, trvá asi 100 s).
- `npm run build` zostaví web do `apps/web/dist`. `npm start` spustí server, ktorý podáva aj zostavený web.
- Typecheck: `npx tsc -p . --noEmit` v `packages/engine`, `apps/server` a `apps/web`.
- Render: build `npm install && npm run build`, štart `npm run start`.
- Server ani web nemajú vlastné testy. `npm run test:mobile` sú Playwright screenshoty (výstup `docs/mobile-shots`, je v `.gitignore`).

## Mapa projektu

```
packages/engine/          čistá logika hry bez siete
  src/data.ts             typy kariet, postavy, roly, balíky, vybavenie Gold Rush
  src/engine.ts           stav, applyCommand, fronta úloh (run/exec), pending, setup, Gold Rush, tiene
  src/view.ts             viewFor a setupViewFor: pohľad hráča, jediné miesto, kde sa filtruje skrytá informácia
  src/bot.ts              náhodný bot (server aj fuzz testy)
  test/engine.test.ts     testy pravidiel a fuzz partie
apps/server/src/
  index.ts                HTTP, Socket.IO, miestnosti, časovače, boti, signalizácia hlasu a chatu
  security.ts             CSP a hlavičky, rate limity, IP klienta, honeypot, parseCmd, podpísaný token na obrázky
apps/web/src/
  net.ts                  socket, call() s ack a časovým limitom, token a meno v localStorage
  App.tsx                 routing cez hash, LobbyScreen, Game, plagáty, rozloženia phone/compact/wide
  Setup.tsx               výber rolí a postáv, FullscreenButton
  Home.tsx                úvod: prezývka, vytvorenie a pripojenie k stolu
  Table.tsx, Mobile.tsx   detail hráča, ruka, náhľad karty, Drawer, Countdown
  voice.ts                WebRTC mesh, Web Audio, hlasitosti, chat (stav mimo Reactu)
  VoiceDock.tsx           UI hlasu a chatu
  i18n.tsx, i18nData.ts   tr(sk, en), názvy a texty kariet, trErr (chyby servera), trLog (denník)
  Cards.tsx, Characters.tsx, GoldRush.tsx, Rules.tsx, RangeDemo.tsx   karty a stránky pravidiel
  device.ts, geometry.ts  rozloženie, wake lock, reconnect; geometria stola
  ds/tokens.css, ds/bundle.css   design systém BANG Saloon; ostatné .css sú štýly appky
assets/cards              obrázky kariet a rubov (webp), server ich podáva na /cards
assets/goldrush_cards     zdrojové png rozšírenia
tools/                    make-icons.mjs, mobile-e2e.mjs
```

## Tok dát

1. Klik v UI volá `send(cmd)`, to `sendCmd(view, cmd)` a emituje `cmd {version, cmd}` s ack.
2. Server: `socket.use` (whitelist udalostí a počtu argumentov `ARITY`, rate limity), potom `parseCmd` (tvar a limity polí).
3. Ak sa verzia stavu líši a príkaz nie je setup (`SETUP_COMMANDS`), server ho odmietne. Inak `applyCommand`: klonuje stav, overí pravidlá, `run()` vyčerpá frontu po najbližší `pending`, zvýši verziu.
4. `broadcast(room)` prepočíta časovače (`armResponse`, `armIdle`) a pošle každému `room` (lobby) a `view` (`setupViewFor` počas výberu, `viewFor` počas hry).
5. Boti a časovače (`scheduleBots`, `armIdle`, `armResponse`) volajú `applyCommand` priamo na serveri.
6. Lobby: `create`, `join`, `addBot`, `removeBot`, `kick`, `options`, `start`, `toLobby`, `leave`. Setup: súbežné `pickRole`, `pickChar`, `chooseChar` bez kontroly verzie.
7. Hlas: server len preposiela SDP (`voice`, `rtc`), zvuk ide priamo medzi hráčmi. Chat ide cez server, neukladá sa.

Miestnosti sú len v pamäti servera, reštart ich zmaže. Hráč sa identifikuje tajným tokenom z localStorage. Odpojeného hráča v rozohranej hre po `RECONNECT_MS` nahradí bot.

## Kde čo hľadať

| Ak sa mení | Pozri |
|---|---|
| pravidlá, karty, postavy, Gold Rush | `engine/data.ts`, `engine/engine.ts`, test, `i18nData.ts`, `Rules.tsx`, `GoldRush.tsx` |
| čo vidí hráč | `engine/view.ts`, `net.ts` (typy), `App.tsx` |
| boti | `engine/bot.ts`, `server/index.ts` (`scheduleBots`, `armIdle`) |
| miestnosti, odchody, kick, zakladateľ | `server/index.ts` (`depart`, `dropAbsent`, `attach`, `disconnect`), `App.tsx` (`onNotice`, `LobbyScreen`) |
| hlas a chat | `server/index.ts` (`voice`, `rtc`, `chat`, `iceServers`), `voice.ts`, `VoiceDock.tsx`, `voice.css` |
| texty a preklady | `i18nData.ts`, `i18n.tsx`, `tr()` v komponentoch; nová chybová hláška servera patrí aj do `ERR` |
| štýly | `ds/*.css`, `styles.css`, `game.css`, `table.css`, `mobile.css`, `goldrush.css`, `voice.css` |
| bezpečnosť a limity | `server/security.ts`, limity v `server/index.ts`, honeypot v `Home.tsx` |
| nasadenie | skripty v `package.json`, premenné prostredia nižšie |

## Premenné prostredia servera

- `PORT`, `CARDS_DIR`, `MIN_PLAYERS`, `BOT_DELAY`, `RESPONSE_MS`, `IDLE_MS`, `RECONNECT_MS`, `MAX_ROOMS`, `MAX_SOCKETS_PER_IP`, `ALLOWED_ORIGINS`.
- `TRUST_PROXY_HOPS`: počet proxy pred serverom. Na Renderi (premenná `RENDER`) je predvolená 3, lebo `X-Forwarded-For` tam má 3 záznamy (klient, okrajový server, vnútorný balancer).
- `COOKIE_SECRET`: tajomstvo na podpis tokenu pre obrázky. Bez neho sa tokeny po reštarte zneplatnia.
- `TURN_URL`, `TURN_USER`, `TURN_PASS` alebo `TURN_API_URL`: relay pre hlas.
- `HTTPS=1`: vynúti správanie ako za TLS.

## Na čo si dať pozor

- Chybové hlášky enginu a servera sú po slovensky a klient ich prekladá cez mapu `ERR` podľa presného textu.
- `mobile.css` sa načítava pred `table.css` a `goldrush.css`, poradie importov je v `main.tsx`.
- Server blokuje User-Agenty botov (aj `curl`), pri ručnom teste treba hlavičku prehliadača.
- Vo `voice.ts` si zvukový kanál vytvára len ten, kto posiela ponuku. Odpovedajúci si ho berie z ponuky (`makePeer(id, offerer)`).
