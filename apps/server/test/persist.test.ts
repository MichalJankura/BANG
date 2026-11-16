import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Snapshot, fileStore, loadLatest, makeSaver, parseSnapshot, storesFromEnv, upstashStore } from '../src/persist';
import { createGame, applyCommand, botCommand, setupActors } from '@bang/engine';

const snap = (savedAt: number, code = 'ABCD'): Snapshot => ({ v: 1, savedAt, rooms: [{ code, host: 'a', opts: { goldRush: false, shadows: false, bonus: true }, kicked: [], touched: savedAt, members: [{ id: 'a', token: 't', name: 'Anna', bot: false }], state: null }] });
const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(path.join(tmpdir(), 'bang-persist-')); dirs.push(d); return d; };
afterAll(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

/** Maly falosny Upstash REST: POST [prikaz, kluc, ...] */
async function fakeUpstash() {
  const kv = new Map<string, string>();
  const srv = createServer((req, res) => {
    let b = ''; req.on('data', c => (b += c));
    req.on('end', () => {
      if (req.headers.authorization !== 'Bearer secret') { res.writeHead(401).end('{}'); return; }
      const [cmd, key, val] = JSON.parse(b) as string[];
      if (cmd === 'SET') { kv.set(key, val); res.end(JSON.stringify({ result: 'OK' })); }
      else res.end(JSON.stringify({ result: kv.get(key) ?? null }));
    });
  });
  await new Promise<void>(r => srv.listen(0, r));
  const port = (srv.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}`, kv, close: () => srv.close() };
}

describe('trvaly stav miestnosti', () => {
  it('subor: ulozi a nacita rovnaky snimok', async () => {
    const s = fileStore(tmp());
    expect(await s.load()).toBeNull();
    await s.save(JSON.stringify(snap(5)));
    expect(parseSnapshot(await s.load())?.rooms[0].code).toBe('ABCD');
  });

  it('Upstash: SET/GET cez REST a zly token zlyha', async () => {
    const f = await fakeUpstash();
    try {
      const s = upstashStore(f.url, 'secret');
      await s.save(JSON.stringify(snap(7, 'WXYZ')));
      expect(parseSnapshot(await s.load())?.rooms[0].code).toBe('WXYZ');
      await expect(upstashStore(f.url, 'zly').load()).rejects.toThrow();
    } finally { f.close(); }
  });

  it('loadLatest vezme novsi snimok a prezije vypadnuty sklad', async () => {
    const f = await fakeUpstash();
    try {
      const file = fileStore(tmp());
      const up = upstashStore(f.url, 'secret');
      await file.save(JSON.stringify(snap(10, 'OLDX')));
      await up.save(JSON.stringify(snap(20, 'NEWX')));
      expect((await loadLatest([file, up]))?.rooms[0].code).toBe('NEWX');
      const broken = { name: 'rozbity', load: async () => { throw new Error('nic'); }, save: async () => {} };
      expect((await loadLatest([broken, file]))?.rooms[0].code).toBe('OLDX');
    } finally { f.close(); }
  });

  it('parseSnapshot odmietne smeti a vyhodi zle miestnosti', () => {
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot('{')).toBeNull();
    expect(parseSnapshot('{"v":2,"rooms":[]}')).toBeNull();
    const bad = JSON.stringify({ v: 1, savedAt: 1, rooms: [{ code: 'A' }, snap(1).rooms[0]] });
    expect(parseSnapshot(bad)?.rooms.length).toBe(1);
  });

  it('stav hry prejde cez JSON bez straty a hra pokracuje', () => {
    let s = createGame(Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `H${i}` })), 11, { bonus: true });
    while (s.setup) { const who = setupActors(s)[0]; s = applyCommand(s, who, botCommand(s, who)!); }
    const copy = JSON.parse(JSON.stringify(s));
    expect(copy).toEqual(s);
    const who = copy.pending ? copy.pending.player : copy.turn.player;
    const next = applyCommand(copy, who, botCommand(copy, who)!);
    expect(next.version).toBeGreaterThan(s.version);
  });

  it('makeSaver zlozi viac zmien do jedneho ulozenia a flush pocka', async () => {
    let writes = 0, n = 0;
    const store = { name: 't', load: async () => null, save: async () => { writes++; } };
    const sv = makeSaver([store], () => ({ ...snap(1), savedAt: Date.now(), rooms: snap(1).rooms.map(r => ({ ...r, touched: n })) }), 30);
    n = 1; sv.schedule(); n = 2; sv.schedule(); sv.schedule();
    await new Promise(r => setTimeout(r, 120));
    expect(writes).toBe(1);
    await sv.flush();                 // bez zmeny sa znova neuklada
    expect(writes).toBe(1);
    n = 3; await sv.flush();
    expect(writes).toBe(2);
  });

  it('storesFromEnv: bez Upstash je len subor, DATA_DIR="" ulozenie vypne', () => {
    expect(storesFromEnv({ DATA_DIR: '' }).length).toBe(0);
    expect(storesFromEnv({}).map(s => s.name).join()).toMatch(/subor/);
    expect(storesFromEnv({ UPSTASH_REDIS_REST_URL: 'http://x', UPSTASH_REDIS_REST_TOKEN: 't', DATA_DIR: '' }).map(s => s.name)).toEqual(['Upstash Redis']);
  });
});
