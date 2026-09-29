// Collateral Damage: plan a strike on a paper city and watch Jev, the engine, estimate who would be hurt.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  aimPoint,
  approver,
  best,
  buildCity,
  compassName,
  dangerField,
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
  type Candidate,
  type DangerField,
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
import { ApprovalLadder, Breakdown, Distribution, Frontier, OptionsMatrix, pct, StatTiles, Timeline, type MatrixCell } from './charts';
import { Chip, Dial, Seg, SourceBars, Step } from './parts';

const SEED = 7;
type HourWindow = 'any' | 'night' | 'quiet';
const WINDOWS: Record<HourWindow, number[]> = { any: [1, 4, 7, 10, 13, 16, 19, 22], night: [22, 23, 0, 1, 2, 3, 4], quiet: [0, 2, 4, 5, 20, 22] };
const SPEEDS = [0.5, 1, 2, 4, 8, 16, 32, 64, Infinity];
const HEADING_NAMES: Record<number, string> = { 0: '↑ N', 45: '↗ NE', 90: '→ E', 135: '↘ SE', 180: '↓ S', 225: '↙ SW', 270: '← W', 315: '↖ NW' };
const DISCOVERED_KEY = 'cd.discovered';
type StepId = 'target' | 'weapon' | 'approach' | 'intel' | 'rules' | 'decide';

interface GuideStep {
  title: string;
  text: string;
  plan?: Partial<Plan>;
  layers?: Partial<Layers>;
  focus?: { cx: number; cy: number; zoom: number };
  open?: StepId;
  tab?: 'estimate' | 'jev';
}

const GUIDE: GuideStep[] = [
  { title: 'Pick a target', text: 'Warehouse 14 is said to hold weapons. Whether it is a lawful target is a legal call made by people, before any maths. Everything after is about the harm to everyone else.', plan: { target: 'warehouse', hour: 10, day: 'weekday', weapon: 'large', fuze: 'instant', heading: 90 }, layers: { danger: false, pattern: false, circle: false }, focus: { cx: 240, cy: 505, zoom: 4.5 }, open: 'target' },
  { title: 'Draw the crude circle', text: 'Everything a weapon could reach. Inside it: a school across the road, a fuel depot round the corner, homes and shops. Protected sites and hazards are outlined.', layers: { circle: true, protect: true }, focus: { cx: 240, cy: 520, zoom: 2.8 } },
  { title: 'See the danger', text: 'The red field is the chance that someone standing in the open would be killed or badly hurt, averaged over hundreds of landings. Buildings cast shadows in it: walls stop fragments.', layers: { danger: true, circle: false }, focus: { cx: 240, cy: 505, zoom: 3.6 }, open: 'weapon' },
  { title: 'Change the weapon', text: 'Try a smaller warhead and a delay fuze in the options matrix. Watch the field shrink and the planning figure fall. Some choices stop destroying the target.', plan: { weapon: 'small', fuze: 'delay' }, tab: 'estimate' },
  { title: 'Change the approach', text: 'Fragments lean the way the bomb travels. Turn the dial so it flies west, away from the school.', plan: { heading: 270 }, open: 'approach' },
  { title: 'Change the hour', text: 'Scrub the timeline. The school fills in the morning and empties at night; homes do the opposite. The line shows what each hour would cost.', plan: { hour: 2 } },
  { title: 'Who signs off', text: 'The spread is boiled down to one cautious figure. The higher it is, or if a protected site is inside the circle, the more senior the approval.', open: 'rules' },
  { title: 'Let Jev search', text: 'Jev tries every weapon, fuze, direction, aim point and hour in parallel, and keeps the plan that meets the requirement with the least harm. Throttle it; change things while it runs.', tab: 'jev' },
];

const loadDiscovered = () => {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(DISCOVERED_KEY) ?? '[]'));
  } catch {
    return new Set<string>();
  }
};

const planFor = (world: ReturnType<typeof buildCity>, target: TargetId): Plan => {
  const t = targetOf(world, target);
  const a = targetCentre(t);
  return { target, weapon: 'large', fuze: 'instant', heading: 90, aimX: a.x, aimY: a.y, hour: 10, day: 'weekday', watched: 6, hardness: t.hardness, stored: t.stored };
};

