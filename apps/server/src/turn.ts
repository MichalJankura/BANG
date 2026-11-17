import { restTurnCredentials } from './security.js';

/**
 * STUN (verejny) a volitelny TURN z prostredia. TURN treba, ak sa hraci kvoli prisnej sieti (mobilne data, firemne NAT) nevedia spojit priamo:
 *  - TURN_URL=turn:host:3478[,turns:host:5349], TURN_USER, TURN_PASS (staticke udaje, napr. ExpressTURN)
 *  - TURN_API_URL=https://<app>.metered.live/api/v1/turn/credentials?apiKey=... (vrati pole iceServers, napr. Metered Open Relay)
 */
let iceCache: { at: number; list: object[] } | null = null;
let iceFailAt = 0;
let iceInflight: Promise<void> | null = null;
/** Nacita TURN zoznam z API najviac raz za 10 minut, naraz jedno volanie, po zlyhani 30 s pauza (nikto nemoze API zahltit spamom udalosti `voice`). */
function loadTurnApi(api: string): Promise<void> {
  if (iceCache && Date.now() - iceCache.at < 600_000) return Promise.resolve();
  if (Date.now() - iceFailAt < 30_000) return Promise.resolve();
  iceInflight ??= (async () => {
    try {
      const r = await fetch(api, { signal: AbortSignal.timeout(4000) });
      const j = await r.json();
      if (!Array.isArray(j)) throw new Error('odpoved nie je zoznam');
      iceCache = { at: Date.now(), list: j.filter(x => x && typeof x === 'object').slice(0, 10) };
    } catch (e) {
      iceFailAt = Date.now();
      console.error('TURN_API_URL:', (e as Error).message);
    } finally { iceInflight = null; }
  })();
  return iceInflight;
}
/**
 * Zoznam ICE serverov. STUN je verejny a ide vzdy; TURN (prihlasovacie udaje, na ktore sa uctuje prenos) len ked `withTurn`
 * (viď handler `voice`). TURN_SECRET + TURN_URL dava kratkodobe udaje (1 h), staticke TURN_USER/TURN_PASS ostavaju ako zaloha.
 */
export async function iceServers(withTurn: boolean): Promise<object[]> {
  const list: object[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
  if (!withTurn) return list;
  const url = process.env.TURN_URL;
  if (url) {
    const urls = url.split(',').map(x => x.trim()).filter(Boolean);
    const secret = process.env.TURN_SECRET;
    list.push(secret
      ? { urls, ...restTurnCredentials(secret) }
      : { urls, username: process.env.TURN_USER ?? '', credential: process.env.TURN_PASS ?? '' });
  }
  const api = process.env.TURN_API_URL;
  if (api) {
    await loadTurnApi(api);
    if (iceCache) list.push(...iceCache.list);
  }
  return list;
}
