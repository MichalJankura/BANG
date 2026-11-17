import { StreamClient } from '@stream-io/node-sdk';

/**
 * Volitelny hlasovy poskytovatel Stream (https://getstream.io/video). Zapina sa v prostredi servera:
 *  - STREAM_API_KEY, STREAM_API_SECRET (z dashboardu Stream, aplikacia > API keys)
 *  - VOICE_PROVIDER=stream (bez toho ostava vlastny WebRTC, aj ked su kluce zadane)
 * Zvuk ide cez servery Stream (SFU), nasa signalizacia sa v tomto rezime nepouziva. Tajny kluc ostava len tu, klient dostane kratkodoby token.
 */
const KEY = process.env.STREAM_API_KEY ?? '';
const SECRET = process.env.STREAM_API_SECRET ?? '';
export const streamEnabled = process.env.VOICE_PROVIDER === 'stream' && !!KEY && !!SECRET;
if (process.env.VOICE_PROVIDER === 'stream' && !streamEnabled) console.error('VOICE_PROVIDER=stream, ale chyba STREAM_API_KEY alebo STREAM_API_SECRET: pouzije sa vlastny WebRTC.');

let client: StreamClient | null = null;

export interface StreamAuth { apiKey: string; userId: string; token: string; callId: string; callType: string }

/** Token pre jedneho hraca na jeden hovor (miestnost). Plati 2 hodiny a klient ho po vyprsani nepotrebuje (hru nahradi dalsie pripojenie). */
export function streamAuth(userId: string, roomCode: string): StreamAuth | null {
  if (!streamEnabled) return null;
  client ??= new StreamClient(KEY, SECRET);
  const callType = 'default';
  const callId = `bang-${roomCode}`;
  const token = client.generateCallToken({ user_id: userId, call_cids: [`${callType}:${callId}`], validity_in_seconds: 7200 });
  return { apiKey: KEY, userId, token, callId, callType };
}
