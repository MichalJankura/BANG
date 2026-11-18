# BANG! Online – prehľad opráv

## El Gringo

Pred opravou hra po zásahu sama vybrala náhodnú kartu z ruky útočníka a okamžite ju presunula El Gringovi. Po oprave si **El Gringo sám vyberá jednu zakrytú kartu z ruky útočníka za každý stratený život**. Na výber používa rovnaké rozhranie ako pri Panike.

### Ako prebieha zásah

1. Výber sa otvorí iba vtedy, keď El Gringo skutočne stratí život po zásahu od iného hráča, zásah prežije a útočník má v ruke aspoň jednu kartu. Ak sa výstrelu vyhne kartou Vedľa! alebo úspešným Barelom, žiadnu kartu si neberie. Pri smrteľnom zásahu sa najprv vyhodnotí záchrana. Výbuch dynamitu schopnosť nespúšťa.
2. Ak má útočník v ruke viac kariet, môže ich poprehadzovať alebo zamiešať a potvrdiť poradie. El Gringo vidí iba ruby kariet. Vyložené karty sú mimo výberu.
3. El Gringo klikne na zakrytú kartu a tá sa presunie do jeho ruky. Ak stratil viac životov, vyberá postupne zo zostávajúcich kariet. Výber sa skončí po vyčerpaní počtu stratených životov alebo kariet v útočníkovej ruke.
4. Hra pokračuje tam, kde zásah nastal. Napríklad pri Guľomete sa útok na ďalšieho hráča vyhodnotí až po dokončení výberu.

Ak má útočník **jedinú kartu**, miešanie sa preskočí a El Gringo ju získa až kliknutím. Pri **prázdnej ruke** hra pokračuje hneď, aj keď má útočník pred sebou vyložené karty.

### Čo sa zmenilo v kóde

| Súbor | Úprava |
| --- | --- |
| [engine.ts](packages/engine/src/engine.ts) | Odstránil som automatické žrebovanie cez `randomFromHand`. Po zásahu hra použije existujúce kroky `arrange` na usporiadanie ruky a `steal` na výber podľa pozície. Počet dostupných výberov určuje menšia z dvoch hodnôt – počet stratených životov a počet kariet v ruke útočníka. |
| [view.ts](packages/engine/src/view.ts) | Pohľad hráča rozpoznáva El Gringa ako zdroj výberu. Rozhranie dostane počet zakrytých kariet a vie, komu patria. Ich identita zostáva pri výbere skrytá. |
| [App.tsx](apps/web/src/App.tsx) a [Posters.tsx](apps/web/src/Posters.tsx) | Výzvy na zamiešanie, čakanie a výber zobrazujú názov El Gringo. Pri jedinej karte text vysvetľuje, že útočník má v ruke už len túto kartu. |
| [data.ts](packages/engine/src/data.ts), [charactersData.ts](apps/web/src/charactersData.ts) a [i18nData.ts](apps/web/src/i18nData.ts) | Upravil som krátky aj podrobný opis schopnosti v slovenčine a angličtine. Texty vysvetľujú výber naslepo a podrobný opis spresňuje podmienku prežitia zásahu. |
| [engine.test.ts](packages/engine/test/engine.test.ts) | Päť regresných testov overuje úspešnú obranu aj výber po zásahu. |

### Overenie opravy

Nové testy overili tieto herné situácie.

- **Úspešné Vedľa!** Kým El Gringo čaká na obranu, hra odmietne pokus vziať kartu. Po úspešnej obrane má pôvodný počet životov a útočníkovi ostáva karta v ruke.
- **Guľomet a viac kariet v ruke.** El Gringo najprv stratí život. Test overí utajenie identity karty, odmietnutie vyloženej karty pri usporiadaní aj výberu mimo rozsahu. Po kliknutí dostane presne kartu zo zvolenej pozície a Guľomet pokračuje na ďalšieho hráča.
- **Jediná karta.** Karta ostane útočníkovi v ruke až do výberu El Gringa.
- **Prázdna ruka.** Výber sa preskočí aj vtedy, keď má útočník na stole Hľadáčik.
- **Dva stratené životy.** El Gringo postupne vyberie dve rôzne karty. Druhýkrát vyberá už zo zmenšenej ruky.

Pri pôvodnom overení opravy prešlo všetkých **113 automatických testov** (`npm.cmd test`) aj produkčné zostavenie webu a servera (`npm.cmd run build`). Po doplnení prípadu úspešnej obrany prešlo všetkých päť testov El Gringa.

## Hlasový chat na iPhone a návrat k stolu

Testerka hlásila prerušenie spojenia po zapnutí mikrofónu. V prehliadačovom teste sa podarilo zachytiť stav, keď sa hráčka vrátila k stolu a hlasové spojenie sa javilo ako aktívne, ale zvuk druhého hráča k nej neprichádzal.

- **Obojsmerný zvuk.** Pri priamom hovore WebRTC teraz odpovedajúci hráč pripojí svoj mikrofón na zvukový kanál z prijatej ponuky. Prehliadač tiež znova skúsi spustiť prehrávanie, keď vzdialená zvuková stopa začne dodávať zvuk. [Implementácia hovoru](apps/web/src/voice.ts)
- **Výpadok pri povoľovaní mikrofónu.** Po návrate k stolu hra obnoví aj rozpracované pripojenie hlasu. Ak prehliadač medzitým dokončí starú žiadosť o mikrofón, hra uvoľní jej stopu. Vlastné stlmenie sa pri automatickom návrate zachová. Žiadosť o pripojenie hlasu má časový limit a dá sa zopakovať. [Správa hlasu](apps/web/src/voice.ts)
- **Spojenie so serverom.** Server prijíma dlhšie hlasové ponuky a odpovede. Klient pred odoslaním kontroluje ich veľkosť, aby príliš veľká hlasová správa neprerušila spojenie s hrou. Opakované prihlásenie k tomu istému stolu z už pripojeného spojenia hráča neodpojí. [Server](apps/server/src/index.ts)
- **Hlas cez službu Stream.** Miestnosť oznámi poskytovateľa hlasu vopred, takže mikrofón otvára priamo Stream. Pri zablokovanom prehrávaní môže hráč klepnutím obnoviť zvuk. Tlačidlo na opakovanie pripojenia funguje aj pre tento režim. [Prehrávanie cez Stream](apps/web/src/voiceStream.ts)
- **Ovládanie pri výpadku.** Pri strate spojenia s hrou je dostupné tlačidlo **Pripojiť sa znova**. Ak sa zároveň obnovuje hlas, hráč môže zvoliť **Pokračovať bez hlasu** a zostať pri stole. [Herná obrazovka](apps/web/src/App.tsx) a [ovládanie hlasu](apps/web/src/VoiceDock.tsx)

**Overenie.** Playwright s dvoma prehliadačmi Chromium, mobilným rozložením iPhonu a simulovanými mikrofónmi overil prerušenie počas povoľovania mikrofónu, návrat k rovnakému stolu a príjem zvukových paketov na oboch stranách bez stlmenia spoluhráča. Samostatný test overil obnovu prehrávania a stlmenie so simulovaným rozhraním Stream. Skúška na fyzickom iPhone a živý hovor cez službu Stream zostávajú neoverené. [Prehliadačový test](tools/voice-e2e.mjs) a [test ovládania Stream](apps/web/test/voiceStream.test.ts)
