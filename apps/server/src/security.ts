import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

/**
 * Bezpecnostna vrstva servera: hlavicky (CSP), cesty k suborom, limity poziadaviek,
 * blokovanie AI crawlerov, honeypot a validacia vstupov od klienta.
 */

// ---------- hlavicky ----------

const HTTPS_FORCED = process.env.HTTPS === '1';

/** Striktna CSP. Web nema inline skripty; inline style="" atributy (React) su povolene len ako atribut. */
function csp(host: string, tls: boolean): string {
  // WebSocket len na vlastny host (Host hlavicka sa overi, aby sa do CSP nedostal cudzi retazec).
  const ws = /^[a-z0-9.-]+(:\d{1,5})?$/i.test(host) ? ` ws://${host} wss://${host}` : '';
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "style-src-attr 'unsafe-inline'",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data:",
    `connect-src 'self'${ws}`,
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    ...(tls ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

const isTls = (req: IncomingMessage) =>
  HTTPS_FORCED || !!(req.socket as { encrypted?: boolean }).encrypted || (TRUST_HOPS > 0 && String(req.headers['x-forwarded-proto'] ?? '').split(',').pop()?.trim() === 'https');

export function securityHeaders(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Security-Policy', csp(String(req.headers.host ?? ''), isTls(req)));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=(), payment=(), usb=(), interest-cohort=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Origin-Agent-Cluster', '?1');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('X-Robots-Tag', 'noai, noimageai');
  if (isTls(req)) res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
}

// ---------- cesty k statickym suborom ----------

/** Dekoduje URL cestu. Zla sekvencia (%E0%A4%A) vrati null namiesto vyhodenia vynimky. */
export function safePath(rawUrl: string | undefined): string | null {
  try {
    const p = decodeURIComponent((rawUrl ?? '/').split('?')[0].split('#')[0]);
    if (p.includes('\0') || p.includes('\\') || !p.startsWith('/')) return null;
    return p;
  } catch { return null; }
}

/**
 * Premeni URL na cestu vo vnutri `root`. Vrati null pri pokuse o vystup z priecinka (../),
 * pri skrytych suboroch (.env, .git) alebo mapach zdrojov.
 */
export function resolveInside(root: string, urlPath: string): string | null {
  const parts = urlPath.split('/').filter(Boolean);
  if (parts.some(p => p === '..' || p === '.' || p.startsWith('.'))) return null;
  if (/\.map$/i.test(urlPath)) return null;
  const file = path.resolve(root, ...parts);
  const rel = path.relative(root, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return file;
}

// ---------- limity ----------

export class RateLimiter {
  private hits = new Map<string, { n: number; reset: number }>();
  constructor(private max: number, private windowMs: number) {
    setInterval(() => { const t = Date.now(); for (const [k, v] of this.hits) if (v.reset < t) this.hits.delete(k); }, windowMs).unref();
  }
  /** true = povolene, false = limit prekroceny. */
  take(key: string): boolean {
    const t = Date.now();
    const h = this.hits.get(key);
    if (!h || h.reset < t) { this.hits.set(key, { n: 1, reset: t + this.windowMs }); return true; }
    return ++h.n <= this.max;
  }
}

/** Pocet doveryhodnych proxy pred serverom (0 = ziadne, X-Forwarded-For sa ignoruje). TRUST_PROXY=1 znamena 1. */
const TRUST_HOPS = Number(process.env.TRUST_PROXY_HOPS ?? (process.env.TRUST_PROXY === '1' ? 1 : 0));

/** IPv6 sa zhlukuje na /64 (jeden klient dostava cely /64), IPv4-mapped sa premeni na IPv4. */
export function normalizeIp(raw: string): string {
  let ip = raw.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  if (ip.startsWith('::ffff:') && ip.includes('.')) return ip.slice(7);
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const full = ip.includes('::') ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h;
  return full.slice(0, 4).map(x => x.padStart(4, '0')).join(':') + '::/64';
}

/**
 * IP klienta. X-Forwarded-For sa cita zprava (zaznam pridany nasim proxy), nie zlava: lavy zaznam si
 * moze klient lubovolne podvrhnut. Bez doveryhodneho proxy (TRUST_PROXY_HOPS=0) sa pouzije priame spojenie.
 */
export function clientIp(req: IncomingMessage): string {
  let ip = req.socket.remoteAddress ?? 'unknown';
  if (TRUST_HOPS > 0) {
    const xs = String(req.headers['x-forwarded-for'] ?? '').split(',').map(x => x.trim()).filter(Boolean);
    const hop = xs[xs.length - TRUST_HOPS];
    if (hop && hop.length < 64) ip = hop;
  }
  return normalizeIp(ip);
}

// ---------- boti a AI crawlery ----------

const AI_AGENTS = [
  'GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'Claude-Web', 'anthropic-ai', 'CCBot', 'Bytespider', 'PerplexityBot',
  'Google-Extended', 'Amazonbot', 'Applebot-Extended', 'cohere-ai', 'Diffbot', 'FacebookBot', 'meta-externalagent', 'ImagesiftBot',
  'Omgilibot', 'Timpibot', 'YouBot', 'PetalBot', 'AhrefsBot', 'SemrushBot', 'MJ12bot', 'DotBot', 'Scrapy', 'HTTrack', 'python-requests',
  'curl/', 'wget/', 'Go-http-client', 'node-fetch', 'axios/', 'okhttp', 'libwww-perl', 'HeadlessChrome', 'PhantomJS',
];
const AI_RE = new RegExp(AI_AGENTS.map(a => a.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|'), 'i');

export const isBotAgent = (ua: string | undefined) => !ua || ua.length < 8 || AI_RE.test(ua);

/** robots.txt: AI crawlery maju zakaz, ostatnym sa zakazuje len honeypot. */
export function robotsTxt(): string {
  const ai = ['GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'Claude-Web', 'anthropic-ai', 'CCBot', 'Bytespider', 'PerplexityBot',
    'Google-Extended', 'Amazonbot', 'Applebot-Extended', 'cohere-ai', 'Diffbot', 'FacebookBot', 'meta-externalagent', 'ImagesiftBot'];
  return [...ai.map(a => `User-agent: ${a}\nDisallow: /\n`), 'User-agent: *\nDisallow: /trap/\nDisallow: /cards/\n'].join('\n');
}

/** Honeypot: IP, ktora navstivi skrytu pascu, dostane na hodinu zakaz. */
const banned = new Map<string, number>();
setInterval(() => { const t = Date.now(); for (const [k, v] of banned) if (v < t) banned.delete(k); }, 60_000).unref();
export const TRAP_PREFIX = '/trap/';
export function ban(ip: string, ms = 3_600_000) { banned.set(ip, Date.now() + ms); }
export function isBanned(ip: string): boolean {
  const until = banned.get(ip);
  if (!until) return false;
  if (until < Date.now()) { banned.delete(ip); return false; }
  return true;
}

// ---------- validacia vstupov od klienta ----------

/** Meno hraca: bez ovladacich znakov, bidi/zero-width trikov a nadmernych medzier, max 16 znakov. */
export function cleanName(n: unknown): string {
  const s = typeof n === 'string' ? n : '';
  const t = s.normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g, '')
    .replace(/\s+/g, ' ').trim();
  return Array.from(t).slice(0, 16).join('') || 'Hráč';
}

export const cleanCode = (c: unknown): string => (typeof c === 'string' ? c : '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

const CMD_TYPES = new Set(['play', 'endTurn', 'discard', 'respond', 'pass', 'sid', 'choose', 'kit', 'storePick', 'pickRole', 'pickChar', 'chooseChar', 'arrange', 'steal', 'buy', 'equipUse', 'scrap', 'ability']);
const isInt = (x: unknown) => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < 1000;
const isIds = (x: unknown) => Array.isArray(x) && x.length <= 12 && x.every(isInt);
const isStr = (x: unknown) => typeof x === 'string' && x.length <= 32;

/** Prisna kontrola tvaru prikazu skor, nez sa dostane do enginu. Neznama pole sa zahodia. */
export function parseCmd(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.type !== 'string' || !CMD_TYPES.has(c.type)) return null;
  const out: Record<string, unknown> = { type: c.type };
  const num = (k: string, optional = false) => { if (c[k] === undefined && optional) return true; if (!isInt(c[k])) return false; out[k] = c[k]; return true; };
  const ids = (k: string) => { if (!isIds(c[k])) return false; out[k] = c[k]; return true; };
  const str = (k: string, optional = false) => { if (c[k] === undefined && optional) return true; if (!isStr(c[k])) return false; out[k] = c[k]; return true; };
  switch (c.type) {
    case 'play':
      if (!num('cardId') || !str('target', true)) return null;
      if (c.pick !== undefined) { if (c.pick === 'hand' || isInt(c.pick)) out.pick = c.pick; else return null; }
      if (c.gold !== undefined) { if (typeof c.gold !== 'boolean') return null; out.gold = c.gold; }
      return out;
    case 'buy': case 'equipUse':
      if ((c.type === 'buy' && !num('equipId')) || !str('target', true) || !str('as', true)) return null;
      if (c.pick !== undefined) { if (c.pick === 'hand' || isInt(c.pick)) out.pick = c.pick; else return null; }
      return out;
    case 'scrap': return num('equipId') && str('target') ? out : null;
    case 'ability': return str('name') && str('target', true) ? out : null;
    case 'endTurn': case 'pass': return out;
    case 'discard': case 'sid': case 'kit': return ids('cardIds') ? out : null;
    case 'respond': case 'storePick': return num('cardId') ? out : null;
    case 'choose': return str('option') ? out : null;
    case 'pickRole': case 'pickChar': return num('slot') ? out : null;
    case 'chooseChar': return str('ch') ? out : null;
    case 'steal': return num('index') ? out : null;
    case 'arrange':
      if (c.order !== undefined) { if (!ids('order')) return null; }
      if (c.shuffle !== undefined) { if (typeof c.shuffle !== 'boolean') return null; out.shuffle = c.shuffle; }
      return out;
  }
  return null;
}

// ---------- podpisany token relacie (anti-scraping) ----------

const SECRET = process.env.COOKIE_SECRET ? Buffer.from(process.env.COOKIE_SECRET) : randomBytes(32);
const TOKEN_TTL_MS = 6 * 3_600_000;
export const TOKEN_COOKIE = 'bs';

const sign = (data: string) => createHmac('sha256', SECRET).update(data).digest('base64url');
const uaTag = (ua: string) => createHmac('sha256', SECRET).update(ua).digest('base64url').slice(0, 8);

/** Token = nonce.expiracia.hash(User-Agent).podpis. Vyda sa pri nacitani HTML, vyzaduje sa pre obrazky. */
export function mintToken(ua: string): string {
  const body = `${randomBytes(9).toString('base64url')}.${Date.now() + TOKEN_TTL_MS}.${uaTag(ua)}`;
  return `${body}.${sign(body)}`;
}

/** Vrati id tokenu (nonce), ak je podpis platny, neexpiroval a patri k rovnakemu User-Agentu. */
export function verifyToken(token: string | undefined, ua: string): string | null {
  if (!token || token.length > 120) return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [nonce, exp, tag, sig] = parts;
  const want = Buffer.from(sign(`${nonce}.${exp}.${tag}`));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  if (Number(exp) < Date.now() || tag !== uaTag(ua)) return null;
  return nonce;
}

export function cookieOf(req: IncomingMessage, name: string): string | undefined {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

export function setTokenCookie(req: IncomingMessage, res: ServerResponse, ua: string) {
  const secure = isTls(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${TOKEN_COOKIE}=${mintToken(ua)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${TOKEN_TTL_MS / 1000}${secure}`);
}
