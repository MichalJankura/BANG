import type { CardType } from '@bang/engine';

/** Farebny typ karty: urcuje farbu tlacidla pod kartou. */
export type Tone = 'attack' | 'react' | 'heal' | 'draw' | 'build';

const TONE: Record<CardType, Tone> = {
  bang: 'attack', gatling: 'attack', indiani: 'attack', duello: 'attack', panico: 'attack', catbalou: 'attack',
  mancato: 'react', barile: 'react',
  birra: 'heal', saloon: 'heal',
  diligenza: 'draw', wellsfargo: 'draw', emporio: 'draw',
  prigione: 'build', dinamite: 'build', mirino: 'build', mustang: 'build',
  volcanic: 'build', schofield: 'build', remington: 'build', carabine: 'build', winchester: 'build',
};

export const toneOf = (t: CardType): Tone => TONE[t];
