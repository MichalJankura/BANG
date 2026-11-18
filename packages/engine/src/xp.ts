import type { Role } from './data';
import type { PlayerStats, Winner } from './engine';

/** Body za akcie (pred kombo nasobicom). */
export const XP = {
  perLife: 5,
  hitValid: 20,
  hitNeutral: 10,
  dodge: 8,
  dynamite: 25,
  perMinute: 2,
  win: 100,
  renegadeWin: 175,
  loss: 15,
  /** strop zapocitaneho casu prezitia (min) */
  maxMinutes: 90,
} as const;

export type DbRole = 'sheriff' | 'deputy' | 'outlaw' | 'renegade';
export type Faction = 'sheriff_team' | 'outlaws' | 'renegade';

export const ROLE_DB: Record<Role, DbRole> = { sceriffo: 'sheriff', vice: 'deputy', fuorilegge: 'outlaw', rinnegato: 'renegade' };
export const FACTION: Record<Winner, Faction> = { sceriffo: 'sheriff_team', fuorilegge: 'outlaws', rinnegato: 'renegade' };
export const DB_ROLES: readonly DbRole[] = ['sheriff', 'deputy', 'outlaw', 'renegade'];

/** Tim pre ELO: Serif + Pomocnici, Banditi, Odpadlik. */
export function teamOf(role: Role): Faction {
  return role === 'sceriffo' || role === 'vice' ? 'sheriff_team' : role === 'fuorilegge' ? 'outlaws' : 'renegade';
}

export function isWinner(role: Role, winner: Winner): boolean {
  if (winner === 'sceriffo') return role === 'sceriffo' || role === 'vice';
  return role === winner;
}

export function comboMultiplier(cards: number): number {
  return cards >= 30 ? 1.5 : cards >= 20 ? 1.3 : cards >= 10 ? 1.15 : 1;
}

export interface XpInput {
  role: Role;
  stats: PlayerStats;
  /** sekundy nazive (od rozdania po vyradenie alebo koniec) */
  survivedSec: number;
  durationSec: number;
  winner: Winner;
  /** hrac pocas hry odisiel (nahradil ho bot) */
  abandoned?: boolean;
}

export interface XpBreakdown {
  damage: number;
  hits: number;
  dodges: number;
  dynamite: number;
  action: number;
  multiplier: number;
  comboBonus: number;
  survival: number;
  minutes: number;
  result: number;
  total: number;
  won: boolean;
}

const nonneg = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/** Ciste a deterministicke: rovnaky vstup = rovnake XP. Pocita sa iba na serveri. */
export function computeXp(i: XpInput): XpBreakdown {
  const s = i.stats;
  const damage = nonneg(s.dmg) * XP.perLife;
  const hits = nonneg(s.hitsValid) * XP.hitValid + nonneg(s.hitsNeutral) * XP.hitNeutral;
  const dodges = nonneg(s.dodges) * XP.dodge;
  const dynamite = nonneg(s.dynHits) * XP.dynamite;
  const action = damage + hits + dodges + dynamite;
  const multiplier = comboMultiplier(nonneg(s.cards));
  // v percentach, aby 50 × 1,15 nebolo 57,4999… (plavajuca ciarka)
  const comboBonus = Math.round((action * Math.round(multiplier * 100)) / 100) - action;
  const minutes = Math.min(XP.maxMinutes, Math.floor(Math.min(nonneg(i.survivedSec), nonneg(i.durationSec)) / 60));
  const survival = minutes * XP.perMinute;
  const won = !i.abandoned && isWinner(i.role, i.winner);
  const result = i.abandoned ? 0 : won ? (i.role === 'rinnegato' ? XP.renegadeWin : XP.win) : XP.loss;
  return { damage, hits, dodges, dynamite, action, multiplier, comboBonus, survival, minutes, result, total: action + comboBonus + survival + result, won };
}
