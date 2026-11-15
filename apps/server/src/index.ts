import { createServer } from 'node:http';
import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs';
import { randomBytes, randomInt } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, Socket } from 'socket.io';
import {
  RateLimiter, TOKEN_COOKIE, TRAP_PREFIX, ban, clientIp, cleanCode, cleanName, cookieOf, isBanned, isBotAgent, parseCmd, resolveInside, robotsTxt, safePath,
  securityHeaders, setTokenCookie, verifyToken,
} from './security.js';
import {
  Command, RuleError, SETUP_COMMANDS, State, actor, applyCommand, botCommand, createGame, eligible, setupActors, setupViewFor, viewFor,
} from '@bang/engine';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3001);
/** Slozka s obrazky karet (01_<klic>.webp). Vychozi: assets/cards v projekte. */
const CARDS_DIR = path.resolve(process.env.CARDS_DIR ?? path.join(here, '../../../assets/cards'));
const WEB_DIST = path.resolve(here, '../../web/dist');
const MIN_PLAYERS = Number(process.env.MIN_PLAYERS ?? 4);
const BOT_DELAY = Number(process.env.BOT_DELAY ?? 900);
/** Cas na reakciu (Vedla!, Indiani!, Duel, smrtelny zasah). 0 = bez limitu. */
const RESPONSE_MS = Number(process.env.RESPONSE_MS ?? 8000);
const REACTIONS = new Set(['bang', 'indians', 'duel', 'lethal', 'arrange']);

interface Member {
  id: string;        // verejne id (vidi ho vsichni)
  token: string;     // tajny token hrace, nikdy se neposila ostatnim
  name: string;
  bot: boolean;
  socket: Socket | null;
}

interface Room {
  code: string;
  host: string;
  members: Member[];
  state: State | null;
  /** cas poslednej aktivity (na upratovanie) */
  touched: number;
  botTimer: NodeJS.Timeout | null;
  /** casovac neaktivneho cloveka (AFK) */
  idle: NodeJS.Timeout | null;
  /** bezici odpocet reakcie pre konkretnu verziu stavu */
  resp: { version: number; at: number; timer: NodeJS.Timeout } | null;
  /** volby dalsej hry: rozsirenie Gold Rush a variant tienov */
  opts: { goldRush: boolean; shadows: boolean };
}

const rooms = new Map<string, Room>();

function dispose(r: Room) {
  if (r.botTimer) clearTimeout(r.botTimer);
  if (r.resp) clearTimeout(r.resp.timer);
  if (r.idle) clearTimeout(r.idle);
  rooms.delete(r.code);
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json',
};

const REAL_ROOTS = new Map<string, string>();
/** Skutocna cesta (po rozbaleni symlinkov) musi ostat v priecinku, inak sa subor nepodava. */
function inside(root: string, file: string): boolean {
  try {
    let r = REAL_ROOTS.get(root);
    if (!r) { r = realpathSync(root); REAL_ROOTS.set(root, r); }
    const real = realpathSync(file);
    return real === r || real.startsWith(r + path.sep);
  } catch { return false; }
}

function sendFile(res: import('node:http').ServerResponse, file: string, cache = 'max-age=3600') {
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': cache });
  createReadStream(file).on('error', () => res.destroy()).pipe(res);
}

function deny(res: import('node:http').ServerResponse, code: number, text = '') {
  if (!res.headersSent) res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(text);
}

const httpLimit = new RateLimiter(300, 60_000);
const assetLimit = new RateLimiter(120, 60_000);
const anonAssetLimit = new RateLimiter(40, 60_000);      // obrazky bez platneho tokenu (bot bez cookie)
const tokenAssetLimit = new RateLimiter(600, 3_600_000); // obrazky na jeden token, bez ohladu na rotaciu IP
/** Povolene Origin hlavicky navyse k tomu istemu hostu (ALLOWED_ORIGINS=https://hra.example,https://www.hra.example). */
const ALLOWED_ORIGINS = new Set((process.env.ALLOWED_ORIGINS ?? '').split(',').map(x => x.trim()).filter(Boolean));

