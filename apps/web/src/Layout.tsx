import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { BASE_H, BASE_W, makeGeo, type Geo } from './geometry';

/**
 * Stol sa meria v mieste, ktore mu zostalo. Z rozmeru sa spocita geometria (elipsa, miesta, stol)
 * pre dany pomer stran; faktor k len drzi velkost tabuliek a textu v rozumnych medziach.
 * Telefon na sirku (compact) ma vlastne male tabulky a ide bez skalovania.
 */
export function Stage({ compact, children }: { compact: boolean; children: (geo: Geo) => ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: BASE_W, h: BASE_H });
  useLayoutEffect(() => {
    const el = host.current!;
    const read = (w: number, h: number) => setSize(s => (Math.abs(s.w - w) < 1 && Math.abs(s.h - h) < 1 ? s : { w, h }));
    const r = el.getBoundingClientRect();
    read(r.width, r.height);
    const ro = new ResizeObserver(e => read(e[0].contentRect.width, e[0].contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const k = compact ? 1 : Math.max(0.72, Math.min(1.3, size.w / BASE_W, size.h / BASE_H));
  const geo = makeGeo(size.w / k, size.h / k, compact);
  const { TABLE, CHALK } = geo;
  return (
    <div className={`stage-host ${compact ? 'is-compact' : ''}`} ref={host}>
      <div className="bang-stage" style={{ width: geo.W, height: geo.H, transform: k === 1 ? 'none' : `scale(${k})`, transformOrigin: '0 0', ['--k' as string]: k } as CSSProperties}>
        <div className="bang-table" style={{ left: TABLE.left, top: TABLE.top, width: TABLE.w, height: TABLE.h }}>
          <div className="bang-felt"><div className="bang-chalk" style={{ width: CHALK.w, height: CHALK.h }} /></div>
        </div>
        {children(geo)}
      </div>
    </div>
  );
}

export function Poster({ kicker, title, children, wide, labelId = 'poster-title' }: { kicker: string; title: ReactNode; children?: ReactNode; wide?: boolean; labelId?: string }) {
  return (
    <div className={`bang-prompt stage-prompt ${wide ? 'is-wide' : ''}`} role="alertdialog" aria-labelledby={labelId}>
      <div className="bang-prompt__kicker">{kicker}</div>
      <h2 id={labelId} className="bang-prompt__title">{title}</h2>
      {children}
    </div>
  );
}

export function Shell({ top, stage, left, center, right }: { top: ReactNode; stage: ReactNode; left: ReactNode; center: ReactNode; right: ReactNode }) {
  return (
    <main className="game">
      <header className="topbar">{top}</header>
      {stage}
      <section className="band">
        <div className="band-left">{left}</div>
        <div className="band-center">{center}</div>
        <div className="band-right">{right}</div>
      </section>
    </main>
  );
}
