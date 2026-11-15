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
/** Ako dlho caka odpojeny hrac v rozohratej hre na navrat, kym ho nahradi bot. */
const RECONNECT_MS = Number(process.env.RECONNECT_MS ?? 45_000);
/** Cas na reakciu (Vedla!, Indiani!, Duel, smrtelny zasah). 0 = bez limitu. */
const RESPONSE_MS = Number(process.env.RESPONSE_MS ?? 8000);
const REACTIONS = new Set(['bang', 'indians', 'duel', 'lethal', 'arrange']);

interface Member {
  id: string;        // verejne id (vidi ho vsichni)
  token: string;     // tajny token hrace, nikdy se neposila ostatnim
  name: string;
  bot: boolean;
  socket: Socket | null;
  /** je v hlasovom kanali (WebRTC); server o hlase vie len toto, zvuk mu nikdy nepride */
  voice: boolean;
  /** casovac "odpojeny hrac sa nahradi botom" (bezi, kym sa nepripoji spat) */
  grace?: NodeJS.Timeout | null;
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
  /** tokeny hracov, ktorych zakladatel vyhodil z lobby: znova sa nepripoja */
  kicked: Set<string>;
}

const rooms = new Map<string, Room>();

function dispose(r: Room) {
  for (const m of r.members) if (m.grace) clearTimeout(m.grace);
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
const rtcLimit = new RateLimiter(90, 10_000);       // WebRTC signalizacia na jeden socket (ponuka + odpoved na kazdeho spoluhraca)
const rtcIpLimit = new RateLimiter(500, 10_000);    // ... a na IP (cela partia moze sediet za jednou domacou IP)
const chatLimit = new RateLimiter(8, 10_000);       // textove spravy na jeden socket
const chatIpLimit = new RateLimiter(60, 10_000);
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


/** Udalost pre vsetkych v miestnosti (odchod hraca, zmena zakladatela). Klient ju ukaze ako upozornenie. */
function notify(r: Room, msg: { t: 'left' | 'kicked' | 'dropped' | 'host'; name: string; id?: string; bot?: boolean }) {
  for (const m of r.members) m.socket?.emit('notice', msg);
}

/**
 * Hrac odchadza (odisiel sam, zakladatel ho vyhodil, alebo sa neozval). V rozohratej hre ho nahradi bot,
 * aby hra isla dalej; inak (lobby, koniec hry) z miestnosti zmizne. Ak odisiel zakladatel, zakladatelom sa stane iny clovek.
 */
function depart(r: Room, m: Member, why: 'left' | 'kicked' | 'dropped') {
  if (m.grace) { clearTimeout(m.grace); m.grace = null; }
  const running = !!r.state && !r.state.winner;
  m.socket = null; m.voice = false;
  if (running) { m.bot = true; m.token = ''; }
  else r.members = r.members.filter(x => x !== m);
  if (!r.members.some(x => !x.bot)) { dispose(r); return; }
  notify(r, { t: why, name: m.name, bot: running });
  if (r.host === m.id) {
    const next = r.members.find(x => !x.bot && x.socket) ?? r.members.find(x => !x.bot)!;
    r.host = next.id;
    notify(r, { t: 'host', name: next.name, id: next.id });
  }
  broadcast(r);
}

/** Text spravy: bez riadiacich a obojsmernych znakov, max 300 znakov, zlozene medzery. */
function cleanChat(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
}

/**
 * STUN (verejny) a volitelny TURN z prostredia. TURN treba, ak sa hraci kvoli prisnej sieti (mobilne data, firemne NAT) nevedia spojit priamo:
 *  - TURN_URL=turn:host:3478[,turns:host:5349], TURN_USER, TURN_PASS (staticke udaje, napr. ExpressTURN)
 *  - TURN_API_URL=https://<app>.metered.live/api/v1/turn/credentials?apiKey=... (vrati pole iceServers, napr. Metered Open Relay)
 */
let iceCache: { at: number; list: object[] } | null = null;
async function iceServers(): Promise<object[]> {
  const list: object[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
  const url = process.env.TURN_URL;
  if (url) list.push({ urls: url.split(',').map(x => x.trim()).filter(Boolean), username: process.env.TURN_USER ?? '', credential: process.env.TURN_PASS ?? '' });
  const api = process.env.TURN_API_URL;
  if (api) {
    if (!iceCache || Date.now() - iceCache.at > 600_000) {
      try {
        const r = await fetch(api, { signal: AbortSignal.timeout(4000) });
        const j = await r.json();
        if (Array.isArray(j)) iceCache = { at: Date.now(), list: j.filter(x => x && typeof x === 'object').slice(0, 10) };
      } catch (e) { console.error('TURN_API_URL:', (e as Error).message); }
    }
    if (iceCache) list.push(...iceCache.list);
  }
  return list;
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
    players: room.members.map(m => ({ id: m.id, name: m.name, bot: m.bot, connected: m.bot || !!m.socket, voice: m.voice })),
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
  const ARITY: Record<string, number> = { create: 1, join: 1, addBot: 0, removeBot: 0, start: 0, toLobby: 0, cmd: 1, options: 1, kick: 1, voice: 1, rtc: 1, chat: 1, leave: 0 };
  socket.use((packet, next) => {
    const ev = String(packet[0]);
    const args = packet.slice(1);
    const ack = typeof args[args.length - 1] === 'function' ? (args.pop() as (r: object) => void) : undefined;
    const n = ARITY[ev];
    if (n === undefined) { if (eventLimit.take(socket.id) && ipEventLimit.take(ip)) ack?.({ error: 'Neplatný príkaz' }); return; }
    // Signalizacia hlasu a chat maju vlastne limity, aby ich nahromadenie nezablokovalo samotnu hru (a naopak).
    const ok = ev === 'rtc' ? rtcLimit.take(socket.id) && rtcIpLimit.take(ip)
      : ev === 'chat' ? chatLimit.take(socket.id) && chatIpLimit.take(ip)
      : eventLimit.take(socket.id) && ipEventLimit.take(ip);
    if (!ok) { ack?.({ error: TOO_MANY }); return; }
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
    m.voice = false;              // nove spojenie sa do hlasu pripaja znova
    if (m.grace) { clearTimeout(m.grace); m.grace = null; }   // vratil sa vcas, bot ho nenahradi
    broadcast(r);
  };

  on('create', (data: unknown, ack?: (r: object) => void) => {
    if (trapped(data)) { ban(ip); socket.disconnect(); return; }
    if (!createLimit.take(ip)) return ack?.({ error: TOO_MANY });
    if (rooms.size >= MAX_ROOMS) return ack?.({ error: 'Server je plný, skús neskôr' });
    if (room) return ack?.({ error: 'Už si v miestnosti' });
    const r: Room = { code: newCode(), host: '', members: [], state: null, touched: Date.now(), botTimer: null, idle: null, resp: null, opts: { goldRush: false, shadows: false }, kicked: new Set() };
    const m: Member = { id: randomBytes(4).toString('hex'), token, name: cleanName(fieldOf(data, 'name')), bot: false, socket: null, voice: false };
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
    if (r.kicked.has(token)) return ack?.({ error: 'Zakladateľ ťa vyhodil z miestnosti' });
    if (r.state) return ack?.({ error: 'Hra už beží' });
    if (r.members.length >= 7) return ack?.({ error: 'Miestnosť je plná' });
    const m: Member = { id: randomBytes(4).toString('hex'), token, name: uniqueName(r, cleanName(fieldOf(data, 'name'))), bot: false, socket: null, voice: false };
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
    room.members.push({ id: randomBytes(4).toString('hex'), token: '', name: `Bot ${n}`, bot: true, socket: null, voice: false });
    broadcast(room);
  });

  on('removeBot', (ack?: (r: object) => void) => {
    if (!hostOnly(ack) || !room || room.state) return;
    const i = room.members.map(m => m.bot).lastIndexOf(true);
    if (i >= 0) room.members.splice(i, 1);
    broadcast(room);
  });

  /** Zakladatel vyhodi hraca (alebo bota). Pocas hry ho nahradi bot; vyhodeny sa uz nepripoji. */
  on('kick', (data: unknown, ack?: (r: object) => void) => {
    if (!hostOnly(ack) || !room || !me) return;
    const id = fieldOf(data, 'id');
    if (id === me.id) return ack?.({ error: 'Sám seba vyhodiť nemôžeš' });
    const target = room.members.find(m => m.id === id);
    if (!target) return ack?.({ error: 'Hráč už nie je v miestnosti' });
    const r = room;
    const s = target.socket;
    if (target.bot) {
      // Bota zakladatel odoberie len pred hrou (pocas hry je na jeho mieste v partii).
      if (r.state && !r.state.winner) return ack?.({ error: 'Bota počas hry vyhodiť nejde' });
      r.members = r.members.filter(m => m !== target);
      broadcast(r);
      return ack?.({ ok: true });
    }
    if (target.token) r.kicked.add(target.token);
    depart(r, target, 'kicked');
    if (s) { s.emit('kicked'); setTimeout(() => s.disconnect(), 100); }
    ack?.({ ok: true });
  });

  /** Hrac odide sam. V rozohratej hre ho nahradi bot, zakladatel sa prenesie na dalsieho cloveka. */
  on('leave', (ack?: (r: object) => void) => {
    if (!room || !me) return ack?.({ ok: true });
    const r = room, m = me;
    room = null; me = null;        // dalsie odpojenie tohto socketu uz nic nemeni
    depart(r, m, 'left');
    ack?.({ ok: true });
  });

  /** Pripojenie do hlasoveho kanala (on) alebo odchod z neho. Odpoved: ICE servery a kto uz v hlase je. */
  on('voice', async (data: unknown, ack?: (r: object) => void) => {
    if (!room || !me || me.bot) return ack?.({ error: 'Nie si v miestnosti' });
    const r = room, m = me;
    const on = fieldOf(data, 'on') === true;
    const ice = on ? await iceServers().catch(() => []) : [];
    if (!r.members.includes(m) || m.bot) return ack?.({ error: 'Nie si v miestnosti' });
    m.voice = on;
    broadcast(r);
    ack?.(on
      ? { ok: true, ice, peers: r.members.filter(x => x !== m && x.voice && x.socket).map(x => x.id) }
      : { ok: true });
  });

  /** Signalizacia WebRTC: server len odovzda ponuku/odpoved konkretnemu spoluhracovi z tej istej miestnosti. Zvuk cez server nejde. */
  on('rtc', (data: unknown) => {
    if (!room || !me || !me.voice) return;
    const to = fieldOf(data, 'to'), t = fieldOf(data, 't'), sdp = fieldOf(data, 'sdp');
    if (typeof to !== 'string' || (t !== 'offer' && t !== 'answer') || typeof sdp !== 'string' || sdp.length < 20 || sdp.length > 8000) return;
    if (!/^v=0\r?\n/.test(sdp)) return;
    const target = room.members.find(m => m.id === to);
    if (!target || target === me || !target.voice || !target.socket) return;
    target.socket.emit('rtc', { from: me.id, t, sdp });
  });

  /** Textovy chat miestnosti. Server spravy neuklada, len ich rozposle clenom miestnosti. */
  on('chat', (data: unknown, ack?: (r: object) => void) => {
    if (!room || !me || me.bot || !room.members.includes(me)) return ack?.({ error: 'Nie si v miestnosti' });
    const text = cleanChat(fieldOf(data, 'text'));
    if (!text) return ack?.({ error: 'Prázdna správa' });
    const msg = { id: randomBytes(6).toString('hex'), from: me.id, name: me.name, text, at: Date.now() };
    for (const m of room.members) m.socket?.emit('chat', msg);
    ack?.({ ok: true });
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
    if (!room?.state || !me || me.bot || !data?.cmd) return ack?.({ error: 'Hra nebeží' });
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
    const r = room, m = me;
    m.socket = null;
    m.voice = false;
    if (!r.state) {
      // V lobby hrac po odpojeni mizi (napr. zatvoril stranku).
      depart(r, m, 'dropped');
    } else if (!r.state.winner) {
      // Rozohrata hra: miesto drzi par desiatok sekund, potom ho prevezme bot.
      m.grace = setTimeout(() => { m.grace = null; if (!m.socket && r.members.includes(m)) depart(r, m, 'dropped'); }, RECONNECT_MS);
      broadcast(r);
    } else {
      // Koniec hry: clen ostava, len zakladatel sa prenesie, aby mal kto spustit dalsiu hru.
      if (r.host === m.id) {
        const next = r.members.find(x => !x.bot && x.socket);
        if (next) { r.host = next.id; notify(r, { t: 'host', name: next.name, id: next.id }); }
      }
      broadcast(r);
    }
  });
});

http.listen(PORT, () => {
  console.log(`BANG! server: http://localhost:${PORT}`);
  console.log(`Obrazky karet: ${CARDS_DIR} ${existsSync(CARDS_DIR) ? '' : '(slozka nenalezena, pouzije se vlastni vzhled karet)'}`);
});
