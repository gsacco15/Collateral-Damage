// People on foot and cars on the road: the living layer of the map, also read by the 3D model.
import { quietAt, rng, shownCount, streetDistricts, trips, type Building, type Population, type Rect, type World } from '../jev';
import { CLOTH, SKIN } from './paper';

// What people wear, seen from above, very simply. Head: bare, a white prayer cap, a red-checked keffiyeh, a plain
// white ghutra, a turban, a hijab, a patterned shawl, a black abaya and niqab, a burqa covering head to foot.
export type Wear = 'bare' | 'cap' | 'keffiyeh' | 'ghutra' | 'turban' | 'hijab' | 'shawl' | 'abaya' | 'burqa';
const WEARS: [Wear, number][] = [
  ['bare', 0.13],
  ['cap', 0.08],
  ['keffiyeh', 0.1],
  ['ghutra', 0.08],
  ['turban', 0.15],
  ['hijab', 0.2],
  ['shawl', 0.08],
  ['abaya', 0.1],
  ['burqa', 0.08],
];
// Thobes and dishdashas: white, cream, grey, brown. Dresses: deeper colours. Turbans, hijabs and caps: their own.
const THOBE = ['#f1ede4', '#e6dfd1', '#cfc8ba', '#9a958c', '#6f5e4b'];
const DRESS = ['#7a2e3a', '#2e5e63', '#3a4a6b', '#6b6a3a', '#a8742c', '#5a3a5e', '#2f2c29', '#8a5a44'];
const TURBAN = ['#f1ede4', '#1f1d22', '#3c4f8a', '#c9832a', '#7a1f2a', '#e7e1d4'];
const SCARF = ['#5b6d80', '#8b3a2e', '#2e5e63', '#d6c3a0', '#6b4a6e', '#c98a6a', '#1f1d22', '#9aa37a'];
const BURQA = ['#3f6fa8', '#5b86b8', '#2f2c33', '#6a6a70', '#4a5d3f'];
const pickWear = (u: number): Wear => {
  for (const [w, p] of WEARS) {
    if (u < p) return w;
    u -= p;
  }
  return 'bare';
};

export interface Walker {
  id: number;
  x: number;
  y: number;
  path: { x: number; y: number }[];
  speed: number;
  skin: string;
  cloth: string;
  wear: Wear; // what's on their head, seen from above
  tint: string; // the colour of the turban, scarf or cap
  phase: number;
  kind: 'street' | 'space' | 'transit';
  zone: Rect | null; // the open space they wander in
  flee: number;
  hurt: boolean;
  gone: boolean;
  d?: number; // Living: the district a pavement walker belongs to
  crowd?: string; // Living, after a strike: which crowd they're part of (at the ruin, a school gate, the hospital)
}

export interface Car {
  id: number;
  x: number;
  y: number;
  horizontal: boolean;
  dir: 1 | -1;
  lane: number;
  from: number;
  to: number;
  speed: number;
  color: string;
  hurt: boolean;
  fled?: boolean; // already turned away from a blast
}

const CAR_COLORS = ['#e7e2d8', '#6c8aa8', '#b8483a', '#2f2d2b', '#d9c9a3', '#8a9a7a', '#c9b24c'];
const MAX_SPACE_WALKERS = 80;

export class Crowd {
  walkers: Walker[] = [];
  cars: Car[] = [];
  private lastHourChange = 0;
  broken: Rect | null = null; // a dropped bridge: cars turn back before the gap
  private r = rng(4242);
  private nextId = 1;
  private lines = new Map<string, number[]>();
  private hLines: { y: number; x0: number; x1: number }[] = [];
  private vLines: { x: number; y0: number; y1: number }[] = [];
  // Living: this hour's trips (from, to, weight), walked as a steady trickle rather than a burst on the hour.
  private trips: [number, number, number][] | null = null;
  private tripSum = 0;
  private tripAcc = 0;

  constructor(private world: World) {
    const s = world.streetPts;
    for (let i = 0; i < s.length; i += 2) {
      for (const k of [`x${Math.round(s[i])}`, `y${Math.round(s[i + 1])}`]) {
        const a = this.lines.get(k) ?? [];
        a.push(i);
        this.lines.set(k, a);
      }
    }
    for (const rd of world.roads) {
      const q = rd.rect;
      if (rd.horizontal) this.hLines.push({ y: q.y + q.h / 2, x0: q.x, x1: q.x + q.w });
      else this.vLines.push({ x: q.x + q.w / 2, y0: q.y, y1: q.y + q.h });
    }
  }

