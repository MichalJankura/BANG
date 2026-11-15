import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';

export type Lang = 'sk' | 'en';
export type Bi = readonly [string, string];

const KEY = 'bang.lang';
const read = (): Lang => {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'sk' || v === 'en') return v;
  } catch { /* ignore */ }
  return 'sk';
};

/** Aktualny jazyk aj pre funkcie mimo Reactu (nazvy kariet, titulky). */
let current: Lang = read();
export const getLang = () => current;

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: current, setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, set] = useState<Lang>(current);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = (l: Lang) => {
    current = l;
    try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
    set(l);
  };
  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}

/** tr('slovensky', 'english') alebo tr(['slovensky', 'english']). */
export function useLang() {
  const { lang, setLang } = useContext(Ctx);
  const tr = (a: string | Bi, b?: string) => (typeof a === 'string' ? (lang === 'sk' ? a : b ?? a) : a[lang === 'sk' ? 0 : 1]);
  return { lang, setLang, tr };
}

export function Flag({ lang, size = 22 }: { lang: Lang; size?: number }) {
  return lang === 'sk' ? (
    <svg width={size} height={(size * 2) / 3} viewBox="0 0 30 20" aria-hidden="true" className="flag">
      <rect width="30" height="20" fill="#fff" /><rect y="6.67" width="30" height="6.67" fill="#0b4ea2" /><rect y="13.33" width="30" height="6.67" fill="#ee1c25" />
      <path d="M5 4h8v7.2c0 2.6-2.2 4.2-4 4.8-1.8-.6-4-2.2-4-4.8z" fill="#ee1c25" stroke="#fff" strokeWidth=".8" />
      <path d="M9 5.6v7.6M6.8 7.4h4.4M7.3 9.4h3.4" stroke="#fff" strokeWidth="1" />
    </svg>
  ) : (
    <svg width={size} height={(size * 2) / 3} viewBox="0 0 60 40" aria-hidden="true" className="flag">
      <rect width="60" height="40" fill="#012169" />
      <path d="M0 0l60 40M60 0L0 40" stroke="#fff" strokeWidth="8" />
      <path d="M0 0l60 40M60 0L0 40" stroke="#c8102e" strokeWidth="3" />
      <path d="M30 0v40M0 20h60" stroke="#fff" strokeWidth="13" />
      <path d="M30 0v40M0 20h60" stroke="#c8102e" strokeWidth="7" />
    </svg>
  );
}

const NAMES: Record<Lang, string> = { sk: 'Slovensky', en: 'English' };

/** Vlajka v liste: po kliknuti sa otvori vyber jazyka. */
export function LangSwitch() {
  const { lang, setLang, tr } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="lang" ref={ref}>
      <button type="button" className="lang__btn" aria-haspopup="listbox" aria-expanded={open}
        aria-label={tr('Jazyk', 'Language') + ': ' + NAMES[lang]} title={tr('Zmeniť jazyk', 'Change language')} onClick={() => setOpen(o => !o)}>
        <Flag lang={lang} />
      </button>
      {open && (
        <ul className="lang__menu" role="listbox" aria-label={tr('Jazyk', 'Language')}>
          {(['sk', 'en'] as Lang[]).map(l => (
            <li key={l} role="option" aria-selected={l === lang}>
              <button type="button" className={l === lang ? 'is-active' : ''} onClick={() => { setLang(l); setOpen(false); }}>
                <Flag lang={l} size={20} /><span>{NAMES[l]}</span>{l === lang && <Check size={14} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
