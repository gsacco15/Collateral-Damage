// Small pieces of the interface, in the explainer's paper style.
import { useRef, type ReactNode } from 'react';
import { fmtHour, RULES, WEAPONS, type Approval, type Estimate, type Rules, type Scored, type Sources, type WeaponId } from '../jev';

export type HistMode = 'spread' | 'figure' | 'thresholds';
export const pct = (v: number) => `${Math.round(v * 100)}%`;

export function Group({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="cd-group">
      <h3>
        <span>{n}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

export function Seg<T extends string | number>({ value, onChange, options, small }: { value: T; onChange: (v: T) => void; options: [T, string][]; small?: boolean }) {
  return (
    <div className={`cd-seg ${small ? 'small' : ''}`} role="radiogroup">
      {options.map(([v, label]) => (
        <button key={String(v)} className={v === value ? 'on' : ''} onClick={() => onChange(v)} role="radio" aria-checked={v === value}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ k, v }: { k: string; v: string }) {
  return (
    <span className="cd-flipchip">
      <small>{k}</small>
      <b>{v}</b>
    </span>
  );
}

// ---------------------------------------------------------------- the estimate checklist

export function Checklist(p: { lawful: boolean; circle: string; weaponLine: string; reduce: string; computing: boolean; signoff: string }) {
  const rows: { done: boolean | 'spin'; t: string; sub?: string; warn?: boolean }[] = [
    { done: p.lawful, t: 'Lawful target', sub: p.lawful ? undefined : 'Not confirmed: stop here', warn: !p.lawful },
    { done: p.lawful, t: 'Crude circle: anything inside?', sub: p.circle },
    { done: p.lawful, t: 'Weapon, fuze, direction, aim', sub: p.weaponLine },
    { done: false, t: 'Ways to reduce the harm', sub: p.reduce },
    { done: p.computing ? 'spin' : p.lawful, t: 'Run the estimate again' },
    { done: p.lawful && !p.computing, t: 'Who signs off', sub: p.signoff },
  ];
  return (
    <div className="cd-card cd-checklist">
      <h4>The estimate</h4>
      {rows.map((r, i) => (
        <div key={i} className="cd-item">
          <span className={`box ${r.done === 'spin' ? 'spin' : r.done ? 'done' : ''}`}>
            {r.done === true && (
              <svg viewBox="0 0 20 20">
                <path d="M4 10.5l4 4 8-10" />
              </svg>
            )}
          </span>
          <div>
            <b>{r.t}</b>
            {r.sub && <em className={r.warn ? 'warn' : ''}>{r.sub}</em>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- the histogram, three ways

function Box({ x, y, text, anchor = 'middle', tone = 'ink', size = 11 }: { x: number; y: number; text: string; anchor?: 'start' | 'middle' | 'end'; tone?: 'ink' | 'brick'; size?: number }) {
  const w = text.length * size * 0.56 + 12;
  const left = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
  return (
    <g className={`box ${tone}`}>
      <rect x={left + 1.5} y={y - size - 3.5} width={w} height={size + 9} className="shadow" />
      <rect x={left} y={y - size - 5} width={w} height={size + 9} />
      <text x={left + w / 2} y={y} textAnchor="middle" style={{ fontSize: size }}>
        {text}
      </text>
    </g>
  );
}

export function Histogram({ est, rules, computing, aside, mode, onMode }: { est: Estimate; rules: Rules; computing: boolean; aside: boolean; mode: HistMode; onMode: (m: HistMode) => void }) {
  const step = [1, 2, 5, 10, 20].find((k) => est.max / k <= 32) ?? 50;
  const maxX = Math.max(30, Math.ceil((est.max + 1) / (step * 5)) * step * 5);
  const nb = Math.floor(maxX / step) + 1;
  const bins = new Array(nb).fill(0);
  for (const c of est.counts) bins[Math.min(nb - 1, Math.floor(c / step))]++;
  const peak = Math.max(...bins, 1);
  const W = 300;
  const H = 150;
  const bw = W / nb;
  const x = (v: number) => (v / step + 0.5) * bw;
  const barTop = (i: number) => H - (bins[i] / peak) * (H - 8);
  const tickStep = maxX <= 30 ? 5 : maxX <= 60 ? 10 : maxX <= 150 ? 25 : maxX <= 400 ? 50 : 100;
  const ticks = Array.from({ length: Math.floor(maxX / tickStep) + 1 }, (_, i) => i * tickStep);
  const low = est.p50;
  let lowRuns = 0;
  for (const c of est.counts) if (c <= low) lowRuns++;
  const maxBin = Math.min(nb - 1, Math.floor(est.max / step));
  const barClass = (i: number) => (mode === 'spread' ? (i * step <= low ? 'in' : 'out') : 'grey');
  return (
    <div className={`cd-card cd-hist ${computing ? 'busy' : ''} ${aside ? 'aside' : ''}`}>
      <div className="cd-hist-head">
        <h4>{aside ? 'Your plan, while Jev tests others' : 'Our model: killed or badly hurt'}</h4>
        <span className="mono">{est.runs} runs</span>
      </div>
      <svg viewBox={`-6 -40 ${W + 12} ${H + 72}`} role="img" aria-label={`Histogram of ${est.runs} runs. ${lowRuns} at ${low} or fewer. Cautious figure ${est.p90}. Worst ${est.max}.`}>
        {mode === 'spread' && (
          <text x={W / 2} y={-26} textAnchor="middle" className="sub">
            {lowRuns} of {est.runs} runs: {low === 0 ? 'none' : `${low} or fewer`}
          </text>
        )}
        {bins.map((_, i) => (
          <rect key={i} x={i * bw + 0.6} width={Math.max(0.5, bw - 1.2)} y={barTop(i)} height={H - barTop(i)} className={barClass(i)} />
        ))}
        {mode === 'spread' && (
          <>
            {bins[0] > 0 && (
              <g className="lead">
                <line x1={x(0)} x2={x(0)} y1={-2} y2={barTop(0)} />
                <circle cx={x(0)} cy={barTop(0)} r={2} />
                <Box x={x(0) - 4} y={-4} text="None" anchor="start" size={12} />
              </g>
            )}
            {est.max > 0 && (
              <g className="lead">
                <line x1={x(maxBin * step)} x2={x(maxBin * step)} y1={18} y2={H} />
                <circle cx={x(maxBin * step)} cy={H} r={2} />
                <Box x={Math.min(x(maxBin * step), W - 14)} y={20} text={String(est.max)} size={12} />
              </g>
            )}
          </>
        )}
        {mode === 'thresholds' &&
          RULES.map((r, i) => {
            if (r.senior > maxX) return null;
            const right = r.senior > maxX * 0.6;
            return (
              <g key={r.id} className={r.id === rules.id ? 'rule on' : 'rule'}>
                <line x1={x(r.senior)} x2={x(r.senior)} y1={-24 + i * 24} y2={H} />
                <circle cx={x(r.senior)} cy={-24 + i * 24} r={2.2} />
                <Box x={x(r.senior) + (right ? 6 : -4)} y={2 + i * 24} text={`${r.name}: ${r.senior}`} anchor={right ? 'end' : 'start'} size={11} />
              </g>
            );
          })}
        {mode !== 'spread' && (
          <g className="fig">
            <line x1={x(est.p90)} x2={x(est.p90)} y1={-34} y2={H} />
            <path d={`M${x(est.p90) - 5},-38 L${x(est.p90) + 5},-38 L${x(est.p90)},-30 Z`} />
            {mode === 'figure' && (
              <>
                <line x1={x(est.p90) - 12} x2={x(est.p90)} y1={20} y2={20} />
                <circle cx={x(est.p90)} cy={20} r={2} />
                <Box x={Math.max(x(est.p90) - 12, 170)} y={25} text={`One cautious figure: ${est.p90}`} anchor="end" tone="brick" size={11.5} />
              </>
            )}
          </g>
        )}
        <line x1={0} x2={W} y1={H} y2={H} className="axis" />
        {ticks.map((t) => (
          <text key={t} x={x(t)} y={H + 16} textAnchor="middle" className="tick">
            {t}
          </text>
        ))}
        <text x={W / 2} y={H + 30} textAnchor="middle" className="tick label">
          people
        </text>
      </svg>
      {mode === 'thresholds' && <div className="cd-hist-caption">Thresholds for senior approval, reportedly</div>}
      <div className="cd-hist-foot">
        nine in ten runs at or below <b>{est.p90}</b> · median <b>{est.p50}</b> · target destroyed <b>{pct(est.pk)}</b>
        {est.secondary > 0.01 && (
          <>
            {' '}
            · something else went off in <b>{pct(est.secondary)}</b>
          </>
        )}
      </div>
      <div className="cd-hist-tabs" role="tablist">
        {(
          [
            ['spread', 'The spread'],
            ['figure', 'One figure'],
            ['thresholds', 'Thresholds'],
          ] as [HistMode, string][]
        ).map(([m, name]) => (
          <button key={m} className={mode === m ? 'on' : ''} onClick={() => onMode(m)} role="tab" aria-selected={mode === m}>
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ApproveCard({ a, figure, rules }: { a: Approval; figure: number; rules: Rules }) {
  return (
    <div className="cd-card cd-approve">
      <h4>Who must approve</h4>
      {['Most senior', 'More senior', 'Senior'].map((r, i) => (
        <div key={r} className={3 - i === a.level ? 'on' : ''}>
          {r}
        </div>
      ))}
      <small>{a.level === 0 ? 'No civilian harm expected: the strike cell signs.' : `Figure ${figure}; senior sign-off at ${rules.senior}. ${a.note.includes('protected') ? 'Protected site in the circle: one level up.' : ''}`}</small>
    </div>
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
    <div className="cd-sources">
      {rows.map(([name, v, note], i) => (
        <button key={name} className={i === 2 ? 'old' : i === 3 ? 'model' : ''} onClick={() => onUse(v)} title={`${note}. Click to use ${v}.`}>
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
      className="cd-dial"
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

export function HourBars({ values, hour, onPick }: { values: number[]; hour: number; onPick: (h: number) => void }) {
  const max = Math.max(1, ...values);
  return (
    <div className="cd-hours" role="group" aria-label="Planning figure by hour for this plan">
      {values.map((v, h) => (
        <button key={h} className={Math.floor(hour) === h ? 'on' : ''} onClick={() => onPick(h)} title={`${fmtHour(h)}: planning figure ${v}`}>
          <i style={{ height: `${6 + (v / max) * 94}%` }} />
        </button>
      ))}
      <div className="cd-hours-axis">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
    </div>
  );
}

const W_COL: Record<WeaponId, string> = { large: '#efe9dc', medium: '#b89a72', small: '#e3876c', focused: '#8fc0ea' };

export function Scatter({ results, best: b, minPk, onPeek, onPick }: { results: Scored[]; best?: Scored; minPk: number; onPeek: (s: Scored | null) => void; onPick: (s: Scored) => void }) {
  const W = 320;
  const H = 210;
  const maxX = Math.max(10, ...results.map((r) => r.p90));
  const x = (v: number) => 28 + (v / maxX) * (W - 40);
  const y = (v: number) => H - 40 - v * (H - 54);
  const j = (s: Scored, k: number) => (((s.c.heading * 7 + s.c.hour * 13 + (s.c.aim.length + k) * 5) % 11) - 5) * 0.5;
  return (
    <svg className="cd-scatter" viewBox={`0 0 ${W} ${H}`} onPointerLeave={() => onPeek(null)}>
      <rect x={28} y={y(1)} width={W - 40} height={y(minPk) - y(1)} className="ok" />
      <line x1={28} x2={W - 12} y1={y(minPk)} y2={y(minPk)} className="req" />
      <text x={W - 12} y={y(minPk) - 4} textAnchor="end" className="lab">
        requirement {pct(minPk)}
      </text>
      <line x1={28} x2={28} y1={y(0)} y2={y(1)} className="axis" />
      <line x1={28} x2={W - 12} y1={y(0)} y2={y(0)} className="axis" />
      <text x={24} y={y(1) + 4} textAnchor="end" className="lab">
        100%
      </text>
      <text x={24} y={y(0)} textAnchor="end" className="lab">
        0
      </text>
      <text x={W - 12} y={y(0) + 13} textAnchor="end" className="lab">
        planning figure → {maxX}
      </text>
      <text x={32} y={y(1) - 2} className="lab">
        target destroyed ↑
      </text>
      {results.map((s, i) => (
        <circle key={i} cx={x(s.p90) + j(s, 1)} cy={y(s.pk) + j(s, 2)} r={2.2} fill={W_COL[s.c.weapon]} opacity={s.pk >= minPk ? 0.75 : 0.18} onPointerEnter={() => onPeek(s)} onClick={() => onPick(s)} />
      ))}
      {b && <circle cx={x(b.p90) + j(b, 1)} cy={y(b.pk) + j(b, 2)} r={6} className="best" />}
      <g className="legend">
        {WEAPONS.map((wp, i) => (
          <g key={wp.id} transform={`translate(${34 + i * 72},${H - 6})`}>
            <circle r={3} fill={W_COL[wp.id]} cy={-3} />
            <text x={6} y={0}>
              {wp.short}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/** A stack of paper books on a desk, with a pencil: the tables. */
export function TablesScene() {
  return (
    <div className="cd-desk" aria-hidden>
      <svg viewBox="0 0 400 260">
        <defs>
          <linearGradient id="wood" x1="0" x2="1">
            <stop offset="0" stopColor="#c98a4b" />
            <stop offset="0.5" stopColor="#b8773c" />
            <stop offset="1" stopColor="#d49a5c" />
          </linearGradient>
          <linearGradient id="cover" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#dedbd4" />
            <stop offset="1" stopColor="#c9c5bc" />
          </linearGradient>
        </defs>
        <rect width="400" height="260" fill="url(#wood)" />
        {Array.from({ length: 9 }, (_, i) => (
          <path key={i} d={`M0 ${18 + i * 30} Q200 ${10 + i * 30 + (i % 2) * 14} 400 ${22 + i * 30}`} stroke="rgba(90,50,20,0.18)" fill="none" />
        ))}
        <polygon points="20,20 390,8 396,250 12,254" fill="#f4f0e6" />
        <polygon points="20,20 390,8 396,90 12,120" fill="rgba(60,40,20,0.08)" />
        {[2, 1, 0].map((k) => (
          <g key={k} transform={`translate(${96 + k * 3},${108 - k * 16})`}>
            <polygon points="0,40 150,22 196,56 46,78" fill="#8f8a80" transform="translate(4,8)" opacity="0.35" />
            <polygon points="0,40 46,78 46,92 0,54" fill="#e9e6de" />
            <polygon points="46,78 196,56 196,70 46,92" fill="#f7f5f0" />
            {Array.from({ length: 5 }, (_, j) => (
              <line key={j} x1={50 + j * 28} y1={82 - j * 4} x2={70 + j * 28} y2={79 - j * 4} stroke="#9a958b" strokeWidth="0.6" />
            ))}
            <polygon points="0,40 150,22 196,56 46,78" fill="url(#cover)" stroke="#8f8a80" strokeWidth="0.6" />
          </g>
        ))}
        <g transform="translate(270,150) rotate(-18)">
          <rect width="110" height="7" fill="#1f3a2c" />
          <polygon points="0,0 -16,3.5 0,7" fill="#e3c9a0" />
          <polygon points="-11,2.3 -16,3.5 -11,4.7" fill="#2a2520" />
          <rect x="104" width="9" height="7" fill="#c9a44c" />
          <rect x="113" width="8" height="7" fill="#e28b8b" rx="1.5" />
        </g>
        <rect x="300" y="186" width="30" height="20" rx="4" fill="#efe9dc" transform="rotate(-12 315 196)" />
        <line x1="171" y1="130" x2="171" y2="40" stroke="#231f1a" strokeWidth="1.2" />
        <circle cx="171" cy="130" r="2.5" fill="#231f1a" />
      </svg>
      <span className="cd-desk-label">Tables for blast and fragments</span>
      <span className="cd-desk-note">Reissued at least twice a year, reportedly</span>
    </div>
  );
}