const http = createServer((req, res) => {
  try {
    securityHeaders(req, res);
    const ip = clientIp(req);
    if (req.method !== 'GET' && req.method !== 'HEAD') return deny(res, 405);
    const url = safePath(req.url);
    if (url === null) return deny(res, 400, 'Bad request');
    if (isBanned(ip)) return deny(res, 403);
    if (!httpLimit.take(ip)) { res.setHeader('Retry-After', '60'); return deny(res, 429, 'Too many requests'); }

    // Honeypot: odkaz je v HTML skryty, navstivi ho iba bot, ktory nerespektuje robots.txt.
    if (url.startsWith(TRAP_PREFIX)) { ban(ip); return deny(res, 410); }
    if (url === '/robots.txt') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(robotsTxt()); }
    if (url.startsWith('/socket.io')) return deny(res, 404);

    const agent = String(req.headers['user-agent'] ?? '');
    if (isBotAgent(agent)) return deny(res, 403, 'Forbidden');

    if (url.startsWith('/cards/')) {
      // Cross-site nacitanie (hotlinking, cudzia stranka) sa odmietne; limity su tvrdsie bez platneho tokenu relacie.
      if (req.headers['sec-fetch-site'] === 'cross-site') return deny(res, 403);
      const tok = verifyToken(cookieOf(req, TOKEN_COOKIE), agent);
      const ok = tok ? tokenAssetLimit.take(tok) && assetLimit.take(ip) : anonAssetLimit.take(ip);
      if (!ok) { res.setHeader('Retry-After', '60'); return deny(res, 429, 'Too many requests'); }
      const name = path.posix.basename(url);
      const file = /^[\w-]+\.webp$/.test(name) ? resolveInside(CARDS_DIR, name) : null;
      if (file && existsSync(file) && statSync(file).isFile() && inside(CARDS_DIR, file)) return sendFile(res, file);
      return deny(res, 404);
    }
    // Produkcni rezim: server podava i sestaveny web (npm run build).
    if (existsSync(WEB_DIST)) {
      const file = url === '/' ? null : resolveInside(WEB_DIST, url);
      if (file && existsSync(file) && statSync(file).isFile() && inside(WEB_DIST, file)) return sendFile(res, file);
      // Web pouziva hash routing, takze index.html patri len na "/" a "/index.html". Ostatne cesty su 404
      // (ziadny "soft 404", ziadne sondovanie /.env, /admin a pod.).
      if (url !== '/' && url !== '/index.html') return deny(res, 404);
      // HTML sa necachuje a pri kazdom nacitani vyda cerstvy podpisany token relacie.
      setTokenCookie(req, res, agent);
      return sendFile(res, path.join(WEB_DIST, 'index.html'), 'no-store');
    }
    deny(res, 404, 'BANG! server bezi. Web spusti cez "npm run dev".');
  } catch (e) {
    console.error('HTTP chyba:', e);
    deny(res, 500, 'Internal error');
  }
});
http.on('clientError', (_e, socket) => { socket.destroy(); });
http.headersTimeout = 15_000;
http.requestTimeout = 30_000;

const io = new Server(http, {
  // Ziadne CORS ako predtym (origin: true) a kontrola Origin pri WebSockete, aby sa cudzia stranka nemohla pripojit.
  maxHttpBufferSize: 10_000,
  pingTimeout: 20_000,
  allowRequest: (req, cb) => {
    const origin = req.headers.origin;
    const hip = clientIp(req);
    if (isBanned(hip)) return cb('banned', false);
    if (!handshakeLimit.take(hip)) return cb('rate', false);
    if (!origin) return cb(null, true);
    try { cb(null, new URL(origin).host === req.headers.host || ALLOWED_ORIGINS.has(origin)); } catch { cb(null, false); }
  },
});

