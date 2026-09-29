// Origami weapons: each folded from paper, faceted, lit from above. Drawn nose to the right.
import type { WeaponId } from '../jev';

interface Shape {
  len: number; // body length
  r: number; // body half-height
  nose: number; // nose length
  tail: number; // tail cone length
  fin: number; // fin size
  wing?: boolean; // the small-diameter bomb's folding wings
  band: string; // the coloured band
  paper: [string, string, string]; // light, mid, dark
}

const SHAPES: Record<WeaponId, Shape> = {
  large: { len: 120, r: 17, nose: 30, tail: 16, fin: 20, band: '#c9a44c', paper: ['#fbfaf6', '#e2dccf', '#c4bcad'] },
  medium: { len: 96, r: 12, nose: 24, tail: 13, fin: 15, band: '#c9a44c', paper: ['#fbfaf6', '#e2dccf', '#c4bcad'] },
  small: { len: 112, r: 7, nose: 20, tail: 9, fin: 10, wing: true, band: '#8a9a6a', paper: ['#f4efe4', '#dcd4c3', '#bdb3a0'] },
  focused: { len: 84, r: 8, nose: 18, tail: 10, fin: 11, band: '#4f7a8a', paper: ['#e9dfcf', '#d2c4ad', '#b3a58c'] },
};

export function Origami({ id, size = 1, fold = false }: { id: WeaponId; size?: number; fold?: boolean }) {
  const s = SHAPES[id];
  const w = 170;
  const h = 64;
  const cy = h / 2;
  const x0 = (w - s.len) / 2 - 4; // where the tail cone starts
  const xb = x0 + s.tail; // body start
  const xn = x0 + s.len - s.nose; // nose start
  const xt = x0 + s.len; // tip
  const [L, M, D] = s.paper;
  const pts = (p: number[][]) => p.map((q) => q.join(',')).join(' ');
  return (
    <svg className={`origami ${fold ? 'fold' : ''}`} viewBox={`0 0 ${w} ${h}`} width={w * size} height={h * size} role="img" aria-label="An origami model of the weapon">
      {/* Shadow on the table. */}
      <ellipse cx={w / 2} cy={cy + s.r + 9} rx={s.len * 0.46} ry={3.2} fill="rgba(40,30,20,0.16)" />
      {/* Fins: back one first. */}
      <polygon points={pts([[x0 + 2, cy], [x0 - s.fin * 0.5, cy - s.r - s.fin], [x0 + s.tail + 4, cy - s.r * 0.6]])} fill={M} stroke="rgba(60,50,40,0.35)" strokeWidth={0.6} strokeLinejoin="round" />
      {s.wing && <polygon points={pts([[xb + s.len * 0.25, cy - s.r * 0.4], [xb + s.len * 0.42, cy - s.r - 13], [xb + s.len * 0.5, cy - s.r * 0.4]])} fill={M} stroke="rgba(60,50,40,0.35)" strokeWidth={0.6} strokeLinejoin="round" />}
      {/* Tail cone. */}
      <polygon points={pts([[x0, cy - s.r * 0.45], [xb, cy - s.r], [xb, cy], [x0, cy]])} fill={M} />
      <polygon points={pts([[x0, cy], [xb, cy], [xb, cy + s.r], [x0, cy + s.r * 0.45]])} fill={D} />
      {/* Body: a lit upper facet and a shaded lower one, folded along the middle. */}
      <polygon points={pts([[xb, cy - s.r], [xn, cy - s.r], [xn, cy], [xb, cy]])} fill={L} />
      <polygon points={pts([[xb, cy], [xn, cy], [xn, cy + s.r], [xb, cy + s.r]])} fill={M} />
      <polygon points={pts([[xb, cy - s.r], [xb + s.len * 0.18, cy - s.r * 0.55], [xn - 6, cy - s.r * 0.6], [xn, cy - s.r]])} fill="rgba(255,255,255,0.55)" />
      {/* The band. */}
      <polygon points={pts([[xn - 12, cy - s.r], [xn - 7, cy - s.r], [xn - 7, cy + s.r], [xn - 12, cy + s.r]])} fill={s.band} opacity={0.85} />
      {/* Nose: four facets meeting at the tip. */}
      <polygon points={pts([[xn, cy - s.r], [xt, cy], [xn, cy]])} fill={L} />
      <polygon points={pts([[xn, cy], [xt, cy], [xn, cy + s.r]])} fill={D} />
      <polygon points={pts([[xn, cy - s.r], [xn + s.nose * 0.45, cy - s.r * 0.35], [xt, cy]])} fill="rgba(255,255,255,0.5)" />
      {/* Front fins and wing. */}
      <polygon points={pts([[x0 + 2, cy], [x0 - s.fin * 0.5, cy + s.r + s.fin], [x0 + s.tail + 4, cy + s.r * 0.6]])} fill={L} stroke="rgba(60,50,40,0.45)" strokeWidth={0.6} strokeLinejoin="round" />
      {s.wing && <polygon points={pts([[xb + s.len * 0.25, cy + s.r * 0.4], [xb + s.len * 0.42, cy + s.r + 13], [xb + s.len * 0.5, cy + s.r * 0.4]])} fill={L} stroke="rgba(60,50,40,0.45)" strokeWidth={0.6} strokeLinejoin="round" />}
      {/* Creases. */}
      <polyline points={pts([[x0, cy], [xt, cy]])} stroke="rgba(40,30,20,0.35)" strokeWidth={0.6} fill="none" />
      <polyline points={pts([[xb, cy - s.r], [xb, cy + s.r]])} stroke="rgba(40,30,20,0.2)" strokeWidth={0.6} />
      <polyline points={pts([[xn, cy - s.r], [xn, cy + s.r]])} stroke="rgba(40,30,20,0.25)" strokeWidth={0.6} />
      <polygon points={pts([[x0, cy - s.r * 0.45], [xb, cy - s.r], [xn, cy - s.r], [xt, cy], [xn, cy + s.r], [xb, cy + s.r], [x0, cy + s.r * 0.45]])} fill="none" stroke="rgba(60,50,40,0.5)" strokeWidth={0.7} strokeLinejoin="round" />
    </svg>
  );
}
