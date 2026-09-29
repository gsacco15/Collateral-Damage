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
  intelKey,
  intelOf,
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
  BRIDGE_RUIN,
  riverX,
  buildingDist,
  type Rect,
  WEAPONS,
  weapon,
  type Candidate,
  type DangerField,
  type Day,
  type Estimate,
  type IntelByHour,
  type JevReply,
  type Job,
  type Observations,
  type Place,
  type Plan,
  type Scored,
  type TargetId,
  type WeaponId,
  type FuzeId,
} from '../jev';
import { JevPool, type PoolStatus } from '../jev/pool';
import type { JobOut } from '../jev/worker';
import { MapView, type Layers, type MapFrame, type Outcome } from '../view/map';
import type { Frame3D, Model3D } from '../view/model3d';
import { JevTheater } from '../view/theater';
import { ApprovalLadder, Breakdown, Distribution, Frontier, OptionsMatrix, pct, StatTiles, Timeline, type MatrixCell } from './charts';
import { JevCard } from './jevCard';
import { placeAt, storyFor, type PlaceStory } from './stories';
import { Origami } from './origami';
import { readIntel } from './jevLive';
import { sound, type Bed } from './sound';
import { Chip, Dial, HoldButton, Seg, SourceBars, Step } from './parts';

const SEED = 7;
type HourWindow = 'any' | 'night' | 'quiet';
const WINDOWS: Record<HourWindow, number[]> = { any: [1, 4, 7, 10, 13, 16, 19, 22], night: [22, 23, 0, 1, 2, 3, 4], quiet: [0, 2, 4, 5, 20, 22] };
const SPEEDS = [0.5, 1, 2, 4, 8, 16, 32, 64, Infinity];
const HEADING_NAMES: Record<number, string> = { 0: '↑ N', 45: '↗ NE', 90: '→ E', 135: '↘ SE', 180: '↓ S', 225: '↙ SW', 270: '← W', 315: '↖ NW' };
const DISCOVERED_KEY = 'cd.discovered';
const INTRO_KEY = 'cd.intro';
type StepId = 'target' | 'weapon' | 'approach' | 'intel' | 'rules' | 'decide';

interface GuideStep {
  title: string;
  text: string;
  plan?: Partial<Plan>;
  layers?: Partial<Layers>;
  focus?: { cx: number; cy: number; zoom: number };
  open?: StepId;
  tab?: 'estimate' | 'jev';
  pulse?: boolean; // make the reach ring breathe
  drawer?: 'day' | 'jev';
  glow?: 'jev-card'; // softly outline this card so it's clear what the step means
  demo?: boolean; // replay a recorded search instead of running Jev live
  play?: boolean; // play through the day while on this step
}

const GUIDE: GuideStep[] = [
  { title: 'The briefing', text: 'Warehouse 14 is said to hold weapons. Across Cotton Street is a school; round the corner, a fuel depot. Whether the warehouse may be struck at all is a legal judgment made by people. Everything after that is about the harm to everyone else.', plan: { target: 'warehouse', hour: 10, day: 'weekday', weapon: 'large', fuze: 'instant', heading: 90 }, layers: { danger: false, pattern: false, circle: false }, focus: { cx: 240, cy: 505, zoom: 4.5 }, open: 'target' },
  { title: "What's within reach?", text: "The ring is everything this bomb could hurt. Inside it: the school, the fuel depot, homes and shops. Protected places are outlined in blue, things that can burn in amber. Planners start by asking what's in here.", layers: { circle: true, protect: true }, focus: { cx: 240, cy: 520, zoom: 2.8 }, pulse: true },
  { title: "Who's inside right now?", text: "Nobody knows exactly who is inside. Overhead images only see people outdoors, not everyone carries a phone, and the census is years old. So the number is always a careful guess, and behind every guess are real people: at home, at work, asleep. Jev's reading of the reports is the first card on the right.", layers: { circle: false }, focus: { cx: 250, cy: 500, zoom: 4 }, open: 'intel', tab: 'estimate', glow: 'jev-card' },
  { title: 'Where it would hurt', text: 'The red wash is the chance that someone standing in the open would be killed or badly hurt, over hundreds of replays of the strike. Buildings cast shadows in it: walls stop fragments.', layers: { danger: true }, focus: { cx: 240, cy: 505, zoom: 3.6 }, open: 'weapon' },
  { title: 'A smaller bomb', text: 'A smaller warhead with a delay fuze goes off inside, a floor down, and the walls catch most fragments. Watch the red shrink and the numbers fall. Go too small and the target survives.', plan: { weapon: 'small', fuze: 'delay' }, tab: 'estimate' },
  { title: 'Change the direction', text: 'Fragments lean the way the bomb travels. Drag the paper plane round, or turn the dial, so they fly west, away from the school.', plan: { heading: 270 }, open: 'approach' },
  { drawer: 'day', title: 'Change the hour', text: "Watch the day go by. The school fills in the morning and empties at night; homes do the opposite. The line below the map shows what each hour would cost. Drag it to stop on any hour.", plan: { hour: 2 }, play: true },
  { title: 'Who signs off', text: 'Hundreds of replays are boiled down to one cautious number: nine in ten come in at or below it. The higher it is, or if a protected place is within reach, the more senior the person who must approve.', open: 'rules' },
  { title: 'Let Jev search', text: 'Jev is there to keep collateral damage as low as it can be. It tries every way to do it: every weapon, fuze, direction, aim point and hour, 3,840 plans, each replayed 120 times, in parallel, so it sees the whole range of possible outcomes. It keeps the plan that still destroys the target and hurts the fewest people. Click any dot to try that plan.', tab: 'jev', demo: true },
  { title: 'Your decision', text: "Authorise strike opens the final decision: the numbers, who signs, the protected places in reach. Hold the red button to release. Afterwards the ruins stay. Pick another building and plan again, or rebuild the city.", open: 'decide' },
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
  return { target, weapon: 'medium', fuze: 'instant', heading: 90, aimX: a.x, aimY: a.y, hour: 10, day: 'weekday', watched: 6, hardness: t.hardness, stored: t.stored };
};

