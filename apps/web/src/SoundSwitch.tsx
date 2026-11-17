import { useLang } from './i18n';
import { setSfxEnabled, useSfxEnabled } from './sound';

/** Nota vedla vlajky: zapina a vypina zvukove efekty. Vypnuta je preskrtnuta. */
export function SoundSwitch() {
  const { tr } = useLang();
  const on = useSfxEnabled();
  const label = on ? tr('Vypnúť zvukové efekty', 'Turn sound effects off') : tr('Zapnúť zvukové efekty', 'Turn sound effects on');
  return (
    <button type="button" className={`lang__btn sfx-btn${on ? '' : ' is-off'}`} aria-pressed={on}
      aria-label={tr('Zvukové efekty', 'Sound effects')} title={label} onClick={() => setSfxEnabled(!on)}>
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
        <path className="sfx-note" d="M9 18.2V5.6l10-2.4v12.4" fill="none" strokeWidth="2" strokeLinejoin="round" />
        <ellipse className="sfx-head" cx="6.2" cy="18.4" rx="3.2" ry="2.5" transform="rotate(-18 6.2 18.4)" />
        <ellipse className="sfx-head" cx="16.2" cy="15.8" rx="3.2" ry="2.5" transform="rotate(-18 16.2 15.8)" />
        <path className="sfx-note" d="M9 9.2l10-2.4" fill="none" strokeWidth="2" />
        {!on && <>
          <path className="sfx-halo" d="M3.5 3.5l17 17" fill="none" strokeWidth="5.5" strokeLinecap="round" />
          <path className="sfx-strike" d="M3.5 3.5l17 17" fill="none" strokeWidth="2.4" strokeLinecap="round" />
        </>}
      </svg>
    </button>
  );
}
