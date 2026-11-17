export type Act = (event: string, ...args: unknown[]) => Promise<{ ok?: boolean; error?: string; pending?: boolean }>;

/** Otazka pre schvalovatela: niekto sa chce pripojit do rozbehnutej hry. */
export interface JoinAsk { id: string; name: string; ms: number; host: boolean; bot: { name: string; hp: number } | null; at: number }