  private spawn(kind: Walker['kind'], x: number, y: number, zone: Rect | null = null): Walker {
    const r = this.r;
    const wear = pickWear(r());
    const any = (xs: string[]) => xs[Math.floor(r() * xs.length)];
    const robe = wear === 'keffiyeh' || wear === 'ghutra' || wear === 'cap' || (wear === 'turban' && r() < 0.6);
    const burqa = any(BURQA);
    const cloth = wear === 'abaya' ? '#1c1a1d' : wear === 'burqa' ? burqa : robe && r() < 0.8 ? any(THOBE) : wear === 'hijab' || wear === 'shawl' ? any(DRESS) : any(CLOTH);
    const tint = wear === 'turban' ? any(TURBAN) : wear === 'hijab' || wear === 'shawl' ? any(SCARF) : wear === 'burqa' ? burqa : '#f2eee6';
    return {
      id: this.nextId++,
      x,
      y,
      path: [],
      speed: kind === 'space' ? 0.8 + r() * 1.2 : 1.1 + r() * 0.6,
      skin: SKIN[Math.floor(r() * SKIN.length)],
      cloth,
      wear,
      tint,
      phase: r() * 10,
      kind,
      zone,
      flee: 0,
      hurt: false,
      gone: false,
    };
  }

  /** Match people on foot and cars to the hour; walk people between buildings when the hour moves. */
  sync(pop: Population, prev: Population | null) {
    const r = this.r;
    const w = this.world;
    const s = w.streetPts;
    const nStreet = s.length / 2;
    // Pavements. Living: each district's own busyness, so the souk streets are full and the villa lanes quiet.
    if (pop.streetD) {
      const dOf = streetDistricts(w);
      const byD = new Map<number, number[]>();
      for (let k = 0; k < dOf.length; k++) {
        const list = byD.get(dOf[k]) ?? [];
        list.push(k);
        byD.set(dOf[k], list);
      }
      const wants = new Map<number, number>();
      let total = 0;
      for (const [d, pts] of byD) {
        const n = pop.streetQ * pts.length * 0.55 * (d >= 0 ? pop.streetD[d] : 0.5);
        wants.set(d, n);
        total += n;
      }
      const scale = total > 500 ? 500 / total : 1;
      const street = this.walkers.filter((x) => x.kind === 'street' && !x.gone && !x.hurt);
      for (const [d, pts] of byD) {
        const want = Math.round((wants.get(d) ?? 0) * scale);
        const mine = street.filter((x) => (x.d ?? -2) === d);
        if (mine.length > want) for (const x of mine.slice(want)) x.gone = true;
        else
          for (let i = mine.length, tries = 0; i < want && tries < want * 3; tries++) {
            const k = pts[Math.floor(r() * pts.length)];
            // After a strike the streets round it are quiet: fewer people put there.
            if (pop.quiet && r() > quietAt(pop, s[k * 2], s[k * 2 + 1])) continue;
            const wk = this.spawn('street', s[k * 2] + (r() - 0.5), s[k * 2 + 1] + (r() - 0.5));
            wk.d = d;
            this.walkers.push(wk);
            i++;
          }
      }
      if (pop.quiet) for (const x of this.walkers) if (x.kind === 'street' && !x.gone && !x.hurt && !x.flee && r() > quietAt(pop, x.x, x.y)) x.gone = true;
      // Walkers from before the switch (no district): let them go.
      for (const x of street) if (x.d == null) x.gone = true;
    } else {
      const want = Math.min(500, Math.round(pop.streetQ * nStreet * 0.55));
      const street = this.walkers.filter((x) => x.kind === 'street' && !x.gone && !x.hurt);
      for (const x of street) if (x.d != null) x.gone = true;
      const plain = street.filter((x) => x.d == null);
      if (plain.length > want) for (const x of plain.slice(want)) x.gone = true;
      else
        for (let i = plain.length; i < want; i++) {
          const k = Math.floor(r() * nStreet);
          this.walkers.push(this.spawn('street', s[k * 2] + (r() - 0.5), s[k * 2 + 1] + (r() - 0.5)));
        }
    }
    this.trips = pop.living ? trips(w, pop.hour, pop.day) : null;
    this.tripSum = this.trips ? this.trips.reduce((t, q) => t + q[2], 0) : 0;
    // Open spaces: the souk, the square, the stadium, the school yard.
    for (const sp of w.spaces) {
      const n = Math.min(MAX_SPACE_WALKERS, Math.round(pop.spaceQ[sp.id] * sp.capacity * 0.6));
      const mine = this.walkers.filter((x) => x.kind === 'space' && x.zone === sp.rect && !x.gone && !x.hurt);
      if (mine.length > n) for (const x of mine.slice(n)) x.gone = true;
      else for (let i = mine.length; i < n; i++) this.walkers.push(this.spawn('space', sp.rect.x + 1 + r() * (sp.rect.w - 2), sp.rect.y + 1 + r() * (sp.rect.h - 2), sp.rect));
    }
    // Living, after a strike: the crowds that gather (helping at the ruin, parents at a school gate, families at the
    // hospital), each milling inside its own small circle. Up to forty drawn per crowd.
    const want = new Map<string, { c: NonNullable<Population['crowds']>[number]; n: number }>();
    for (const c of pop.crowds ?? []) want.set(`${c.kind}@${Math.round(c.x)},${Math.round(c.y)}`, { c, n: Math.min(40, c.n) });
    for (const x of this.walkers) if (x.crowd && !x.gone && !x.hurt && !want.has(x.crowd)) x.gone = true;
    for (const [key, { c, n }] of want) {
      const mine = this.walkers.filter((x) => x.crowd === key && !x.gone && !x.hurt);
      if (mine.length > n) for (const x of mine.slice(n)) x.gone = true;
      else
        for (let i = mine.length; i < n; i++) {
          const zone = { x: c.x - c.r, y: c.y - c.r, w: c.r * 2, h: c.r * 2 };
          const a = r() * Math.PI * 2;
          const rr = c.r * Math.sqrt(r());
          const wk = this.spawn('space', c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr, zone);
          wk.crowd = key;
          this.walkers.push(wk);
        }
    }
    // People moving between buildings as the hour changes: a handful, scaled to how busy the streets are, and
    // none while the clock is racing (playing the day, holding for an hour) so they never pile up.
    const now = performance.now();
    const racing = now - this.lastHourChange < 1500;
    if (prev && prev.hour !== pop.hour) this.lastHourChange = now;
    const moving = this.walkers.filter((x) => x.kind === 'transit' && !x.gone).length;
    if (!pop.living && prev && prev.hour !== pop.hour && !racing && moving < 60) {
      const from: Building[] = [];
      const to: Building[] = [];
      for (const b of w.buildings) {
        const d = shownCount(pop, b) - shownCount(prev, b);
        for (let i = 0; i < Math.min(6, Math.abs(d)); i++) (d > 0 ? to : from).push(b);
      }
      const busy = Math.max(0.25, Math.min(1, pop.streetQ / 0.12));
      const n = Math.min(60 - moving, Math.round(Math.min(60, Math.max(from.length, to.length)) * busy));
      for (let i = 0; i < n; i++) {
        const a = from[Math.floor(r() * from.length)];
        if (!a || !to.length) break;
        // Somewhere not too far away.
        let b = to[Math.floor(r() * to.length)];
        for (let k = 0; k < 6 && Math.hypot(b.cx - a.cx, b.cy - a.cy) > 260; k++) b = to[Math.floor(r() * to.length)];
        if (a === b) continue;
        const t = this.spawn('transit', a.cx, a.cy);
        t.path = this.route(a, b);
        t.speed = 4.5 + r() * 3;
        t.phase = -r() * 1.5;
        this.walkers.push(t);
      }
    }
    this.walkers = this.walkers.filter((x) => !x.gone || x.kind === 'transit');
    // Cars: more on the boulevard, a little busier at rush hour, few at night.
    const t = pop.trafficQ[1];
    const wantCars = Math.round(20 + 150 * t + 60 * t * t);
    while (this.cars.length < wantCars) this.cars.push(this.newCar());
    if (this.cars.length > wantCars) this.cars.length = wantCars;
  }

