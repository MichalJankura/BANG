/** Hodnosti pre ranked. Rovnake hodnoty su v tabulke `ranks` (supabase/migrations/001_ranked.sql). */
export interface Rank {
  id: number;
  name: string;
  nameEn: string;
  /** hodnost Policajneho zboru SR, z ktorej westernova vychadza */
  police: string;
  minXp: number;
  /** kluc ikony; obrazky zatial nie su, UI ukaze placeholder */
  iconKey: string;
}

export const RANKS: readonly Rank[] = [
  { id: 1, name: 'Zelenáč z prérie', nameEn: 'Prairie Greenhorn', police: 'Strážmajster', minXp: 0, iconKey: 'rank-01' },
  { id: 2, name: 'Pomocník šerifa', nameEn: "Sheriff's Helper", police: 'Nadstrážmajster', minXp: 150, iconKey: 'rank-02' },
  { id: 3, name: 'Strážnik dostavníkov', nameEn: 'Stagecoach Guard', police: 'Podpráporčík', minXp: 350, iconKey: 'rank-03' },
  { id: 4, name: 'Stopár banditov', nameEn: 'Outlaw Tracker', police: 'Práporčík', minXp: 650, iconKey: 'rank-04' },
  { id: 5, name: 'Zástupca šerifa', nameEn: 'Deputy Sheriff', police: 'Nadpráporčík', minXp: 1050, iconKey: 'rank-05' },
  { id: 6, name: 'Pištoľník zákona', nameEn: 'Lawman Gunslinger', police: 'Podporučík', minXp: 1600, iconKey: 'rank-06' },
  { id: 7, name: 'Lovec odmien', nameEn: 'Bounty Hunter', police: 'Poručík', minXp: 2300, iconKey: 'rank-07' },
  { id: 8, name: 'Ostrý strelec', nameEn: 'Sharpshooter', police: 'Nadporučík', minXp: 3200, iconKey: 'rank-08' },
  { id: 9, name: 'Veliteľ posádky', nameEn: 'Garrison Commander', police: 'Kapitán', minXp: 4300, iconKey: 'rank-09' },
  { id: 10, name: 'Okresný maršal', nameEn: 'County Marshal', police: 'Major', minXp: 5600, iconKey: 'rank-10' },
  { id: 11, name: 'Vrchný maršal', nameEn: 'Chief Marshal', police: 'Podplukovník', minXp: 7200, iconKey: 'rank-11' },
  { id: 12, name: 'Strážca Divokého západu', nameEn: 'Guardian of the Wild West', police: 'Plukovník', minXp: 9200, iconKey: 'rank-12' },
  { id: 13, name: 'Legenda pohraničia', nameEn: 'Frontier Legend', police: 'Generál', minXp: 12000, iconKey: 'rank-13' },
];

export function rankFor(xp: number): Rank {
  let r = RANKS[0];
  for (const x of RANKS) if (xp >= x.minXp) r = x;
  return r;
}

/** Postup k dalsej hodnosti: 0..1 (1 pri najvyssej). */
export function rankProgress(xp: number): { rank: Rank; next: Rank | null; into: number; span: number; ratio: number } {
  const rank = rankFor(xp);
  const next = RANKS.find(r => r.id === rank.id + 1) ?? null;
  if (!next) return { rank, next, into: 0, span: 0, ratio: 1 };
  const into = Math.max(0, xp - rank.minXp), span = next.minXp - rank.minXp;
  return { rank, next, into, span, ratio: Math.min(1, into / span) };
}
