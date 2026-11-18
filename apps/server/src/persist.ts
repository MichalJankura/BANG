import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Badge, RankedMatch } from './types.js';

/**
 * Trvaly stav miestnosti. Render (free) uspi proces po necinnosti a pri kazdom restarte zmaze lokalny disk,
 * preto sa stav uklada na dve miesta: do suboru v DATA_DIR (prezije pad procesu) a, ak su nastavene
 * UPSTASH_REDIS_REST_URL a UPSTASH_REDIS_REST_TOKEN, aj do Upstash Redis (prezije aj uspatie a redeploy).
 * Bez nastaveneho uloziska sa hra sprava ako doteraz (miestnosti ostavaju len v pamati).
 */

/** `th` = SHA-256 tokenu hraca (novy format). `token` je len zo starych snimkov, pri obnove sa premeni na hash. */
export interface SavedMember { id: string; th?: string; token?: string; name: string; bot: boolean; acct?: string; badge?: Badge }
export interface SavedRoom {
  code: string;
  host: string;
  opts: { goldRush: boolean; shadows: boolean };
  kicked: string[];
  touched: number;
  members: SavedMember[];
  /** stav hry (cisty JSON z enginu), alebo null v lobby */
  state: unknown | null;
  ranked?: boolean;
  match?: RankedMatch | null;
}
export interface Snapshot { v: 1; savedAt: number; rooms: SavedRoom[] }

export interface Store {
  readonly name: string;
  load(): Promise<string | null>;
  save(data: string): Promise<void>;
}

const KEY = process.env.PERSIST_KEY ?? 'bang:rooms';
const TTL_S = 24 * 3600;

export function fileStore(dir: string): Store {
  const file = path.join(dir, 'rooms.json');
  return {
    name: `subor ${file}`,
    async load() { try { return readFileSync(file, 'utf8'); } catch { return null; } },
    async save(data) {
      mkdirSync(dir, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      writeFileSync(tmp, data);
      renameSync(tmp, file);
    },
  };
}

export function upstashStore(url: string, token: string): Store {
  const call = async (cmd: unknown[]): Promise<unknown> => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Upstash ${res.status}`);
    const j = (await res.json()) as { result?: unknown; error?: string };
    if (j.error) throw new Error(j.error);
    return j.result;
  };
  return {
    name: 'Upstash Redis',
    async load() { const r = await call(['GET', KEY]); return typeof r === 'string' ? r : null; },
    async save(data) { await call(['SET', KEY, data, 'EX', String(TTL_S)]); },
  };
}

/** Ulozisko podla prostredia. Prazdny zoznam = trvale ulozenie je vypnute. */
export function storesFromEnv(env: NodeJS.ProcessEnv = process.env): Store[] {
  const out: Store[] = [];
  const url = env.UPSTASH_REDIS_REST_URL, tok = env.UPSTASH_REDIS_REST_TOKEN;
  if (url && tok) out.push(upstashStore(url, tok));
  if (env.DATA_DIR !== '') out.push(fileStore(path.resolve(env.DATA_DIR ?? '.data')));
  return out;
}

export function parseSnapshot(raw: string | null): Snapshot | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as Snapshot;
    if (j?.v !== 1 || !Array.isArray(j.rooms)) return null;
    const rooms = j.rooms.filter(r => r && typeof r.code === 'string' && Array.isArray(r.members) && r.members.every(m => m && typeof m.id === 'string' && typeof m.name === 'string'));
    return { v: 1, savedAt: Number(j.savedAt) || 0, rooms };
  } catch { return null; }
}

/** Nacita najnovsi snimok zo vsetkych uloziek (chyba jedneho ulozka nevadi). */
export async function loadLatest(stores: Store[]): Promise<Snapshot | null> {
  let best: Snapshot | null = null;
  for (const s of stores) {
    try {
      const snap = parseSnapshot(await s.load());
      if (snap && (!best || snap.savedAt > best.savedAt)) best = snap;
    } catch (e) { console.error(`Nacitanie z ulozka (${s.name}) zlyhalo:`, (e as Error).message); }
  }
  return best;
}

/** Odlozeny zapis: viac zmien za sebou sa zlozi do jedneho ulozenia. */
export function makeSaver(stores: Store[], snapshot: () => Snapshot, delayMs = 1500) {
  let timer: NodeJS.Timeout | null = null;
  let running: Promise<void> = Promise.resolve();
  let last = '';
  const run = () => {
    timer = null;
    const data = JSON.stringify(snapshot());
    running = running.then(async () => {
      // porovnanie bez casu: nemenny stav sa znova neuklada
      const sig = data.replace(/"savedAt":\d+/, '');
      if (sig === last) return;
      last = sig;
      for (const s of stores) {
        try { await s.save(data); } catch (e) { console.error(`Ulozenie (${s.name}) zlyhalo:`, (e as Error).message); }
      }
    });
    return running;
  };
  return {
    schedule() { if (!stores.length || timer) return; timer = setTimeout(run, delayMs); timer.unref?.(); },
    /** hned a pockaj (pri vypnuti procesu) */
    async flush() { if (!stores.length) return; if (timer) clearTimeout(timer); await run(); },
  };
}
