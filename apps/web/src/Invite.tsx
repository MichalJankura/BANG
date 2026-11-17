import { useEffect, useRef, useState } from 'react';
import { Check, Link2 } from 'lucide-react';
import { useLang } from './i18n';

/** Z textu vyberie platny kod miestnosti (velke pismena A-Z, max 6 znakov). */
export function cleanRoomCode(raw: string | null | undefined): string {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
}

/** Kod z pozvanky (?room=KOD) v adrese stranky; prazdny retazec, ak ziadny nie je. */
export function roomFromUrl(): string {
  try { return cleanRoomCode(new URLSearchParams(location.search).get('room')); } catch { return ''; }
}

/** Odstrani ?room= z adresy, aby sa po navrate na uvodnu obrazovku kod nepredvyplnal znova. */
export function stripRoomFromUrl(): void {
  try {
    const u = new URL(location.href);
    if (!u.searchParams.has('room')) return;
    u.searchParams.delete('room');
    history.replaceState(null, '', u.pathname + u.search + u.hash);
  } catch { /* adresa sa neda upravit, nevadi */ }
}

export function inviteUrl(code: string): string {
  return `${location.origin}/?room=${encodeURIComponent(cleanRoomCode(code))}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* spadne na zalozny sposob */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

/** Tlacidlo pozvanky: na mobile otvori systemove zdielanie, inak skopiruje odkaz do schranky. */
export function InviteButton({ code, className }: { code: string; className?: string }) {
  const { tr } = useLang();
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  const flash = (s: 'copied' | 'failed') => {
    setState(s);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2200);
  };

  const onClick = async () => {
    const url = inviteUrl(code);
    const text = tr(`Poď si zahrať BANG! Kód stola: ${code}`, `Come play BANG! Table code: ${code}`);
    if (typeof navigator.share === 'function' && window.matchMedia?.('(pointer: coarse)').matches) {
      try { await navigator.share({ title: 'BANG!', text, url }); return; }
      catch (e) { if ((e as DOMException)?.name === 'AbortError') return; /* ine zlyhanie: skusi sa kopirovanie */ }
    }
    flash((await copyText(url)) ? 'copied' : 'failed');
  };

  return (
    <button type="button" className={className ?? 'bang-btn invite-btn'} onClick={onClick} aria-live="polite">
      {state === 'copied' ? <Check size={16} /> : <Link2 size={16} />}
      {state === 'copied' ? tr('Odkaz skopírovaný', 'Link copied')
        : state === 'failed' ? tr('Kopírovanie zlyhalo', 'Copy failed')
        : tr('Pozvať kamarátov', 'Invite friends')}
    </button>
  );
}