export default function App() {
  const world = useMemo(() => buildCity(SEED), []);
  const [plan, setPlanState] = useState<Plan>(() => planFor(world, 'warehouse'));
  const target = targetOf(world, plan.target);
  const [obs, setObs] = useState<Observations>({});
  const [lawful, setLawful] = useState(true);
  const [rulesId, setRulesId] = useState('iraq2003');
  const [runs, setRuns] = useState(400);
  const [layers, setLayers] = useState<Layers>({ people: true, circle: true, pattern: true, impacts: true, labels: true, protect: true, danger: true });
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
  const [intro, setIntro] = useState(() => {
    try {
      return !localStorage.getItem(INTRO_KEY) && !location.hash;
    } catch {
      return true;
    }
  });
  const closeIntro = (step: boolean) => {
    setIntro(false);
    try {
      localStorage.setItem(INTRO_KEY, '1');
    } catch {
      /* fine: it just shows again next time */
    }
    if (step) goGuide(0);
  };
  const [aimDrag, setAimDrag] = useState(false);
  const [dayPlay, setDayPlay] = useState(false);
  // Explore: click a building to see who's inside. Target: click or drag the target onto any building.
  const [mapMode, setMapMode] = useState<'explore' | 'target'>('explore');
  const [strikeOpen, setStrikeOpen] = useState(false);
  const [place, setPlace] = useState<{ story: PlaceStory; x: number; y: number } | null>(null);
  const [retarget, setRetarget] = useState<{ x: number; y: number; bid: number | null } | null>(null);
  const [explored, setExplored] = useState(0);
  const [toast, setToast] = useState<Place | null>(null);
  const [view, setView] = useState<'map' | 'model'>('map');
  useEffect(() => setPlace(null), [mapMode, view]); // eslint-disable-line react-hooks/exhaustive-deps
  const [modelReady, setModelReady] = useState(false);
  const [open, setOpen] = useState<Set<StepId>>(new Set(['target', 'weapon', 'approach']));
  const [tab, setTab] = useState<'estimate' | 'jev'>('estimate');
  const [mobileTab, setMobileTab] = useState<'plan' | 'estimate' | 'jev'>('estimate');
  const [weaponData, setWeaponData] = useState(false);
  const [about, setAbout] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [headingDrag, setHeadingDrag] = useState(false);
  const [panels, setPanelsState] = useState<Panels>(loadPanels);
  const setPanels = (f: (p: Panels) => Panels) =>
    setPanelsState((p) => {
      const n = f(p);
      try {
        localStorage.setItem(PANELS_KEY, JSON.stringify(n));
      } catch {
        /* private window: fine, just not remembered */
      }
      return n;
    });
  const [drawerTab, setDrawerTab] = useState<'day' | 'jev'>('day');
  const [layersOpen, setLayersOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(sound.enabled);
  const [mix, setMixState] = useState(sound.mix);
  const [mixOpen, setMixOpen] = useState(false);
  useEffect(
    () =>
      sound.onChange((on) => {
        setSoundOn(on);
        setMixState(sound.mix);
      }),
    [],
  );
  // Browsers only start audio after a tap: if sound was left on, wake it on the first ones.
  // iOS only counts a finished tap (touchend / click), so keep listening until audio is actually running.
  useEffect(() => {
    const events = ['pointerdown', 'touchend', 'click', 'keydown'] as const;
    const off = () => events.forEach((e) => window.removeEventListener(e, wake));
    const wake = () => {
      if (sound.wake()) off();
    };
    events.forEach((e) => window.addEventListener(e, wake));
    return off;
  }, []);
  // Quiet paper clicks for every button.
  useEffect(() => {
    const click = (e: MouseEvent) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b || !sound.enabled) return;
      sound.play(b.closest('.panel-toggles, .layers-pop, .seg, .drawer-tabs, .tabs') ? 'ui-toggle' : 'ui-click');
    };
    window.addEventListener('click', click, true);
    return () => window.removeEventListener('click', click, true);
  }, []);
  const [placesOpen, setPlacesOpen] = useState(false);
  const [simulated, setSimulated] = useState(0);

  // Jev's search.
  const [status, setStatus] = useState<PoolStatus>({ running: false, done: 0, total: 0, busy: 0, workers: 0, rate: 0 });
  const [results, setResults] = useState<Scored[]>([]);
  const [testing, setTesting] = useState<Candidate | null>(null);
  const [follow, setFollow] = useState(true);
  const [speed, setSpeed] = useState(SPEEDS.length - 1); // flat out: about 30–60 seconds for a full search
  const [minPk, setMinPk] = useState(0.85);
  const [hours, setHours] = useState<HourWindow>('any');
  const [allowed, setAllowed] = useState<WeaponId[]>(WEAPONS.map((w) => w.id));
  const [log, setLog] = useState<{ t: string; kind: 'info' | 'best' | 'try' | 'step' }[]>([]);
  const [phase, setPhase] = useState<'idle' | 'checklist' | 'search' | 'done'>('idle');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
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
  const strikeRef = useRef<{ plan: Plan; outcome: Outcome; before: number[] } | null>(null);
  const theaterCanvas = useRef<HTMLCanvasElement>(null);
  const theaterRef = useRef<JevTheater | null>(null);
  const trailRef = useRef<Plan[]>([]);
  const tipRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);

  const rules = RULES.find((r) => r.id === rulesId)!;
  const setPlan = useCallback((p: Partial<Plan>) => {
    setPlanState((old) => ({ ...old, ...p }));
    setOutcome(null);
  }, []);
  const toggleStep = (s: StepId) => setOpen((o) => new Set(o.has(s) ? [...o].filter((x) => x !== s) : [...o, s]));

  // Buildings destroyed by earlier strikes stay destroyed, and empty, until the city is rebuilt.
  const [ruins, setRuins] = useState<number[]>([]);
  const ruinsRef = useRef(ruins);
  ruinsRef.current = ruins;

  // Jev reads the intelligence for this target and hour; the simulator then samples from its answer.
  const [intel, setIntel] = useState<IntelByHour>({});
  const [reading, setReading] = useState<JevReply | null>(null);
  const intelRef = useRef(intel);
  intelRef.current = intel;
  const scopeKey = intelKey(plan.target, plan.hour, plan.day, plan.watched);
  const scope = `${scopeKey.target}|${scopeKey.day}|${scopeKey.watched}`;
  const scopeRef = useRef(scope);
  useEffect(() => {
    if (scopeRef.current === scope) return;
    scopeRef.current = scope;
    setIntel({});
  }, [scope]);
  useEffect(() => {
    if (dayPlay) return; // while the day plays, keep the last reading; read again once it stops
    let alive = true;
    const k = scopeKey;
    setReading((r) => (r && r.ok && r.key.target === k.target && r.key.hour === k.hour && r.key.day === k.day && r.key.watched === k.watched ? r : null));
    const id = window.setTimeout(() => {
      readIntel(k).then((r) => {
        if (!alive) return;
        setReading(r);
        if (r.ok) setIntel((m) => ({ ...m, [r.key.hour]: intelOf(r) }));
      });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [scope, scopeKey.hour, dayPlay]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Jev's readings for a set of hours, fetched together; whatever doesn't come back is left to the built-in guess. */
  const readHours = async (hs: number[]) => {
    const got = await Promise.all([...new Set(hs.map((h) => Math.floor(h) % 24))].map((h) => readIntel(intelKey(plan.target, h, plan.day, plan.watched))));
    const add: IntelByHour = {};
    for (const r of got) if (r.ok) add[r.key.hour] = intelOf(r);
    setIntel((m) => ({ ...m, ...add }));
    return { ...intelRef.current, ...add };
  };

  // Ambience. Day or night by the hour, the operations room underneath. Where you look, and how close you are,
  // brings in the place itself: the park, the canal, the pitch, the school, the souk, the boulevard. High above
  // the city the places fade into one hum and a little wind; close to the roofs, the nearest place comes forward.
  const zones = useMemo(() => {
    const rects = (f: (x: { kind: string }) => boolean, from: { kind: string; rect?: Rect; rects?: Rect[] }[]) => from.filter(f).flatMap((x) => x.rects ?? (x.rect ? [x.rect] : []));
    const souk = world.places.find((pl) => /souk/i.test(pl.name));
    return {
      park: rects((x) => x.kind === 'park', world.spaces),
      pitch: rects((x) => x.kind === 'pitch', world.spaces),
      school: [...rects((x) => x.kind === 'school', world.buildings), ...rects((x) => x.kind === 'playground', world.spaces)],
      traffic: rects((x) => x.kind === 'boulevard', world.roads),
      market: souk ? [{ x: souk.x - 30, y: souk.y - 30, w: 60, h: 60 }] : [],
    };
  }, [world]);
  useEffect(() => {
    if (!soundOn) return;
    const h = plan.hour;
    const day = h < 5 || h > 20.5 ? 0 : h < 7 ? (h - 5) / 2 : h > 18.5 ? (20.5 - h) / 2 : 1;
    const busy = h >= 7 && h < 20 ? 1 : 0.35;
    const tick = () => {
      const v = mapRef.current?.view;
      if (!v) return;
      const close = Math.max(0, Math.min(1, (v.zoom - 1.3) / 4)); // 0 high above, 1 down at the roofs
      const hush = striking ? 0.3 : 1;
      // One place at a time, and only up close: the nearest place you're looking at, within a short distance.
      const reach = 25 + close * 35; // metres
      const dist = (qs: Rect[]) => {
        let d = Infinity;
        for (const q of qs) d = Math.min(d, Math.hypot(Math.max(q.x - v.cx, 0, v.cx - q.x - q.w), Math.max(q.y - v.cy, 0, v.cy - q.y - q.h)));
        return d;
      };
      const school = plan.day !== 'friday' && h >= 7.5 && h < 14;
      const candidates: [Bed, number, number][] = [
        ['amb-market', dist(zones.market), day * 0.8],
        ['amb-park', dist(zones.park), (0.3 + 0.7 * day) * 0.7],
        ['amb-pitch', dist(zones.pitch), day * 0.6],
        ['amb-school', dist(zones.school), school ? 0.6 : 0],
        ['amb-traffic', dist(zones.traffic), busy * 0.45],
        ['amb-water', Math.max(0, Math.abs(v.cx - riverX(v.cy)) - world.river.width / 2), 0.55],
      ];
      let pick: [Bed, number] | null = null;
      if (close > 0.3)
        for (const [bed, d, loud] of candidates) {
          if (loud <= 0 || d > reach) continue;
          const lvl = loud * (1 - d / reach) * Math.min(1, (close - 0.3) / 0.3);
          if (!pick || lvl > pick[1]) pick = [bed, lvl];
        }
      const local = pick?.[1] ?? 0;
      const base = (1 - Math.min(0.65, local * 1.2)) * 0.8; // the city dips under the place you're at
      const levels: Partial<Record<Bed, number>> = {
        'amb-city-day': day * base * hush,
        'amb-city-night': (1 - day) * base * hush,
        'amb-cell-room': 0.22,
        'amb-wind': close < 0.12 ? (1 - close / 0.12) * 0.3 * hush : 0,
      };
      for (const [bed] of candidates) levels[bed] = pick && pick[0] === bed ? pick[1] * hush : 0;
      void sound.ambience(levels);
    };
    tick();
    const id = window.setInterval(tick, 700);
    return () => clearInterval(id);
  }, [soundOn, plan.hour, plan.day, striking, zones]); // eslint-disable-line react-hooks/exhaustive-deps
  // The call to prayer at dawn, and before Friday noon prayers.
  const prayerKey = useRef('');
  useEffect(() => {
    if (!soundOn) return;
    const h = plan.hour;
    const k = h >= 5 && h < 6 ? 'dawn' : plan.day === 'friday' && h >= 11.5 && h < 12.5 ? 'friday' : '';
    if (k && k !== prayerKey.current) sound.play('amb-call-to-prayer');
    prayerKey.current = k;
  }, [soundOn, plan.hour, plan.day]);

  const popNow = useMemo(() => population(world, plan.hour, plan.day, plan.watched, obs, intel[Math.floor(plan.hour) % 24], ruins), [world, plan.hour, plan.day, plan.watched, obs, intel, ruins]);
  const circle = useMemo(() => inCircle(world, plan, popNow), [world, plan, popNow]);

  // Every change reruns the estimate and the danger field. While the day plays, they hold still (the map's
  // people and the day line still move) and catch up the moment it stops, so nothing stutters.
  useEffect(() => {
    if (dayPlay) return;
    setComputing(true);
    const id = window.setTimeout(() => {
      setEst(estimate(world, plan, popNow, runs, estSeed));
      setField(dangerField(world, plan, 40, 3, estSeed));
      setComputing(false);
    }, 90);
    return () => clearTimeout(id);
  }, [world, plan, popNow, runs, estSeed, dayPlay]);

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
      const msg: Job = { job: jobs.current.hours, seed: SEED, base: plan, obs, intel, ruins, runs: 150, cands };
      sideWorker.current?.postMessage(msg);
    }, 250);
    return () => clearTimeout(id);
  }, [plan.target, plan.weapon, plan.fuze, plan.heading, plan.aimX, plan.aimY, plan.day, plan.watched, plan.hardness, plan.stored, obs, intel, ruins]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const id = window.setTimeout(() => {
      const cands: Candidate[] = WEAPONS.flatMap((w) => FUZES.map((f) => ({ weapon: w.id, fuze: f.id, heading: plan.heading, aim: 'custom' as const, hour: plan.hour })));
      jobs.current.matrix = Date.now() + 1;
      const msg: Job = { job: jobs.current.matrix, seed: SEED, base: plan, obs, intel, ruins, runs: 150, cands };
      sideWorker.current?.postMessage(msg);
    }, 350);
    return () => clearTimeout(id);
  }, [plan.target, plan.heading, plan.aimX, plan.aimY, plan.hour, plan.day, plan.watched, plan.hardness, plan.stored, obs, intel, ruins]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dayPlay) return;
    const id = window.setInterval(() => setPlanState((p) => ({ ...p, hour: (Math.round(p.hour * 2) / 2 + 0.5) % 24 })), 600);
    return () => clearInterval(id);
  }, [dayPlay]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') {
        setConfirm(false);
        setPop(null);
        setPlacesOpen(false);
        setLayersOpen(false);
        setIntro(false);
        setMixOpen(false);
        setPlace(null);
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'p') setPanels((p) => ({ ...p, plan: !p.plan }));
      if (k === 'e') setPanels((p) => ({ ...p, side: !p.side }));
      if (k === 't') setPanels((p) => ({ ...p, drawer: !p.drawer }));
      if (k === 'f') setPanels(fullMap);
      if (k === 'l') setLayersOpen((o) => !o);
      if (k === 'm') sound.setEnabled(!sound.enabled);
      if (k === 'x') setMapMode((v) => (v === 'target' ? 'explore' : 'target'));
      if (e.key === '[') setPlanState((p) => ({ ...p, hour: (p.hour + 23.5) % 24 }));
      if (e.key === ']') setPlanState((p) => ({ ...p, hour: (p.hour + 0.5) % 24 }));
      if (e.key === ',') setPlanState((p) => ({ ...p, heading: (p.heading + 345) % 360 }));
      if (e.key === '.') setPlanState((p) => ({ ...p, heading: (p.heading + 15) % 360 }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
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
      onStart: (total, _kept, workers) => theaterRef.current?.start(total, poolRef.current?.results ?? [], workers),
      onDispatch: (wk, cands) => theaterRef.current?.dispatch(wk, cands),
      onJob: (wk, out, runs, ms) => {
        sound.play('jev-tick');
        theaterRef.current?.job(wk, out, runs, ms);
        setSimulated((n) => n + runs.reduce((a, r) => a + r.length, 0));
      },
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
  const showTheater = panels.drawer && drawerTab === 'jev' && phase !== 'idle';
  useEffect(() => {
    if (!showTheater || !theaterCanvas.current) return;
    const t = new JevTheater(theaterCanvas.current);
    theaterRef.current = t;
    const pool = poolRef.current;
    if (pool && pool.total) t.start(pool.total, pool.results, pool.workers);
    const ro = new ResizeObserver(() => t.resize());
    ro.observe(theaterCanvas.current);
    return () => {
      ro.disconnect();
      t.dispose();
      theaterRef.current = null;
    };
  }, [showTheater]);
  useEffect(() => {
    const t = theaterRef.current;
    if (!t) return;
    t.minPk = minPk;
    t.best = bestNow;
    t.paused = phase === 'search' && !status.running;
  });
  const seenCount = useRef(0);
  useEffect(() => {
    const fresh = results.slice(seenCount.current);
    seenCount.current = results.length;
    if (!fresh.length) return;
    if (SPEEDS[speed] <= 8) for (const s of fresh.slice(-4)) pushLog(`${describe(s.c)} → ${s.p90}, target ${pct(s.pk)}`, 'try');
    const b = best(results, minPk);
    if (b && (!bestRef.current || key(b.c) !== key(bestRef.current.c))) {
      pushLog(`Better plan: ${describe(b.c)}. Planning figure ${b.p90} ${b.p90 === 1 ? 'person' : 'people'}; destroys the target ${pct(b.pk)} of the time.`, 'best');
      bestRef.current = b;
    }
  }, [results]); // eslint-disable-line react-hooks/exhaustive-deps
  // One line when the requirement settles, not one per step of the slider.
  const firstPk = useRef(true);
  useEffect(() => {
    if (firstPk.current) {
      firstPk.current = false;
      return;
    }
    const b = best(results, minPk);
    const was = bestRef.current;
    bestRef.current = b;
    if (!results.length) return;
    const id = window.setTimeout(() => {
      if (!b) pushLog(`Must now destroy the target ${pct(minPk)} of the time. No plan tried so far does.`, 'step');
      else if (was && key(was.c) === key(b.c)) pushLog(`Must now destroy the target ${pct(minPk)} of the time. Jev's pick stays the same.`, 'step');
      else pushLog(`Must now destroy the target ${pct(minPk)} of the time. Jev's pick changes: ${describe(b.c)}, ${b.p90} ${b.p90 === 1 ? 'person' : 'people'}.`, 'best');
    }, 700);
    return () => clearTimeout(id);
  }, [minPk]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (phase === 'search' && !status.running && status.done >= status.total && status.total > 0) {
      setPhase('done');
      sound.play('jev-done');
      sound.radio('radio-10-jev-done', 0.5);
      const b = best(results, minPk);
      if (b) pushLog(`Done: ${status.done} plans. Best: ${describe(b.c)} → planning figure ${b.p90}. Sign-off: ${approver(b.p90, rules, circle.protectedSites.length > 0).who}.`, 'best');
      else pushLog(`Done: ${status.done} plans. None destroys the target ${pct(minPk)} of the time.`, 'best');
    }
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const space = useCallback(() => ({ weapons: allowed, hours: WINDOWS[hours] }), [allowed, hours]);
  // The guide doesn't run Jev live: it replays one recorded search (the warehouse, every plan) into the chart,
  // with no workers and no sound, so it loads fast and the narrator isn't competing with anything.
  const demoTimer = useRef(0);
  const stopDemo = () => window.clearInterval(demoTimer.current);
  const startDemo = async () => {
    stopDemo();
    poolRef.current?.stop();
    timers.current.forEach(clearTimeout);
    setLog([]);
    bestRef.current = undefined;
    seenCount.current = 0;
    trailRef.current = [];
    setResults([]);
    setSimulated(0);
    setPhase('search');
    const rows: [WeaponId, FuzeId, number, Candidate['aim'], number, number, number, number][] = await fetch('/demo/jev-warehouse.json').then((r) => r.json()).catch(() => []);
    if (!rows.length) return setPhase('idle');
    const all: Scored[] = rows.map(([weapon, fuze, heading, aim, hour, pk, mean, p90]) => ({ c: { weapon, fuze, heading, aim, hour }, pk, mean, p90 }));
    pushLog(`A recorded search of ${target.name}: ${all.length.toLocaleString()} plans, each replayed 120 times.`, 'step');
    let n = 0;
    const per = Math.ceil(all.length / 80); // about eight seconds
    demoTimer.current = window.setInterval(() => {
      n = Math.min(all.length, n + per);
      setResults(all.slice(0, n));
      setSimulated(n * 120);
      setStatus({ running: n < all.length, done: n, total: all.length, busy: n < all.length ? 4 : 0, workers: 4, rate: per * 10 });
      if (n >= all.length) stopDemo();
    }, 100);
  };
  const runJev = () => {
    if (guide != null) return void startDemo();
    const pool = poolRef.current;
    if (!pool) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setLog([]);
    bestRef.current = undefined;
    seenCount.current = 0;
    trailRef.current = [];
    setSimulated(0);
    setDrawerTab('jev');
    setPanels((p) => ({ ...p, drawer: true, side: true }));
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
      () => lawful && pushLog(`Within reach of the ${big.short}: ${c.radius} m, ${c.buildings} buildings.${c.protectedSites.length ? ` Protected: ${c.protectedSites.join(', ')}.` : ''}${c.hazards.length ? ` Hazards: ${c.hazards.join(', ')}.` : ''}`, 'step'),
      () => lawful && pushLog(`Trying ${n.toLocaleString()} plans, each replayed ${pool.runs} times, on ${pool.workers} workers at once.`, 'step'),
      () => {
        if (!lawful) return setPhase('idle');
        pushLog(`Asking Jev to read the intelligence for ${sp.hours.length} hours…`, 'step');
        sound.play('jev-start');
        sound.radio('radio-09-jev-run', 0.3);
        readHours(sp.hours).then((got) => {
          const n = sp.hours.filter((h) => got[Math.floor(h) % 24]).length;
          sound.play('jev-read');
          if (n) sound.radio('radio-01-pol', 2.4);
          pushLog(n ? `Jev read the intelligence for ${n} of ${sp.hours.length} hours. Every replay draws who is inside from its answers.` : 'Jev could not read the intelligence here, so replays use the built-in guess of who is inside.', 'step');
          setPhase('search');
          pool.start(plan, obs, sp, SEED, false, got, ruinsRef.current);
        });
      },
    ];
    const gap = SPEEDS[speed] === Infinity ? 120 : Math.max(180, 1000 / Math.sqrt(SPEEDS[speed]));
    steps.forEach((f, i) => timers.current.push(window.setTimeout(f, i * gap)));
  };
  const assumptions = `${plan.target}|${plan.day}|${plan.watched}|${plan.hardness}|${plan.stored}|${JSON.stringify(obs)}${ruins.length}|${allowed.join()}|${hours}`;
  const lastAssumptions = useRef(assumptions);
  useEffect(() => {
    if (assumptions === lastAssumptions.current) return;
    const onlySpace = assumptions.split('|').slice(0, 6).join('|') === lastAssumptions.current.split('|').slice(0, 6).join('|');
    lastAssumptions.current = assumptions;
    const pool = poolRef.current;
    if (!pool || phase !== 'search') return;
    pushLog(onlySpace ? 'Search space changed: keeping what still fits.' : 'Assumptions changed: re-scoring from scratch.', 'step');
    bestRef.current = undefined;
    pool.start(plan, obs, space(), SEED, onlySpace, intelRef.current, ruinsRef.current);
  }, [assumptions]); // eslint-disable-line react-hooks/exhaustive-deps

  const candidateAim = (c: Candidate) => (c.aim === 'custom' ? { x: plan.aimX, y: plan.aimY } : aimPoint(target, c.aim));
  const applyCandidate = (c: Candidate) => {
    const a = candidateAim(c);
    setPlan({ weapon: c.weapon, fuze: c.fuze, heading: c.heading, hour: c.hour, aimX: a.x, aimY: a.y });
    pushLog(`You're now using: ${describe(c)}.`, 'step');
  };

  // ------------------------------------------------------------ the map

  const ghostCand = peek?.c ?? (phase === 'search' || phase === 'done' ? testing : null);
  const ghostPlan = useMemo(() => {
    if (!ghostCand) return null;
    const a = candidateAim(ghostCand);
    return { ...plan, weapon: ghostCand.weapon, fuze: ghostCand.fuze, heading: ghostCand.heading, hour: ghostCand.hour, aimX: a.x, aimY: a.y };
  }, [ghostCand, plan]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastTrailKey = useRef('');
  if (ghostPlan && phase === 'search' && testing) {
    const k = key(testing);
    if (k !== lastTrailKey.current) {
      lastTrailKey.current = k;
      trailRef.current = [...trailRef.current.slice(-13), ghostPlan];
    }
  }
  const following = follow && !!ghostPlan && (status.running || !!peek) && !outcome && !striking;
  const shownPlan = following ? ghostPlan! : plan;
  const popShown = useMemo(() => (following ? population(world, shownPlan.hour, plan.day, plan.watched, obs, intel[Math.floor(shownPlan.hour) % 24], ruins) : popNow), [following, shownPlan.hour, world, plan.day, plan.watched, obs, popNow, intel, ruins]);

  frameRef.current = {
    world,
    pop: popShown,
    plan: shownPlan,
    est: following ? null : est,
    field: following ? null : field,
    layers,
    circleR: inCircle(world, shownPlan, popShown).radius,
    pulseCircle: guide != null && !!GUIDE[guide].pulse,
    ghost: following ? null : ghostPlan,
    trail: phase === 'search' || phase === 'done' ? trailRef.current : [],
    spotMode: countMode,
    targetMode: mapMode === 'target',
    retarget,
    hover,
    selected: pop?.bid ?? null,
    outcome,
    ruins,
    aimDrag,
    headingDrag,
  };

  useEffect(() => {
    const canvas = canvasRef.current!;
    const map = new MapView(canvas, world);
    map.discovered = loadDiscovered();
    setExplored(map.discovered.size);
    map.onDiscover = (p) => {
      if (p.kind !== 'street') sound.play('ui-discover');
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
    // Resizing clears the canvas, so redraw straight away rather than flash blank while a panel slides.
    const ro = new ResizeObserver(() => {
      map.resize();
      if (frameRef.current) map.frame(frameRef.current, 0);
    });
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
      const b = bannerRef.current;
      if (b) {
        const t = map.strikeTime();
        if (t == null || t > 4.2) b.style.display = 'none';
        else {
          b.style.display = '';
          b.className = `banner ${t < 2.6 ? 'away' : 'impact'}`;
          b.textContent = t < 2.6 ? `Weapon away · impact in ${(2.6 - t).toFixed(1)} s` : 'Impact';
        }
      }
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
        return { world: f.world, plan: f.plan, pop: f.pop, est: f.est, layers: f.layers, circleR: f.circleR, outcome: f.outcome, ruins: f.ruins, strike: st && t != null ? { ...st, t } : null, walkers: m.crowd.visible(), cars: m.crowd.cars };
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
  const drag = useRef<{ mode: 'aim' | 'pan' | 'heading' | 'retarget'; x: number; y: number; cx: number; cy: number } | null>(null);
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
    if (b?.id === target.buildingId) return setPop(null);
    if (!b || !b.capacity) {
      // Not a building anyone uses: tell the story of the place instead.
      setPop(null);
      const st = placeAt(world, wx, wy);
      if (place && place.story.title === st.title) return setPlace(null); // a second click closes it
      sound.play('ui-toggle', 0, 0.18);
      return setPlace({ story: st, x: px, y: py });
    }
    setPlace(null);
    sound.play('ui-building');
    setPop({ bid: b.id, x: px, y: py, n: obs[b.id] ?? shownCount(popNow, b) });
  };
  // Can this building be made the target? Not a ruin, not the current target, and someone must use it.
  const targetable = (b: ReturnType<MapView['buildingAt']>) => !!b && !ruins.includes(b.id) && b.id !== target.buildingId;
  // Target mode is forgiving: the building under the pointer, or failing that the nearest one within 40 m.
  const pickAt = (x: number, y: number) => {
    const under = mapRef.current?.buildingAt(x, y) ?? null;
    if (targetable(under)) return under;
    let bestB: (typeof world.buildings)[number] | null = null;
    let bestD = 40;
    for (const b of world.buildings) {
      if (Math.abs(b.cx - x) > 80 || Math.abs(b.cy - y) > 80 || !targetable(b)) continue;
      const d = buildingDist(b, x, y);
      if (d < bestD) {
        bestD = d;
        bestB = b;
      }
    }
    return bestB;
  };
  // The bridge isn't a building, so Target mode checks for it by position.
  const onBridge = (x: number, y: number) => {
    const q = targetOf(world, 'bridge').rect;
    return plan.target !== 'bridge' && !ruins.includes(BRIDGE_RUIN) && x >= q.x && x <= q.x + q.w && y >= q.y - 1 && y <= q.y + q.h + 1;
  };
  const retargetTo = (bid: number) => {
    const briefed = world.targets.find((t) => t.buildingId === bid);
    chooseTarget(briefed ? briefed.id : `b:${bid}`);
    sound.play('ui-weapon');
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
    const hp = m.toScreen(m.handleWorld(plan).x, m.handleWorld(plan).y);
    (e.target as Element).setPointerCapture(e.pointerId);
    hideTip();
    if (mapMode === 'target' && !outcome && inTarget(w.x, w.y)) {
      drag.current = { mode: 'retarget', x: p.x, y: p.y, cx: 0, cy: 0 };
      setRetarget({ x: w.x, y: w.y, bid: null });
    } else if (!outcome && Math.hypot(p.x - hp.x, p.y - hp.y) < 18) {
      drag.current = { mode: 'heading', x: p.x, y: p.y, cx: 0, cy: 0 };
      setHeadingDrag(true);
    } else if (!outcome && (nearAim || inTarget(w.x, w.y))) {
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
    if (d?.mode === 'heading') {
      const deg = (Math.atan2(plan.aimX - w.x, -(plan.aimY - w.y)) * 180) / Math.PI;
      setPlan({ heading: ((Math.round(deg / 5) * 5) % 360 + 360) % 360 });
    } else if (d?.mode === 'retarget') {
      setRetarget({ x: w.x, y: w.y, bid: onBridge(w.x, w.y) ? null : (pickAt(w.x, w.y)?.id ?? null) });
    } else if (d?.mode === 'aim') moveAim(w.x, w.y);
    else if (d?.mode === 'pan') {
      const { s } = m.cam();
      m.view.cx = d.cx - (p.x - d.x) / s;
      m.view.cy = d.cy - (p.y - d.y) / s;
      m.clampView();
    } else {
      const b = mapMode === 'target' && !onBridge(w.x, w.y) ? (pickAt(w.x, w.y) ?? m.buildingAt(w.x, w.y)) : m.buildingAt(w.x, w.y);
      if ((b?.id ?? null) !== hover) setHover(b ? b.id : null);
      showTip(p.x, p.y, w.x, w.y, b);
    }
  };
  // The cursor readout: who is here, and how dangerous it would be to stand here.
  const hideTip = () => {
    if (tipRef.current) tipRef.current.style.display = 'none';
  };
  const showTip = (px: number, py: number, wx: number, wy: number, b: ReturnType<MapView['buildingAt']>) => {
    const el = tipRef.current;
    if (!el || view !== 'map' || striking) return;
    let text = '';
    if (b && mapMode === 'target') {
      const why = b.id === target.buildingId ? 'The target. Drag it onto another building' : ruins.includes(b.id) ? 'Already destroyed' : `Click to make this the target${b.protected ? ' · protected site' : ''}`;
      text = `<b>${placeName(b)}</b><span>${why}</span>`;
    } else if (!b && mapMode === 'target' && onBridge(wx, wy)) {
      text = '<b>Boulevard bridge</b><span>Click to make this the target</span>';
    } else if (b) {
      const n = obs[b.id] ?? shownCount(popNow, b);
      const hurt = est && est.byBuilding[b.id] > 0.05 ? ` · ${est.byBuilding[b.id].toFixed(1)} expected hurt` : '';
      text = `<b>${placeName(b)}</b><span>${b.capacity ? `${n} inside now` : 'no one inside'} · ${MATERIAL_NAME[b.material].toLowerCase()}${hurt}</span>`;
    } else if (field && layers.danger) {
      const i = Math.floor((wx - field.x0) / field.cell);
      const j = Math.floor((wy - field.y0) / field.cell);
      const v = i >= 0 && j >= 0 && i < field.cols && j < field.rows ? field.p[j * field.cols + i] : 0;
      if (v >= 0.01) text = `<b>${v >= 0.95 ? 'Almost certain' : `About 1 in ${Math.max(1, Math.round(1 / v))}`}</b><span>chance someone standing here is killed or badly hurt</span>`;
      else if (v > 0) text = '<span>Very little danger here</span>';
    }
    if (!text) return hideTip();
    el.innerHTML = text;
    el.style.display = '';
    el.style.transform = `translate(${px + 14}px, ${py + 14}px)`;
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setAimDrag(false);
    setHeadingDrag(false);
    setRetarget(null);
    const m = mapRef.current;
    if (d?.mode === 'retarget' && m && e.type === 'pointerup') {
      const p = localXY(e);
      const w = m.toWorld(p.x, p.y);
      if (onBridge(w.x, w.y)) chooseTarget('bridge');
      else {
        const b = pickAt(w.x, w.y);
        if (b) retargetTo(b.id);
      }
      return;
    }
    if (d?.mode === 'pan' && m && e.type === 'pointerup' && mapMode === 'target') {
      const p = localXY(e);
      if (Math.hypot(p.x - d.x, p.y - d.y) < 5) {
        const w = m.toWorld(p.x, p.y);
        if (onBridge(w.x, w.y)) chooseTarget('bridge');
        else {
          const b = pickAt(w.x, w.y);
          if (b) retargetTo(b.id);
        }
      }
      return;
    }
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
    endStrike();
    setPop(null);
    setObs({});
    setLawful(!id.startsWith('b:'));
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
    stopDemo();
    if (i != null && GUIDE[i].demo) void startDemo();
    else if (phaseRef.current !== 'idle' && (i == null || (guide != null && GUIDE[guide].demo))) {
      // Leaving the demo: clear it, so nothing recorded is mistaken for a live search.
      setResults([]);
      setPhase('idle');
      setLog([]);
    }
    // "Change the hour" plays through the day; any other step (or leaving the guide) stops it.
    setDayPlay(i != null && !!GUIDE[i].play);
    if (i == null) return sound.stopVoice();
    sound.voice(i + 1);
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
      setPanels((p) => ({ ...p, side: true }));
    }
    if (g.drawer) {
      setDrawerTab(g.drawer);
      setPanels((p) => ({ ...p, drawer: true }));
    }
    if (g.open) setPanels((p) => ({ ...p, plan: true }));
    if (g.open === 'decide') setStrikeOpen(true);
    setPop(null);
    setOutcome(null);
  };
  // The guide is its own thing: the narrator leads, the rest goes quiet.
  useEffect(() => sound.setQuiet(guide != null), [guide]);
  // Once the opening card is gone, the Guide button breathes for a few seconds so people know it's there.
  const [guideHint, setGuideHint] = useState(true);
  useEffect(() => {
    if (intro || !guideHint) return;
    const id = window.setTimeout(() => setGuideHint(false), 9000);
    return () => window.clearTimeout(id);
  }, [intro, guideHint]);
  // On the map, pan and zoom; in 3D, glide the camera there too.
  const flyTo = (x: number, y: number, zoom = 4) => {
    focusRef.current = { cx: x, cy: y, zoom };
    if (view === 'model') modelRef.current?.flyTo(x, y, zoom <= 2.5 ? 320 : zoom <= 4 ? 190 : 130);
  };
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
    // Rolling again replaces the last strike; a new strike adds to the ruins.
    const before = outcome && strikeRef.current ? strikeRef.current.before : ruins;
    setRuins(before);
    // The sound of it: the aircraft, the call, the impact, the stamp, then what the radio says.
    sound.play('aircraft-approach');
    sound.radio('radio-04-away', 0.9);
    sound.play('bomb-whistle', 1.5);
    m.onImpact = (o) => {
      setOutcome(o);
      setRuins([...new Set([...before, ...o.damaged])]);
      sound.play('impact');
      sound.play('aftermath', 1.1);
      sound.play('stamp', 0.55);
      // After the blast has settled: one call with the result, then a quiet "stand by".
      sound.radio(o.destroyed ? 'radio-06-destroyed' : 'radio-07-intact', 2.4);
      sound.radio('radio-08-bda', 3.2);
    };
    m.onSettled = () => setStriking(false);
    const o = m.strike(plan, population(world, plan.hour, plan.day, plan.watched, obs, intel[Math.floor(plan.hour) % 24], before), Math.floor(Math.random() * 1e9));
    strikeRef.current = { plan, outcome: o, before };
  };
  /** Clear the last strike's effects, keeping the ruins. */
  function endStrike() {
    mapRef.current?.clearStrike();
    strikeRef.current = null;
    setOutcome(null);
    setStriking(false);
  }
  function resetCity() {
    endStrike();
    setRuins([]);
  }
  // Hold for the best hour: the day line (worked out for this plan at every hour, no search needed) says which
  // hour hurts the fewest. The clock then runs forward to it over a second or two, so you see the day pass.
  const holdTimer = useRef(0);
  const holdForHour = () => {
    if (!profile) return;
    let h = 0;
    profile.forEach((v, i) => {
      if (v.p90 < profile[h].p90 || (v.p90 === profile[h].p90 && v.mean < profile[h].mean)) h = i;
    });
    setDayPlay(false);
    window.clearInterval(holdTimer.current);
    const goal = h + 0.5;
    const steps = Math.round((((goal - plan.hour) % 24) + 24) % 24 * 2); // half-hours forward
    let left = steps;
    const dt = Math.max(40, Math.min(120, 2200 / Math.max(1, steps)));
    holdTimer.current = window.setInterval(() => {
      if (left-- <= 0) return window.clearInterval(holdTimer.current);
      setPlanState((p) => ({ ...p, hour: left <= 0 ? goal : (Math.round(p.hour * 2) / 2 + 0.5) % 24 }));
      setOutcome(null);
    }, dt);
    flash(`Holding until ${fmtHour(goal)}: for this plan, the hour that would hurt the fewest people (${profile[h].p90} at most, nine times in ten). Jev's search also tries other weapons and approaches.`);
  };
  // Call it off: nothing is released. The plan and any earlier ruins stay as they are.
  const callOff = () => {
    setConfirm(false);
    poolRef.current?.stop();
    setDayPlay(false);
    endStrike();
    flash('Called off. Nothing was released.');
    sound.radio('radio-12-calloff', 0.1);
  };
  const authorise = () => {
    setConfirm(true);
    sound.radio('radio-02-estimate', 0.3);
  };
  // A short line across the map, for a few seconds.
  const [note, setNote] = useState<string | null>(null);
  const noteTimer = useRef(0);
  const flash = (t: string) => {
    setNote(t);
    window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(null), 4200);
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

      <Step n={2} title="Weapon" summary={`${w.short} · ${fuze(plan.fuze).name}${weaponWarn ? ` · destroys it ${pct(est!.pk)}` : ''}`} status={weaponWarn ? 'warn' : 'ok'} open={open.has('weapon')} onToggle={() => toggleStep('weapon')}>
        <div className="armoury" key={plan.weapon}>
          <Origami id={plan.weapon} size={1.35} fold />
          <div>
            <b>{w.name}</b>
            <span>{w.note}</span>
          </div>
        </div>
        <div className="options">
          {WEAPONS.map((wp) => (
            <button
              key={wp.id}
              className={plan.weapon === wp.id ? 'on' : ''}
              onClick={() => {
                setPlan({ weapon: wp.id });
                sound.play('ui-weapon');
              }}
            >
              <span className="mini-origami" aria-hidden>
                <Origami id={wp.id} size={0.26} />
              </span>
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
          <button className="btn danger big" onClick={authorise} disabled={!lawful || striking || !est}>
            Authorise strike…
          </button>
          <button className="btn" onClick={holdForHour} disabled={!profile || striking}>
            Hold for the best hour
          </button>
          <button className="btn calm" onClick={callOff} disabled={striking}>
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
      <div className={`jev-slot ${guide != null && GUIDE[guide].glow === 'jev-card' ? 'glow' : ''}`}>
        <JevCard reading={reading} hour={plan.hour} />
      </div>
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
            <p className="sub">
              Tries every way to strike {target.short} and keeps the one that hurts the fewest people.
            </p>
            <p className="powered">TypeSafe System One</p>
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
        {phase !== 'idle' && !showTheater && (
          <button
            className="link"
            onClick={() => {
              setDrawerTab('jev');
              setPanels((p) => ({ ...p, drawer: true }));
            }}
          >
            Watch Jev work
          </button>
        )}
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
            Pace <em>{SPEEDS[speed] === Infinity ? 'as fast as it can' : `${SPEEDS[speed]} plans/s, slowed to watch`}</em>
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
          {plan.target.startsWith('b:') && (
            <button className="on picked" title={target.note}>
              {target.short}
            </button>
          )}
        </nav>
        <div className="top-right">
          <button className="explored" onClick={() => setPlacesOpen(!placesOpen)} title="Places you've found by exploring the map">
            Explored {explored}/{world.places.length} ▾
          </button>
<div className="sound-wrap">
                      <button className={`sound-btn ${soundOn ? 'on' : ''}`} aria-label="Sound" onClick={() => sound.setEnabled(!soundOn)} aria-pressed={soundOn} title={soundOn ? 'Sound is on (M)' : 'Sound is off (M)'}>
            <span aria-hidden>{soundOn ? '🔊' : '🔇'}</span>
            <span className="lbl">{soundOn ? 'Sound on' : 'Sound off'}</span>
          </button>
            <button className={`sound-more ${mixOpen ? 'on' : ''}`} onClick={() => setMixOpen(!mixOpen)} aria-expanded={mixOpen} aria-label="Sound settings" title="Sound settings">
              ▾
            </button>
            {mixOpen && (
              <div className="mix-pop" role="group" aria-label="Sound settings">
                {(
                  [
                    ['master', 'Everything'],
                    ['ambience', 'The city', 'Day and night, parks, the canal, traffic'],
                    ['effects', 'Effects', 'Clicks, Jev, the strike'],
                    ['voices', 'Voices', 'The narrator and the radio'],
                  ] as [keyof typeof mix, string, string?][]
                ).map(([k, name, hint]) => (
                  <label key={k}>
                    <span>
                      {name}
                      {hint && <small>{hint}</small>}
                    </span>
                    <input type="range" min={0} max={1} step={0.05} value={mix[k]} onChange={(e) => sound.setMix(k, Number(e.target.value))} />
                  </label>
                ))}
                {!soundOn && (
                  <button className="btn small" onClick={() => sound.setEnabled(true)}>
                    Turn sound on
                  </button>
                )}
              </div>
            )}
          </div>
          <button className={`btn small ${guideHint && guide == null ? 'attention' : ''}`} onClick={() => (guide == null ? setIntro(true) : goGuide(null))}>
            {guide == null ? 'Guide' : 'End guide'}
          </button>
          <Seg small value={view} onChange={setView} options={[['map', 'Map'], ['model', '3D']]} />
          <div className="panel-toggles" role="group" aria-label="Panels">
            <button className={panels.plan ? 'on' : ''} onClick={() => setPanels((p) => ({ ...p, plan: !p.plan }))} aria-pressed={panels.plan} title="Plan panel (P)">
              <PanelIcon side="left" />
              Plan
            </button>
            <button className={panels.drawer ? 'on' : ''} onClick={() => setPanels((p) => ({ ...p, drawer: !p.drawer }))} aria-pressed={panels.drawer} title="Timeline and Jev at work (T)">
              <PanelIcon side="bottom" />
              Timeline
            </button>
            <button className={panels.side ? 'on' : ''} onClick={() => setPanels((p) => ({ ...p, side: !p.side }))} aria-pressed={panels.side} title="Estimate and Jev (E)">
              <PanelIcon side="right" />
              Estimate
            </button>
            <button className={`full ${!panels.plan && !panels.side && !panels.drawer ? 'on' : ''}`} onClick={() => setPanels(fullMap)} title="Full map (F)" aria-label="Full map">
              ⛶
            </button>
          </div>
        </div>
      </header>

      <main className={`main ${panels.plan ? '' : 'no-left'} ${panels.side ? '' : 'no-right'}`}>
        <aside className="dock left" aria-label="Plan" hidden={!panels.plan}>
          <div className="dock-title">
            Plan
            <button className="dock-x" onClick={() => setPanels((p) => ({ ...p, plan: false }))} aria-label="Hide the plan panel" title="Hide (P)">
              ‹
            </button>
          </div>
          {planDock}
        </aside>

        <section className="stage">
          <div className="map">
            <canvas
              ref={canvasRef}
              className={`canvas ${countMode ? 'count' : ''} ${hover != null && hover === target.buildingId && !countMode ? 'aim' : ''} ${mapMode === 'target' ? 'target-mode' : ''} ${retarget ? 'dragging' : ''}`}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onPointerLeave={() => {
                setHover(null);
                hideTip();
              }}
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

            {view === 'map' && (
              <div className="hud-mode" role="radiogroup" aria-label="What clicking the map does">
                <button role="radio" aria-checked={mapMode === 'explore'} className={mapMode === 'explore' ? 'on' : ''} onClick={() => setMapMode('explore')} title="Click a building to see who's inside (X)">
                  Explore
                </button>
                <button role="radio" aria-checked={mapMode === 'target'} className={`tgt ${mapMode === 'target' ? 'on' : ''}`} onClick={() => setMapMode('target')} title="Click any building, or drag the target onto it, to make it the target (X)">
                  <span aria-hidden>⌖</span> Target
                </button>
              </div>
            )}
            {mapMode === 'target' && view === 'map' && !striking && !outcome && <div className="hud-hint">Click any building to make it the target, or drag the target onto one.</div>}

            {!striking && !outcome && !confirm && (
              <div className={`strike-dock ${strikeOpen ? 'open' : ''}`} role="group" aria-label="Decide">
                {strikeOpen ? (
                  <>
                    <button className="act strike" onClick={authorise} disabled={!lawful || !est} title={!lawful ? 'No lawful target: confirm it in the Target step first' : 'Opens the final decision'}>
                      Authorise strike
                    </button>
                    <button className="act wait" onClick={holdForHour} disabled={!profile}>
                      Hold for best hour
                    </button>
                    <button className="act off" onClick={callOff}>
                      Call off
                    </button>
                    <button className="dock-close" onClick={() => setStrikeOpen(false)} aria-label="Close">
                      ×
                    </button>
                  </>
                ) : (
                  <button className="act strike tab" onClick={() => setStrikeOpen(true)} title="Authorise, hold or call off">
                    Strike ▸
                  </button>
                )}
              </div>
            )}
            {note && (
              <div className="map-note" role="status">
                {note}
              </div>
            )}

            <div className="hud-layers">
              <button className={`layers-btn ${layersOpen ? 'on' : ''}`} onClick={() => setLayersOpen(!layersOpen)} aria-expanded={layersOpen} title="Map layers (L)">
                Layers <span className="mono">{Object.values(layers).filter(Boolean).length}</span> ▾
              </button>
              {layersOpen && (
                <div className="layers-pop" role="group" aria-label="Map layers">
                  {(
                    [
                      ['danger', 'Danger', 'Chance someone in the open is killed or badly hurt'],
                      ['people', 'People', 'Everyone Jev expects at this hour'],
                      ['pattern', 'Fragments', 'Where fragments fly, and the shadows buildings cast'],
                      ['circle', 'Reach', 'Everything this bomb could hurt'],
                      ['impacts', 'Landings', 'Where each simulated bomb landed'],
                      ['protect', 'Protected', 'Hospitals, schools, places of worship'],
                      ['labels', 'Labels', 'Places you have found'],
                    ] as [keyof Layers, string, string][]
                  ).map(([k, name, note]) => (
                    <button key={k} className={layers[k] ? 'on' : ''} onClick={() => setLayers({ ...layers, [k]: !layers[k] })} aria-pressed={layers[k]}>
                      <i className="tick" aria-hidden>
                        {layers[k] ? '✓' : ''}
                      </i>
                      <span>
                        <b>{name}</b>
                        <em>{note}</em>
                      </span>
                      {k === 'danger' && layers.danger && (
                        <span className="mini-legend" aria-hidden>
                          <span className="ramp">
                            <i />
                          </span>
                          <span className="ramp-ticks">
                            <span>0</span>
                            <span>1 in 10</span>
                            <span>1 in 2</span>
                            <span>certain</span>
                          </span>
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!panels.plan && (
              <button className="edge-tab left" onClick={() => setPanels((p) => ({ ...p, plan: true }))} title="Show the plan (P)">
                Plan ›
              </button>
            )}
            {!panels.side && (
              <button className="edge-tab right" onClick={() => setPanels((p) => ({ ...p, side: true }))} title="Show the estimate (E)">
                ‹ {est ? `${est.p90} · ${approval.who}` : 'Estimate'}
              </button>
            )}

            <div className="hud-zoom">
              {view === 'model' ? (
                <>
                  <button onClick={() => modelRef.current?.preset('drone')}>Drone</button>
                  <button onClick={() => modelRef.current?.preset('street')}>Street</button>
                  <button onClick={() => modelRef.current?.preset('top')}>Top</button>
                  <button className="tgt-btn" onClick={() => modelRef.current?.toTarget()}>
                    <span aria-hidden>⌖</span> Target
                  </button>
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
                    className="tgt-btn"
                    title="Fly to the target"
                  >
                    <span aria-hidden>⌖</span> Target
                  </button>
                </>
              )}
            </div>

            <div className="maptip" ref={tipRef} style={{ display: 'none' }} />
            <div className="banner" ref={bannerRef} style={{ display: 'none' }} />

            {placesOpen && (
              <div className="places-pop">
                <div className="places-head">
                  <b>Places</b>
                  <span>
                    {explored} of {world.places.length} found. Pan and zoom to discover more.
                  </span>
                </div>
                {(['district', 'landmark'] as const).map((k) => (
                  <div key={k} className="places-group">
                    <span className="k">{k === 'district' ? 'Districts' : 'Landmarks'}</span>
                    {world.places
                      .filter((pl) => pl.kind === k)
                      .map((pl) => {
                        const found = mapRef.current?.discovered.has(pl.id);
                        return (
                          <button
                            key={pl.id}
                            disabled={!found}
                            onClick={() => {
                              flyTo(pl.x, pl.y, k === 'district' ? 2.4 : 4.5);
                              setPlacesOpen(false);
                            }}
                          >
                            {found ? pl.name : '???'}
                            {found && pl.note && <em>{pl.note}</em>}
                          </button>
                        );
                      })}
                  </div>
                ))}
              </div>
            )}

            {confirm && est && (
              <div className="sheet">
                <div className="sheet-card">
                  <span className="k">Final decision</span>
                  <h2>Strike {target.name}?</h2>
                  <p className="plan-line">
                    {w.name}, {fuze(plan.fuze).name.toLowerCase()} fuze, arriving from the {compassName(plan.heading + 180)}, {plan.day === 'friday' ? 'Friday' : 'a weekday'} at {fmtHour(plan.hour)}.
                  </p>
                  <div className="sheet-nums">
                    <div>
                      <b>{est.mean < 10 ? est.mean.toFixed(1) : Math.round(est.mean)}</b>
                      <span>expected killed or badly hurt</span>
                    </div>
                    <div>
                      <b>{est.p90}</b>
                      <span>nine in ten runs at or below</span>
                    </div>
                    <div>
                      <b>{pct(est.pk)}</b>
                      <span>chance the target is destroyed</span>
                    </div>
                  </div>
                  <ApprovalLadder a={approval} />
                  {circle.protectedSites.length > 0 && <p className="hint warn">Protected sites in range: {circle.protectedSites.join(', ')}.</p>}
                  <p className="hint">The estimate is a spread of possibilities; the strike is one roll of the dice. Whether this harm is excessive for what it achieves is your judgment, not the model's.</p>
                  <div className="sheet-actions">
                    <HoldButton
                      label="Hold to release"
                      onStart={() => sound.chargeStart()}
                      onCancel={() => {
                        sound.chargeStop();
                        sound.play('hold-abort');
                        sound.radio('radio-11-abort', 0.25);
                      }}
                      onDone={() => {
                        sound.chargeStop();
                        sound.radio('radio-03-cleared');
                        setConfirm(false);
                        release();
                      }}
                    />
                    <button className="btn" onClick={() => setConfirm(false)}>
                      Stand down
                    </button>
                  </div>
                </div>
              </div>
            )}

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
              <div className={`stamp ${outcome.destroyed ? 'hit' : 'miss'}`} key={`${outcome.ix},${outcome.iy}`} aria-live="assertive">
                <b>{outcome.destroyed ? 'Target destroyed' : 'Target missed'}</b>
                <span>
                  {outcome.count} {outcome.count === 1 ? 'person' : 'people'} killed or badly hurt
                </span>
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
                <p>The ruins stay{ruins.length > 1 ? ` (${ruins.length} buildings so far)` : ''}. Pick another target above, or click any building on the map.</p>
                <div className="row">
                  <button className="btn primary small" onClick={endStrike} disabled={striking}>
                    Next target
                  </button>
                  <button className="btn small" onClick={resetCity} disabled={striking}>
                    Rebuild the city
                  </button>
                  <button className="btn small" onClick={release} disabled={striking}>
                    Roll again
                  </button>
                </div>
              </div>
            )}

            {place && !striking && (
              <div
                className="placecard"
                key={place.story.title}
                style={{
                  left: Math.max(10, Math.min(place.x + 18, (canvasRef.current?.clientWidth ?? 400) - 290)),
                  top: Math.max(56, Math.min(place.y - 30, (canvasRef.current?.clientHeight ?? 600) - 220)),
                }}
              >
                <div className="pop-head">
                  <div>
                    <span className="kind">{place.story.kind}</span>
                    <b>{place.story.title}</b>
                  </div>
                  <button className="x" onClick={() => setPlace(null)} aria-label="Close">
                    ×
                  </button>
                </div>
                <p>{place.story.line}</p>
                {place.story.when && <p className="when">{place.story.when}</p>}
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
                {storyFor(popB.name) && <p className="story">{storyFor(popB.name)!.line}</p>}
                {ruins.includes(popB.id) ? (
                  <p className="hint">Destroyed in an earlier strike. Nobody is inside.</p>
                ) : (
                  plan.target !== `b:${popB.id}` &&
                  targetOf(world, plan.target).buildingId !== popB.id && (
                    <button className="btn small make-target" onClick={() => chooseTarget(`b:${popB.id}`)}>
                      Make this the target
                    </button>
                  )
                )}
                {popB.protected && !ruins.includes(popB.id) && <p className="hint warn">A protected site. Striking it is prohibited unless it has lost its protection: a legal judgment for people, not the model.</p>}
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

          {panels.drawer ? (
            <div className={`drawer ${drawerTab}`}>
              <div className="drawer-tabs" role="tablist">
                <button role="tab" aria-selected={drawerTab === 'day'} className={drawerTab === 'day' ? 'on' : ''} onClick={() => setDrawerTab('day')}>
                  The day
                </button>
                <button role="tab" aria-selected={drawerTab === 'jev'} className={drawerTab === 'jev' ? 'on' : ''} onClick={() => setDrawerTab('jev')}>
                  Jev at work {phase === 'search' && status.running && <i className="live" />}
                </button>
                <button className="dock-x" onClick={() => setPanels((p) => ({ ...p, drawer: false }))} aria-label="Hide the timeline" title="Hide (T)">
                  ▾
                </button>
              </div>
              {drawerTab === 'day' ? (
                <div className="timebar">
                  <div className="time-controls">
              <Seg small value={plan.day} onChange={(day: Day) => setPlan({ day })} options={[['weekday', 'Weekday'], ['friday', 'Friday']]} />
              <button className="btn small" onClick={() => setDayPlay(!dayPlay)} aria-pressed={dayPlay}>
                {dayPlay ? '❚❚ Pause' : '▶ Play the day'}
              </button>
            </div>
            <Timeline profile={profile} hour={plan.hour} onHour={(h) => {
                setDayPlay(false);
                setPlan({ hour: h });
              }} day={plan.day === 'friday' ? 'Friday' : 'weekday'} />
                </div>
              ) : phase === 'idle' ? (
                <div className="drawer-empty">
                  <p>Jev hasn't run yet. It will try every weapon, fuze, direction, aim point and hour in parallel, and you can watch each worker score plans here.</p>
                  <button className="btn primary small" onClick={() => runJev()}>
                    Run Jev
                  </button>
                </div>
              ) : (
                          <div className="theater">
                <div className="theater-head">
                  <b>{status.running ? 'Working' : phase === 'search' ? 'Paused' : 'Done'}</b>
                  <span className="mono stats">
                    <abbr title={`${status.workers} copies of Jev running at the same time, one per processor core on your computer.`}>{status.workers} workers</abbr> ·{' '}
                    <abbr title="Every combination of weapon, fuze, direction of attack, aim point and hour.">
                      {status.done.toLocaleString()}/{status.total.toLocaleString()} plans
                    </abbr>{' '}
                    ·{' '}
                    <abbr title="Each plan is replayed many times with different luck: where it lands, who is inside, where the fragments go. This is every replay so far.">
                      {simulated.toLocaleString()} replays
                    </abbr>{' '}
                    · <abbr title="How many plans Jev finishes each second.">{status.rate.toFixed(0)} plans/s</abbr>
                  </span>
                  <span className="theater-ctl">
                    {phase === 'search' && (
                      <button className="btn small" onClick={() => (status.running ? poolRef.current?.pause() : poolRef.current?.resume())}>
                        {status.running ? 'Pause' : 'Resume'}
                      </button>
                    )}
                  </span>
                </div>
                <canvas ref={theaterCanvas} className="theater-canvas" aria-label="Jev's workers scoring plans in parallel" />
              </div>
              )}
            </div>
          ) : (
            <button className="edge-tab bottom" onClick={() => setPanels((p) => ({ ...p, drawer: true }))} title="Show the timeline (T)">
              ▴ {fmtHour(plan.hour)} · timeline{phase !== 'idle' ? ' · Jev at work' : ''}
            </button>
          )}
        </section>

        <aside className="dock right" aria-label="Estimate and Jev" hidden={!panels.side}>
          <div className="tabs">
            <button className={tab === 'estimate' ? 'on' : ''} onClick={() => setTab('estimate')}>
              Estimate {computing && <i className="spin" />}
            </button>
            <button className={tab === 'jev' ? 'on' : ''} onClick={() => setTab('jev')}>
              Jev {phase === 'search' && status.running && <i className="live" />}
            </button>
            <button className="dock-x" onClick={() => setPanels((p) => ({ ...p, side: false }))} aria-label="Hide the estimate panel" title="Hide (E)">
              ›
            </button>
          </div>
          {tab === 'estimate' ? <div className={`held-wrap ${dayPlay ? 'held' : ''}`}>{dayPlay && <div className="held-note">Playing the day. The figures catch up when it stops.</div>}{estimateDock}</div> : jevDock}
        </aside>
      </main>

      {intro && (
        <div className="intro" role="dialog" aria-modal="true" aria-labelledby="intro-title">
          <div className="intro-card">
            <span className="k">06:00 · Targeting cell</span>
            <h1 id="intro-title">Collateral damage</h1>
            <p className="lede">is the harm a strike does to people and places around its target. Before a strike, planners estimate it, and the higher the number, the more senior the person who has to sign for it.</p>
            <p>
              This is a city of 40,000 people, made of paper. Intelligence says one of its buildings holds weapons. Across the street is a school. Whether to strike is a legal judgment made by people. Your job is to estimate what it would cost in civilian lives, and who has to sign
              for that number.
            </p>
            <p>
              <b>Jev</b> is on your desk. It reads the intelligence, replays the strike thousands of times with different luck, and searches every other way to do it.
            </p>
            <p className="powered">Jev is powered by TypeSafe&rsquo;s System One model. The city, the numbers and the people are invented, for teaching; this is an explainer, not a targeting tool.</p>
            <div className="intro-actions">
              <button className="btn primary big" onClick={() => closeIntro(true)} autoFocus>
                Step in →
              </button>
              <button className="btn" onClick={() => closeIntro(false)}>
                Look around first
              </button>
              <button
                className="btn listen"
                onClick={() => {
                  sound.setEnabled(true);
                  sound.voice(0);
                }}
              >
                🔈 Listen
              </button>
            </div>
          </div>
        </div>
      )}

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

interface Panels {
  plan: boolean;
  side: boolean;
  drawer: boolean;
}
const PANELS_KEY = 'cd.panels';
function loadPanels(): Panels {
  const d = { plan: true, side: true, drawer: true };
  try {
    return { ...d, ...JSON.parse(localStorage.getItem(PANELS_KEY) ?? '{}') };
  } catch {
    return d;
  }
}
/** Hide every panel, or bring them all back if they're already hidden. */
const fullMap = (p: Panels): Panels => (p.plan || p.side || p.drawer ? { plan: false, side: false, drawer: false } : { plan: true, side: true, drawer: true });

function PanelIcon({ side }: { side: 'left' | 'right' | 'bottom' }) {
  return (
    <svg viewBox="0 0 16 12" width="14" height="11" aria-hidden className="picon">
      <rect x="0.5" y="0.5" width="15" height="11" rx="2" fill="none" stroke="currentColor" />
      {side === 'left' && <rect x="1.5" y="1.5" width="4" height="9" rx="1" fill="currentColor" />}
      {side === 'right' && <rect x="10.5" y="1.5" width="4" height="9" rx="1" fill="currentColor" />}
      {side === 'bottom' && <rect x="1.5" y="7.5" width="13" height="3" rx="1" fill="currentColor" />}
    </svg>
  );
}