  private newCar(): Car {
    const r = this.r;
    const roads = this.world.roads;
    // Bias toward the boulevard and its bridge.
    let rd = roads[Math.floor(r() * roads.length)];
    if (r() < 0.45) rd = roads.find((q) => q.kind === 'boulevard' && r() < 0.5) ?? rd;
    const q = rd.rect;
    const dir: 1 | -1 = r() < 0.5 ? 1 : -1;
    const lane = rd.horizontal ? q.y + q.h * (dir > 0 ? 0.72 : 0.28) : q.x + q.w * (dir > 0 ? 0.28 : 0.72);
    const from = rd.horizontal ? Math.max(-40, q.x) : Math.max(-40, q.y);
    const to = rd.horizontal ? Math.min(this.world.w + 40, q.x + q.w) : Math.min(this.world.h + 40, q.y + q.h);
    const at = from + r() * (to - from);
    return { id: this.nextId++, x: rd.horizontal ? at : lane, y: rd.horizontal ? lane : at, horizontal: rd.horizontal, dir, lane, from, to, speed: 7 + r() * 6, color: CAR_COLORS[Math.floor(r() * CAR_COLORS.length)], hurt: false };
  }

  private nearestStreet(x: number, y: number) {
    const s = this.world.streetPts;
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < s.length; i += 2) {
      const d = (s[i] - x) ** 2 + (s[i + 1] - y) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return { x: s[best], y: s[best + 1] };
  }

