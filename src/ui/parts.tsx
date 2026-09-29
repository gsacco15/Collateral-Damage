// Small controls.
import { useRef, type ReactNode } from 'react';
import type { Sources } from '../jev';

export function Seg<T extends string | number>({ value, onChange, options, small }: { value: T; onChange: (v: T) => void; options: [T, string][]; small?: boolean }) {
  return (
    <div className={`seg ${small ? 'small' : ''}`} role="radiogroup">
      {options.map(([v, label]) => (
        <button key={String(v)} className={v === value ? 'on' : ''} onClick={() => onChange(v)} role="radio" aria-checked={v === value}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** A plan step: numbered, with a one-line summary of its current choice, collapsible. */
export function Step({ n, title, summary, status, open, onToggle, children }: { n: number; title: string; summary: string; status?: 'ok' | 'warn' | 'stop'; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className={`step ${open ? 'open' : ''}`}>
      <button className="step-head" onClick={onToggle} aria-expanded={open}>
        <span className={`num ${status ?? ''}`}>{status === 'stop' ? '✕' : status === 'warn' ? '!' : n}</span>
        <span className="t">
          <b>{title}</b>
          <em>{summary}</em>
        </span>
        <span className="chev" aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>
      {open && <div className="step-body">{children}</div>}
    </section>
  );
}

export function Chip({ k, v }: { k: string; v: string }) {
  return (
    <span className="flipchip">
      <small>{k}</small>
      <b>{v}</b>
    </span>
  );
}

export function SourceBars({ s, onUse }: { s: Sources; onUse: (n: number) => void }) {
  const rows: [string, number, string][] = [
    ['Overhead images', s.overhead, 'Only people outside or at a window'],
    ['Phone signals', s.phones, 'Not everyone carries one'],
    ['Census, years old', s.census, 'Who lived here, not who is here now'],
    ["Jev's pattern of life", s.model, 'Expected at this hour'],
  ];
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div className="sources">
      {rows.map(([name, v, note], i) => (
        <button key={name} className={i === 3 ? 'model' : ''} onClick={() => onUse(v)} title={`${note}. Click to use ${v}.`}>
          <span>{name}</span>
          <span className="bar">
            <i style={{ width: `${(v / max) * 100}%` }} />
            <b>{v}</b>
          </span>
        </button>
      ))}
      <small>The sources disagree. Click one to use its count, or set your own.</small>
    </div>
  );
}

export function Dial({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const set = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    let a = (Math.atan2(dx, -dy) * 180) / Math.PI;
    a = (Math.round(a / 15) * 15 + 360) % 360;
    onChange(a);
  };
  const h = (value * Math.PI) / 180;
  const ux = Math.sin(h);
  const uy = -Math.cos(h);
  return (
    <svg
      ref={ref}
      className="dial"
      viewBox="-60 -60 120 120"
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture(e.pointerId);
        set(e);
      }}
      onPointerMove={(e) => e.buttons && set(e)}
      role="slider"
      aria-label="Attack heading"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={359}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange((value + 15) % 360);
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange((value + 345) % 360);
      }}
    >
      <circle r={52} className="ring" />
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i * 15 * Math.PI) / 180;
        const l = i % 6 === 0 ? 8 : 4;
        return <line key={i} x1={Math.sin(a) * 52} y1={-Math.cos(a) * 52} x2={Math.sin(a) * (52 - l)} y2={-Math.cos(a) * (52 - l)} className="tick" />;
      })}
      {['N', 'E', 'S', 'W'].map((t, i) => (
        <text key={t} x={Math.sin((i * Math.PI) / 2) * 38} y={-Math.cos((i * Math.PI) / 2) * 38 + 4} textAnchor="middle">
          {t}
        </text>
      ))}
      <line x1={-ux * 46} y1={-uy * 46} x2={ux * 18} y2={uy * 18} className="track" />
      <g transform={`translate(${ux * 20},${uy * 20}) rotate(${value})`}>
        <path d="M0,-9 L7,6 L0,2 L-7,6 Z" className="plane" />
      </g>
      <circle r={3} className="hub" />
    </svg>
  );
}