const handshakeLimit = new RateLimiter(40, 60_000);    // nove spojenia na IP (engine.io handshake)
const MAX_ROOMS = Number(process.env.MAX_ROOMS ?? 200);
const MAX_SOCKETS_PER_IP = Number(process.env.MAX_SOCKETS_PER_IP ?? 12);
const ROOM_IDLE_MS = 6 * 3_600_000;
const sockPerIp = new Map<string, number>();
const eventLimit = new RateLimiter(40, 10_000);
const ipEventLimit = new RateLimiter(120, 10_000);   // vsetky udalosti z jednej IP (reconnect nuluje limit socketu)     // vsetky udalosti jedneho socketu
const createLimit = new RateLimiter(5, 60_000);     // zakladanie miestnosti na IP
const joinLimit = new RateLimiter(12, 60_000);      // hadanie kodov miestnosti na IP (anti brute-force)
const TOO_MANY = 'Príliš veľa požiadaviek, skús o chvíľu';

// Upratovanie: miestnosti bez aktivity sa po case zmazu (inak by sa hromadili v pamati).
setInterval(() => {
  const t = Date.now();
  for (const [code, r] of rooms) {
    if (t - r.touched > ROOM_IDLE_MS && !r.members.some(m => m.socket)) dispose(r);
  }
}, 600_000).unref();

const fieldOf = (d: unknown, k: string): unknown => (d && typeof d === 'object' ? (d as Record<string, unknown>)[k] : typeof d === 'string' && k === 'name' ? d : undefined);
/** Skryte pole formulara ("website") vyplnaju len boty. */
const trapped = (d: unknown) => d !== null && typeof d === 'object' && typeof (d as Record<string, unknown>).hp === 'string' && (d as Record<string, string>).hp.length > 0;
/** Dve mena v miestnosti nesmu byt rovnake (inak sa da vydavat za ineho hraca). */
function uniqueName(r: Room, name: string): string {
  const taken = new Set(r.members.map(m => m.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let i = 2; i < 10; i++) { const n = `${name.slice(0, 13)} ${i}`; if (!taken.has(n.toLowerCase())) return n; }
  return `${name.slice(0, 11)} ${randomInt(100, 999)}`;
}

function newCode(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    const code = Array.from({ length: 4 }, () => abc[randomInt(abc.length)]).join('');
    if (!rooms.has(code)) return code;
  }
}

/**
 * Ak sa caka na reakciu cloveka, spusti odpocet. Po vyprsani server odpovie za neho:
 * pri smrtelnom zasahu zahra Pivo, ak ho ma, inak prijme zasah.
 */
function armResponse(room: Room) {
  const s = room.state;
  const pd = s?.pending;
  const human = pd && room.members.find(m => m.id === pd.player && !m.bot);
  if (!s || !pd || s.winner || !human || !REACTIONS.has(pd.kind) || RESPONSE_MS <= 0) {
    if (room.resp) { clearTimeout(room.resp.timer); room.resp = null; }
    return;
  }
  if (room.resp?.version === s.version) return;
  if (room.resp) clearTimeout(room.resp.timer);
  const version = s.version;
  const timer = setTimeout(() => {
    room.resp = null;
    const cur = room.state;
    if (!cur || cur.version !== version || !cur.pending) return;
    const who = cur.pending.player;
    const beer = cur.pending.kind === 'lethal' ? eligible(cur, who)[0] : undefined;
    const cmd: Command = cur.pending.kind === 'arrange' ? { type: 'arrange', shuffle: true }
      : beer !== undefined ? { type: 'respond', cardId: beer } : { type: 'pass' };
    try { room.state = applyCommand(cur, who, cmd); } catch (e) { console.error('Odpocet: neplatny tah', e); return; }
    broadcast(room);
  }, RESPONSE_MS + 500);
  room.resp = { version, at: Date.now() + RESPONSE_MS, timer };
}

const IDLE_MS = Number(process.env.IDLE_MS ?? 90_000);

