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
  midFins?: boolean; // a missile's small fins halfway along
  seeker?: boolean; // a dark glass tip that looks for the laser
  band2?: string; // a second band, further back
  seams?: boolean; // a canister: the lines it splits along, and what's packed inside
  noFins?: boolean; // spun, not steered
  blades?: boolean; // long blades folded along the body, their edges catching the light
}

const SHAPES: Record<WeaponId, Shape> = {
  large: { len: 120, r: 17, nose: 30, tail: 16, fin: 20, band: '#c9a44c', paper: ['#fbfaf6', '#e2dccf', '#c4bcad'] },
  medium: { len: 96, r: 12, nose: 24, tail: 13, fin: 15, band: '#c9a44c', paper: ['#fbfaf6', '#e2dccf', '#c4bcad'] },
  small: { len: 112, r: 7, nose: 20, tail: 9, fin: 10, wing: true, band: '#8a9a6a', paper: ['#f4efe4', '#dcd4c3', '#bdb3a0'] },
  focused: { len: 84, r: 8, nose: 18, tail: 10, fin: 11, band: '#4f7a8a', paper: ['#e9dfcf', '#d2c4ad', '#b3a58c'] },
  moab: { len: 150, r: 22, nose: 26, tail: 20, fin: 24, band: '#8c2f22', paper: ['#e6e1d6', '#c9c1b2', '#a39a89'] },
  // Long, heavy and pointed: a steel penetrator, dark bands.
  bunker: { len: 150, r: 10, nose: 34, tail: 12, fin: 14, band: '#3a3530', band2: '#3a3530', paper: ['#eceae4', '#cfccc3', '#aca89c'] },
  // A long, thin tungsten rod, darker paper, with a guidance band and a seeker tip.
  spear: { len: 150, r: 4.5, nose: 30, tail: 6, fin: 9, midFins: true, seeker: true, band: '#6b7280', band2: '#b8483a', paper: ['#dfe2e4', '#b9bec2', '#8f959b'] },
  // A short body with six sword-like blades folded along it.
  blades: { len: 100, r: 8, nose: 14, tail: 9, fin: 11, blades: true, seeker: true, band: '#c9a44c', paper: ['#f4f3ee', '#d9d7cf', '#b5b2a7'] },
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
      {!s.noFins && <polygon points={pts([[x0 + 2, cy], [x0 - s.fin * 0.5, cy - s.r - s.fin], [x0 + s.tail + 4, cy - s.r * 0.6]])} fill={M} stroke="rgba(60,50,40,0.35)" strokeWidth={0.6} strokeLinejoin="round" />}
      {s.midFins && <polygon points={pts([[xb + s.len * 0.36, cy - s.r * 0.5], [xb + s.len * 0.42, cy - s.r - 8], [xb + s.len * 0.47, cy - s.r * 0.5]])} fill={M} stroke="rgba(60,50,40,0.35)" strokeWidth={0.6} strokeLinejoin="round" />}
      {s.wing &&<polygon points={pts([[xb + s.len * 0.25, cy - s.r * 0.4], [xb + s.len * 0.42, cy - s.r - 13], [xb + s.len * 0.5, cy - s.r * 0.4]])} fill={M} stroke="rgba(60,50,40,0.35)" strokeWidth={0.6} strokeLinejoin="round" />}
      {/* Tail cone. */}
      <polygon points={pts([[x0, cy - s.r * 0.45], [xb, cy - s.r], [xb, cy], [x0, cy]])} fill={M} />
      <polygon points={pts([[x0, cy], [xb, cy], [xb, cy + s.r], [x0, cy + s.r * 0.45]])} fill={D} />
      {/* Body: a lit upper facet and a shaded lower one, folded along the middle. */}
      <polygon points={pts([[xb, cy - s.r], [xn, cy - s.r], [xn, cy], [xb, cy]])} fill={L} />
      <polygon points={pts([[xb, cy], [xn, cy], [xn, cy + s.r], [xb, cy + s.r]])} fill={M} />
      <polygon points={pts([[xb, cy - s.r], [xb + s.len * 0.18, cy - s.r * 0.55], [xn - 6, cy - s.r * 0.6], [xn, cy - s.r]])} fill="rgba(255,255,255,0.55)" />
      {/* The band (a shell's is its copper driving band, near the back). */}
      {s.noFins ? (
        <polygon points={pts([[xb + 4, cy - s.r], [xb + 9, cy - s.r], [xb + 9, cy + s.r], [xb + 4, cy + s.r]])} fill={s.band} opacity={0.9} />
      ) : (
        <polygon points={pts([[xn - 12, cy - s.r], [xn - 7, cy - s.r], [xn - 7, cy + s.r], [xn - 12, cy + s.r]])} fill={s.band} opacity={0.85} />
      )}
      {s.band2 && <polygon points={pts([[xb + 6, cy - s.r], [xb + 10, cy - s.r], [xb + 10, cy + s.r], [xb + 6, cy + s.r]])} fill={s.band2} opacity={0.8} />}
      {/* A cluster canister: the seams it opens along, and the bomblets packed inside. */}
      {s.seams && (
        <>
          {[0.3, 0.55].map((k) => (
            <polyline key={k} points={pts([[xb + (xn - xb) * k, cy - s.r], [xb + (xn - xb) * k, cy + s.r]])} stroke="rgba(40,30,20,0.45)" strokeWidth={0.8} strokeDasharray="2 1.5" />
          ))}
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <circle key={i} cx={xb + (xn - xb) * (0.36 + (i % 3) * 0.07)} cy={cy - s.r * 0.35 + Math.floor(i / 3) * s.r * 0.7} r={2.1} fill="#c9a44c" stroke="rgba(60,50,40,0.5)" strokeWidth={0.4} />
          ))}
        </>
      )}
      {/* Nose: four facets meeting at the tip. */}
      <polygon points={pts([[xn, cy - s.r], [xt, cy], [xn, cy]])} fill={L} />
      <polygon points={pts([[xn, cy], [xt, cy], [xn, cy + s.r]])} fill={D} />
      <polygon points={pts([[xn, cy - s.r], [xn + s.nose * 0.45, cy - s.r * 0.35], [xt, cy]])} fill="rgba(255,255,255,0.5)" />
      {/* The blades: three on this side, folded back along the body, swept like swords. */}
      {s.blades &&
        [-1, 0, 1].map((k) => (
          <polygon
            key={k}
            points={pts([
              [xn - 4, cy + k * s.r * 0.55],
              [xb - 6, cy + k * s.r * 0.55 + (k === 0 ? 0 : k * (s.r + 9))],
              [xb + 2, cy + k * s.r * 0.55 + (k === 0 ? 0 : k * (s.r + 6)) - (k === 0 ? 2.6 : 0)],
              [xn - 8, cy + k * s.r * 0.55 - 1.4],
            ])}
            fill={k === 0 ? 'rgba(235,238,240,0.95)' : k < 0 ? '#e8ebee' : '#c3c8cd'}
            stroke="rgba(60,60,70,0.55)"
            strokeWidth={0.6}
            strokeLinejoin="round"
          />
        ))}
      {/* The seeker: dark glass on the tip. */}
      {s.seeker && <circle cx={xt - 2.5} cy={cy} r={3} fill="#2b3440" stroke="rgba(255,255,255,0.4)" strokeWidth={0.6} />}
      {/* Front fins and wing. */}
      {!s.noFins && <polygon points={pts([[x0 + 2, cy], [x0 - s.fin * 0.5, cy + s.r + s.fin], [x0 + s.tail + 4, cy + s.r * 0.6]])} fill={L} stroke="rgba(60,50,40,0.45)" strokeWidth={0.6} strokeLinejoin="round" />}
      {s.midFins && <polygon points={pts([[xb + s.len * 0.36, cy + s.r * 0.5], [xb + s.len * 0.42, cy + s.r + 8], [xb + s.len * 0.47, cy + s.r * 0.5]])} fill={L} stroke="rgba(60,50,40,0.45)" strokeWidth={0.6} strokeLinejoin="round" />}
      {s.wing && <polygon points={pts([[xb + s.len * 0.25, cy + s.r * 0.4], [xb + s.len * 0.42, cy + s.r + 13], [xb + s.len * 0.5, cy + s.r * 0.4]])} fill={L} stroke="rgba(60,50,40,0.45)" strokeWidth={0.6} strokeLinejoin="round" />}
      {/* Creases. */}
      <polyline points={pts([[x0, cy], [xt, cy]])} stroke="rgba(40,30,20,0.35)" strokeWidth={0.6} fill="none" />
      <polyline points={pts([[xb, cy - s.r], [xb, cy + s.r]])} stroke="rgba(40,30,20,0.2)" strokeWidth={0.6} />
      <polyline points={pts([[xn, cy - s.r], [xn, cy + s.r]])} stroke="rgba(40,30,20,0.25)" strokeWidth={0.6} />
      <polygon points={pts([[x0, cy - s.r * 0.45], [xb, cy - s.r], [xn, cy - s.r], [xt, cy], [xn, cy + s.r], [xb, cy + s.r], [x0, cy + s.r * 0.45]])} fill="none" stroke="rgba(60,50,40,0.5)" strokeWidth={0.7} strokeLinejoin="round" />
    </svg>
  );
}
