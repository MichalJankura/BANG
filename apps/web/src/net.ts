import { io, Socket } from 'socket.io-client';
import type { Command, GameView, SetupView } from '@bang/engine';

export interface Lobby {
  code: string;
  host: string;
  me: string;
  started: boolean;
  minPlayers: number;
  opts?: { goldRush: boolean; shadows: boolean; bonus?: boolean };
  players: { id: string; name: string; bot: boolean; connected: boolean; voice?: boolean }[];
}

/** Pohlad zo servera pocas hry + odpocet reakcie (ak bezi). */
export type GView = GameView & { responseMs?: number; responseTotal?: number };
/** Pohlad zo servera: vyber rol a postav, alebo hra. */
export type View = GView | SetupView;

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* bez uloziska to ide tiez */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* nic */ } },
};

function token(): string {
  let t = store.get('bang.token');
  if (!t) {
    t = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
    store.set('bang.token', t);
  }
  return t;
}

export const savedName = () => store.get('bang.name') ?? '';
export const saveName = (n: string) => store.set('bang.name', n);
export const savedCode = () => store.get('bang.code');
export const saveCode = (c: string | null) => (c ? store.set('bang.code', c) : store.del('bang.code'));

export const socket: Socket = io({ auth: { token: token() } });

export type Ack = { ok?: boolean; error?: string; code?: string; pending?: boolean };

export function call(event: string, ...args: unknown[]): Promise<Ack> {
  return new Promise(resolve => socket.emit(event, ...args, (r: Ack) => resolve(r ?? {})));
}

/** Odide z miestnosti: server ta v rozohratej hre nahradi botom. Aj pri vypadnutom spojeni sa stranka znova nacita. */
export async function leaveRoom() {
  saveCode(null);
  if (socket.connected) await Promise.race([call('leave'), new Promise(r => setTimeout(r, 900))]);
  location.reload();
}

export const sendCmd = (view: { version: number }, cmd: Command) => call('cmd', { version: view.version, cmd });
