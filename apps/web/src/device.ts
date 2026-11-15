import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * phone   = telefon na vysku (vlastne rozlozenie: pas supernikov, stol, ruka)
 * compact = telefon na sirku (elipsa stola, ruka v pruhu dole, ovladanie vpravo)
 * wide    = tablet a desktop (elipsa stola, ruka dole)
 */
export type Layout = 'phone' | 'compact' | 'wide';

function measure(): Layout {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w < 700 && h >= w) return 'phone';
  if (h < 520 && w > h) return 'compact';
  return 'wide';
}

const subs = new Set<() => void>();
let current: Layout = typeof window === 'undefined' ? 'wide' : measure();
function refresh() {
  const next = measure();
  if (next !== current) { current = next; subs.forEach(f => f()); }
}
if (typeof window !== 'undefined') {
  window.addEventListener('resize', refresh);
  window.addEventListener('orientationchange', refresh);
}

export function useLayout(): Layout {
  return useSyncExternalStore(
    cb => { subs.add(cb); return () => { subs.delete(cb); }; },
    () => current,
    () => 'wide' as Layout,
  );
}

/** Dotykove zariadenie (prst), nie mys. */
export const isCoarse = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

/** Sirka okna pod ktorou je denník a zoznam hracov vo vysuvacom paneli. */
export function useNarrow(limit = 900) {
  const [n, setN] = useState(() => window.innerWidth < limit);
  useEffect(() => {
    const f = () => setN(window.innerWidth < limit);
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, [limit]);
  return n;
}

/** Zariadenie, ktore nema vibraciu (iOS), to ticho ignoruje. */
export function vibrate(pattern: number | number[]) {
  try { if (typeof navigator.vibrate === 'function') navigator.vibrate(pattern); } catch { /* nic */ }
}

/** Obrazovka sa pocas hry nezhasne. Po navrate z pozadia sa zamok vyziada znova. */
export function useWakeLock(active: boolean) {
  const lock = useRef<{ release: () => Promise<void> } | null>(null);
  useEffect(() => {
    if (!active) return;
    let dead = false;
    const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    if (!wl) return;
    const get = async () => {
      if (dead || document.visibilityState !== 'visible') return;
      try { lock.current = await wl.request('screen'); } catch { /* bez povolenia to ide tiez */ }
    };
    const onVis = () => { if (document.visibilityState === 'visible') get(); };
    get();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      dead = true;
      document.removeEventListener('visibilitychange', onVis);
      lock.current?.release().catch(() => {});
      lock.current = null;
    };
  }, [active]);
}

/** Pri navrate z pozadia: iOS uspi socket, tak sa pripojime znova s tym istym tokenom. */
export function useResumeReconnect(reconnect: () => void) {
  const hiddenAt = useRef(0);
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') { hiddenAt.current = Date.now(); return; }
      if (hiddenAt.current && Date.now() - hiddenAt.current > 1500) reconnect();
      hiddenAt.current = 0;
    };
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) reconnect(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pageshow', onShow);
    window.addEventListener('online', reconnect);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pageshow', onShow);
      window.removeEventListener('online', reconnect);
    };
  }, [reconnect]);
}

/** Vypis varovania, ak je okno na sirku prilis nizke na hru (napr. 568 x 320). */
export function useTooShort() {
  const [v, setV] = useState(false);
  useEffect(() => {
    const f = () => setV(window.innerWidth > window.innerHeight && window.innerHeight < 340);
    f();
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  return v;
}
