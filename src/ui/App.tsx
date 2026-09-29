// Collateral Damage: plan a strike on a paper city, and watch Jev, the engine, estimate who would be hurt.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  approver,
  best,
  buildCity,
  compassName,
  estimate,
  fmtHour,
  FUZES,
  fuze,
  inCircle,
  key,
  MATERIAL_NAME,
  partOfDay,
  placeName,
  population,
  RULES,
  shownCount,
  sources,
  targetCentre,
  targetOf,
  WEAPONS,
  weapon,
  aimPoint,
  type Candidate,
  type Day,
  type Estimate,
  type Job,
  type Observations,
  type Place,
  type Plan,
  type Scored,
  type TargetId,
  type WeaponId,
} from '../jev';
import { JevPool, type PoolStatus } from '../jev/pool';
import type { JobOut } from '../jev/worker';
import { MapView, type Layers, type MapFrame, type Outcome } from '../view/map';
import type { Frame3D, Model3D } from '../view/model3d';
import { ApproveCard, Checklist, Chip, Dial, Group, Histogram, HourBars, pct, Scatter, Seg, SourceBars, TablesScene, type HistMode } from './parts';

const SEED = 7;
type HourWindow = 'any' | 'night' | 'quiet';
const WINDOWS: Record<HourWindow, number[]> = {
  any: [1, 4, 7, 10, 13, 16, 19, 22],
  night: [22, 23, 0, 1, 2, 3, 4],
  quiet: [0, 2, 4, 5, 20, 22],
};
const SPEEDS = [0.5, 1, 2, 4, 8, 16, 32, 64, Infinity];
const HEADING_NAMES: Record<number, string> = { 0: '↑ N', 45: '↗ NE', 90: '→ E', 135: '↘ SE', 180: '↓ S', 225: '↙ SW', 270: '← W', 315: '↖ NW' };
const DISCOVERED_KEY = 'cd.discovered';

interface Chapter {
  title: string;
  text: string;
  plan?: Partial<Plan>;
  layers?: Partial<Layers>;
  focus?: { cx: number; cy: number; zoom: number };
  hist?: HistMode;
  tables?: boolean;
  count?: boolean;
}

const CHAPTERS: Chapter[] = [
  {
    title: 'The target',
    text: 'Warehouse 14, in the Workshops, said to hold weapons. Whether it is a lawful military objective is a legal judgment, made by people, before any of the maths.',
    plan: { target: 'warehouse', hour: 10, day: 'weekday', weapon: 'large', fuze: 'instant', heading: 90 },
    layers: { circle: false, pattern: false, impacts: false, people: false },
    focus: { cx: 230, cy: 510, zoom: 5 },
  },
  {
    title: 'The crude circle',
    text: 'Draw a circle as far as the weapon can reach. Anything inside that must be protected? A school across School Road, the fuel depot round the corner, homes and shops. So: go on.',
    layers: { circle: true, pattern: false, impacts: false, people: false, protect: true },
    focus: { cx: 230, cy: 520, zoom: 3 },
  },
  {
    title: 'The tables',
    text: 'How far each weapon throws blast and fragments comes from thick books of tables, built from tests and past strikes, reportedly reissued at least twice a year. These are made-up stand-ins.',
    tables: true,
  },
  {
    title: 'The weapon',
    text: 'Warhead, fuze, direction and aim point change who is in reach. Fragments lean the way the bomb travels, and buildings and walls catch them: see the shadows in the spray.',
    layers: { circle: false, pattern: true, impacts: false, people: false },
    focus: { cx: 230, cy: 510, zoom: 4 },
  },
  {
    title: 'Who is there',
    text: 'Nobody knows exactly. Overhead images, phone signals and an old census disagree. Click any building to see its sources. Every dot is a person Jev expects there at this hour.',
    layers: { circle: false, pattern: true, impacts: false, people: true },
    focus: { cx: 250, cy: 500, zoom: 5 },
    count: true,
  },
  {
    title: 'Managing chance',
    text: 'Bombs do not land exactly where aimed, and the counts are guesses. So Jev runs the strike hundreds of times. Most runs are low; a few are much worse.',
    layers: { circle: false, pattern: true, impacts: true, people: true },
    focus: { cx: 230, cy: 510, zoom: 4 },
    hist: 'spread',
  },
  {
    title: 'Ways to reduce the harm',
    text: 'A smaller warhead. A delay fuze, so the walls catch the fragments. An approach that throws them west, away from the school. An hour when fewer people are nearby.',
    plan: { weapon: 'small', fuze: 'delay', heading: 270, hour: 2 },
    layers: { circle: false, pattern: true, impacts: true, people: true },
    focus: { cx: 230, cy: 510, zoom: 4 },
    hist: 'spread',
  },
  {
    title: 'Who signs off',
    text: 'The spread is boiled down to one cautious figure: nine in ten runs at or below it. The higher it is, the more senior the approval. A protected site in the circle pushes it up a level.',
    layers: { circle: true, pattern: true, impacts: false, people: true, protect: true },
    hist: 'thresholds',
  },
  {
    title: 'One roll of the dice',
    text: 'The estimate is a spread of possibilities. The strike is a single outcome. Then try the other targets: Tower 7 at night shows why some strikes cannot be made cheaply at all.',
    layers: { circle: false, pattern: true, impacts: false, people: true },
  },
];

const loadDiscovered = () => {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(DISCOVERED_KEY) ?? '[]'));
  } catch {
    return new Set<string>();
  }
};

const planFor = (world: ReturnType<typeof buildCity>, target: TargetId, base?: Partial<Plan>): Plan => {
  const t = targetOf(world, target);
  const a = targetCentre(t);
  return { target, weapon: 'large', fuze: 'instant', heading: 90, aimX: a.x, aimY: a.y, hour: 10, day: 'weekday', watched: 6, hardness: t.hardness, stored: t.stored, ...base };
};

