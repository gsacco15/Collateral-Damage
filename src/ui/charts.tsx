// Charts for the estimate and for Jev. One axis each, thin marks, hover on every mark, text in text colours.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { fmtHour, placeName, type Approval, type Estimate, type Rules, type Scored, type World } from '../jev';

export const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`;

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(160, el.clientWidth)));
    ro.observe(el);
    setW(Math.max(160, el.clientWidth));
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** A column with a 4px rounded data end, square at the baseline. */
function col(x: number, y: number, w: number, h: number) {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function Tip({ x, y, children, width }: { x: number; y: number; children: ReactNode; width: number }) {
  const left = Math.min(Math.max(4, x + 12), width - 180);
  return (
    <div className="tip" style={{ left, top: Math.max(0, y - 8) }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- headline numbers

export function StatTiles({ est }: { est: Estimate }) {
  let any = 0;
  for (const c of est.counts) if (c > 0) any++;
  const tiles: [string, string, string][] = [
    ['Expected', est.mean < 10 ? est.mean.toFixed(1) : Math.round(est.mean).toString(), 'people killed or badly hurt, on average'],
    ['Planning figure', String(est.p90), 'nine in ten runs at or below'],
    ['Any harm', pct(any / est.runs), 'chance of at least one person'],
    ['Target destroyed', pct(est.pk), 'share of runs'],
  ];
  return (
    <div className="tiles">
      {tiles.map(([k, v, note]) => (
        <div key={k} className="tile">
          <span className="k">{k}</span>
          <b>{v}</b>
          <span className="n">{note}</span>
        </div>
      ))}
    </div>
  );
}

const STATUS = [
  { cls: 'good', icon: '✓', name: 'Strike cell' },
  { cls: 'warning', icon: '!', name: 'Senior' },
  { cls: 'serious', icon: '!!', name: 'More senior' },
  { cls: 'critical', icon: '!!!', name: 'Most senior' },
];

export function ApprovalLadder({ a }: { a: Approval }) {
  return (
    <div className="ladder" role="list" aria-label={`Approval: ${a.who}`}>
      {STATUS.map((s, i) => (
        <div key={s.name} role="listitem" className={`rung ${s.cls} ${i === a.level ? 'on' : i < a.level ? 'past' : ''}`}>
          <i aria-hidden>{s.icon}</i>
          <span>{s.name}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- the distribution, and the chance of at least N

export function Distribution({ est, rules }: { est: Estimate; rules: Rules }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const step = [1, 2, 5, 10, 20].find((k) => est.max / k <= 30) ?? 50;
  const maxX = Math.max(10, Math.ceil((est.max + 1) / (step * 5)) * step * 5);
  const nb = Math.floor(maxX / step) + 1;
  const bins = new Array(nb).fill(0);
  for (const c of est.counts) bins[Math.min(nb - 1, Math.floor(c / step))]++;
  const peak = Math.max(...bins, 1);
  // Chance of at least n.
  const sorted = est.counts.slice().sort();
  const atLeast = (n: number) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (sorted[m] < n) lo = m + 1;
      else hi = m;
    }
    return (sorted.length - lo) / sorted.length;
  };
  const L = 30;
  const R = 12;
  const pw = W - L - R;
  const x = (v: number) => L + (v / (maxX + step)) * pw;
  const bw = Math.min(24, Math.max(2, pw / nb - 2));
  const H1 = 110;
  const H2 = 84;
  const gap = 34;
  const y1 = (v: number) => 10 + H1 - (v / peak) * H1;
  const top2 = 10 + H1 + gap;
  const y2 = (p: number) => top2 + H2 - p * H2;
  const tickStep = maxX <= 20 ? 5 : maxX <= 50 ? 10 : maxX <= 150 ? 25 : maxX <= 400 ? 50 : 100;
  const ticks = Array.from({ length: Math.floor(maxX / tickStep) + 1 }, (_, i) => i * tickStep);
  const T = rules.senior;
  const pT = atLeast(T);
  const curve: string[] = [];
  for (let n = 0; n <= maxX; n += Math.max(1, step / 2)) curve.push(`${x(n).toFixed(1)},${y2(atLeast(n)).toFixed(1)}`);
  const hv = hover != null ? Math.min(nb - 1, Math.max(0, hover)) : null;
  const H = top2 + H2 + 26;
  return (
    <div className="chart" ref={ref} onPointerLeave={() => setHover(null)}>
      <svg
        width={W}
        height={H}
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const v = ((e.clientX - r.left - L) / pw) * (maxX + step);
          setHover(Math.floor(v / step));
        }}
        role="img"
        aria-label={`Distribution of ${est.runs} runs. Median ${est.p50}, nine in ten at or below ${est.p90}. Chance of ${T} or more: ${pct(pT)}.`}
      >
        {/* Histogram */}
        <text x={L} y={4} className="ax-title">
          Runs by number of people killed or badly hurt
        </text>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={y1(peak * f)} y2={y1(peak * f)} className="grid" />
            <text x={L - 6} y={y1(peak * f) + 3} textAnchor="end" className="tick">
              {pct((peak * f) / est.runs)}
            </text>
          </g>
        ))}
        {bins.map((b, i) => (
          <path key={i} d={col(x(i * step) + 1, y1(b), bw, H1 + 10 - y1(b))} className={`bar ${hv === i ? 'hot' : ''}`} />
        ))}
        {[
          [est.p50, 'median'],
          [est.p90, '9 in 10'],
        ].map(([v, name]) => (
          <g key={name as string} className="mark">
            <line x1={x(v as number) + bw / 2 + 1} x2={x(v as number) + bw / 2 + 1} y1={14} y2={10 + H1} />
            <text x={x(v as number) + bw / 2 + 4} y={name === 'median' ? 24 : 36} className="mark-label">
              {name} {v}
            </text>
          </g>
        ))}
        {/* Chance of at least n */}
        <text x={L} y={top2 - 10} className="ax-title">
          Chance of at least this many people
        </text>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={y2(f)} y2={y2(f)} className="grid" />
            <text x={L - 6} y={y2(f) + 3} textAnchor="end" className="tick">
              {pct(f)}
            </text>
          </g>
        ))}
        <polygon points={`${x(0)},${y2(0)} ${curve.join(' ')} ${x(maxX)},${y2(0)}`} className="wash" />
        <polyline points={curve.join(' ')} className="line" />
        {T <= maxX && (
          <g className="rule">
            <line x1={x(T)} x2={x(T)} y1={top2 - 4} y2={top2 + H2} />
            <circle cx={x(T)} cy={y2(pT)} r={4} className="dot" />
            <text x={x(T) + (x(T) > W * 0.6 ? -8 : 8)} y={y2(pT) - 8} textAnchor={x(T) > W * 0.6 ? 'end' : 'start'} className="mark-label strong">
              {pct(pT)} chance of {T}+
            </text>
          </g>
        )}
        {ticks.map((t) => (
          <text key={t} x={x(t) + bw / 2} y={top2 + H2 + 14} textAnchor="middle" className="tick">
            {t}
          </text>
        ))}
        {hv != null && <line x1={x(hv * step) + bw / 2 + 1} x2={x(hv * step) + bw / 2 + 1} y1={top2} y2={top2 + H2} className="cross" />}
      </svg>
      {hv != null && (
        <Tip x={x(hv * step)} y={y1(bins[hv])} width={W}>
          <b>{step === 1 ? `${hv * step} people` : `${hv * step}–${hv * step + step - 1} people`}</b>
          <span>
            {bins[hv]} of {est.runs} runs ({pct(bins[hv] / est.runs)})
          </span>
          <span>
            chance of {hv * step}+: {pct(atLeast(hv * step))}
          </span>
        </Tip>
      )}
      <p className="chart-note">
        Dashed line: senior sign-off at {T} or more ({rules.name}, reportedly).
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- where the harm comes from

const SOURCE_KEYS = [
  ['buildings', 'Inside buildings', 's1'],
  ['spaces', 'Open ground', 's2'],
  ['street', 'On foot', 's3'],
  ['traffic', 'In cars', 's4'],
] as const;

export function Breakdown({ world, est, onPick }: { world: World; est: Estimate; onPick: (kind: 'b' | 's', id: number) => void }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  let b = 0;
  for (const v of est.byBuilding) b += v;
  let s = 0;
  for (const v of est.bySpace) s += v;
  const vals: Record<string, number> = { buildings: b, spaces: s, street: est.street, traffic: est.traffic };
  const total = b + s + est.street + est.traffic;
  // Top places.
  const places: { kind: 'b' | 's'; id: number; name: string; v: number; note: string }[] = [];
  est.byBuilding.forEach((v, id) => {
    if (v > 0.05) {
      const bb = world.buildings[id];
      places.push({ kind: 'b', id, name: placeName(bb), v, note: bb.protected ? 'protected' : bb.hazard ? 'hazard' : '' });
    }
  });
  est.bySpace.forEach((v, id) => {
    if (v > 0.05) places.push({ kind: 's', id, name: world.spaces[id].name ?? world.spaces[id].kind, v, note: 'open ground' });
  });
  places.sort((p, q) => q.v - p.v);
  const top = places.slice(0, 6);
  const maxV = Math.max(0.1, ...top.map((p) => p.v));
  let acc = 0;
  return (
    <div className="chart" ref={ref}>
      {total < 0.05 ? (
        <p className="chart-note">No one is expected to be hurt by this plan.</p>
      ) : (
        <>
          <svg width={W} height={18} role="img" aria-label="Expected harm by where people are">
            {SOURCE_KEYS.map(([k, , c]) => {
              const w = (vals[k] / total) * W;
              const x0 = acc;
              acc += w;
              if (w < 0.5) return null;
              return <rect key={k} x={x0} y={0} width={Math.max(0, w - 2)} height={18} rx={3} className={`seg ${c} ${hover === k ? 'hot' : ''}`} onPointerEnter={() => setHover(k)} onPointerLeave={() => setHover(null)} />;
            })}
          </svg>
          <div className="legend">
            {SOURCE_KEYS.map(([k, name, c]) => (
              <span key={k} className={hover === k ? 'hot' : ''} onPointerEnter={() => setHover(k)} onPointerLeave={() => setHover(null)}>
                <i className={`sw ${c}`} />
                {name} <b>{vals[k] < 10 ? vals[k].toFixed(1) : Math.round(vals[k])}</b>
              </span>
            ))}
          </div>
          <div className="places">
            {top.map((p) => (
              <button key={`${p.kind}${p.id}`} onClick={() => onPick(p.kind, p.id)} title="Show on the map">
                <span className="name">
                  {p.name}
                  {p.note && <em className={p.note}>{p.note}</em>}
                </span>
                <span className="barwrap">
                  <i style={{ width: `${(p.v / maxV) * 100}%` }} />
                </span>
                <b>{p.v < 10 ? p.v.toFixed(1) : Math.round(p.v)}</b>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- options: every weapon against every fuze

export interface MatrixCell {
  weapon: string;
  fuze: string;
  label: [string, string];
  p90: number;
  pk: number;
}

const HARM = ['#3a2622', '#5c2b22', '#833226', '#ab3d2b', '#d25236', '#f07a55'];

export function OptionsMatrix({ cells, weapons, fuzes, current, minPk, onPick }: { cells: MatrixCell[]; weapons: [string, string][]; fuzes: [string, string][]; current: [string, string]; minPk: number; onPick: (w: string, f: string) => void }) {
  const max = Math.max(1, ...cells.map((c) => c.p90));
  const at = (w: string, f: string) => cells.find((c) => c.weapon === w && c.fuze === f);
  return (
    <div className="matrix" role="table" aria-label="Planning figure for each weapon and fuze">
      <div role="row" className="mrow head">
        <span />
        {fuzes.map(([, n]) => (
          <span key={n} role="columnheader">
            {n}
          </span>
        ))}
      </div>
      {weapons.map(([w, wn]) => (
        <div role="row" className="mrow" key={w}>
          <span role="rowheader">{wn}</span>
          {fuzes.map(([f]) => {
            const c = at(w, f);
            if (!c) return <span key={f} className="cell empty" />;
            const i = Math.min(HARM.length - 1, Math.round((c.p90 / max) * (HARM.length - 1)));
            const ok = c.pk >= minPk;
            return (
              <button
                key={f}
                role="cell"
                className={`cell ${ok ? '' : 'fails'} ${current[0] === w && current[1] === f ? 'current' : ''}`}
                style={{ background: HARM[i], color: i >= 4 ? '#1a1a19' : '#f3efe7' }}
                onClick={() => onPick(w, f)}
                title={`${c.label[0]}, ${c.label[1].toLowerCase()} fuze: planning figure ${c.p90}, destroys the target in ${pct(c.pk)} of runs${ok ? '' : ' (below the requirement)'}`}
              >
                <b>{c.p90}</b>
                <small>{ok ? pct(c.pk) : `✕ ${pct(c.pk)}`}</small>
              </button>
            );
          })}
        </div>
      ))}
      <div className="scale">
        <span>fewer hurt</span>
        {HARM.map((h) => (
          <i key={h} style={{ background: h }} />
        ))}
        <span>more</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the day, as a scrubber

export function Timeline({ profile, hour, onHour, day }: { profile: { mean: number; p90: number }[] | null; hour: number; onHour: (h: number) => void; day: string }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const drag = useRef(false);
  const L = 34;
  const R = 10;
  const H = 70;
  const pw = W - L - R;
  const x = (h: number) => L + (h / 24) * pw;
  const max = Math.max(1, ...(profile ?? []).map((p) => p.p90));
  const y = (v: number) => 8 + H - (v / max) * H;
  const hourAt = (clientX: number, el: Element) => {
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(23.5, Math.round((((clientX - r.left - L) / pw) * 24) * 2) / 2));
  };
  const pts = (profile ?? []).map((p, h) => [x(h + 0.5), y(p.mean), y(p.p90)] as const);
  const hv = hover != null && profile ? profile[Math.min(23, Math.floor(hover))] : null;
  return (
    <div className="chart timeline" ref={ref} onPointerLeave={() => setHover(null)}>
      <svg
        width={W}
        height={H + 30}
        onPointerDown={(e) => {
          drag.current = true;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          onHour(hourAt(e.clientX, e.currentTarget));
        }}
        onPointerMove={(e) => {
          const h = hourAt(e.clientX, e.currentTarget);
          setHover(h);
          if (drag.current) onHour(h);
        }}
        onPointerUp={() => (drag.current = false)}
        role="slider"
        aria-label="Hour of the strike"
        aria-valuenow={hour}
        aria-valuemin={0}
        aria-valuemax={23.5}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') onHour(Math.min(23.5, hour + 0.5));
          if (e.key === 'ArrowLeft') onHour(Math.max(0, hour - 0.5));
        }}
      >
        <rect x={x(0)} y={8} width={x(5.5) - x(0)} height={H} className="night" />
        <rect x={x(20.5)} y={8} width={x(24) - x(20.5)} height={H} className="night" />
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} className="grid" />
            <text x={L - 6} y={y(max * f) + 3} textAnchor="end" className="tick">
              {Math.round(max * f)}
            </text>
          </g>
        ))}
        {pts.length > 0 && (
          <>
            <polygon points={[...pts.map(([px, , p90]) => `${px},${p90}`), ...pts.slice().reverse().map(([px, m]) => `${px},${m}`)].join(' ')} className="band" />
            <polyline points={pts.map(([px, m]) => `${px},${m}`).join(' ')} className="line" />
          </>
        )}
        {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
          <text key={h} x={x(h)} y={H + 24} textAnchor={h === 0 ? 'start' : h === 24 ? 'end' : 'middle'} className="tick">
            {String(h).padStart(2, '0')}
          </text>
        ))}
        <g className="playhead">
          <line x1={x(hour)} x2={x(hour)} y1={2} y2={H + 12} />
          <rect x={x(hour) - 22} y={H + 9} width={44} height={16} rx={8} />
          <text x={x(hour)} y={H + 21} textAnchor="middle">
            {fmtHour(hour)}
          </text>
        </g>
      </svg>
      {hv && hover != null && (
        <Tip x={x(hover)} y={0} width={W}>
          <b>
            {fmtHour(Math.floor(hover))} · {day}
          </b>
          <span>expected {hv.mean.toFixed(1)}</span>
          <span>nine in ten at or below {hv.p90}</span>
        </Tip>
      )}
      <div className="legend small">
        <span>
          <i className="sw line" />
          Expected
        </span>
        <span>
          <i className="sw band" />
          Up to nine in ten runs
        </span>
        <span>
          <i className="sw night" />
          Night
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Jev's trade-offs

export function Frontier({ results, best, minPk, onPeek, onPick }: { results: Scored[]; best?: Scored; minPk: number; onPeek: (s: Scored | null) => void; onPick: (s: Scored) => void }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<Scored | null>(null);
  const L = 38;
  const R = 12;
  const H = 170;
  const pw = W - L - R;
  const maxX = Math.max(10, ...results.map((r) => r.p90));
  const x = (v: number) => L + (v / maxX) * pw;
  const y = (v: number) => 12 + H - v * H;
  // The frontier: for each level of harm, the best chance of destroying the target so far.
  const sorted = results.slice().sort((a, b) => a.p90 - b.p90 || b.pk - a.pk);
  const front: Scored[] = [];
  let bestPk = -1;
  for (const s of sorted)
    if (s.pk > bestPk + 1e-9) {
      front.push(s);
      bestPk = s.pk;
    }
  const pick = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    let near: Scored | null = null;
    let d = 24 * 24;
    for (const s of results) {
      const dd = (x(s.p90) - mx) ** 2 + (y(s.pk) - my) ** 2;
      if (dd < d) {
        d = dd;
        near = s;
      }
    }
    return near;
  };
  return (
    <div className="chart" ref={ref}>
      <svg
        width={W}
        height={H + 40}
        onPointerMove={(e) => {
          const s = pick(e);
          setHover(s);
          onPeek(s);
        }}
        onPointerLeave={() => {
          setHover(null);
          onPeek(null);
        }}
        onClick={(e) => {
          const s = pick(e);
          if (s) onPick(s);
        }}
        role="img"
        aria-label={`${results.length} plans. Best: planning figure ${best?.p90 ?? 'none'}.`}
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={y(f)} y2={y(f)} className="grid" />
            <text x={L - 6} y={y(f) + 3} textAnchor="end" className="tick">
              {pct(f)}
            </text>
          </g>
        ))}
        <rect x={L} y={y(1)} width={pw} height={Math.max(0, y(minPk) - y(1))} className="ok-zone" />
        <line x1={L} x2={W - R} y1={y(minPk)} y2={y(minPk)} className="req" />
        <text x={W - R} y={y(minPk) - 5} textAnchor="end" className="mark-label">
          requirement {pct(minPk)}
        </text>
        {results.map((s, i) => (
          <circle key={i} cx={x(s.p90)} cy={y(s.pk)} r={3} className={`pt ${s.pk >= minPk ? 'ok' : ''}`} />
        ))}
        {front.length > 1 && <polyline points={front.map((s) => `${x(s.p90)},${y(s.pk)}`).join(' ')} className="front" />}
        {best && <circle cx={x(best.p90)} cy={y(best.pk)} r={7} className="best" />}
        {hover && <circle cx={x(hover.p90)} cy={y(hover.pk)} r={5} className="hov" />}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <text key={f} x={x(maxX * f)} y={H + 28} textAnchor="middle" className="tick">
            {Math.round(maxX * f)}
          </text>
        ))}
        <text x={L} y={H + 28 + 12} className="tick">
          planning figure (people) →
        </text>
      </svg>
      {hover && (
        <Tip x={x(hover.p90)} y={y(hover.pk)} width={W}>
          <b>
            {hover.c.weapon} · {hover.c.fuze} · {fmtHour(hover.c.hour)}
          </b>
          <span>
            planning figure {hover.p90} · mean {hover.mean.toFixed(1)}
          </span>
          <span>target destroyed {pct(hover.pk)} · click to use</span>
        </Tip>
      )}
      <div className="legend small">
        <span>
          <i className="sw dot" />
          A plan
        </span>
        <span>
          <i className="sw front" />
          Best trade-offs
        </span>
        <span>
          <i className="sw ring" />
          Jev's pick
        </span>
      </div>
    </div>
  );
}