/**
 * Neaktivny clovek by zablokoval celu hru (aj naschval). Ak sa po IDLE_MS nepohne, jeho tah za neho
 * odohra rovnaky nahodny bot ako pri botoch. IDLE_MS=0 to vypne.
 */
function armIdle(room: Room) {
  if (room.idle) { clearTimeout(room.idle); room.idle = null; }
  const s = room.state;
  if (!s || s.winner || IDLE_MS <= 0) return;
  const who = (st: State) => (st.setup ? setupActors(st) : [actor(st)]).filter((x): x is string => !!x);
  if (!room.members.some(m => !m.bot && m.socket && who(s).includes(m.id))) return;
  const version = s.version;
  room.idle = setTimeout(() => {
    room.idle = null;
    const cur = room.state;
    if (!cur || cur.version !== version || cur.winner) return;
    for (const id of who(cur)) {
      const m = room.members.find(x => x.id === id && !x.bot);
      if (!m || !room.state) continue;
      const cmd = botCommand(room.state, id);
      if (!cmd) continue;
      try { room.state = applyCommand(room.state, id, cmd); } catch (e) { console.error('AFK: neplatny tah', (e as Error).message); }
    }
    broadcast(room);
  }, cur_ms(s));
}
const cur_ms = (s: State) => (s.setup ? Math.min(IDLE_MS, 60_000) : IDLE_MS);

function broadcast(room: Room) {
  room.touched = Date.now();
  armResponse(room);
  armIdle(room);
  const lobby = {
    code: room.code,
    host: room.host,
    started: !!room.state,
    minPlayers: MIN_PLAYERS,
    opts: room.opts,
    players: room.members.map(m => ({ id: m.id, name: m.name, bot: m.bot, connected: m.bot || !!m.socket })),
  };
  for (const m of room.members) {
    if (!m.socket) continue;
    m.socket.emit('room', { ...lobby, me: m.id });
    const resp = room.resp ? { responseMs: Math.max(0, room.resp.at - Date.now()), responseTotal: RESPONSE_MS } : {};
    const st = room.state;
    m.socket.emit('view', !st ? null : st.setup ? setupViewFor(st, m.id) : { ...viewFor(st, m.id), ...resp });
  }
  scheduleBots(room);
}

/** Boti tahnou se zpozdenim, aby slo hru sledovat. */
function scheduleBots(room: Room) {
  if (room.botTimer || !room.state || room.state.winner) return;
  // Pocas vyberu rol a postav moze tahat ktorykolvek bot, ktory este nevybral.
  const candidates = room.state.setup ? setupActors(room.state) : [actor(room.state)];
  const m = room.members.find(x => x.bot && candidates.includes(x.id));
  if (!m) return;
  room.botTimer = setTimeout(() => {
    room.botTimer = null;
    if (!room.state) return;
    const cmd = botCommand(room.state, m.id);
    if (cmd) {
      try { room.state = applyCommand(room.state, m.id, cmd); }
      catch (e) { console.error('Bot: neplatny tah', cmd, e); return; }
    }
    broadcast(room);
  }, room.state.setup ? Math.min(BOT_DELAY, 450) : BOT_DELAY);
}

