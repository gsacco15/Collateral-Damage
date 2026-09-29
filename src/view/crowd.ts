// People on foot and cars on the road: the living layer of the map, also read by the 3D model.
import { rng, shownCount, type Building, type Population, type Rect, type World } from '../jev';
import { CLOTH, SKIN } from './paper';

export interface Walker {
  id: number;
  x: number;
  y: number;
  path: { x: number; y: number }[];
  speed: number;
  skin: string;
  cloth: string;
  phase: number;
  kind: 'street' | 'space' | 'transit';
  zone: Rect | null; // the open space they wander in
  flee: number;
  hurt: boolean;
  gone: boolean;
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
}

const CAR_COLORS = ['#e7e2d8', '#6c8aa8', '#b8483a', '#2f2d2b', '#d9c9a3', '#8a9a7a', '#c9b24c'];
const MAX_SPACE_WALKERS = 140;

export class Crowd {
  walkers: Walker[] = [];
  cars: Car[] = [];
  private r = rng(4242);
  private nextId = 1;
  private lines = new Map<string, number[]>();
  private hLines: { y: number; x0: number; x1: number }[] = [];
  private vLines: { x: number; y0: number; y1: number }[] = [];

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
    return {
      id: this.nextId++,
      x,
      y,
      path: [],
      speed: kind === 'space' ? 0.8 + r() * 1.2 : 1.1 + r() * 0.6,
      skin: SKIN[Math.floor(r() * SKIN.length)],
      cloth: CLOTH[Math.floor(r() * CLOTH.length)],
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
    // Pavements.
    const want = Math.min(900, Math.round(pop.streetQ * nStreet));
    const street = this.walkers.filter((x) => x.kind === 'street' && !x.gone && !x.hurt);
    if (street.length > want) for (const x of street.slice(want)) x.gone = true;
    else
      for (let i = street.length; i < want; i++) {
        const k = Math.floor(r() * nStreet);
        this.walkers.push(this.spawn('street', s[k * 2] + (r() - 0.5), s[k * 2 + 1] + (r() - 0.5)));
      }
    // Open spaces: the souk, the square, the stadium, the school yard.
    for (const sp of w.spaces) {
      const n = Math.min(MAX_SPACE_WALKERS, Math.round(pop.spaceQ[sp.id] * sp.capacity));
      const mine = this.walkers.filter((x) => x.kind === 'space' && x.zone === sp.rect && !x.gone && !x.hurt);
      if (mine.length > n) for (const x of mine.slice(n)) x.gone = true;
      else for (let i = mine.length; i < n; i++) this.walkers.push(this.spawn('space', sp.rect.x + 1 + r() * (sp.rect.w - 2), sp.rect.y + 1 + r() * (sp.rect.h - 2), sp.rect));
    }
    // People moving between buildings as the hour changes.
    if (prev && prev.hour !== pop.hour) {
      const from: Building[] = [];
      const to: Building[] = [];
      for (const b of w.buildings) {
        const d = shownCount(pop, b) - shownCount(prev, b);
        for (let i = 0; i < Math.min(6, Math.abs(d)); i++) (d > 0 ? to : from).push(b);
      }
      const n = Math.min(160, Math.max(from.length, to.length));
      for (let i = 0; i < n; i++) {
        const a = from[Math.floor(r() * from.length)];
        if (!a || !to.length) break;
        // Somewhere not too far away.
        let b = to[Math.floor(r() * to.length)];
        for (let k = 0; k < 6 && Math.hypot(b.cx - a.cx, b.cy - a.cy) > 260; k++) b = to[Math.floor(r() * to.length)];
        if (a === b) continue;
        const t = this.spawn('transit', a.cx, a.cy);
        t.path = this.route(a, b);
        t.speed = 8 + r() * 6;
        t.phase = -r() * 1.5;
        this.walkers.push(t);
      }
    }
    this.walkers = this.walkers.filter((x) => !x.gone || x.kind === 'transit');
    // Cars: more on the boulevard, few at night.
    const wantCars = Math.round(20 + 150 * pop.trafficQ[1]);
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

  step(dt: number, blast: { x: number; y: number; t: number } | null) {
    const r = this.r;
    const s = this.world.streetPts;
    for (const w of this.walkers) {
      if (w.hurt) continue;
      w.phase += dt;
      if (w.kind === 'transit' && w.phase < 0) continue;
      if (blast && blast.t < 8) {
        const dx = w.x - blast.x;
        const dy = w.y - blast.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 130 && !w.flee) {
          w.flee = 1;
          w.path = [{ x: w.x + (dx / d) * 35, y: w.y + (dy / d) * 35 }];
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
      const sp = w.speed * (w.flee ? 3.2 : 1) * dt;
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
    for (const c of this.cars) {
      if (c.hurt) continue;
      if (blast && blast.t < 10 && Math.hypot(c.x - blast.x, c.y - blast.y) < 80) continue;
      const v = c.dir * c.speed * dt;
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
