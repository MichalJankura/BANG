import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { DB_ROLES, type DbRole } from '@bang/engine';
import { RateLimiter } from './security.js';
import { db, type Profile } from './db.js';

/**
 * Ucty pre ranked: prezyvka + heslo, bez e-mailu. Heslo sa hashuje cez scrypt (Node crypto, bez natívnych
 * zavislosti), relacia je nahodny 256-bit token, v databaze je len jeho SHA-256.
 */

// ---------- validacia ----------

/** Prezyvka: 3-16 znakov, pismena (aj s diakritikou), cislice, medzera, _ . - ; nezacina ani nekonci oddelovacom. */
const NICK_RE = /^[\p{L}\p{N}](?:[\p{L}\p{N} _.-]{1,14})[\p{L}\p{N}]$/u;

export function cleanNickname(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 64) return null;
  const n = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!NICK_RE.test(n) || / {2}/.test(n)) return null;
  return n;
}

export function validPassword(raw: unknown): raw is string {
  return typeof raw === 'string' && raw.length >= 8 && raw.length <= 128 && Buffer.byteLength(raw) <= 512;
}

export const validRole = (r: unknown): r is DbRole => typeof r === 'string' && (DB_ROLES as readonly string[]).includes(r);

// ---------- hesla ----------

// OWASP: N=2^15, r=8, p=3 je ekvivalent N=2^17, p=1, ale s 32 MB pamate na hash namiesto 128 MB (Render free ma 512 MB).
const N = 2 ** 15, R = 8, PAR = 3, KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

function kdf(pw: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((ok, bad) => scrypt(pw.normalize('NFC'), salt, KEYLEN, { N: n, r, p, maxmem: MAXMEM }, (e, k) => (e ? bad(e) : ok(k))));
}

/** Najviac par sucasnych hashovani: scrypt zabera CPU aj pamat, hromadne prihlasovanie nesmie zastavit hru. */
let busy = 0;
const MAX_BUSY = 4;
export class BusyError extends Error {}

async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  if (busy >= MAX_BUSY) throw new BusyError('busy');
  busy++;
  try { return await fn(); } finally { busy--; }
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await guarded(() => kdf(pw, salt, N, R, PAR));
  return `scrypt$${N}$${R}$${PAR}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  // Parametre z DB sa ohranicia (poskodeny zaznam nesmie zahltit server).
  if (!(n >= 2 ** 14 && n <= 2 ** 17 && r >= 8 && r <= 16 && p >= 1 && p <= 4)) return false;
  const salt = Buffer.from(parts[4], 'base64'), want = Buffer.from(parts[5], 'base64');
  if (salt.length < 16 || want.length !== KEYLEN) return false;
  const got = await guarded(() => kdf(pw, salt, n, r, p));
  return timingSafeEqual(got, want);
}

/** Fiktivny hash pre neexistujucu prezyvku: odpoved trva rovnako dlho, existencia uctu sa neprezradi. */
let dummy: Promise<string> | null = null;
const dummyHash = () => (dummy ??= hashPassword(randomBytes(18).toString('base64')));

// ---------- relacie ----------

export const SESSION_DAYS = 30;
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const validSession = (t: unknown): t is string => typeof t === 'string' && /^[0-9a-f]{64}$/.test(t);

/** Kratka cache relacii (token hash -> profil), aby sa DB nevolala pri kazdom pripojeni. */
const CACHE_MS = 5 * 60_000;
const cache = new Map<string, { p: Profile; exp: number }>();
setInterval(() => { const t = Date.now(); for (const [k, v] of cache) if (v.exp < t) cache.delete(k); }, 60_000).unref();

/** Po zapase alebo zmene profilu: zahodi cache daneho hraca. */
export function forgetPlayer(id: string) {
  for (const [k, v] of cache) if (v.p.id === id) cache.delete(k);
}

async function openSession(player: string): Promise<{ session: string; profile: Profile }> {
  const session = randomBytes(32).toString('hex');
  const th = sha256(session);
  const profile = await db.createSession(player, th, SESSION_DAYS);
  cache.set(th, { p: profile, exp: Date.now() + CACHE_MS });
  return { session, profile };
}

// ---------- limity ----------

// Partia pri jednom stole moze sediet za jednou IP (NAT), preto limity na IP nie su prilis tesne.
export const loginIpLimit = new RateLimiter(Number(process.env.LOGIN_PER_15MIN ?? 20), 15 * 60_000);
export const registerIpLimit = new RateLimiter(Number(process.env.REGISTER_PER_HOUR ?? 10), 3_600_000);
export const resumeIpLimit = new RateLimiter(60, 60_000);

/** Neuspesne prihlasenia na jednu prezyvku (brute force z viacerych IP). */
const fails = new Map<string, { n: number; reset: number }>();
const FAIL_MAX = 5, FAIL_MS = 15 * 60_000;
setInterval(() => { const t = Date.now(); for (const [k, v] of fails) if (v.reset < t) fails.delete(k); }, 60_000).unref();
const nickLocked = (k: string) => { const f = fails.get(k); return !!f && f.reset > Date.now() && f.n >= FAIL_MAX; };
function nickFail(k: string) {
  const t = Date.now(), f = fails.get(k);
  if (!f || f.reset < t) fails.set(k, { n: 1, reset: t + FAIL_MS }); else f.n++;
}

// ---------- operacie ----------

export const ERR_BAD_LOGIN = 'Nesprávna prezývka alebo heslo';

export async function register(nickRaw: unknown, pw: unknown, role: unknown) {
  const nickname = cleanNickname(nickRaw);
  if (!nickname) throw new AuthError('Prezývka musí mať 3–16 znakov (písmená, číslice, medzera, _ . -)');
  if (!validPassword(pw)) throw new AuthError('Heslo musí mať 8 až 128 znakov');
  if (!validRole(role)) throw new AuthError('Vyber si preferovanú rolu');
  const hash = await hashPassword(pw);
  const profile = await db.register(nickname, hash, role);
  if (!profile) throw new AuthError('Táto prezývka je už obsadená');
  return openSession(profile.id);
}

export async function login(nickRaw: unknown, pw: unknown) {
  const nickname = cleanNickname(nickRaw);
  if (!nickname || typeof pw !== 'string' || pw.length > 128) throw new AuthError(ERR_BAD_LOGIN);
  const key = nickname.toLowerCase();
  if (nickLocked(key)) throw new AuthError('Priveľa neúspešných pokusov, skús to o 15 minút');
  const row = await db.loginLookup(nickname);
  const ok = await verifyPassword(pw, row?.hash ?? await dummyHash());
  if (!row || !ok) { nickFail(key); throw new AuthError(ERR_BAD_LOGIN); }
  fails.delete(key);
  return openSession(row.id);
}

export async function resume(session: unknown): Promise<Profile | null> {
  if (!validSession(session)) return null;
  const th = sha256(session);
  const hit = cache.get(th);
  if (hit && hit.exp > Date.now()) return hit.p;
  const p = await db.sessionProfile(th);
  if (p) cache.set(th, { p, exp: Date.now() + CACHE_MS }); else cache.delete(th);
  return p;
}

export async function logout(session: unknown) {
  if (!validSession(session)) return;
  const th = sha256(session);
  cache.delete(th);
  await db.deleteSession(th);
}

export async function setRole(player: string, role: unknown): Promise<Profile> {
  if (!validRole(role)) throw new AuthError('Neplatná rola');
  const p = await db.setRole(player, role);
  forgetPlayer(player);
  return p;
}

export class AuthError extends Error {}
