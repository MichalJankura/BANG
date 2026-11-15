/**
 * Geometria stola podla BANG Saloon (layout.md).
 * Rozmery podu sa neberu pevne 960 x 600, ale z miesta, ktore stol naozaj ma. Tvar elipsy, miesta
 * hracov a stol sa prepocitaju pre pomer stran, takze na tablete na vysku aj na telefone na sirku
 * nevznika len zmenseny obrazok. Pri 960 x 600 vychadzaju rovnake cisla ako doteraz.
 */
export const BASE_W = 960;
export const BASE_H = 600;

/** Uhly miest (0 = vpravo, 90 = dole), ty si vzdy na 90. Dalsi hraci v smere hodin. */
const ANGLES: Record<number, number[]> = {
  4: [90, 180, 270, 0],
  5: [90, 162, 234, 306, 18],
  6: [90, 150, 210, 270, 330, 30],
  7: [90, 141, 193, 244, 296, 347, 39],
};

export function seatAngles(n: number): number[] {
  return ANGLES[n] ?? Array.from({ length: n }, (_, i) => (90 + (i * 360) / n) % 360);
}

const rad = (a: number) => (a * Math.PI) / 180;

export interface Geo {
  W: number;
  H: number;
  CX: number;
  CY: number;
  TABLE: { left: number; top: number; w: number; h: number };
  CHALK: { w: number; h: number };
  seatPos: (angle: number) => { x: number; y: number };
  lampPos: (angle: number | null) => { x: number; y: number };
  pointerPos: (angle: number) => { x: number; y: number };
}

export function makeGeo(W: number, H: number, compact = false): Geo {
  const CX = W / 2;
  const halfW = compact ? 66 : 115;
  const halfH = compact ? 30 : 39;
  const inset = compact ? 10 : 22;

  const RX = Math.max(60, Math.min(W * 0.43, W / 2 - halfW - 16));
  // nad hornymi tabulkami vykukuju vylozene karty, preto je hore rezerva
  const peek = compact ? 20 : 44;
  const RY = Math.max(30, compact ? H / 2 - halfH - 4 - peek / 2 : Math.min(H * 0.37, H / 2 - halfH - 10 - peek / 2));
  const CY = H / 2 + peek / 2;

  const TW = Math.min(W * 0.66, 2 * (RX - halfW + 8));
  const TH = Math.min(H * 0.54, 2 * (RY - halfH + 22));
  const TABLE = { left: (W - TW) / 2, top: CY - TH / 2, w: TW, h: TH };

  const feltW = TW - inset * 2;
  const feltH = TH - inset * 2;
  const CHALK = { w: Math.min(feltW * 0.62, 330), h: Math.min(feltH * 0.72, 210) };

  const seatPos = (angle: number) => ({ x: CX + RX * Math.cos(rad(angle)), y: CY + RY * Math.sin(rad(angle)) });
  /** Lampa svieti nad hracom na tahu, mierne pritiahnuta k stredu stola. */
  const lampPos = (angle: number | null) => {
    if (angle === null) return { x: CX, y: CY };
    const p = seatPos(angle);
    return { x: CX + (p.x - CX) * 0.9, y: CY + (p.y - CY) * 0.9 };
  };
  /** Mosadzny ukazovatel obieha 16 px za kriedovym kruhom. */
  const pointerPos = (angle: number) => ({ x: CX + (CHALK.w / 2 + 16) * Math.cos(rad(angle)), y: CY + (CHALK.h / 2 + 16) * Math.sin(rad(angle)) });

  return { W, H, CX, CY, TABLE, CHALK, seatPos, lampPos, pointerPos };
}
