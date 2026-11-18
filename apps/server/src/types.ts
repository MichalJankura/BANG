import type { Socket } from 'socket.io';
import type { State } from '@bang/engine';

export interface Member {
  id: string;        // verejne id (vidi ho vsichni)
  token: string;     // tajny token hrace, nikdy se neposila ostatnim (po obnove zo snimku prazdny, pozri th)
  /** SHA-256 tokenu z obnoveneho snimku; po prvom pripojeni sa nahradi tokenom */
  th?: string;
  /** dostal TURN udaje (v hlase s aspon 2 ludmi) */
  turn?: boolean;
  name: string;
  bot: boolean;
  socket: Socket | null;
  /** je v hlasovom kanali (WebRTC); server o hlase vie len toto, zvuk mu nikdy nepride */
  voice: boolean;
  /** casovac "odpojeny hrac sa nahradi botom" (bezi, kym sa nepripoji spat) */
  grace?: NodeJS.Timeout | null;
  /** ranked: id uctu (players.id) a verejny odznak do lobby */
  acct?: string;
  badge?: Badge;
}

/** Verejne udaje uctu, ktore vidia spoluhraci (bez id uctu). */
export interface Badge { rankId: number; preferredRole: string; rating: number }

/** Sledovanie ranked zapasu. Cisty JSON, uklada sa do snimku miestnosti. */
export interface RankedMatch {
  /** uuid zapasu (idempotencia zapisu v DB) */
  id: string;
  /** clen (id hraca v hre) -> id uctu */
  accounts: Record<string, string>;
  /** koniec vyberu rol a postav (zaciatok zapasu), ms */
  startedAt: number | null;
  /** cas vyradenia hraca, ms */
  deadAt: Record<string, number>;
  /** clenovia, ktori pocas hry odisli (nahradil ich bot) */
  left: string[];
  status: 'playing' | 'sending' | 'done' | 'failed';
  /** vysledok pre kazdeho clena (pozapasova obrazovka) */
  results?: Record<string, MatchResultMsg>;
}

export interface MatchResultMsg {
  role: string;
  won: boolean;
  abandoned: boolean;
  xp: Record<string, number | boolean>;
  xpBefore: number; xpAfter: number;
  ratingBefore: number; ratingAfter: number;
  rankBefore: number; rankAfter: number;
}

/** Ziadost noveho hraca o vstup do rozbehnutej hry. Schvaluje ju zakladatel, pri neodpovedani dalsi hraci. */
export interface JoinReq {
  id: string;
  token: string;
  name: string;
  socket: Socket;
  /** kto uz otazku dostal (aby sa nezvolal dvakrat) */
  tried: string[];
  /** kto ju prave schvaluje */
  ask: string | null;
  timer: NodeJS.Timeout | null;
  /** dosadi hraca do miestnosti (nastavi premenne jeho spojenia) */
  attach: (m: Member) => void;
  /** ziadost skoncila (zamietnuta, vyprsana, zrusena): spojenie uz nic nevybavuje */
  release: () => void;
}

export interface Room {
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
  joinReqs: JoinReq[];
  /** ranked stol: len prihlaseni hraci, bez botov, zapis XP a ratingu */
  ranked?: boolean;
  match?: RankedMatch | null;
}