io.on('connection', socket => {
  const ip = clientIp(socket.request);
  const token = String(socket.handshake.auth?.token ?? '');
  if (!/^[0-9a-f]{32}$/.test(token)) { socket.disconnect(); return; }
  const open = (sockPerIp.get(ip) ?? 0) + 1;
  if (open > MAX_SOCKETS_PER_IP || isBanned(ip)) { socket.disconnect(); return; }
  sockPerIp.set(ip, open);
  socket.on('disconnect', () => { const n = (sockPerIp.get(ip) ?? 1) - 1; if (n <= 0) sockPerIp.delete(ip); else sockPerIp.set(ip, n); });

  // Povolene udalosti a pocet ich argumentov (bez ack). Cokolvek ine sa zahodi, ack sa vzdy zjednoti na funkciu/undefined.
  const ARITY: Record<string, number> = { create: 1, join: 1, addBot: 0, removeBot: 0, start: 0, toLobby: 0, cmd: 1, options: 1 };
  socket.use((packet, next) => {
    const ev = String(packet[0]);
    const args = packet.slice(1);
    const ack = typeof args[args.length - 1] === 'function' ? (args.pop() as (r: object) => void) : undefined;
    if (!eventLimit.take(socket.id) || !ipEventLimit.take(ip)) { ack?.({ error: TOO_MANY }); return; }
    const n = ARITY[ev];
    if (n === undefined) { ack?.({ error: 'Neplatný príkaz' }); return; }
    const fixed = args.slice(0, n);
    while (fixed.length < n) fixed.push(undefined);
    packet.length = 0;
    packet.push(ev, ...fixed, ...(ack ? [ack] : []));
    next();
  });
  /** Chyba v obsluhe jednej udalosti nesmie zhodit proces. */
  const on = (ev: string, fn: (...a: never[]) => void) => socket.on(ev, (...a: unknown[]) => {
    try { (fn as (...x: unknown[]) => void)(...a); } catch (e) { console.error(`handler ${ev}:`, (e as Error).message); }
  });

  let room: Room | null = null;
  let me: Member | null = null;

  const attach = (r: Room, m: Member) => {
    room = r; me = m;
    m.socket?.disconnect();
    m.socket = socket;
    broadcast(r);
  };

  on('create', (data: unknown, ack?: (r: object) => void) => {
    if (trapped(data)) { ban(ip); socket.disconnect(); return; }
    if (!createLimit.take(ip)) return ack?.({ error: TOO_MANY });
    if (rooms.size >= MAX_ROOMS) return ack?.({ error: 'Server je plný, skús neskôr' });
    if (room) return ack?.({ error: 'Už si v miestnosti' });
    const r: Room = { code: newCode(), host: '', members: [], state: null, touched: Date.now(), botTimer: null, idle: null, resp: null, opts: { goldRush: false, shadows: false } };
    const m: Member = { id: randomBytes(4).toString('hex'), token, name: cleanName(fieldOf(data, 'name')), bot: false, socket: null };
    r.host = m.id; r.members.push(m); rooms.set(r.code, r);
    attach(r, m);
    ack?.({ ok: true, code: r.code });
  });

  on('join', (data: unknown, ack?: (r: object) => void) => {
    if (trapped(data)) { ban(ip); socket.disconnect(); return; }
    if (!joinLimit.take(ip)) return ack?.({ error: TOO_MANY });
    const r = rooms.get(cleanCode(fieldOf(data, 'code')));
    if (!r) return ack?.({ error: 'Miestnosť neexistuje' });
    if (room && room !== r) return ack?.({ error: 'Už si v miestnosti' });   // bez duchov v starej miestnosti
    const known = r.members.find(m => m.token === token);
    if (known) { attach(r, known); return ack?.({ ok: true, code: r.code }); }
    if (r.state) return ack?.({ error: 'Hra už beží' });
    if (r.members.length >= 7) return ack?.({ error: 'Miestnosť je plná' });
    const m: Member = { id: randomBytes(4).toString('hex'), token, name: uniqueName(r, cleanName(fieldOf(data, 'name'))), bot: false, socket: null };
    r.members.push(m);
    attach(r, m);
    ack?.({ ok: true, code: r.code });
  });

  const hostOnly = (ack?: (r: object) => void) => {
    if (!room || !me) { ack?.({ error: 'Nie si v miestnosti' }); return false; }
    if (room.host !== me.id) { ack?.({ error: 'Toto môže len zakladateľ' }); return false; }
    return true;
  };

  on('addBot', (ack?: (r: object) => void) => {
    if (!hostOnly(ack) || !room || room.state) return;
    if (room.members.length >= 7) return ack?.({ error: 'Miestnosť je plná' });
    const n = room.members.filter(m => m.bot).length + 1;
    room.members.push({ id: randomBytes(4).toString('hex'), token: '', name: `Bot ${n}`, bot: true, socket: null });
    broadcast(room);
  });

  on('removeBot', (ack?: (r: object) => void) => {
    if (!hostOnly(ack) || !room || room.state) return;
    const i = room.members.map(m => m.bot).lastIndexOf(true);
    if (i >= 0) room.members.splice(i, 1);
    broadcast(room);
  });

  on('start', (ack?: (r: object) => void) => {
    if (!hostOnly(ack) || !room) return;
    if (room.state && !room.state.winner) return ack?.({ error: 'Hra už beží' });
    if (room.members.length < MIN_PLAYERS) return ack?.({ error: `Treba aspoň ${MIN_PLAYERS} hráčov` });
    try {
      room.state = createGame(room.members.map(m => ({ id: m.id, name: m.name })), randomInt(2 ** 31), room.opts);
    } catch (e) { return ack?.({ error: e instanceof RuleError ? e.message : 'Chyba servera' }); }
    broadcast(room);
    ack?.({ ok: true });
  });

  on('options', (data: unknown, ack?: (r: object) => void) => {
    if (!hostOnly(ack) || !room) return;
    if (room.state && !room.state.winner) return ack?.({ error: 'Hra už beží' });
    const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
    room.opts = { goldRush: d.goldRush === true, shadows: d.shadows === true };
    broadcast(room);
    ack?.({ ok: true });
  });

  on('toLobby', (ack?: (r: object) => void) => {
    if (!hostOnly(ack) || !room) return;
    if (room.state && !room.state.winner) return ack?.({ error: 'Hra ešte beží' });
    room.state = null;
    broadcast(room);
  });

  // Prikazy se zpracuji synchronne jeden po druhem. Stara verze stavu = odmitnuti.
  on('cmd', (data: { version?: number; cmd?: Command }, ack?: (r: object) => void) => {
    if (!room?.state || !me || !data?.cmd) return ack?.({ error: 'Hra nebeží' });
    const cmd = parseCmd(data.cmd);
    if (!cmd) return ack?.({ error: 'Neplatný príkaz' });
    // Vyber rol a postav je subezny: obsadenu kartu odmietne engine, nie verzia stavu.
    if (data.version !== room.state.version && !SETUP_COMMANDS.includes(cmd.type as string)) return ack?.({ error: 'Stav sa medzitým zmenil, skús znova' });
    try {
      room.state = applyCommand(room.state, me.id, cmd as unknown as Command);
    } catch (e) {
      if (e instanceof RuleError) return ack?.({ error: e.message });
      console.error('cmd chyba:', (e as Error).message);
      return ack?.({ error: 'Chyba servera' });
    }
    ack?.({ ok: true });
    broadcast(room);
  });

  socket.on('disconnect', () => {
    if (!room || !me || me.socket !== socket) return;
    me.socket = null;
    const r = room;
    if (!r.state) {
      // V lobby hrac po odpojeni mizi, rozehrana hra na nej ceka.
      r.members = r.members.filter(m => m !== me);
      if (!r.members.some(m => !m.bot)) { dispose(r); return; }
      if (r.host === me.id) r.host = r.members.find(m => !m.bot)!.id;
    } else if (r.host === me.id) {
      // Zakladatel odisiel z rozohratej hry: nova hra / lobby by inak nemal kto spustit.
      const next = r.members.find(m => !m.bot && m.socket);
      if (next) r.host = next.id;
    }
    broadcast(r);
  });
});

http.listen(PORT, () => {
  console.log(`BANG! server: http://localhost:${PORT}`);
  console.log(`Obrazky karet: ${CARDS_DIR} ${existsSync(CARDS_DIR) ? '' : '(slozka nenalezena, pouzije se vlastni vzhled karet)'}`);
});
