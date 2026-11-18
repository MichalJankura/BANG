import { RateLimiter } from './security.js';

/** Vsetky limity rychlosti na jednom mieste (na IP, na socket, na token). Hodnoty a ich dovody su pri jednotlivych riadkoch. */
export const httpLimit = new RateLimiter(300, 60_000);
export const assetLimit = new RateLimiter(120, 60_000);
export const rankAssetLimit = new RateLimiter(300, 60_000);  // odznaky hodnosti (13 malych suborov, prehliadac ich cachuje na den)
export const anonAssetLimit = new RateLimiter(40, 60_000);      // obrazky bez platneho tokenu (bot bez cookie)
export const tokenAssetLimit = new RateLimiter(600, 3_600_000); // obrazky na jeden token, bez ohladu na rotaciu IP
export const handshakeLimit = new RateLimiter(40, 60_000);    // nove spojenia na IP (engine.io handshake)
export const eventLimit = new RateLimiter(40, 10_000);     // vsetky udalosti jedneho socketu
export const ipEventLimit = new RateLimiter(120, 10_000);   // vsetky udalosti z jednej IP (reconnect nuluje limit socketu)
export const rtcLimit = new RateLimiter(90, 10_000);       // WebRTC signalizacia na jeden socket (ponuka + odpoved na kazdeho spoluhraca)
export const rtcIpLimit = new RateLimiter(500, 10_000);    // ... a na IP (cela partia moze sediet za jednou domacou IP)
export const chatLimit = new RateLimiter(8, 10_000);       // textove spravy na jeden socket
export const chatIpLimit = new RateLimiter(60, 10_000);
export const createLimit = new RateLimiter(5, 60_000);     // zakladanie miestnosti na IP
export const turnLimit = new RateLimiter(60, 3_600_000);    // vydanie TURN udajov na IP za hodinu (cela partia moze sediet za jednou IP)
export const joinLimit = new RateLimiter(12, 60_000);      // hadanie kodov miestnosti na IP (anti brute-force)
export const TOO_MANY = 'Príliš veľa požiadaviek, skús o chvíľu';