  private route(a: Building, b: Building) {
    const sa = this.nearestStreet(a.cx, a.cy);
    const sb = this.nearestStreet(b.cx, b.cy);
    const crosses = (sa.x < 745) !== (sb.x < 745);
    const hl = (x: number, y: number) =>
      this.hLines.filter((l) => x >= l.x0 && x <= l.x1 && (!crosses || [115, 350, 580].includes(Math.round(l.y)))).reduce((m, l) => (Math.abs(l.y - y) < Math.abs(m - y) ? l.y : m), crosses ? 350 : y);
    const ya = hl(sa.x, sa.y);
    const yb = crosses ? ya : hl(sb.x, sb.y);
    const mid = (sa.x + sb.x) / 2;
    const v = this.vLines.filter((l) => l.y0 <= Math.min(ya, yb) && l.y1 >= Math.max(ya, yb)).reduce((m, l) => (Math.abs(l.x - mid) < Math.abs(m - mid) ? l.x : m), mid);
    const j = () => (this.r() - 0.5) * 4;
    return [
      { x: sa.x, y: sa.y },
      { x: sa.x, y: ya + j() },
      { x: v + j(), y: ya + j() },
      { x: v + j(), y: yb + j() },
      { x: sb.x, y: yb + j() },
      { x: sb.x, y: sb.y },
      { x: b.cx, y: b.cy },
    ];
  }

  private blastSeen = '';

  /** Once per blast: people spill out of the buildings around it and hurry away. */
  private evacuate(blast: { x: number; y: number }, pop: Population | null) {
    const r = this.r;
    let n = 0;
    for (const b of this.world.buildings) {
      if (n >= 45) break;
      const d = Math.hypot(b.cx - blast.x, b.cy - blast.y);
      if (d < 35 || d > 170 || (pop && !shownCount(pop, b)) || r() > 0.55) continue;
      const k = 1 + Math.floor(r() * 2);
      for (let i = 0; i < k; i++, n++) {
        const w = this.spawn('street', b.cx + (r() - 0.5) * 4, b.cy + (r() - 0.5) * 4);
        const ux = (b.cx - blast.x) / d;
        const uy = (b.cy - blast.y) / d;
        w.flee = 1;
        w.phase = -r() * 1.2;
        w.path = [{ x: b.cx + ux * (25 + r() * 30) + (r() - 0.5) * 12, y: b.cy + uy * (25 + r() * 30) + (r() - 0.5) * 12 }];
        this.walkers.push(w);
      }
    }
  }