export default function App() {
  const world = useMemo(() => buildCity(SEED), []);
  const [plan, setPlanState] = useState<Plan>(() => planFor(world, 'warehouse'));
  const target = targetOf(world, plan.target);
  const [obs, setObs] = useState<Observations>({});
  const [lawful, setLawful] = useState(true);
  const [rulesId, setRulesId] = useState('iraq2003');
  const [runs, setRuns] = useState(400);
  const [layers, setLayers] = useState<Layers>({ people: true, circle: false, pattern: false, impacts: false, labels: true, protect: true, danger: true });
  const [est, setEst] = useState<Estimate | null>(null);
  const [field, setField] = useState<DangerField | null>(null);
  const [computing, setComputing] = useState(false);
  const [estSeed, setEstSeed] = useState(1);
  const [profile, setProfile] = useState<{ mean: number; p90: number }[] | null>(null);
  const [matrix, setMatrix] = useState<MatrixCell[]>([]);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [striking, setStriking] = useState(false);
  const [countMode, setCountMode] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [pop, setPop] = useState<{ bid: number; x: number; y: number; n: number } | null>(null);
  const [guide, setGuide] = useState<number | null>(null);
  const [aimDrag, setAimDrag] = useState(false);
  const [dayPlay, setDayPlay] = useState(false);
  const [explored, setExplored] = useState(0);
  const [toast, setToast] = useState<Place | null>(null);
  const [view, setView] = useState<'map' | 'model'>('map');
  const [modelReady, setModelReady] = useState(false);
  const [open, setOpen] = useState<Set<StepId>>(new Set(['target', 'weapon', 'approach']));
  const [tab, setTab] = useState<'estimate' | 'jev'>('estimate');
  const [mobileTab, setMobileTab] = useState<'plan' | 'estimate' | 'jev'>('estimate');
  const [weaponData, setWeaponData] = useState(false);
  const [about, setAbout] = useState(false);

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
  const toggleStep = (s: StepId) => setOpen((o) => new Set(o.has(s) ? [...o].filter((x) => x !== s) : [...o, s]));

  const popNow = useMemo(() => population(world, plan.hour, plan.day, plan.watched, obs), [world, plan.hour, plan.day, plan.watched, obs]);
  const circle = useMemo(() => inCircle(world, plan, popNow), [world, plan, popNow]);

  // Every change reruns the estimate and the danger field.
  useEffect(() => {
    setComputing(true);
    const id = window.setTimeout(() => {
      setEst(estimate(world, plan, popNow, runs, estSeed));
      setField(dangerField(world, plan, 40, 3, estSeed));
      setComputing(false);
    }, 90);
    return () => clearTimeout(id);
  }, [world, plan, popNow, runs, estSeed]);

  // The day and the options, from a worker so dragging stays smooth.
  const sideWorker = useRef<Worker | null>(null);
  const jobs = useRef({ hours: 0, matrix: 0 });
  useEffect(() => {
    let w: Worker | null = null;
    try {
      w = new Worker(new URL('../jev/worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<JobOut>) => {
        if (e.data.job === jobs.current.hours) setProfile(e.data.out.map((s) => ({ mean: s.mean, p90: s.p90 })));
        if (e.data.job === jobs.current.matrix)
          setMatrix(e.data.out.map((s) => ({ weapon: s.c.weapon, fuze: s.c.fuze, label: [weapon(s.c.weapon).short, fuze(s.c.fuze).name], p90: s.p90, pk: s.pk })));
      };
    } catch {
      w = null;
    }
    sideWorker.current = w;
    return () => w?.terminate();
  }, []);
  useEffect(() => {
    const id = window.setTimeout(() => {
      const cands: Candidate[] = Array.from({ length: 24 }, (_, h) => ({ weapon: plan.weapon, fuze: plan.fuze, heading: plan.heading, aim: 'custom', hour: h + 0.5 }));
      jobs.current.hours = Date.now();
      const msg: Job = { job: jobs.current.hours, seed: SEED, base: plan, obs, runs: 150, cands };
      sideWorker.current?.postMessage(msg);
    }, 250);
    return () => clearTimeout(id);
  }, [plan.target, plan.weapon, plan.fuze, plan.heading, plan.aimX, plan.aimY, plan.day, plan.watched, plan.hardness, plan.stored, obs]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const id = window.setTimeout(() => {
      const cands: Candidate[] = WEAPONS.flatMap((w) => FUZES.map((f) => ({ weapon: w.id, fuze: f.id, heading: plan.heading, aim: 'custom' as const, hour: plan.hour })));
      jobs.current.matrix = Date.now() + 1;
      const msg: Job = { job: jobs.current.matrix, seed: SEED, base: plan, obs, runs: 150, cands };
      sideWorker.current?.postMessage(msg);
    }, 350);
    return () => clearTimeout(id);
  }, [plan.target, plan.heading, plan.aimX, plan.aimY, plan.hour, plan.day, plan.watched, plan.hardness, plan.stored, obs]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dayPlay) return;
    const id = window.setInterval(() => setPlanState((p) => ({ ...p, hour: (Math.round(p.hour * 2) / 2 + 0.5) % 24 })), 500);
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
    if (SPEEDS[speed] <= 8) for (const s of fresh.slice(-4)) pushLog(`${describe(s.c)} → ${s.p90}, target ${pct(s.pk)}`, 'try');
    const b = best(results, minPk);
    if (b && (!bestRef.current || key(b.c) !== key(bestRef.current.c))) {
      pushLog(`New best: ${describe(b.c)} → planning figure ${b.p90}, target destroyed ${pct(b.pk)}`, 'best');
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
    if (results.length) pushLog(`Requirement now ${pct(minPk)}. ${b ? `Best: ${describe(b.c)} → ${b.p90}` : 'Nothing tried so far meets it.'}`, 'step');
  }, [minPk]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (phase === 'search' && !status.running && status.done >= status.total && status.total > 0) {
      setPhase('done');
      const b = best(results, minPk);
      if (b) pushLog(`Done: ${status.done} plans. Best: ${describe(b.c)} → planning figure ${b.p90}. Sign-off: ${approver(b.p90, rules, circle.protectedSites.length > 0).who}.`, 'best');
      else pushLog(`Done: ${status.done} plans. None destroys the target ${pct(minPk)} of the time.`, 'best');
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
    setTab('jev');
    setMobileTab('jev');
    pool.throttle = SPEEDS[speed];
    const sp = space();
    const n = sp.weapons.length * 3 * 8 * 5 * sp.hours.length;
    const big = weapon(sp.weapons.includes('large') ? 'large' : sp.weapons[0]);
    const c = inCircle(world, { ...plan, weapon: big.id, fuze: 'instant' }, popNow);
    const steps = [
      () => pushLog(`Target: ${target.name}. ${lawful ? 'Marked a lawful military objective by people; Jev takes that as given.' : 'Not confirmed as a lawful target: stop.'}`, lawful ? 'step' : 'best'),
      () => lawful && pushLog(`Circle for the ${big.short}: ${c.radius} m, ${c.buildings} buildings.${c.protectedSites.length ? ` Protected: ${c.protectedSites.join(', ')}.` : ''}${c.hazards.length ? ` Hazards: ${c.hazards.join(', ')}.` : ''}`, 'step'),
      () => lawful && pushLog(`Sweeping ${n.toLocaleString()} plans on ${pool.workers} workers, ${pool.runs} runs each.`, 'step'),
      () => {
        if (!lawful) return setPhase('idle');
        setPhase('search');
        pool.start(plan, obs, sp, SEED);
      },
    ];
    const gap = SPEEDS[speed] === Infinity ? 120 : Math.max(180, 1000 / Math.sqrt(SPEEDS[speed]));
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
    pushLog(onlySpace ? 'Search space changed: keeping what still fits.' : 'Assumptions changed: re-scoring from scratch.', 'step');
    bestRef.current = undefined;
    pool.start(plan, obs, space(), SEED, onlySpace);
  }, [assumptions]); // eslint-disable-line react-hooks/exhaustive-deps

  const candidateAim = (c: Candidate) => (c.aim === 'custom' ? { x: plan.aimX, y: plan.aimY } : aimPoint(target, c.aim));
  const applyCandidate = (c: Candidate) => {
    const a = candidateAim(c);
    setPlan({ weapon: c.weapon, fuze: c.fuze, heading: c.heading, hour: c.hour, aimX: a.x, aimY: a.y });
    pushLog(`Applied: ${describe(c)}.`, 'step');
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
    field: following ? null : field,
    layers,
    circleR: inCircle(world, shownPlan, popShown).radius,
    ghost: following ? null : ghostPlan,
    spotMode: countMode,
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
        window.setTimeout(() => setToast((t) => (t === p ? null : t)), 3000);
      }
      try {
        localStorage.setItem(DISCOVERED_KEY, JSON.stringify([...map.discovered]));
      } catch {
        /* exploring just won't be remembered */
      }
    };
    mapRef.current = map;
    map.resize();
    const c = targetCentre(targetOf(world, 'warehouse'));
    map.view = canvas.clientWidth < 600 ? { cx: c.x + 20, cy: c.y + 10, zoom: 4.5 } : { cx: c.x + 20, cy: c.y + 5, zoom: 3 };
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
        const k = 1 - Math.pow(0.001, dt); // frame-rate independent easing
        v.cx += (f.cx - v.cx) * k;
        v.cy += (f.cy - v.cy) * k;
        v.zoom += (f.zoom - v.zoom) * k;
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
    if (countMode) return openPeople(w.x, w.y, p.x, p.y);
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

  // ------------------------------------------------------------ targets, guide, strike

  const chooseTarget = (id: TargetId) => {
    const t = targetOf(world, id);
    const a = targetCentre(t);
    resetCity();
    setPop(null);
    setObs({});
    setPlan({ target: id, aimX: a.x, aimY: a.y, hardness: t.hardness, stored: t.stored });
    focusRef.current = { cx: a.x + 20, cy: a.y + 10, zoom: 3.2 };
    poolRef.current?.stop();
    setResults([]);
    setPhase('idle');
    setLog([]);
    setTesting(null);
  };
  const goGuide = (i: number | null) => {
    setGuide(i);
    if (i == null) return;
    const g = GUIDE[i];
    if (g.plan) {
      const tgt = g.plan.target ?? plan.target;
      const t = targetOf(world, tgt);
      const a = targetCentre(t);
      setPlan(g.plan.target ? { ...g.plan, aimX: a.x, aimY: a.y, hardness: t.hardness, stored: t.stored } : g.plan);
    }
    if (g.layers) setLayers((l) => ({ ...l, ...g.layers }));
    if (g.focus) focusRef.current = g.focus;
    if (g.open) setOpen((o) => new Set([...o, g.open!]));
    if (g.tab) {
      setTab(g.tab);
      setMobileTab(g.tab);
    }
    setPop(null);
    setOutcome(null);
  };
  const flyTo = (x: number, y: number, zoom = 4) => (focusRef.current = { cx: x, cy: y, zoom });
  const pickPlace = (kind: 'b' | 's', id: number) => {
    if (kind === 'b') {
      const b = world.buildings[id];
      flyTo(b.cx, b.cy, 5);
      window.setTimeout(() => {
        const m = mapRef.current;
        if (!m) return;
        const p = m.toScreen(b.cx, b.cy);
        setPop({ bid: b.id, x: p.x, y: p.y, n: obs[b.id] ?? shownCount(popNow, b) });
      }, 900);
    } else {
      const s = world.spaces[id];
      flyTo(s.rect.x + s.rect.w / 2, s.rect.y + s.rect.h / 2, 5);
    }
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
    focusRef.current = { cx: plan.aimX, cy: plan.aimY + 10, zoom: Math.max(3.2, m.view.zoom) };
    m.onImpact = (o) => setOutcome(o);
    m.onSettled = () => setStriking(false);
    const o = m.strike(plan, popNow, Math.floor(Math.random() * 1e9));
    strikeRef.current = { plan, outcome: o };
  };
  function resetCity() {
    mapRef.current?.clearStrike();
    strikeRef.current = null;
    setOutcome(null);
    setStriking(false);
  }
  const holdForHour = () => {
    if (!profile) return;
    let h = 0;
    profile.forEach((v, i) => {
      if (v.p90 < profile[h].p90 || (v.p90 === profile[h].p90 && v.mean < profile[h].mean)) h = i;
    });
    setPlan({ hour: h + 0.5 });
  };

  // ------------------------------------------------------------ derived

  const approval = approver(est?.p90 ?? 0, rules, circle.protectedSites.length > 0);
  const w = weapon(plan.weapon);
  const popB = pop ? world.buildings[pop.bid] : null;
  const matrixHere = matrix.find((c) => c.weapon === plan.weapon && c.fuze === plan.fuze);
  const weaponWarn = !!(est && est.pk < minPk);

  const planDock = (
    <div className="dock-scroll">
      <Step n={1} title="Target" summary={`${target.name}${lawful ? '' : ' · not confirmed lawful'}`} status={lawful ? 'ok' : 'stop'} open={open.has('target')} onToggle={() => toggleStep('target')}>
        <p className="brief">{target.note}</p>
        <div className="flags">
          {circle.protectedSites.map((s) => (
            <span key={s} className="flag protect">
              Protected · {s}
            </span>
          ))}
          {circle.hazards.map((s) => (
            <span key={s} className="flag hazard">
              Hazard · {s}
            </span>
          ))}
          {circle.openSpaces.slice(0, 3).map((s) => (
            <span key={s} className="flag open">
              Open ground · {s}
            </span>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={lawful} onChange={(e) => setLawful(e.target.checked)} />
          <span>
            Confirmed lawful military objective
            <small>A legal judgment by people. Untick it and nothing else matters.</small>
          </span>
        </label>
        {target.buildingId != null && (
          <label className="check">
            <input type="checkbox" checked={plan.stored} onChange={(e) => setPlan({ stored: e.target.checked })} />
            <span>
              Weapons stored inside
              <small>If it's destroyed, what's inside may go off too.</small>
            </span>
          </label>
        )}
      </Step>

      <Step n={2} title="Weapon and fuze" summary={`${w.short} · ${fuze(plan.fuze).name}${weaponWarn ? ` · destroys it ${pct(est!.pk)}` : ''}`} status={weaponWarn ? 'warn' : 'ok'} open={open.has('weapon')} onToggle={() => toggleStep('weapon')}>
        <div className="options">
          {WEAPONS.map((wp) => (
            <button key={wp.id} className={plan.weapon === wp.id ? 'on' : ''} onClick={() => setPlan({ weapon: wp.id })}>
              <b>{wp.name}</b>
              <span>
                blast {wp.blast} m · fragments {wp.frag} m · ±{wp.cep} m
              </span>
            </button>
          ))}
        </div>
        <Seg value={plan.fuze} onChange={(f) => setPlan({ fuze: f })} options={FUZES.map((f) => [f.id, f.name] as [typeof f.id, string])} />
        <p className="hint">{fuze(plan.fuze).note}</p>
        <button className="link" onClick={() => setWeaponData(true)}>
          Weapon data table
        </button>
      </Step>

      <Step n={3} title="Approach and aim" summary={`From the ${compassName(plan.heading + 180)}, heading ${compassName(plan.heading)}`} status="ok" open={open.has('approach')} onToggle={() => toggleStep('approach')}>
        <div className="dir">
          <Dial value={plan.heading} onChange={(heading) => setPlan({ heading })} />
          <div>
            <p className="hint">Fragments lean the way the bomb travels. Aim it so they fly away from people.</p>
            <p className="hint">Drag the crosshair on the target to move the aim point.</p>
            <button
              className="link"
              onClick={() => {
                const c = targetCentre(target);
                setPlan({ aimX: c.x, aimY: c.y });
              }}
            >
              Re-centre the aim
            </button>
          </div>
        </div>
      </Step>

      <Step n={4} title="Intelligence" summary={`${plan.watched} h watched · ${Object.keys(obs).length} building${Object.keys(obs).length === 1 ? '' : 's'} counted`} open={open.has('intel')} onToggle={() => toggleStep('intel')}>
        <div className="slider">
          <span>
            Hours of watching <em>{plan.watched} h</em>
          </span>
          <input type="range" min={0} max={72} step={2} value={plan.watched} onChange={(e) => setPlan({ watched: +e.target.value })} />
        </div>
        <p className="hint">More watching narrows Jev's guess of how many people are in each building.</p>
        <div className="row">
          <button className={`chip ${countMode ? 'on' : ''}`} onClick={() => setCountMode(!countMode)} aria-pressed={countMode}>
            {countMode ? 'Done counting' : 'Count people in a building'}
          </button>
          {Object.keys(obs).length > 0 && (
            <button className="link" onClick={() => setObs({})}>
              Forget counts
            </button>
          )}
        </div>
        <p className="hint">Or just click any building on the map to compare what overhead images, phones and the census say.</p>
      </Step>

      <Step n={5} title="Rules and sign-off" summary={`${approval.who} · ${rules.name}`} status={approval.level >= 3 ? 'warn' : 'ok'} open={open.has('rules')} onToggle={() => toggleStep('rules')}>
        <Seg value={rulesId} onChange={setRulesId} options={RULES.map((r) => [r.id, r.name] as [string, string])} />
        <p className="hint">
          Senior sign-off at {rules.senior} or more: {rules.source}.
        </p>
        <Seg small value={runs} onChange={setRuns} options={[[100, '100 runs'], [400, '400 runs'], [1000, '1,000 runs']]} />
        <button className="link" onClick={() => setEstSeed(estSeed + 1)}>
          Roll new dice for the estimate
        </button>
      </Step>

      <Step n={6} title="Decide" summary={lawful ? 'Release, hold, or call it off' : 'No lawful target, no strike'} status={lawful ? undefined : 'stop'} open={open.has('decide') || true} onToggle={() => toggleStep('decide')}>
        <div className="decide">
          <button className="btn primary" onClick={release} disabled={!lawful || striking}>
            Release
          </button>
          <button className="btn" onClick={holdForHour} disabled={!profile || striking}>
            Hold for the best hour
          </button>
          <button className="btn" onClick={resetCity} disabled={striking}>
            Call it off
          </button>
        </div>
        <p className="hint">Whether the harm is excessive against the military advantage is a human judgment. The model can't make it.</p>
      </Step>
    </div>
  );

  const estimateDock = est ? (
    <div className="dock-scroll">
      <section className="card">
        <StatTiles est={est} />
        <div className="approval">
          <div className="approval-head">
            <span className="k">Who must approve</span>
            <b>{approval.who}</b>
          </div>
          <ApprovalLadder a={approval} />
          <p className="hint">{approval.note}</p>
        </div>
      </section>
      <section className="card">
        <h3>How bad could it be?</h3>
        <p className="sub">{est.runs} runs, each with a different landing point and a different count of people.</p>
        <Distribution est={est} rules={rules} />
      </section>
      <section className="card">
        <h3>Where the harm comes from</h3>
        <p className="sub">Expected people killed or badly hurt. Click a place to see it.</p>
        <Breakdown world={world} est={est} onPick={pickPlace} />
        {est.secondary > 0.01 && <p className="hint warn">Something else went off in {pct(est.secondary)} of runs: stored weapons or fuel.</p>}
      </section>
      <section className="card">
        <h3>Every weapon, every fuze</h3>
        <p className="sub">
          Planning figure at {fmtHour(plan.hour)}, heading {compassName(plan.heading)}, from a quick 150-run check. Below each number: how often the target is destroyed; ✕ misses the {pct(minPk)} requirement. Click a cell to use it.
        </p>
        {matrix.length ? (
          <OptionsMatrix
            cells={matrix}
            weapons={WEAPONS.map((x) => [x.id, x.short])}
            fuzes={FUZES.map((f) => [f.id, f.name])}
            current={[plan.weapon, plan.fuze]}
            minPk={minPk}
            onPick={(wid, fid) => setPlan({ weapon: wid as WeaponId, fuze: fid as typeof plan.fuze })}
          />
        ) : (
          <p className="hint">Working…</p>
        )}
        {matrixHere && <p className="hint">Current plan outlined.</p>}
      </section>
      <p className="about-line">
        Illustrative model, invented numbers.{' '}
        <button className="link" onClick={() => setAbout(true)}>
          About
        </button>
      </p>
    </div>
  ) : (
    <div className="dock-scroll">
      <p className="hint">Running the estimate…</p>
    </div>
  );

  const jevDock = (
    <div className="dock-scroll">
      <section className="card">
        <div className="jev-head">
          <div>
            <h3>
              Jev <span className={`status ${phase}`}>{phase === 'idle' ? 'idle' : phase === 'checklist' ? 'checking' : phase === 'search' ? (status.running ? 'searching' : 'paused') : 'done'}</span>
            </h3>
            <p className="sub">The engine: typed, seeded, pure. Here it sweeps every weapon, fuze, direction, aim point and hour for {target.short}.</p>
          </div>
        </div>
        <div className="row">
          <button className="btn primary" onClick={runJev}>
            {phase === 'idle' ? 'Run Jev' : 'Start over'}
          </button>
          {phase === 'search' && (
            <button className="btn" onClick={() => (status.running ? poolRef.current?.pause() : poolRef.current?.resume())}>
              {status.running ? 'Pause' : 'Resume'}
            </button>
          )}
          {phase === 'search' && !status.running && (
            <button className="btn" onClick={() => poolRef.current?.step()}>
              Step
            </button>
          )}
        </div>
        <div className="progress">
          <div style={{ width: `${status.total ? (100 * status.done) / status.total : 0}%` }} />
        </div>
        <p className="hint mono">
          {status.done.toLocaleString()} / {status.total.toLocaleString()} plans · {status.rate.toFixed(0)}/s · {status.busy}/{status.workers} workers busy
        </p>
      </section>
      <section className="card">
        <h3>Trade-offs</h3>
        <p className="sub">Each dot is a plan. Up is more likely to destroy the target; right is more people hurt. Hover to preview it on the map.</p>
        <Frontier results={results} best={bestNow} minPk={minPk} onPeek={setPeek} onPick={(s) => applyCandidate(s.c)} />
        {bestNow && (
          <div className="bestplan">
            <span className="k">Jev's pick</span>
            <b>{describe(bestNow.c)}</b>
            <span>
              Planning figure {bestNow.p90} · expected {bestNow.mean.toFixed(1)} · target destroyed {pct(bestNow.pk)} · {approver(bestNow.p90, rules, circle.protectedSites.length > 0).who}
            </span>
            <button className="btn primary small" onClick={() => applyCandidate(bestNow.c)}>
              Use this plan
            </button>
          </div>
        )}
      </section>
      <section className="card">
        <h3>Controls</h3>
        <div className="slider">
          <span>
            Throttle <em>{SPEEDS[speed] === Infinity ? 'flat out' : `${SPEEDS[speed]} plans/s`}</em>
          </span>
          <input type="range" min={0} max={SPEEDS.length - 1} step={1} value={speed} onChange={(e) => setSpeed(+e.target.value)} />
        </div>
        <div className="slider">
          <span>
            Workers in parallel <em>{status.workers}</em>
          </span>
          <input type="range" min={1} max={Math.max(2, Math.min(8, navigator.hardwareConcurrency || 4))} step={1} value={status.workers || 1} onChange={(e) => poolRef.current?.setWorkers(+e.target.value)} />
        </div>
        <div className="slider">
          <span>
            Must destroy the target <em>{pct(minPk)} of runs</em>
          </span>
          <input type="range" min={0.5} max={0.99} step={0.01} value={minPk} onChange={(e) => setMinPk(+e.target.value)} />
        </div>
        <Seg small value={hours} onChange={setHours} options={[['any', 'Any hour'], ['night', 'Night only'], ['quiet', 'Quiet hours']]} />
        <div className="grid2">
          {WEAPONS.map((wp) => (
            <label key={wp.id} className="check small">
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
        <label className="check small">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
          <span>Show each plan on the map as Jev tries it</span>
        </label>
      </section>
      <section className="card">
        <h3>{phase === 'search' ? 'Now testing' : 'Log'}</h3>
        {testing && (
          <div className="flip" key={key(testing)}>
            <Chip k="Weapon" v={weapon(testing.weapon).short} />
            <Chip k="Fuze" v={fuze(testing.fuze).name} />
            <Chip k="Heading" v={HEADING_NAMES[testing.heading]} />
            <Chip k="Aim" v={testing.aim} />
            <Chip k="Hour" v={fmtHour(testing.hour)} />
          </div>
        )}
        <div className="log" ref={logRef}>
          {log.length ? (
            log.map((l, i) => (
              <div key={i} className={l.kind}>
                {l.t}
              </div>
            ))
          ) : (
            <div className="info">Press Run Jev.</div>
          )}
        </div>
      </section>
    </div>
  );

  return (
    <div className={`app m-${mobileTab}`}>
      <header className="top">
        <div className="brand">
          <b>Collateral Damage</b>
          <span>Jev engine</span>
        </div>
        <nav className="targets" aria-label="Targets">
          {world.targets.map((t) => (
            <button key={t.id} className={plan.target === t.id ? 'on' : ''} onClick={() => chooseTarget(t.id)} title={t.note}>
              {t.short}
            </button>
          ))}
        </nav>
        <div className="top-right">
          <span className="explored" title="Places found by exploring the map">
            Explored {explored}/{world.places.length}
          </span>
          <button className="btn small" onClick={() => goGuide(guide == null ? 0 : null)}>
            {guide == null ? 'Guide' : 'End guide'}
          </button>
          <Seg small value={view} onChange={setView} options={[['map', 'Map'], ['model', '3D']]} />
        </div>
      </header>

      <main className="main">
        <aside className="dock left" aria-label="Plan">
          <div className="dock-title">Plan</div>
          {planDock}
        </aside>

        <section className="stage">
          <div className="map">
            <canvas
              ref={canvasRef}
              className={`canvas ${countMode ? 'count' : ''} ${hover != null && hover === target.buildingId && !countMode ? 'aim' : ''}`}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onPointerLeave={() => setHover(null)}
              aria-label="The city, seen from above"
            />
            <canvas ref={canvas3dRef} className={`canvas3d ${view === 'model' ? 'on' : ''}`} aria-label="The city as a tilted model" />
            <div ref={labels3dRef} className={`labels3d ${view === 'model' ? 'on' : ''}`} />
            {view === 'model' && !modelReady && <div className="loading">Building the model…</div>}

            <div className="hud-time">
              <b>{partOfDay(shownPlan.hour)}</b>
              <span>
                {plan.day === 'friday' ? 'Friday' : 'Weekday'} {fmtHour(shownPlan.hour)}
              </span>
              {following && <em>Jev testing</em>}
            </div>

            <div className="hud-layers" role="group" aria-label="Map layers">
              {(
                [
                  ['danger', 'Danger'],
                  ['people', 'People'],
                  ['pattern', 'Fragments'],
                  ['circle', 'Circle'],
                  ['impacts', 'Landings'],
                  ['protect', 'Protected'],
                  ['labels', 'Labels'],
                ] as [keyof Layers, string][]
              ).map(([k, name]) => (
                <button key={k} className={layers[k] ? 'on' : ''} onClick={() => setLayers({ ...layers, [k]: !layers[k] })} aria-pressed={layers[k]}>
                  {name}
                </button>
              ))}
            </div>

            {layers.danger && view === 'map' && !outcome && (
              <div className="hud-legend">
                <span>Chance someone in the open is killed or badly hurt</span>
                <div className="ramp">
                  <i />
                </div>
                <div className="ramp-ticks">
                  <span>0</span>
                  <span>1 in 10</span>
                  <span>1 in 2</span>
                  <span>certain</span>
                </div>
              </div>
            )}

            <div className="hud-zoom">
              {view === 'model' ? (
                <>
                  <button onClick={() => modelRef.current?.preset('drone')}>Drone</button>
                  <button onClick={() => modelRef.current?.preset('street')}>Street</button>
                  <button onClick={() => modelRef.current?.preset('top')}>Top</button>
                </>
              ) : (
                <>
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
                      focusRef.current = { cx: c.x + 20, cy: c.y + 10, zoom: 3.2 };
                    }}
                  >
                    Target
                  </button>
                </>
              )}
            </div>

            {toast && (
              <div className="toast" key={toast.id}>
                <small>Found</small>
                <b>{toast.name}</b>
                {toast.note && <span>{toast.note}</span>}
              </div>
            )}

            {guide != null && (
              <div className="guide">
                <span className="n">
                  {guide + 1}/{GUIDE.length}
                </span>
                <div>
                  <h4>{GUIDE[guide].title}</h4>
                  <p>{GUIDE[guide].text}</p>
                </div>
                <div className="guide-nav">
                  <button onClick={() => goGuide(Math.max(0, guide - 1))} disabled={guide === 0}>
                    Back
                  </button>
                  {guide < GUIDE.length - 1 ? (
                    <button className="primary" onClick={() => goGuide(guide + 1)}>
                      Next
                    </button>
                  ) : (
                    <button className="primary" onClick={() => goGuide(null)}>
                      Done
                    </button>
                  )}
                </div>
              </div>
            )}

            {outcome && (
              <div className="outcome">
                <span className="k">One outcome</span>
                <div className="big">
                  <b>{outcome.count}</b>
                  <span>{outcome.count === 1 ? 'person' : 'people'} killed or badly hurt</span>
                </div>
                {est && (
                  <p>
                    The estimate: half the runs at or below {est.p50}, nine in ten at or below {est.p90}. This roll: {outcome.count}.
                  </p>
                )}
                <p>
                  Target {outcome.destroyed ? 'destroyed' : 'not destroyed'}. Landed {Math.round(Math.hypot(outcome.ix - plan.aimX, outcome.iy - plan.aimY))} m from the aim.
                  {outcome.secondary.length > 0 && ` Also went off: ${outcome.secondary.join(', ')}.`}
                </p>
                <p className="muted">Every red ring is a person in the model.</p>
                <div className="row">
                  <button className="btn primary small" onClick={resetCity} disabled={striking}>
                    Rebuild the city
                  </button>
                  <button className="btn small" onClick={release} disabled={striking}>
                    Roll again
                  </button>
                </div>
              </div>
            )}

            {pop && popB && (
              <div
                className="popcard"
                style={{
                  left: Math.max(10, Math.min(pop.x + 24, (canvasRef.current?.clientWidth ?? 400) - 320)),
                  top: Math.max(56, Math.min(pop.y - 40, (canvasRef.current?.clientHeight ?? 600) - 340)),
                }}
              >
                <div className="pop-head">
                  <div>
                    <b>{placeName(popB)}</b>
                    <span>
                      {MATERIAL_NAME[popB.material]}
                      {popB.floors > 1 ? ` · ${popB.floors} floors` : ''}
                      {popB.protected ? ' · protected' : ''} · {fmtHour(plan.hour)}
                    </span>
                  </div>
                  <button className="x" onClick={() => setPop(null)} aria-label="Close">
                    ×
                  </button>
                </div>
                <span className="k">People inside right now</span>
                <SourceBars s={sources(world, popNow, popB)} onUse={(n) => setPop({ ...pop, n })} />
                {est && est.byBuilding[popB.id] > 0.01 && <p className="hint">Expected to be killed or badly hurt here: {est.byBuilding[popB.id].toFixed(1)}</p>}
                <div className="row">
                  <div className="stepper">
                    <button onClick={() => setPop({ ...pop, n: Math.max(0, pop.n - 1) })}>−</button>
                    <em>{pop.n}</em>
                    <button onClick={() => setPop({ ...pop, n: Math.min(popB.slots.length / 2, pop.n + 1) })}>+</button>
                  </div>
                  <button
                    className="btn primary small"
                    onClick={() => {
                      setObs({ ...obs, [pop.bid]: pop.n });
                      setPop(null);
                    }}
                  >
                    Log count
                  </button>
                  {obs[pop.bid] != null && (
                    <button
                      className="btn small"
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
                </div>
              </div>
            )}

            {weaponData && (
              <div className="modal" onClick={() => setWeaponData(false)}>
                <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                  <h3>Weapon data</h3>
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
                  <p className="hint">Invented, illustrative numbers. Real blast and fragment tables are classified, and reportedly reissued at least twice a year.</p>
                  <button className="btn small" onClick={() => setWeaponData(false)}>
                    Close
                  </button>
                </div>
              </div>
            )}

            {about && (
              <div className="modal" onClick={() => setAbout(false)}>
                <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                  <h3>About this model</h3>
                  <p>
                    An illustrative explainer of collateral damage estimation as it has been publicly described. The city, weapon effects, pattern of life, materials, shielding and approval levels are simplified and invented for teaching; the two approval thresholds are as reported in the press.
                  </p>
                  <p>Real estimates rest on classified data, and the decisions that matter, whether a target is lawful and whether the expected harm is excessive, are made by people.</p>
                  <p>
                    Inspired by an explainer video by{' '}
                    <a href="https://x.com/tobiaschneider" target="_blank" rel="noreferrer">
                      Tobias Schneider
                    </a>
                    .
                  </p>
                  <button className="btn small" onClick={() => setAbout(false)}>
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="timebar">
            <div className="time-controls">
              <Seg small value={plan.day} onChange={(day: Day) => setPlan({ day })} options={[['weekday', 'Weekday'], ['friday', 'Friday']]} />
              <button className="btn small" onClick={() => setDayPlay(!dayPlay)} aria-pressed={dayPlay}>
                {dayPlay ? '❚❚ Pause' : '▶ Play the day'}
              </button>
            </div>
            <Timeline profile={profile} hour={plan.hour} onHour={(h) => setPlan({ hour: h })} day={plan.day === 'friday' ? 'Friday' : 'weekday'} />
          </div>
        </section>

        <aside className="dock right" aria-label="Estimate and Jev">
          <div className="tabs">
            <button className={tab === 'estimate' ? 'on' : ''} onClick={() => setTab('estimate')}>
              Estimate {computing && <i className="spin" />}
            </button>
            <button className={tab === 'jev' ? 'on' : ''} onClick={() => setTab('jev')}>
              Jev {phase === 'search' && status.running && <i className="live" />}
            </button>
          </div>
          {tab === 'estimate' ? estimateDock : jevDock}
        </aside>
      </main>

      <nav className="mobile-tabs" aria-label="Panels">
        {(['plan', 'estimate', 'jev'] as const).map((t) => (
          <button key={t} className={mobileTab === t ? 'on' : ''} onClick={() => setMobileTab(t)}>
            {t === 'plan' ? 'Plan' : t === 'estimate' ? 'Estimate' : 'Jev'}
          </button>
        ))}
      </nav>
      <div className="mobile-panel">{mobileTab === 'plan' ? planDock : mobileTab === 'estimate' ? estimateDock : jevDock}</div>
    </div>
  );
}

const describe = (c: Candidate) => `${weapon(c.weapon).short}, ${fuze(c.fuze).name.toLowerCase()}, heading ${compassName(c.heading)}, aim ${c.aim}, ${fmtHour(c.hour)}`;
