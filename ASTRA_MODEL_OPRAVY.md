# BANG! Online – oprava schopnosti El Gringa

Pred opravou hra po zásahu sama vybrala náhodnú kartu z ruky útočníka a okamžite ju presunula El Gringovi. Po oprave si **El Gringo sám vyberá jednu zakrytú kartu z ruky útočníka za každý stratený život**. Na výber používa rovnaké rozhranie ako pri Panike.

## Ako prebieha zásah

1. Hra odpočíta životy. Ak El Gringo potrebuje záchranu, najprv sa vyhodnotí jej výsledok. Výber sa otvorí, keď El Gringo zranenie od iného hráča prežije a útočník má v ruke aspoň jednu kartu. Výbuch dynamitu schopnosť nespúšťa.
2. Ak má útočník v ruke viac kariet, môže ich poprehadzovať alebo zamiešať a potvrdiť poradie. El Gringo vidí iba ruby kariet. Vyložené karty sú mimo výberu.
3. El Gringo klikne na zakrytú kartu a tá sa presunie do jeho ruky. Ak stratil viac životov, vyberá postupne zo zostávajúcich kariet. Výber sa skončí po vyčerpaní počtu stratených životov alebo kariet v útočníkovej ruke.
4. Hra pokračuje tam, kde zásah nastal. Napríklad pri Guľomete sa útok na ďalšieho hráča vyhodnotí až po dokončení výberu.

Ak má útočník **jedinú kartu**, miešanie sa preskočí a El Gringo ju získa až kliknutím. Pri **prázdnej ruke** hra pokračuje hneď, aj keď má útočník pred sebou vyložené karty.

## Čo sa zmenilo v kóde

| Súbor | Úprava |
| --- | --- |
| [engine.ts](packages/engine/src/engine.ts) | Odstránil som automatické žrebovanie cez `randomFromHand`. Po zásahu hra použije existujúce kroky `arrange` na usporiadanie ruky a `steal` na výber podľa pozície. Počet dostupných výberov určuje menšia z dvoch hodnôt – počet stratených životov a počet kariet v ruke útočníka. |
| [view.ts](packages/engine/src/view.ts) | Pohľad hráča rozpoznáva El Gringa ako zdroj výberu. Rozhranie dostane počet zakrytých kariet a vie, komu patria. Ich identita zostáva pri výbere skrytá. |
| [App.tsx](apps/web/src/App.tsx) a [Posters.tsx](apps/web/src/Posters.tsx) | Výzvy na zamiešanie, čakanie a výber zobrazujú názov El Gringo. Pri jedinej karte text vysvetľuje, že útočník má v ruke už len túto kartu. |
| [data.ts](packages/engine/src/data.ts), [charactersData.ts](apps/web/src/charactersData.ts) a [i18nData.ts](apps/web/src/i18nData.ts) | Upravil som krátky aj podrobný opis schopnosti v slovenčine a angličtine. Texty vysvetľujú výber naslepo a podrobný opis spresňuje podmienku prežitia zásahu. |
| [engine.test.ts](packages/engine/test/engine.test.ts) | Pridal som štyri regresné testy pre výber po zásahu. |

## Overenie opravy

Nové testy overili tieto herné situácie.

- **Guľomet a viac kariet v ruke.** El Gringo najprv stratí život. Test overí utajenie identity karty, odmietnutie vyloženej karty pri usporiadaní aj výberu mimo rozsahu. Po kliknutí dostane presne kartu zo zvolenej pozície a Guľomet pokračuje na ďalšieho hráča.
- **Jediná karta.** Karta ostane útočníkovi v ruke až do výberu El Gringa.
- **Prázdna ruka.** Výber sa preskočí aj vtedy, keď má útočník na stole Hľadáčik.
- **Dva stratené životy.** El Gringo postupne vyberie dve rôzne karty. Druhýkrát vyberá už zo zmenšenej ruky.

Pri overení opravy prešlo všetkých **113 automatických testov** – 84 testov herného jadra, 15 servera a 14 webu (`npm.cmd test`). Produkčné zostavenie webu aj servera prebehlo úspešne (`npm.cmd run build`).