  step(dt: number, blast: { x: number; y: number; t: number } | null, pop: Population | null = null) {
    const r = this.r;
    const s = this.world.streetPts;
    if (blast && blast.t > 0.4 && blast.t < 8) {
      const k = `${blast.x.toFixed(1)},${blast.y.toFixed(1)}`;
      if (k !== this.blastSeen) {
        this.blastSeen = k;
        this.evacuate(blast, pop);
      }
    }
    for (const w of this.walkers) {
      if (w.hurt) continue;
      w.phase += dt;
      if ((w.kind === 'transit' || w.flee) && w.phase < 0) continue;
      if (blast && blast.t < 8) {
        const dx = w.x - blast.x;
        const dy = w.y - blast.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 130 && !w.flee) {
          w.flee = 1;
          w.path = [{ x: w.x + (dx / d) * 35, y: w.y + (dy / d) * 35 }];
        }
      }
      // Later, some drift back and stand at a distance, looking.
      if (blast && blast.t > 12 && blast.t < 40 && w.flee === 1 && !w.path.length && r() < 0.004) {
        const dx = w.x - blast.x;
        const dy = w.y - blast.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 160) {
          w.flee = 2;
          w.path = [{ x: blast.x + (dx / d) * (38 + r() * 14), y: blast.y + (dy / d) * (38 + r() * 14) }];
        }
      }
      if (!w.path.length) {
        if (w.gone) continue;
        if (w.kind === 'space' && w.zone) {
          if (r() < 0.02) w.path = [{ x: w.zone.x + 1 + r() * (w.zone.w - 2), y: w.zone.y + 1 + r() * (w.zone.h - 2) }];
        } else if (r() < 0.005) {
          const line = this.lines.get(r() < 0.5 ? `x${Math.round(w.x)}` : `y${Math.round(w.y)}`);
          if (line?.length) {
            const i = line[Math.floor(r() * line.length)];
            if (Math.hypot(s[i] - w.x, s[i + 1] - w.y) < 40) w.path = [{ x: s[i] + (r() - 0.5), y: s[i + 1] + (r() - 0.5) }];
          }
        }
        continue;
      }
      const t = w.path[0];
      const dx = t.x - w.x;
      const dy = t.y - w.y;
      const d = Math.hypot(dx, dy);
      const sp = w.speed * (w.flee === 1 ? 3.2 : 1) * dt;
      if (d <= sp) {
        w.x = t.x;
        w.y = t.y;
        w.path.shift();
        if (!w.path.length && w.kind === 'transit') w.gone = true;
      } else {
        w.x += (dx / d) * sp;
        w.y += (dy / d) * sp;
      }
    }
    this.walkers = this.walkers.filter((w) => !(w.kind === 'transit' && w.gone));
    // Living: people setting off on this hour's trips, a few a second, never more than about eighty at once.
    if (this.trips?.length && !(blast && blast.t < 40)) {
      this.tripAcc += dt * Math.min(4, this.tripSum * 0.006);
      let moving = -1;
      while (this.tripAcc >= 1) {
        this.tripAcc -= 1;
        if (moving < 0) moving = this.walkers.filter((x) => x.kind === 'transit').length;
        if (moving >= 80) {
          this.tripAcc = 0;
          break;
        }
        let u = r() * this.tripSum;
        let trip = this.trips[0];
        for (const q of this.trips) if ((u -= q[2]) <= 0) {
          trip = q;
          break;
        }
        const a = this.world.buildings[trip[0]];
        const b = this.world.buildings[trip[1]];
        const t = this.spawn('transit', a.cx, a.cy);
        t.path = this.route(a, b);
        t.speed = 2.2 + r() * 0.8; // a brisk walk: somewhere to be
        this.walkers.push(t);
        moving++;
      }
    }
    for (const c of this.cars) {
      if (c.hurt) continue;
      let boost = 1;
      if (blast && blast.t < 14) {
        const d = Math.hypot(c.x - blast.x, c.y - blast.y);
        if (d < 80 && blast.t < 10) continue; // stopped dead
        // Further out: turn round if heading towards it, and hurry.
        if (d < 240 && !c.fled) {
          c.fled = true;
          const toward = c.horizontal ? Math.sign(blast.x - c.x) === c.dir : Math.sign(blast.y - c.y) === c.dir;
          if (toward) c.dir = c.dir === 1 ? -1 : 1;
        }
        if (c.fled) boost = 1.8;
      } else c.fled = false;
      const v = c.dir * c.speed * boost * dt;
      const gap = this.broken;
      if (gap && c.horizontal && c.y > gap.y - 2 && c.y < gap.y + gap.h + 2) {
        const mid = gap.x + gap.w / 2;
        const edge = mid - c.dir * 14; // where the road ends
        if ((c.dir === 1 && c.x < mid && c.x + v >= edge) || (c.dir === -1 && c.x > mid && c.x + v <= edge)) {
          c.dir = c.dir === 1 ? -1 : 1;
          continue;
        }
        if (Math.abs(c.x - mid) < 12) c.x = mid - c.dir * 20; // never parked in mid-air
      }
      if (c.horizontal) {
        c.x += v;
        if (c.x > c.to) c.x = c.from;
        if (c.x < c.from) c.x = c.to;
      } else {
        c.y += v;
        if (c.y > c.to) c.y = c.from;
        if (c.y < c.from) c.y = c.to;
      }
    }
  }

  /** Everyone currently drawn: walkers that haven't left. */
  visible() {
    return this.walkers.filter((w) => !(w.gone && w.kind !== 'transit'));
  }
}
