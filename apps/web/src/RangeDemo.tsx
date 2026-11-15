import { useEffect, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Crosshair, Pause, Play } from 'lucide-react';
import { useLang } from './i18n';

/**
 * Animovana schema dostrelu. Hrac "VY" sedi dole, ostatni okolo kruhoveho stola.
 * Kruh dostrelu sa rozsiri tesne za posledneho zasiahnutelneho hraca (vzdialenosti
 * po obvode su monotonne s vzdusnou ciarou, takze kruh je presny).
 * Klik na hraca mu da/odoberie Mustanga (+1), prepinac pridava Hladacik (-1).
 */

const N = 7;
const CX = 180;
const CY = 165;
const SEAT_R = 120;
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const WEAPONS = [
  { name: 'Colt .45', range: 1 },
  { name: 'Schofield', range: 2 },
  { name: 'Remington', range: 3 },
  { name: 'Rev. Carabine', range: 4 },
  { name: 'Winchester', range: 5 },
];

const seat = (i: number) => {
  const a = (Math.PI / 2) + (i * 2 * Math.PI) / N;
  return { x: CX + SEAT_R * Math.cos(a), y: CY + SEAT_R * Math.sin(a) };
};
const tableDist = (i: number) => Math.min(i, N - i);
const chord = (k: number) => 2 * SEAT_R * Math.sin((Math.PI * k) / N);

export function RangeDemo() {
  const { tr } = useLang();
  const [w, setW] = useState(1);
  const [scope, setScope] = useState(false);
  const [mustang, setMustang] = useState<Record<number, boolean>>({});
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setW(x => (x + 1) % 3), 2600);
    return () => clearInterval(t);
  }, [auto]);

  const weapon = WEAPONS[w];
  const ringK = weapon.range + (scope ? 1 : 0);
  const maxD = tableDist(Math.floor(N / 2));
  const ringR = ringK >= maxD ? chord(maxD) + 26 : (chord(ringK) + chord(ringK + 1)) / 2;
  const me = seat(0);

  const eff = (i: number) => Math.max(1, tableDist(i) + (mustang[i] ? 1 : 0) - (scope ? 1 : 0));
  const hit = (i: number) => eff(i) <= weapon.range;
  const hits = Array.from({ length: N - 1 }, (_, k) => k + 1).filter(hit).length;

  const touch = () => setAuto(false);
  const toggleMustang = (i: number) => { touch(); setMustang(m => ({ ...m, [i]: !m[i] })); };
  const onKey = (i: number) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMustang(i); }
  };

  return (
    <div className="rg">
      <div className="rg-head">
        <span className="bang-label">{tr('Schéma: okrúhly stôl (dostrel)', 'Diagram: round table (range)')}</span>
        <span className="rg-count" role="status">{tr('Zasiahnuteľní', 'Reachable')}: <b>{hits}</b> {tr('z', 'of')} {N - 1}</span>
      </div>

      <svg viewBox="0 0 360 330" className="rg-svg" role="img"
        aria-label={tr(`Dostrel ${ringK}. Zbraň ${weapon.name}${scope ? ' s Hľadáčikom' : ''}. Zasiahnuteľných hráčov: ${hits} z ${N - 1}.`, `Range ${ringK}. Weapon ${weapon.name}${scope ? ' with Scope' : ''}. Reachable players: ${hits} of ${N - 1}.`)}>
        <circle cx={CX} cy={CY} r={SEAT_R + 4} className="rg-table" />
        <text x={CX} y={CY - 4} className="rg-center">{tr('SALÓN', 'SALOON')}</text>
        <text x={CX} y={CY + 10} className="rg-center rg-center--sub">{tr('dostrel', 'range')} {ringK}</text>

        {/* kruh dostrelu: plynule sa meni a pri kazdej zmene vyslie vlnu */}
        <circle cx={me.x} cy={me.y} r={ringR} className="rg-ring" />
        <circle key={`${w}-${scope}`} cx={me.x} cy={me.y} r={ringR} className="rg-ripple" style={{ '--R': `${ringR}px` } as CSSProperties} />

        {Array.from({ length: N - 1 }, (_, k) => k + 1).filter(hit).map(i => {
          const p = seat(i);
          return <line key={i} x1={me.x} y1={me.y} x2={p.x} y2={p.y} className="rg-shot" />;
        })}

        {Array.from({ length: N - 1 }, (_, k) => k + 1).map(i => {
          const p = seat(i);
          const ok = hit(i);
          return (
            <g key={i} className={`rg-seat ${ok ? 'is-hit' : 'is-miss'}`} transform={`translate(${p.x} ${p.y})`}
              role="button" tabIndex={0} aria-pressed={!!mustang[i]}
              aria-label={tr(`Hráč ${LETTERS[i - 1]}, vzdialenosť ${eff(i)}, ${ok ? 'v dostrele' : 'mimo dostrelu'}${mustang[i] ? ', má Mustanga' : ''}. Stlač pre prepnutie Mustanga.`, `Player ${LETTERS[i - 1]}, distance ${eff(i)}, ${ok ? 'in range' : 'out of range'}${mustang[i] ? ', has a Mustang' : ''}. Press to toggle the Mustang.`)}
              onClick={() => toggleMustang(i)} onKeyDown={onKey(i)}>
              <circle r="17" />
              <text y="4" className="rg-letter">{LETTERS[i - 1]}</text>
              <text y="32" className="rg-dist">d = {eff(i)}{mustang[i] ? ' (Mustang)' : ''}</text>
              {!ok && (
                <g className="rg-x" transform="translate(0 -26)">
                  <line x1="-4" y1="-4" x2="4" y2="4" /><line x1="-4" y1="4" x2="4" y2="-4" />
                </g>
              )}
            </g>
          );
        })}

        <g transform={`translate(${me.x} ${me.y})`}>
          <circle r="20" className="rg-me" />
          <text y="4" className="rg-me-t">{tr('VY', 'YOU')}</text>
        </g>
      </svg>

      <div className="rg-controls">
        <div className="rg-weapons" role="group" aria-label={tr('Zbraň', 'Weapon')}>
          {WEAPONS.map((x, i) => (
            <button key={x.name} type="button" className={i === w ? 'is-active' : ''} aria-pressed={i === w}
              onClick={() => { touch(); setW(i); }}>
              {x.name}<small>{tr('dostrel', 'range')} {x.range}</small>
            </button>
          ))}
        </div>
        <label className="rg-scope">
          <input type="checkbox" checked={scope} onChange={e => { touch(); setScope(e.target.checked); }} />
          <span className="ic"><Crosshair size={15} />{tr('Hľadáčik (−1 ku každému cieľu)', 'Scope (−1 to every target)')}</span>
        </label>
        <button type="button" className="rg-auto" onClick={() => setAuto(a => !a)} aria-pressed={auto}>
          {auto ? <><Pause size={14} />{tr('Zastaviť ukážku', 'Pause demo')}</> : <><Play size={14} />{tr('Spustiť ukážku', 'Start demo')}</>}
        </button>
      </div>
      <p className="rg-note">
        {tr('Klikni na hráča a daj mu Mustanga (+1 vzdialenosť). Pri 7 hráčoch je najďalej sediaci hráč vo vzdialenosti 3, takže Remington už dosiahne každého, no Carabine a Winchester sa hodia, keď sa ciele schovávajú za Mustangov.', 'Click a player to give them a Mustang (+1 distance). With 7 players the farthest seated player is at distance 3, so the Remington already reaches everyone, but the Carabine and Winchester help when targets hide behind Mustangs.')}
      </p>
    </div>
  );
}