export default function App() {
  const world = useMemo(() => buildCity(SEED), []);
  const [plan, setPlanState] = useState<Plan>(() => planFor(world, 'warehouse'));
  const target = targetOf(world, plan.target);
  const [obs, setObs] = useState<Observations>({});
  const [lawful, setLawful] = useState(true);
  const [rulesId, setRulesId] = useState('afg2009');
  const [runs, setRuns] = useState(400);
  const [layers, setLayers] = useState<Layers>({ people: true, circle: true, pattern: true, impacts: true, labels: true, protect: true });
  const [est, setEst] = useState<Estimate | null>(null);
  const [computing, setComputing] = useState(false);
  const [estSeed, setEstSeed] = useState(1);
  const [hourProfile, setHourProfile] = useState<number[] | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [striking, setStriking] = useState(false);
  const [spotMode, setSpotMode] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [pop, setPop] = useState<{ bid: number; x: number; y: number; n: number } | null>(null);
  const [chapter, setChapter] = useState<number | null>(null);
  const [card, setCard] = useState<number | null>(null);
  const [aimDrag, setAimDrag] = useState(false);
  const [dayPlay, setDayPlay] = useState(false);
  const [showCards, setShowCards] = useState(true);
  const [histMode, setHistMode] = useState<HistMode>('figure');
  const [showTables, setShowTables] = useState(false);
  const [explored, setExplored] = useState(0);
  const [toast, setToast] = useState<Place | null>(null);
  const [view, setView] = useState<'map' | 'model'>('map');
  const [modelReady, setModelReady] = useState(false);

  // Jev's search.
  const [status, setStatus] = useState<PoolStatus>({ running: false, done: 0, total: 0, busy: 0, workers: 0, rate: 0 });
  const [results, setResults] = useState<Scored[]>([]);
  const [testing, setTesting] = useState<Candidate | null>(null);
  const [follow, setFollow] = useState(true);
  const [speed, setSpeed] = useState(4);
  const [minPk, setMinPk] = useState(0.85);
  const [hours, setHours] = useState<HourWindow>('any');
  const [allowed, setAllowed] = useState<WeaponId[]>(WEAPONS.map((w) => w.id));
  const [log, setLog] = useState<{ t: string; kind: 'info' | 'best' | 'try' | 'step' }[]>([]);
  const [phase, setPhase] = useState<'idle' | 'checklist' | 'search' | 'done'>('idle');
  const [peek, setPeek] = useState<Scored | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<MapView | null>(null);
  const frameRef = useRef<MapFrame | null>(null);
  const poolRef = useRef<JevPool | null>(null);
  const bestRef = useRef<Scored | undefined>(undefined);
  const lastShown = useRef(0);
  const timers = useRef<number[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<{ cx: number; cy: number; zoom: number } | null>(null);
  const canvas3dRef = useRef<HTMLCanvasElement>(null);
  const labels3dRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<Model3D | null>(null);
  const strikeRef = useRef<{ plan: Plan; outcome: Outcome } | null>(null);

  const rules = RULES.find((r) => r.id === rulesId)!;
  const setPlan = useCallback((p: Partial<Plan>) => {
    setPlanState((old) => ({ ...old, ...p }));
    setOutcome(null);
  }, []);

  const popNow = useMemo(() => population(world, plan.hour, plan.day, plan.watched, obs), [world, plan.hour, plan.day, plan.watched, obs]);
  const circle = useMemo(() => inCircle(world, plan, popNow), [world, plan, popNow]);

  // Every change reruns the estimate.
  useEffect(() => {
    setComputing(true);
    const id = window.setTimeout(() => {
      setEst(estimate(world, plan, popNow, runs, estSeed));
      setComputing(false);
    }, 90);
    return () => clearTimeout(id);
  }, [world, plan, popNow, runs, estSeed]);

  // Harm by hour for this plan, from a worker so dragging stays smooth.
  const profileWorker = useRef<Worker | null>(null);
  useEffect(() => {
    let w: Worker | null = null;
    try {
      w = new Worker(new URL('../jev/worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<JobOut>) => setHourProfile(e.data.out.map((s) => s.p90));
    } catch {
      w = null;
    }
    profileWorker.current = w;
    return () => w?.terminate();
  }, []);
  useEffect(() => {
    const id = window.setTimeout(() => {
      const cands: Candidate[] = Array.from({ length: 24 }, (_, h) => ({ weapon: plan.weapon, fuze: plan.fuze, heading: plan.heading, aim: 'custom', hour: h }));
      const msg: Job = { job: Date.now(), seed: SEED, base: plan, obs, runs: 150, cands };
      profileWorker.current?.postMessage(msg);
    }, 250);
    return () => clearTimeout(id);
  }, [plan.target, plan.weapon, plan.fuze, plan.heading, plan.aimX, plan.aimY, plan.day, plan.watched, plan.hardness, plan.stored, obs]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dayPlay) return;
    const id = window.setInterval(() => setPlanState((p) => ({ ...p, hour: (Math.round(p.hour * 2) / 2 + 0.5) % 24 })), 450);
    return () => clearInterval(id);
  }, [dayPlay]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  // ------------------------------------------------------------ Jev's search

  const pushLog = useCallback((t: string, kind: 'info' | 'best' | 'try' | 'step' = 'info') => setLog((l) => [...l.slice(-80), { t, kind }]), []);
  const speedRef = useRef(SPEEDS[speed]);
  speedRef.current = SPEEDS[speed];

  useEffect(() => {
    const pool = new JevPool({
      onStatus: setStatus,
      onTesting: (c) => {
        const now = performance.now();
        const gap = speedRef.current === Infinity ? 180 : Math.min(250, 1000 / speedRef.current);
        if (now - lastShown.current < gap * 0.9) return;
        lastShown.current = now;
        setTesting(c);
      },
      onResults: setResults,
    });
    poolRef.current = pool;
    return () => {
      pool.dispose();
      timers.current.forEach(clearTimeout);
    };
  }, []);
  useEffect(() => {
    if (poolRef.current) poolRef.current.throttle = SPEEDS[speed];
  }, [speed]);

  const bestNow = useMemo(() => best(results, minPk), [results, minPk]);
  const seenCount = useRef(0);
  useEffect(() => {
    const fresh = results.slice(seenCount.current);
    seenCount.current = results.length;
    if (!fresh.length) return;
    if (SPEEDS[speed] <= 8) for (const s of fresh.slice(-4)) pushLog(`${describe(s.c)} → figure ${s.p90}, target ${pct(s.pk)}`, 'try');
    const b = best(results, minPk);
    if (b && (!bestRef.current || key(b.c) !== key(bestRef.current.c))) {
      pushLog(`New best: ${describe(b.c)} → planning figure ${b.p90}, mean ${b.mean.toFixed(1)}, target destroyed ${pct(b.pk)}`, 'best');
      bestRef.current = b;
    }
  }, [results]); // eslint-disable-line react-hooks/exhaustive-deps

  const firstPk = useRef(true);
  useEffect(() => {
    if (firstPk.current) {
      firstPk.current = false;
      return;
    }
    const b = best(results, minPk);
    bestRef.current = b;
    pushLog(`Requirement now ≥ ${pct(minPk)} chance of destroying the target. ${b ? `Best: ${describe(b.c)} → ${b.p90}` : 'Nothing tried so far meets it.'}`, 'step');
  }, [minPk]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase === 'search' && !status.running && status.done >= status.total && status.total > 0) {
      setPhase('done');
      const b = best(results, minPk);
      if (b) pushLog(`Done: ${status.done} plans. Best: ${describe(b.c)} → planning figure ${b.p90}. Sign-off: ${approver(b.p90, rules, circle.protectedSites.length > 0).who}.`, 'best');
      else pushLog(`Done: ${status.done} plans. None destroys the target ${pct(minPk)} of the time. Relax the requirement, or reconsider the strike.`, 'best');
    }
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const space = useCallback(() => ({ weapons: allowed, hours: WINDOWS[hours] }), [allowed, hours]);

  const runJev = () => {
    const pool = poolRef.current;
    if (!pool) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setLog([]);
    bestRef.current = undefined;
    seenCount.current = 0;
    setPhase('checklist');
    pool.throttle = SPEEDS[speed];
    const sp = space();
    const n = sp.weapons.length * 3 * 8 * 5 * sp.hours.length;
    const big = weapon(sp.weapons.includes('large') ? 'large' : sp.weapons[0]);
    const c = inCircle(world, { ...plan, weapon: big.id, fuze: 'instant' }, popNow);
    const steps = [
      () => pushLog(`Target: ${target.name}. Is it a lawful target?`, 'step'),
      () => pushLog(lawful ? 'Marked as a military objective by the targeting cell. That is a legal call made by people; Jev takes it as given.' : 'Not confirmed as a lawful target. Stop here: no estimate can make an unlawful strike lawful.', lawful ? 'info' : 'best'),
      () =>
        lawful &&
        pushLog(
          `Crude circle for the ${big.short}: ${c.radius} m, ${c.buildings} buildings.${c.protectedSites.length ? ` Protected: ${c.protectedSites.join(', ')}.` : ''}${c.hazards.length ? ` Hazards: ${c.hazards.join(', ')}.` : ''}${c.openSpaces.length ? ` Open ground: ${c.openSpaces.join(', ')}.` : ''} Go on.`,
          'step',
        ),
      () => lawful && pushLog(`Sweeping ${n.toLocaleString()} plans (${sp.weapons.length} weapons × 3 fuzes × 8 directions × 5 aim points × ${sp.hours.length} hours, ${plan.day === 'friday' ? 'Friday' : 'a weekday'}), ${pool.runs} runs each, on ${pool.workers} workers.`, 'step'),
      () => {
        if (!lawful) return setPhase('idle');
        setPhase('search');
        pool.start(plan, obs, sp, SEED);
      },
    ];
    const gap = SPEEDS[speed] === Infinity ? 150 : Math.max(200, 1300 / Math.sqrt(SPEEDS[speed]));
    steps.forEach((f, i) => timers.current.push(window.setTimeout(f, i * gap)));
  };

  const assumptions = `${plan.target}|${plan.day}|${plan.watched}|${plan.hardness}|${plan.stored}|${JSON.stringify(obs)}|${allowed.join()}|${hours}`;
  const lastAssumptions = useRef(assumptions);
  useEffect(() => {
    if (assumptions === lastAssumptions.current) return;
    const onlySpace = assumptions.split('|').slice(0, 6).join('|') === lastAssumptions.current.split('|').slice(0, 6).join('|');
    lastAssumptions.current = assumptions;
    const pool = poolRef.current;
    if (!pool || phase !== 'search') return;
    pushLog(onlySpace ? 'Search space changed: keeping what still fits, carrying on.' : 'Assumptions changed (target, day, people seen, hours watched): re-scoring from scratch.', 'step');
    bestRef.current = undefined;
    pool.start(plan, obs, space(), SEED, onlySpace);
  }, [assumptions]); // eslint-disable-line react-hooks/exhaustive-deps

  const candidateAim = (c: Candidate) => (c.aim === 'custom' ? { x: plan.aimX, y: plan.aimY } : aimPoint(target, c.aim));
  const applyCandidate = (c: Candidate) => {
    const a = candidateAim(c);
    setPlan({ weapon: c.weapon, fuze: c.fuze, heading: c.heading, hour: c.hour, aimX: a.x, aimY: a.y });
    pushLog(`Applied to the plan: ${describe(c)}.`, 'step');
  };

  // ------------------------------------------------------------ the map

  const ghostCand = peek?.c ?? (phase === 'search' || phase === 'done' ? testing : null);
  const ghostPlan = useMemo(() => {
    if (!ghostCand) return null;
    const a = candidateAim(ghostCand);
    return { ...plan, weapon: ghostCand.weapon, fuze: ghostCand.fuze, heading: ghostCand.heading, hour: ghostCand.hour, aimX: a.x, aimY: a.y };
  }, [ghostCand, plan]); // eslint-disable-line react-hooks/exhaustive-deps
  const following = follow && !!ghostPlan && (status.running || !!peek) && !outcome && !striking;
  const shownPlan = following ? ghostPlan! : plan;
  const popShown = useMemo(() => (following ? population(world, shownPlan.hour, plan.day, plan.watched, obs) : popNow), [following, shownPlan.hour, world, plan.day, plan.watched, obs, popNow]);

  frameRef.current = {
    world,
    pop: popShown,
    plan: shownPlan,
    est: following ? null : est,
    layers,
    circleR: inCircle(world, shownPlan, popShown).radius,
    ghost: following ? null : ghostPlan,
    spotMode,
    hover,
    selected: pop?.bid ?? null,
    outcome,
    aimDrag,
  };

  useEffect(() => {
    const canvas = canvasRef.current!;
    const map = new MapView(canvas, world);
    map.discovered = loadDiscovered();
    setExplored(map.discovered.size);
    map.onDiscover = (p) => {
      setExplored(map.discovered.size);
      if (p.kind !== 'street') {
        setToast(p);
        window.setTimeout(() => setToast((t) => (t === p ? null : t)), 3200);
      }
      try {
        localStorage.setItem(DISCOVERED_KEY, JSON.stringify([...map.discovered]));
      } catch {
        /* private mode: exploring just won't be remembered */
      }
    };
    mapRef.current = map;
    map.resize();
    const c = targetCentre(targetOf(world, 'warehouse'));
    map.view = canvas.clientWidth < 600 ? { cx: c.x + 20, cy: c.y + 10, zoom: 5 } : { cx: c.x + 30, cy: c.y + 5, zoom: 3.2 };
    // A shared view: #at=x,y,zoom (and optionally &h=hour&d=friday).
    const at = /at=([\d.]+),([\d.]+),([\d.]+)/.exec(location.hash);
    if (at) map.view = { cx: +at[1], cy: +at[2], zoom: +at[3] };
    const hh = /h=([\d.]+)/.exec(location.hash);
    if (hh) setPlanState((p) => ({ ...p, hour: Math.min(23.5, +hh[1]) }));
    if (/d=friday/.test(location.hash)) setPlanState((p) => ({ ...p, day: 'friday' }));
    map.clampView();
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(canvas);
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const f = focusRef.current;
      if (f) {
        const v = map.view;
        v.cx += (f.cx - v.cx) * 0.08;
        v.cy += (f.cy - v.cy) * 0.08;
        v.zoom += (f.zoom - v.zoom) * 0.08;
        map.clampView();
        if (Math.abs(f.zoom - v.zoom) < 0.005 && Math.hypot(f.cx - v.cx, f.cy - v.cy) < 0.1) focusRef.current = null;
      }
      if (frameRef.current) map.frame(frameRef.current, dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [world]);

  // The 3D model loads only when first opened.
  useEffect(() => {
    if (view !== 'model' || modelRef.current) return;
    let alive = true;
    import('../view/model3d').then(({ Model3D }) => {
      if (!alive || !canvas3dRef.current || !labels3dRef.current) return;
      const getFrame = (): Frame3D | null => {
        const f = frameRef.current;
        const m = mapRef.current;
        if (!f || !m) return null;
        const st = strikeRef.current;
        const t = m.strikeTime();
        return { world: f.world, plan: f.plan, pop: f.pop, est: f.est, layers: f.layers, circleR: f.circleR, outcome: f.outcome, strike: st && t != null ? { ...st, t } : null, walkers: m.crowd.visible(), cars: m.crowd.cars };
      };
      modelRef.current = new Model3D(canvas3dRef.current, labels3dRef.current, world, getFrame);
      setModelReady(true);
    });
    return () => {
      alive = false;
    };
  }, [view, world]);
  useEffect(() => {
    const m = modelRef.current;
    if (!m) return;
    m.resize();
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(canvas3dRef.current!);
    return () => ro.disconnect();
  }, [modelReady]);
  useEffect(() => () => modelRef.current?.dispose(), []);

  // Pointer: drag the aim, pan, zoom, click a building to count its people.
  const drag = useRef<{ mode: 'aim' | 'pan'; x: number; y: number; cx: number; cy: number } | null>(null);
  const localXY = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const inTarget = (x: number, y: number) => x >= target.rect.x - 2 && x <= target.rect.x + target.rect.w + 2 && y >= target.rect.y - 2 && y <= target.rect.y + target.rect.h + 2;
  const moveAim = (x: number, y: number) => {
    const q = target.rect;
    setPlan({ aimX: Math.max(q.x + 1, Math.min(q.x + q.w - 1, x)), aimY: Math.max(q.y + 1, Math.min(q.y + q.h - 1, y)) });
  };
  const openPeople = (wx: number, wy: number, px: number, py: number) => {
    const b = mapRef.current?.buildingAt(wx, wy);
    if (!b || b.id === target.buildingId || !b.capacity) return setPop(null);
    setPop({ bid: b.id, x: px, y: py, n: obs[b.id] ?? shownCount(popNow, b) });
  };
  const onDown = (e: React.PointerEvent) => {
    const m = mapRef.current;
    if (!m || striking) return;
    const p = localXY(e);
    const w = m.toWorld(p.x, p.y);
    focusRef.current = null;
    if (spotMode) return openPeople(w.x, w.y, p.x, p.y);
    const { s } = m.cam();
    const nearAim = Math.hypot(w.x - plan.aimX, w.y - plan.aimY) * s < 22;
    (e.target as Element).setPointerCapture(e.pointerId);
    if (!outcome && (nearAim || inTarget(w.x, w.y))) {
      drag.current = { mode: 'aim', x: p.x, y: p.y, cx: 0, cy: 0 };
      setAimDrag(true);
      moveAim(w.x, w.y);
    } else drag.current = { mode: 'pan', x: p.x, y: p.y, cx: m.view.cx, cy: m.view.cy };
  };
  const onMove = (e: React.PointerEvent) => {
    const m = mapRef.current;
    if (!m) return;
    const p = localXY(e);
    const w = m.toWorld(p.x, p.y);
    const d = drag.current;
    if (d?.mode === 'aim') moveAim(w.x, w.y);
    else if (d?.mode === 'pan') {
      const { s } = m.cam();
      m.view.cx = d.cx - (p.x - d.x) / s;
      m.view.cy = d.cy - (p.y - d.y) / s;
      m.clampView();
    } else {
      const b = m.buildingAt(w.x, w.y);
      setHover(b ? b.id : null);
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setAimDrag(false);
    const m = mapRef.current;
    if (d?.mode === 'pan' && m && e.type === 'pointerup') {
      const p = localXY(e);
      if (Math.hypot(p.x - d.x, p.y - d.y) < 5) {
        const w = m.toWorld(p.x, p.y);
        openPeople(w.x, w.y, p.x, p.y);
      }
    }
  };
  useEffect(() => {
    const c = canvasRef.current!;
    const wheel = (e: WheelEvent) => {
      const m = mapRef.current;
      if (!m) return;
      e.preventDefault();
      focusRef.current = null;
      const p = localXY(e);
      const before = m.toWorld(p.x, p.y);
      m.view.zoom *= Math.exp(-e.deltaY * 0.0015);
      m.clampView();
      const after = m.toWorld(p.x, p.y);
      m.view.cx += before.x - after.x;
      m.view.cy += before.y - after.y;
      m.clampView();
    };
    c.addEventListener('wheel', wheel, { passive: false });
    return () => c.removeEventListener('wheel', wheel);
  }, []);

  // ------------------------------------------------------------ targets, tour, strike

  const chooseTarget = (id: TargetId) => {
    const t = targetOf(world, id);
    const a = targetCentre(t);
    resetTown();
    setPop(null);
    setObs({});
    setPlan({ target: id, aimX: a.x, aimY: a.y, hardness: t.hardness, stored: t.stored });
    focusRef.current = { cx: a.x + 20, cy: a.y + 10, zoom: 3.4 };
    poolRef.current?.stop();
    setResults([]);
    setPhase('idle');
    setLog([]);
    setTesting(null);
  };

  const goChapter = (i: number | null) => {
    setChapter(i);
    if (i == null) return;
    const ch = CHAPTERS[i];
    setCard(i);
    window.setTimeout(() => setCard((c) => (c === i ? null : c)), 1700);
    if (ch.plan) {
      const tgt = ch.plan.target ?? plan.target;
      const t = targetOf(world, tgt);
      const a = targetCentre(t);
      setPlan({ ...ch.plan, aimX: a.x, aimY: a.y, hardness: t.hardness, stored: t.stored });
    }
    if (ch.layers) setLayers((l) => ({ ...l, ...ch.layers }));
    if (ch.focus) window.setTimeout(() => (focusRef.current = ch.focus!), 900);
    setHistMode(ch.hist ?? 'figure');
    setShowTables(!!ch.tables);
    setPop(null);
    if (ch.count) {
      const c = targetCentre(target);
      const flats = world.buildings.filter((b) => (b.kind === 'home' || b.kind === 'apartment') && Math.hypot(b.cx - c.x, b.cy - c.y) < 120).sort((a, b) => b.capacity - a.capacity)[0];
      if (flats)
        window.setTimeout(() => {
          const m = mapRef.current;
          if (!m) return;
          const p = m.toScreen(flats.cx, flats.cy);
          setPop({ bid: flats.id, x: p.x, y: p.y, n: shownCount(popNow, flats) });
        }, 2600);
    }
    setOutcome(null);
  };

  const release = () => {
    const m = mapRef.current;
    if (!m || !lawful) return;
    setOutcome(null);
    m.clearStrike();
    setStriking(true);
    setDayPlay(false);
    setPop(null);
    if (poolRef.current?.running) poolRef.current.pause();
    focusRef.current = { cx: plan.aimX, cy: plan.aimY + 10, zoom: Math.max(3.4, m.view.zoom) };
    m.onImpact = (o) => setOutcome(o);
    m.onSettled = () => setStriking(false);
    const o = m.strike(plan, popNow, Math.floor(Math.random() * 1e9));
    strikeRef.current = { plan, outcome: o };
  };
  function resetTown() {
    mapRef.current?.clearStrike();
    strikeRef.current = null;
    setOutcome(null);
    setStriking(false);
  }
  const holdForHour = () => {
    if (!hourProfile) return;
    let h = plan.hour;
    let bestV = Infinity;
    hourProfile.forEach((v, i) => {
      if (v < bestV || (v === bestV && Math.abs(i - plan.hour) < Math.abs(h - plan.hour))) {
        bestV = v;
        h = i;
      }
    });
    setPlan({ hour: h });
  };

  // ------------------------------------------------------------ derived

  const fig = est?.p90 ?? 0;
  const signoff = approver(fig, rules, circle.protectedSites.length > 0);
  const reduceTip = useMemo(() => {
    if (!est) return '';
    if (hourProfile) {
      const min = Math.min(...hourProfile);
      const at = hourProfile.indexOf(min);
      if (min < fig - 1) return `An hour when fewer are nearby (${fmtHour(at)}: ${min})`;
    }
    if (plan.weapon === 'large' || plan.weapon === 'medium') return 'A smaller warhead';
    if (plan.fuze !== 'delay' && target.buildingId != null) return 'A delay fuze';
    if (circle.protectedSites.length) {
      const b = world.buildings.find((x) => x.name === circle.protectedSites[0]);
      if (b) {
        const toward = (Math.atan2(b.cx - plan.aimX, -(b.cy - plan.aimY)) * 180) / Math.PI;
        const diff = Math.abs(((plan.heading - toward + 540) % 360) - 180);
        if (diff < 90) return `An approach that throws fragments away from ${b.name}`;
      }
    }
    return 'Watch longer, to narrow the guess';
  }, [est, hourProfile, fig, plan, world, target, circle]);

  const circleLine = circle.protectedSites.length
    ? `${circle.protectedSites[0]}${circle.protectedSites.length > 1 ? ` and ${circle.protectedSites.length - 1} more protected` : ''}: go on`
    : circle.hazards.length
      ? `${circle.hazards[0]}: go on`
      : circle.people > 0.5
        ? `${Math.round(circle.people)} people: go on`
        : 'Nothing: no estimate needed';
  const w = weapon(plan.weapon);
  const popB = pop ? world.buildings[pop.bid] : null;

  return (
    <div className="cd">
      <nav className="cd-nav">
        <a className="cd-logo" href="/">
          Collateral Damage<span>[ powered by Jev ]</span>
        </a>
        <div className="cd-actions">
          <span className="cd-exp">An explainer, not a targeting tool</span>
          <button className="cd-pill dark" onClick={() => goChapter(chapter == null ? 0 : null)}>
            {chapter == null ? 'Take the tour' : 'End tour'}
          </button>
        </div>
      </nav>

      <header className="cd-head">
        <div>
          <p className="cd-kicker">Collateral damage estimation</p>
          <h1>How a strike is weighed</h1>
        </div>
        <p>
          A paper city of eight districts and some twenty-four thousand people. Pick a target, then change the weapon, the fuze, the direction of attack, the aim point, the hour and the day, and watch Jev, the engine underneath, rerun the estimate of who would be killed or badly hurt. Or let Jev sweep thousands of plans in parallel.
        </p>
      </header>

      <div className="cd-grid">
        <section className="cd-stage">
          <div className="cd-map">
            <canvas
              ref={canvasRef}
              className={`cd-canvas ${spotMode ? 'spot' : ''} ${hover != null && hover === target.buildingId && !spotMode ? 'aim' : ''}`}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onPointerLeave={() => setHover(null)}
              aria-label="A paper model of a city, seen from above"
            />
            <canvas ref={canvas3dRef} className={`cd-canvas3d ${view === 'model' ? 'on' : ''}`} aria-label="The paper city as a tilted model" />
            <div ref={labels3dRef} className={`cd3-labels ${view === 'model' ? 'on' : ''}`} />
            {view === 'model' && <div className="cd-tilt" aria-hidden />}
            {view === 'model' && !modelReady && <div className="cd-loading">Folding the city…</div>}

            <div className="cd-when">
              <b>{partOfDay(shownPlan.hour)}</b>
              <span>
                {plan.day === 'friday' ? 'Fri' : 'Weekday'} {fmtHour(shownPlan.hour)}
              </span>
              {following && <em>Jev is testing</em>}
            </div>
            <div className="cd-explored" title="Places you've found by exploring the map">
              Explored <b>{explored}</b> / {world.places.length}
            </div>
            {toast && (
              <div className="cd-toast" key={toast.id}>
                <small>Found</small>
                <b>{toast.name}</b>
                {toast.note && <span>{toast.note}</span>}
              </div>
            )}

            {showCards && (
              <div className="cd-cards">
                <Checklist lawful={lawful} circle={circleLine} weaponLine={`${w.short} · ${fuze(plan.fuze).name.toLowerCase()} · heading ${compassName(plan.heading)}`} reduce={reduceTip} computing={computing} signoff={signoff.who} />
                {est && histMode !== 'spread' && <ApproveCard a={signoff} figure={est.p90} rules={rules} />}
                {est && <Histogram est={est} rules={rules} computing={computing} aside={following} mode={histMode} onMode={setHistMode} />}
              </div>
            )}

            {showTables && (
              <div className="cd-tables">
                <TablesScene />
                <div className="cd-card cd-table">
                  <h4>Blast and fragments</h4>
                  <table>
                    <thead>
                      <tr>
                        <th>Weapon</th>
                        <th>Blast</th>
                        <th>Fragments</th>
                        <th>Half land within</th>
                      </tr>
                    </thead>
                    <tbody>
                      {WEAPONS.map((wp) => (
                        <tr key={wp.id} className={wp.id === plan.weapon ? 'on' : ''} onClick={() => setPlan({ weapon: wp.id })}>
                          <td>{wp.name}</td>
                          <td>{wp.blast} m</td>
                          <td>{wp.frag} m</td>
                          <td>{wp.cep} m</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="cd-hint">Illustrative numbers, invented for this model. Real tables are classified. Click a row to choose that weapon.</p>
                  {chapter == null && (
                    <button className="cd-link" onClick={() => setShowTables(false)}>
                      Close the tables
                    </button>
                  )}
                </div>
              </div>
            )}

            {card != null && (
              <div className="cd-chapter" key={card}>
                <div>
                  <span className="n">{card + 1}</span>
                  <h2>{CHAPTERS[card].title}</h2>
                </div>
              </div>
            )}
            {chapter != null && card == null && (
              <div className="cd-caption">
                <span className="n">{chapter + 1}</span>
                <div>
                  <h3>{CHAPTERS[chapter].title}</h3>
                  <p>{CHAPTERS[chapter].text}</p>
                </div>
                <div className="cd-caption-nav">
                  <button onClick={() => goChapter(Math.max(0, chapter - 1))} disabled={chapter === 0}>
                    Back
                  </button>
                  {chapter < CHAPTERS.length - 1 ? (
                    <button className="dark" onClick={() => goChapter(chapter + 1)}>
                      Next
                    </button>
                  ) : (
                    <button
                      className="dark"
                      onClick={() => {
                        goChapter(null);
                        release();
                      }}
                    >
                      Release
                    </button>
                  )}
                </div>
              </div>
            )}

            {outcome && (
              <div className="cd-outcome">
                <p className="cd-kicker">One outcome</p>
                <div className="big">
                  {outcome.count}
                  <span>{outcome.count === 1 ? 'person' : 'people'} killed or badly hurt</span>
                </div>
                {est && (
                  <p>
                    The estimate said half the runs at or below <b>{est.p50}</b>, nine in ten at or below <b>{est.p90}</b>. This time it was {outcome.count}.
                  </p>
                )}
                <p>
                  Target {outcome.destroyed ? 'destroyed' : <b>not destroyed</b>}. It landed {Math.round(Math.hypot(outcome.ix - plan.aimX, outcome.iy - plan.aimY))} m from the aim point.
                  {outcome.secondary.length > 0 && <> Also went off: {outcome.secondary.join(', ')}.</>}
                </p>
                <p className="cd-small">Every red ring is a person in the model. Real people have names.</p>
                <div className="cd-row">
                  <button className="cd-pill dark" onClick={resetTown} disabled={striking}>
                    Rebuild the city
                  </button>
                  <button className="cd-pill ghost" onClick={release} disabled={striking}>
                    Roll again
                  </button>
                </div>
              </div>
            )}

            {pop && popB && (
              <div
                className="cd-card cd-pop"
                style={{
                  left: Math.max(10, Math.min(pop.x + 24, (canvasRef.current?.clientWidth ?? 400) - 330)),
                  top: Math.max(10, Math.min(pop.y - 40, (canvasRef.current?.clientHeight ?? 600) - 360)),
                }}
              >
                <h4>People inside right now</h4>
                <span>
                  {placeName(popB)} · {MATERIAL_NAME[popB.material]} · {fmtHour(plan.hour)}
                  {popB.protected ? ' · protected site' : ''}
                </span>
                <SourceBars s={sources(world, popNow, popB)} onUse={(n) => setPop({ ...pop, n })} />
                <div className="cd-stepper">
                  <button onClick={() => setPop({ ...pop, n: Math.max(0, pop.n - 1) })}>−</button>
                  <em>{pop.n} seen</em>
                  <button onClick={() => setPop({ ...pop, n: Math.min(popB.slots.length / 2, pop.n + 1) })}>+</button>
                </div>
                <div className="cd-row">
                  <button
                    className="cd-pill dark small"
                    onClick={() => {
                      setObs({ ...obs, [pop.bid]: pop.n });
                      setPop(null);
                    }}
                  >
                    Log it
                  </button>
                  {obs[pop.bid] != null && (
                    <button
                      className="cd-pill ghost small"
                      onClick={() => {
                        const o = { ...obs };
                        delete o[pop.bid];
                        setObs(o);
                        setPop(null);
                      }}
                    >
                      Forget
                    </button>
                  )}
                  <button className="cd-x" onClick={() => setPop(null)} aria-label="Close">
                    ×
                  </button>
                </div>
              </div>
            )}

            <div className="cd-bar">
              <span className="cd-view">
                <button className={view === 'map' ? 'on' : ''} onClick={() => setView('map')}>
                  Map
                </button>
                <button
                  className={view === 'model' ? 'on' : ''}
                  onClick={() => {
                    if (view !== 'model' && !modelRef.current) setShowCards(false);
                    setView('model');
                  }}
                >
                  Model
                </button>
              </span>
              {(
                [
                  ['people', 'People inside'],
                  ['pattern', 'Pattern'],
                  ['circle', 'Circle'],
                  ['impacts', 'Landings'],
                  ['protect', 'Protected'],
                  ['labels', 'Labels'],
                ] as [keyof Layers, string][]
              ).map(([k, name]) => (
                <button key={k} className={`cd-chip ${layers[k] ? 'on' : ''}`} onClick={() => setLayers({ ...layers, [k]: !layers[k] })} aria-pressed={layers[k]}>
                  {name}
                </button>
              ))}
              <button className={`cd-chip ${showCards ? 'on' : ''}`} onClick={() => setShowCards(!showCards)}>
                Cards
              </button>
              {view === 'model' ? (
                <span className="cd-zoom">
                  <button onClick={() => modelRef.current?.preset('drone')}>Drone</button>
                  <button onClick={() => modelRef.current?.preset('street')}>Street</button>
                  <button onClick={() => modelRef.current?.preset('top')}>Top</button>
                </span>
              ) : (
                <span className="cd-zoom">
                  <button onClick={() => (focusRef.current = { ...mapRef.current!.view, zoom: mapRef.current!.view.zoom * 1.4 })} aria-label="Zoom in">
                    +
                  </button>
                  <button onClick={() => (focusRef.current = { ...mapRef.current!.view, zoom: mapRef.current!.view.zoom / 1.4 })} aria-label="Zoom out">
                    −
                  </button>
                  <button onClick={() => (focusRef.current = { cx: world.w / 2, cy: world.h / 2, zoom: 1 })}>City</button>
                  <button
                    onClick={() => {
                      const c = targetCentre(target);
                      focusRef.current = { cx: c.x + 20, cy: c.y + 10, zoom: 3.4 };
                    }}
                  >
                    Target
                  </button>
                </span>
              )}
            </div>
          </div>
        </section>

        <aside className="cd-panel">
          <Group n={1} title="The target">
            <div className="cd-targets">
              {world.targets.map((t) => (
                <button key={t.id} className={plan.target === t.id ? 'on' : ''} onClick={() => chooseTarget(t.id)}>
                  <b>{t.name}</b>
                  <span>{t.note}</span>
                </button>
              ))}
            </div>
            <label className="cd-check">
              <input type="checkbox" checked={lawful} onChange={(e) => setLawful(e.target.checked)} />
              <span>
                Confirmed lawful military objective
                <small>A legal judgment by people, before any estimate. Untick it and nothing else matters.</small>
              </span>
            </label>
            {target.buildingId != null && (
              <label className="cd-check">
                <input type="checkbox" checked={plan.stored} onChange={(e) => setPlan({ stored: e.target.checked })} />
                <span>
                  Weapons stored inside
                  <small>If it's destroyed, what's inside may go off too, whatever bomb you choose.</small>
                </span>
              </label>
            )}
          </Group>

          <Group n={2} title="Weapon">
            <div className="cd-weapons">
              {WEAPONS.map((wp) => (
                <button key={wp.id} className={plan.weapon === wp.id ? 'on' : ''} onClick={() => setPlan({ weapon: wp.id })}>
                  <b>{wp.name}</b>
                  <span>{wp.note}</span>
                  <em>
                    blast {wp.blast} m · fragments {wp.frag} m · half land within {wp.cep} m
                  </em>
                </button>
              ))}
            </div>
            <Seg value={plan.fuze} onChange={(f) => setPlan({ fuze: f })} options={FUZES.map((f) => [f.id, f.name] as [typeof f.id, string])} />
            <p className="cd-hint">{fuze(plan.fuze).note}</p>
            <button className="cd-link" onClick={() => setShowTables(!showTables)}>
              {showTables ? 'Close the tables' : 'Open the blast and fragment tables'}
            </button>
          </Group>

          <Group n={3} title="Direction and aim">
            <div className="cd-dir">
              <Dial value={plan.heading} onChange={(heading) => setPlan({ heading })} />
              <div>
                <p className="cd-hint">
                  Arriving from the {compassName(plan.heading + 180)}, heading {compassName(plan.heading)}. Fragments lean the way it's travelling.
                </p>
                <p className="cd-hint">Drag the crosshair on the target to move the aim point.</p>
                <button
                  className="cd-link"
                  onClick={() => {
                    const c = targetCentre(target);
                    setPlan({ aimX: c.x, aimY: c.y });
                  }}
                >
                  Re-centre the aim
                </button>
              </div>
            </div>
          </Group>

          <Group n={4} title="Who is there">
            <Seg value={plan.day} onChange={(day: Day) => setPlan({ day })} options={[['weekday', 'Weekday'], ['friday', 'Friday']]} />
            <p className="cd-hint">{plan.day === 'friday' ? 'Friday: prayers at noon, a match at the stadium in the afternoon, schools and most offices shut.' : 'A working day: schools, offices, the souk and the bus station busy.'}</p>
            <div className="cd-slider">
              <span>
                Hour <em>{fmtHour(plan.hour)}</em>
              </span>
              <input type="range" min={0} max={23.5} step={0.5} value={plan.hour} onChange={(e) => setPlan({ hour: +e.target.value })} />
            </div>
            {hourProfile && <HourBars values={hourProfile} hour={plan.hour} onPick={(hour) => setPlan({ hour })} />}
            <div className="cd-row">
              <button className="cd-chip" onClick={() => setDayPlay(!dayPlay)}>
                {dayPlay ? 'Stop the clock' : 'Play the day'}
              </button>
              <span className="cd-hint">~{Math.round(circle.people)} people in the circle</span>
            </div>
            <div className="cd-slider">
              <span>
                Hours watched <em>{plan.watched} h</em>
              </span>
              <input type="range" min={0} max={72} step={2} value={plan.watched} onChange={(e) => setPlan({ watched: +e.target.value })} />
            </div>
            <div className="cd-row">
              <button className={`cd-chip ${spotMode ? 'on' : ''}`} onClick={() => setSpotMode(!spotMode)} aria-pressed={spotMode}>
                {spotMode ? 'Done counting' : 'Count people in a building'}
              </button>
              {Object.keys(obs).length > 0 && (
                <button className="cd-link" onClick={() => setObs({})}>
                  Forget {Object.keys(obs).length} count{Object.keys(obs).length > 1 ? 's' : ''}
                </button>
              )}
            </div>
            <p className="cd-hint">Click any building to compare overhead images, phone signals and the census, and log a count. Logged counts show as blue dots.</p>
          </Group>

          <Group n={5} title="Who signs off">
            <Seg value={rulesId} onChange={setRulesId} options={RULES.map((r) => [r.id, r.name] as [string, string])} />
            <p className="cd-hint">Senior sign-off at {rules.senior} or more: {rules.source}.</p>
            <div className="cd-sign">
              {['Strike cell', 'Senior', 'More senior', 'Most senior'].map((name, l) => (
                <span key={l} className={l === signoff.level ? 'on' : l < signoff.level ? 'past' : ''}>
                  {name}
                </span>
              ))}
            </div>
            <p className="cd-hint">{signoff.note}</p>
            <Seg value={runs} onChange={setRuns} options={[[100, '100 runs'], [400, '400 runs'], [1000, '1,000 runs']]} />
            <button className="cd-link" onClick={() => setEstSeed(estSeed + 1)}>
              Run the estimate again with new dice
            </button>
          </Group>

          <Group n={6} title="Decide">
            <div className="cd-decide">
              <button className="cd-pill dark" onClick={release} disabled={!lawful || striking}>
                Release
              </button>
              <button className="cd-pill ghost" onClick={holdForHour} disabled={!hourProfile || striking}>
                Hold for a better hour
              </button>
              <button className="cd-pill ghost" onClick={resetTown} disabled={striking}>
                Call it off
              </button>
            </div>
            {!lawful && <p className="cd-hint warn">No lawful target, no strike.</p>}
            <p className="cd-hint">Whether the expected harm is excessive against the military advantage is a human judgment. The model can't make it.</p>
          </Group>
        </aside>
      </div>

      <section className="cd-jev">
        <div className="cd-jev-head">
          <div>
            <p className="cd-kicker">The engine</p>
            <h2>
              Jev <span className={`cd-status ${phase}`}>{phase === 'idle' ? 'Idle' : phase === 'checklist' ? 'Walking the checklist' : phase === 'search' ? (status.running ? 'Searching' : 'Paused') : 'Done'}</span>
            </h2>
            <p className="cd-jev-sub">Typed, seeded and pure: the same code runs the page, the map, the 3D model and every worker, so any plan's numbers can be reproduced exactly.</p>
          </div>
          <div className="cd-row">
            <button className="cd-pill light" onClick={runJev}>
              {phase === 'idle' ? 'Run Jev' : 'Start over'}
            </button>
            {phase === 'search' && (
              <button className="cd-pill ghost-light" onClick={() => (status.running ? poolRef.current?.pause() : poolRef.current?.resume())}>
                {status.running ? 'Pause' : 'Resume'}
              </button>
            )}
            {phase === 'search' && !status.running && (
              <button className="cd-pill ghost-light" onClick={() => poolRef.current?.step()}>
                Step
              </button>
            )}
          </div>
        </div>

        <div className="cd-jev-grid">
          <div className="cd-jev-controls">
            <div className="cd-slider">
              <span>
                Throttle <em>{SPEEDS[speed] === Infinity ? 'flat out' : `${SPEEDS[speed]} plans/s`}</em>
              </span>
              <input type="range" min={0} max={SPEEDS.length - 1} step={1} value={speed} onChange={(e) => setSpeed(+e.target.value)} />
            </div>
            <div className="cd-slider">
              <span>
                Workers in parallel <em>{status.workers}</em>
              </span>
              <input type="range" min={1} max={Math.max(2, Math.min(8, navigator.hardwareConcurrency || 4))} step={1} value={status.workers || 1} onChange={(e) => poolRef.current?.setWorkers(+e.target.value)} />
            </div>
            <div className="cd-slider">
              <span>
                Must destroy the target <em>{pct(minPk)} of runs</em>
              </span>
              <input type="range" min={0.5} max={0.99} step={0.01} value={minPk} onChange={(e) => setMinPk(+e.target.value)} />
            </div>
            <Seg small value={hours} onChange={setHours} options={[['any', 'Any hour'], ['night', 'Night only'], ['quiet', 'Quiet hours']]} />
            <div className="cd-allowed">
              {WEAPONS.map((wp) => (
                <label key={wp.id} className="cd-check small">
                  <input
                    type="checkbox"
                    checked={allowed.includes(wp.id)}
                    onChange={(e) => {
                      const next = e.target.checked ? [...allowed, wp.id] : allowed.filter((x) => x !== wp.id);
                      if (next.length) setAllowed(WEAPONS.map((x) => x.id).filter((x) => next.includes(x)));
                    }}
                  />
                  <span>{wp.short}</span>
                </label>
              ))}
            </div>
            <label className="cd-check small">
              <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
              <span>Show each plan on the map as Jev tries it</span>
            </label>
            <div className="cd-progress">
              <div style={{ width: `${status.total ? (100 * status.done) / status.total : 0}%` }} />
            </div>
            <p className="cd-hint mono">
              {status.done.toLocaleString()} / {status.total.toLocaleString()} plans · {status.rate.toFixed(0)}/s · {status.busy} of {status.workers} workers busy
            </p>
          </div>

          <div className="cd-jev-mid">
            <div className="cd-testing" key={testing ? key(testing) : 'none'}>
              <p className="cd-kicker">{phase === 'search' ? 'Now testing' : 'Next up'}</p>
              {testing ? (
                <div className="cd-flip">
                  <Chip k="Weapon" v={weapon(testing.weapon).short} />
                  <Chip k="Fuze" v={fuze(testing.fuze).name} />
                  <Chip k="Heading" v={HEADING_NAMES[testing.heading]} />
                  <Chip k="Aim" v={testing.aim} />
                  <Chip k="Hour" v={fmtHour(testing.hour)} />
                </div>
              ) : (
                <p className="cd-hint">Press Run Jev. It walks the checklist, then tries every combination for {target.short}, runs each one {poolRef.current?.runs ?? 120} times, and keeps the plan that meets the requirement with the least harm.</p>
              )}
            </div>
            <div className="cd-log" ref={logRef}>
              {log.map((l, i) => (
                <div key={i} className={l.kind}>
                  {l.t}
                </div>
              ))}
            </div>
          </div>

          <div className="cd-jev-right">
            <Scatter results={results} best={bestNow} minPk={minPk} onPeek={setPeek} onPick={(s) => applyCandidate(s.c)} />
            {bestNow ? (
              <div className="cd-best">
                <p className="cd-kicker">Best so far</p>
                <b>{describe(bestNow.c)}</b>
                <span>
                  Planning figure {bestNow.p90} · mean {bestNow.mean.toFixed(1)} · target destroyed {pct(bestNow.pk)} · {approver(bestNow.p90, rules, circle.protectedSites.length > 0).who}
                </span>
                <button className="cd-pill light small" onClick={() => applyCandidate(bestNow.c)}>
                  Use this plan
                </button>
              </div>
            ) : (
              <p className="cd-hint">Each dot is a plan: harm across, chance of destroying the target up. Hover to preview it on the map, click to use it.</p>
            )}
          </div>
        </div>
      </section>

      <footer className="cd-foot">
        <p>
          <b>About this model.</b> An illustrative explainer of the collateral damage estimation process as it has been publicly described. The city, weapon radii, how people move through the day, materials, shielding and approval levels are simplified and invented for teaching; the two approval thresholds are as reported in the press. Real estimates rest on classified data, and the decisions that matter, whether a target is lawful and whether the expected harm is excessive, are made by people. Inspired by an explainer video by{' '}
          <a href="https://x.com/tobiaschneider" target="_blank" rel="noreferrer">
            Tobias Schneider
          </a>
          .
        </p>
      </footer>
    </div>
  );
}

const describe = (c: Candidate) => `${weapon(c.weapon).short}, ${fuze(c.fuze).name.toLowerCase()} fuze, heading ${compassName(c.heading)}, aim ${c.aim}, ${fmtHour(c.hour)}`;
