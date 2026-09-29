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
  modeOf,
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
  groundId,
  type Rect,
  SEARCH_WEAPONS,
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
import { nightness } from '../view/paper';
import type { Frame3D, Model3D } from '../view/model3d';
import { JevTheater, setTheaterDark } from '../view/theater';
import { ApprovalLadder, Breakdown, Distribution, Frontier, OptionsMatrix, pct, StatTiles, Timeline, type MatrixCell } from './charts';
import { JevCard } from './jevCard';
import { personIn, personInCar, personLine, personOut } from './people';
import { placeAt, storyFor, TARGET_STORIES, type PlaceStory } from './stories';
import { Origami } from './origami';
import { readIntel } from './jevLive';
import { addSceneExtra } from '../view/lifeScene';
import { bakerLine, current, DONE, EARLY, ENDINGS, FIGURES, figureAt, HANDLER_BRIEF, inHours, loadMission, MEETS, missionEnts, newMission, SAMIR, saveMission, scatterLetters, setLive, STRANGER, type FigureId, type MissionState } from '../mission/mission';
import { EndCard, MissionHud, TalkCard, type Talk } from '../mission/MissionUI';

// The secret mission's people live in the same scene as everyone else, in both views.
addSceneExtra(missionEnts);
import { sound, type Bed, type CityCue } from './sound';
import { Chip, Dial, HoldButton, Seg, SourceBars, Step } from './parts';

const SEED = 7;
type HourWindow = 'any' | 'night' | 'quiet';
const WINDOWS: Record<HourWindow, number[]> = { any: [1, 4, 7, 10, 13, 16, 19, 22], night: [22, 23, 0, 1, 2, 3, 4], quiet: [0, 2, 4, 5, 20, 22] };
const SPEEDS = [0.5, 1, 2, 4, 8, 16, 32, 64, Infinity];
const HEADING_NAMES: Record<number, string> = { 0: '↑ N', 45: '↗ NE', 90: '→ E', 135: '↘ SE', 180: '↓ S', 225: '↙ SW', 270: '← W', 315: '↖ NW' };
const DISCOVERED_KEY = 'cd.discovered';
const INTRO_KEY = 'cd.intro';
const SESSION_START = performance.now();
// A phone or tablet: narrow, short, or any touch screen up to tablet width (even when the browser asks for the desktop site).
const PHONE = '(max-width: 760px), (max-height: 520px), (pointer: coarse) and (max-width: 1100px)';
/** Which prayer, if any, it is around now: loud ones (dawn, Friday noon) and softer ones through the day. */
function prayerNow(h: number, day: string): '' | 'dawn' | 'friday' | 'noon' | 'afternoon' | 'sunset' | 'night' {
  if (h >= 5 && h < 6) return 'dawn';
  if (day === 'friday' && h >= 11.5 && h < 12.5) return 'friday';
  if (h >= 12.5 && h < 13) return 'noon';
  if (h >= 15.5 && h < 16) return 'afternoon';
  if (h >= 18.5 && h < 19) return 'sunset';
  if (h >= 20 && h < 20.5) return 'night';
  return '';
}
let lastTrain = 0;
let lastCloseCall = 0;
type StepId = 'target' | 'weapon' | 'approach' | 'intel' | 'rules' | 'decide';

interface GuideStep {
  title: string;
  text: string;
  plan?: Partial<Plan>;
  layers?: Partial<Layers>;
  focus?: { cx: number; cy: number; zoom: number; dur?: number };
  open?: StepId;
  tab?: 'estimate' | 'jev';
  pulse?: boolean; // make the reach ring breathe
  drawer?: 'day' | 'jev';
  glow?: 'jev-card'; // softly outline this card so it's clear what the step means
  tour?: boolean; // once, on arrival: point at the warehouse, the school, the fuel depot, then back
  demo?: boolean; // replay a recorded search instead of running Jev live
  play?: boolean; // play through the day while on this step
  // Layers to turn on as the narrator reaches them; `at` is the share of the narration spoken so far.
  cues?: { at: number; layers: Partial<Layers> }[];
}

const GUIDE: GuideStep[] = [
  { title: 'The briefing', text: 'Warehouse 14 is said to hold weapons. Across Cotton Street is a school; round the corner, a fuel depot. Whether the warehouse may be struck at all is a legal judgment made by people. Everything after that is about the harm to everyone else.', plan: { target: 'warehouse', hour: 10, day: 'weekday', weapon: 'large', fuze: 'instant', heading: 90 }, layers: { danger: false, pattern: false, circle: false }, focus: { cx: 240, cy: 505, zoom: 4.5 }, open: 'target', tour: true },
  { title: "What's within reach?", text: "The ring is everything this bomb could hurt. Inside it: the school, the fuel depot, homes and shops. Protected places are outlined in blue, things that can burn in amber. Planners start by asking what's in here.", layers: { circle: true, protect: true }, focus: { cx: 240, cy: 520, zoom: 2.8 }, pulse: true },
  { title: "Who's inside right now?", text: "Nobody knows exactly who is inside. Overhead images only see people outdoors, not everyone carries a phone, and the census is years old. So the number is always a careful guess, and behind every guess are real people: at home, at work, asleep. Jev's reading of the reports is the first card on the right.", layers: { circle: false }, focus: { cx: 250, cy: 500, zoom: 4, dur: 2.8 }, open: 'intel', tab: 'estimate', glow: 'jev-card' },
  { title: 'Where it would hurt', text: "No bomb lands exactly where it's aimed: each replay comes down a little short or wide. The blast is deadly close in and fades within a few dozen metres. Fragments go much further, in straight lines down open streets, until they hit a wall, so one side of a street can be spared and the other not. Put together, over hundreds of replays: the chance someone standing here is killed or badly hurt.", layers: { danger: false, pattern: false, impacts: false }, cues: [{ at: 0.07, layers: { impacts: true } }, { at: 0.43, layers: { pattern: true } }, { at: 0.76, layers: { danger: true } }], focus: { cx: 240, cy: 505, zoom: 3.6 }, open: 'weapon' },
  { title: 'A smaller bomb', text: 'A smaller warhead with a delay fuze goes off inside, a floor down, and the walls catch most fragments. Watch the red shrink and the numbers fall. Go too small and the target survives.', plan: { weapon: 'small', fuze: 'delay' }, tab: 'estimate' },
  { title: 'Change the direction', text: 'Fragments lean the way the bomb travels. Drag the paper plane round, or turn the dial, so they fly west, away from the school.', plan: { heading: 270 }, open: 'approach' },
  { drawer: 'day', title: 'Change the hour', text: "Watch the day go by. The school fills in the morning and empties at night; homes do the opposite. The line below the map shows what each hour would cost. Drag it to stop on any hour.", plan: { hour: 2 }, play: true },
  { title: 'Who signs off', text: 'Hundreds of replays are boiled down to one cautious number: nine in ten come in at or below it. The higher it is, or if a protected place is within reach, the more senior the person who must approve.', open: 'rules' },
  { title: 'Let Jev search', text: 'Jev is there to keep collateral damage as low as it can be. It tries every way to do it: every weapon, fuze, direction, aim point and hour, 3,840 plans, each replayed 120 times, in parallel, so it sees the whole range of possible outcomes. It keeps the plan that still destroys the target and hurts the fewest people. Click any dot to try that plan.', tab: 'jev', demo: true },
  { title: 'Your decision', text: "Authorise strike opens the final decision: the numbers, who signs, the protected places in reach. Hold the red button to release. Afterwards the ruins stay. Pick another building and plan again, or rebuild the city.", open: 'decide' },
];

/** Scroll the page to y over `ms`, easing in and out. */
let glideId = 0;
function glide(y: number, ms: number) {
  const id = ++glideId;
  const from = window.scrollY;
  const t0 = performance.now();
  const step = (now: number) => {
    if (id !== glideId) return;
    const u = Math.min(1, (now - t0) / ms);
    const e = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
    window.scrollTo(0, from + (y - from) * e);
    if (u < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Seconds after impact before the verdict stamp: long enough to watch the blast, and anything it sets off, go up. */
const stampDelay = (o: { blasts: { at: number }[] }) => (o.blasts.length ? Math.max(...o.blasts.map((b) => b.at)) : 0) + 3;

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
  // The secret mission: where you are in the file, who's talking, and how it ended.
  const [mission, setMissionState] = useState<MissionState>(loadMission);
  const missionRef = useRef(mission);
  const setMission = (s: MissionState) => {
    missionRef.current = s;
    setLive(s);
    saveMission(s);
    setMissionState(s);
  };
  const [talk, setTalk] = useState<Talk | null>(null);
  // Dark mode: a switch at the foot of the page, remembered in this browser.
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem('cd-theme') === 'dark';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    setTheaterDark(dark);
    try {
      localStorage.setItem('cd-theme', dark ? 'dark' : 'light');
    } catch {
      /* no storage */
    }
  }, [dark]);
  const [missionEnd, setMissionEnd] = useState<{ result: 'clean' | 'hurt' | 'miss'; others: number; names: string[] } | null>(null);
  const [countMode, setCountMode] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [pop, setPop] = useState<{ bid: number; x: number; y: number; n: number } | null>(null);
  const [guide, setGuide] = useState<number | null>(null);
  const guideSeq = useRef(0);
  // Phones: no opening card and no big guide cards; the guide starts at once and the narrator does the telling.
  // A phone in either orientation: narrow when upright, short when turned on its side.
  const [phone, setPhone] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(PHONE).matches);
  useEffect(() => {
    const mq = matchMedia(PHONE);
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const mobileTimers = useRef<number[]>([]);
  // The map on its own, filling the screen: real full screen where the browser allows it (not on iPhone), otherwise the whole window.
  const [mapFull, setMapFull] = useState(false);
  const toggleMapFull = () => {
    const on = !mapFull;
    setMapFull(on);
    const d = document as Document & { webkitExitFullscreen?: () => void; webkitFullscreenElement?: Element };
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    try {
      if (on) {
        if (el.requestFullscreen) void el.requestFullscreen().catch(() => {});
        else el.webkitRequestFullscreen?.();
      } else if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      else if (d.webkitFullscreenElement) d.webkitExitFullscreen?.();
    } catch {
      /* the window-filling map is enough */
    }
    window.setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
  };
  useEffect(() => {
    const off = () => !document.fullscreenElement && setMapFull((f) => (f ? false : f));
    document.addEventListener('fullscreenchange', off);
    return () => document.removeEventListener('fullscreenchange', off);
  }, []);
  // The opening card, with its narration, greets you every time you open the site (not on phones, which go straight
  // into the guide, and not when a link opens a particular view of the map).
  const [intro, setIntro] = useState(() => {
    try {
      if (matchMedia(PHONE).matches) return false;
      return !location.hash;
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      if (!phone || localStorage.getItem(INTRO_KEY) || location.hash) return;
      localStorage.setItem(INTRO_KEY, '1');
    } catch {
      if (!phone) return;
    }
    const id = window.setTimeout(() => goGuide(0), 600);
    return () => clearTimeout(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // The opening card tells itself: its narration is queued as the page opens. Browsers hold all sound until the
  // first tap or key press, so it starts the moment you touch the page (or straight away, where the browser allows).
  const introVoice = useRef<{ start: number; dur: number } | null>(null);
  useEffect(() => {
    if (!intro || !sound.enabled) return;
    const t0 = performance.now();
    void sound.voice(0).then((d) => {
      if (d && sound.running()) introVoice.current = { start: t0, dur: d };
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Step in: sound on, the card tells its story, then moves on to the guide by itself. The button becomes Skip,
  // which wakes up after a moment, so one click can't jump straight past the card.
  const [telling, setTelling] = useState<{ ms: number; skip: boolean } | null>(null);
  const tellTimer = useRef(0);
  const stepIn = async () => {
    if (telling) {
      if (!telling.skip) return;
      window.clearTimeout(tellTimer.current);
      return closeIntro(true);
    }
    if (!sound.enabled) sound.setEnabled(true);
    const home = guideHome();
    focusRef.current = { cx: home.cx, cy: home.cy, zoom: home.zoom, dur: 3 }; // glide back in to the guide's home view
    const iv = introVoice.current;
    const elapsed = iv ? (performance.now() - iv.start) / 1000 : Infinity;
    let left = iv && elapsed < iv.dur - 1 ? iv.dur - elapsed : 0;
    if (!left) left = await sound.voice(0); // not playing yet (or already over): tell it now
    const ms = left ? left * 1000 + 700 : 5000;
    setTelling({ ms, skip: false });
    window.setTimeout(() => setTelling((t) => (t ? { ...t, skip: true } : t)), 1500);
    tellTimer.current = window.setTimeout(() => closeIntro(true), ms);
  };
  // Closing the opening card: it lifts away and the city clears, then the guide begins.
  const [introLeaving, setIntroLeaving] = useState(false);
  const closeIntro = (step: boolean) => {
    try {
      localStorage.setItem(INTRO_KEY, '1');
    } catch {
      /* fine: it just shows again next time */
    }
    window.clearTimeout(tellTimer.current);
    setTelling(null);
    if (step && !sound.enabled) sound.setEnabled(true);
    if (!step) sound.stopVoice(); // looking around: the card's story stops with it
    setIntroLeaving(true);
    window.setTimeout(() => {
      setIntro(false);
      setIntroLeaving(false);
      if (step) goGuide(0);
    }, 480);
  };
  const [aimDrag, setAimDrag] = useState(false);
  const [dayPlay, setDayPlay] = useState(false);
  // Explore: click a building to see who's inside. Target: click or drag the target onto any building.
  const [mapMode, setMapMode] = useState<'explore' | 'target'>('explore');
  const [strikeOpen, setStrikeOpen] = useState(false);
  // Ready the strike's sounds while the decision is still open, so they land with the plane, not after it.
  useEffect(() => {
    if (strikeOpen) sound.preload(['aircraft-approach', 'aircraft-cargo', 'bomb-whistle', 'impact', 'impact-mega', 'stamp', 'after-0', 'after-few', 'after-some', 'after-many', 'after-mass', 'radio-04-away', 'radio-06-destroyed', 'radio-07-intact', 'radio-08-bda']);
  }, [strikeOpen]);
  // A briefed target's story, shown (and narrated) when you pick it from the top bar.
  const [story, setStory] = useState<keyof typeof TARGET_STORIES | null>(null);
  const storyTimer = useRef(0);
  const [spotlight, setSpotlight] = useState<MapFrame['spotlight']>(null);
  const tourTimers = useRef<number[]>([]);
  const tipHide = useRef(0);
  const [place, setPlace] = useState<{ story: PlaceStory; x: number; y: number } | null>(null);
  const [retarget, setRetarget] = useState<{ x: number; y: number; bid: number | null } | null>(null);
  const [explored, setExplored] = useState(0);
  const [toast, setToast] = useState<Place | null>(null);
  const [view, setView] = useState<'map' | 'model'>('map');
  const viewRef = useRef(view);
  viewRef.current = view;
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
  const [storiesOpen, setStoriesOpen] = useState(false);
  const storiesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!storiesOpen) return;
    const off = (e: PointerEvent) => !storiesRef.current?.contains(e.target as Node) && setStoriesOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setStoriesOpen(false);
    window.addEventListener('pointerdown', off);
    window.addEventListener('keydown', esc);
    return () => (window.removeEventListener('pointerdown', off), window.removeEventListener('keydown', esc));
  }, [storiesOpen]);
  const [simulated, setSimulated] = useState(0);

  // Jev's search.
  const [status, setStatus] = useState<PoolStatus>({ running: false, done: 0, total: 0, busy: 0, workers: 0, rate: 0 });
  const [results, setResults] = useState<Scored[]>([]);
  const [testing, setTesting] = useState<Candidate | null>(null);
  const [follow, setFollow] = useState(true);
  const [speed, setSpeed] = useState(SPEEDS.length - 1); // flat out: about 30–60 seconds for a full search
  const [minPk, setMinPk] = useState(0.85);
  const [hours, setHours] = useState<HourWindow>('any');
  const [allowed, setAllowed] = useState<WeaponId[]>(SEARCH_WEAPONS.map((w) => w.id));
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
  const focusRef = useRef<{ cx: number; cy: number; zoom: number; dur?: number } | null>(null);
  // The guide's home view: Warehouse 14, the school and the depot, with the canal off to the east.
  const guideHome = () => {
    const m0 = mapRef.current;
    const base = m0 ? m0.cam().s / m0.view.zoom : 1;
    const cw = canvasRef.current?.clientWidth ?? 1000;
    const ch = canvasRef.current?.clientHeight ?? 700;
    // The zoom that shows about w metres across (and 0.6 w down).
    const fit = (w: number) => Math.max(1, Math.min(cw / w, ch / (w * 0.6)) / base);
    // Home: close on Warehouse 14 and the school across the street, the depot at the bottom edge.
    const zoom = fit(300);
    // Pulled back: the district around it out to the canal, never so far that the desert shows.
    const out = Math.min(zoom * 0.75, fit(820));
    const hw = cw / 2 / (base * out);
    return { cx: 256, cy: 522, zoom, back: { cx: Math.max(hw - 40, Math.min(452, world.city.w - hw + 10)), cy: 550, zoom: out } };
  };

  // The guide's card opens over the city: pull back a little (not so far the desert shows), for a sense of scale.
  useEffect(() => {
    if (!intro) return;
    focusRef.current = { ...guideHome().back, dur: 1.8 };
  }, [intro]); // eslint-disable-line react-hooks/exhaustive-deps
  const canvas3dRef = useRef<HTMLCanvasElement>(null);
  const down3d = useRef<{ x: number; y: number } | null>(null);
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
      bus: rects((x) => x.kind === 'busstation', world.spaces),
      hospital: rects((x) => x.kind === 'hospital', world.buildings),
      industry: world.blocks.filter((q) => q.district === 'kilns'),
      camp: world.blocks.filter((q) => q.district === 'camp'),
      groves: world.blocks.filter((q) => q.district === 'groves'),
      rail: [{ x: world.extras.rail.x0, y: world.extras.rail.y - 3, w: world.extras.rail.x1 - world.extras.rail.x0, h: 6 }],
      desert: [{ x: world.city.w + 40, y: -300, w: world.w - world.city.w + 300, h: world.h + 600 }],
      mosque: [...rects((x) => x.kind === 'mosque', world.buildings), ...world.spaces.filter((s) => s.name === 'Mosque courtyard').map((s) => s.rect)],
      taps: world.spaces.filter((q) => q.kind === 'plaza' && q.district === 'camp').map((q) => q.rect),
      bricks: rects((x) => x.kind === 'brickyard', world.spaces),
      pump: world.buildings.filter((b) => b.name === 'Pump House').flatMap((b) => b.rects),
    };
  }, [world]);
  const districtHere = (x: number, y: number) => {
    if (Math.abs(x - riverX(y)) < world.river.width / 2 + 20) return 'canal';
    if (x > world.city.w + 40) return 'desert';
    const bl = world.blocks.find((q) => x >= q.x - 8 && x <= q.x + q.w + 8 && y >= q.y - 8 && y <= q.y + q.h + 8);
    return bl?.district ?? '';
  };
  useEffect(() => {
    if (!soundOn) return;
    const h = plan.hour;
    const day = h < 5 || h > 20.5 ? 0 : h < 7 ? (h - 5) / 2 : h > 18.5 ? (20.5 - h) / 2 : 1;
    const busy = h >= 7 && h < 20 ? 1 : 0.35;
    let lastZoom = 0;
    const tick = () => {
      const m = mapRef.current;
      // In 3D, listen from where the camera looks, and how high it is (its distance, as a map zoom).
      const at = view === 'model' ? modelRef.current?.lookingAt() : null;
      const v = at ? { cx: at.x, cy: at.y, zoom: Math.max(0.5, Math.min(14, 600 / at.dist)) } : m?.view;
      if (!m || !v) return;
      const close = Math.max(0, Math.min(1, (v.zoom - 1.3) / 4)); // 0 high above, 1 down at the roofs
      const hush = striking ? 0.3 : 1;
      sound.setAltitude(close);
      // A soft rush of air when you zoom a long way quickly.
      if (lastZoom && Math.abs(Math.log(v.zoom / lastZoom)) > 0.45) sound.whoosh(v.zoom < lastZoom);
      lastZoom = v.zoom;
      // Left or right: where a place sits on screen.
      const { s: px } = m.cam();
      const half = (canvasRef.current?.clientWidth ?? 800) / 2;
      const panOf = (x: number) => Math.max(-0.8, Math.min(0.8, ((x - v.cx) * px) / half));
      // One place at a time, and only up close: the nearest place you're looking at, within a short distance.
      const reach = 25 + close * 35; // metres
      const near = (qs: Rect[]): [number, number] => {
        let d = Infinity;
        let nx = v.cx;
        for (const q of qs) {
          const x = Math.max(q.x, Math.min(q.x + q.w, v.cx));
          const y = Math.max(q.y, Math.min(q.y + q.h, v.cy));
          const dd = Math.hypot(x - v.cx, y - v.cy);
          if (dd < d) [d, nx] = [dd, x];
        }
        return [d, nx];
      };
      const school = plan.day !== 'friday' && h >= 7.5 && h < 14;
      const rx = riverX(v.cy);
      const candidates: [Bed, [number, number], number][] = [
        ['amb-market', near(zones.market), day * 0.7],
        ['amb-park', near(zones.park), (0.3 + 0.7 * day) * 0.3],
        ['amb-pitch', near(zones.pitch), day * 0.5],
        ['amb-school', near(zones.school), school ? 0.5 : 0],
        ['amb-traffic', near(zones.traffic), busy * 0.35],
        ['amb-water', [Math.max(0, Math.abs(v.cx - rx) - world.river.width / 2), rx], 0.5],
        ['amb-industry', near(zones.industry), (0.5 + 0.5 * busy) * 0.4],
        ['amb-camp', near(zones.camp), (0.45 + 0.55 * day) * 0.45],
        ['amb-groves', near(zones.groves), (0.3 + 0.7 * day) * 0.4],
        // The mosque courtyard: quiet most of the day, busier around prayers, fullest at Friday noon.
        // The mosque's own sounds (the courtyard water, the gathering) are for the day; at night it is quiet.
        ['amb-mosque', near(zones.mosque), (h >= 21 || h < 5 ? 0 : 1) * (prayerNow(h, plan.day) === 'friday' ? 0.75 : prayerNow(h, plan.day) ? 0.55 : 0.35) * (0.4 + 0.6 * day)],
      ];
      let pick: [Bed, number, number] | null = null;
      if (close > 0.3)
        for (const [bed, [d, x], loud] of candidates) {
          if (loud <= 0 || d > reach) continue;
          const lvl = loud * (1 - d / reach) * Math.min(1, (close - 0.3) / 0.3);
          if (!pick || lvl > pick[1]) pick = [bed, lvl, panOf(x)];
        }
      const local = pick?.[1] ?? 0;
      // Out in the desert the city falls away behind you: wind over sand, a goat bell, nothing else.
      const away = Math.max(0, Math.min(1, (v.cx - (world.city.w + 30)) / 140));
      const base = (1 - Math.min(0.6, local * 1.2)) * 0.7 * (1 - away * 0.85); // the city dips under the place you're at
      const levels: Partial<Record<Bed, number>> = {
        'amb-city-day': day * base * hush,
        'amb-city-night': (1 - day) * base * hush,
        'amb-cell-room': 0.18,
        'amb-wind': close < 0.15 ? (1 - close / 0.15) * 0.35 * hush * (1 - away) : 0,
        'amb-desert': away * 0.5 * hush,
      };
      const pans: Partial<Record<Bed, number>> = {};
      for (const [bed] of candidates) levels[bed] = pick && pick[0] === bed ? pick[1] * hush : 0;
      if (pick) pans[pick[0]] = pick[2];
      void sound.ambience(levels, pans);
      // Come close to the mosque by day, in the map or in 3D, and you hear the call from there: once each time you come.
      const look = view === 'model' ? modelRef.current?.lookingAt() : null;
      const lx = look ? look.x : v.cx;
      const ly = look ? look.y : v.cy;
      const lClose = look ? Math.max(0, Math.min(1, (900 / look.dist - 1.3) / 4)) : close;
      let dMosque = Infinity;
      for (const q of zones.mosque) dMosque = Math.min(dMosque, Math.hypot(Math.max(q.x, Math.min(q.x + q.w, lx)) - lx, Math.max(q.y, Math.min(q.y + q.h, ly)) - ly));
      // Its level follows how close you are, and it fades away as you zoom out or move off (the timed calls don't).
      // Not at night: after the evening prayer the call close by stays silent (the timed city-wide calls still come).
      const nightHere = h >= 21 || h < 5;
      const prox = nightHere || dMosque >= 280 || lClose < 0.12 ? 0 : (1 - dMosque / 280) * Math.min(1, lClose / 0.5);
      const minaret = world.buildings.find((b) => b.kind === 'minaret');
      const callPan = look || !minaret ? 0 : panOf(minaret.cx);
      let begin = false;
      if (prox === 0) heardClose.current = '';
      else if (!striking && lClose > 0.25 && dMosque < 180 && !heardClose.current && performance.now() - lastCloseCall > 45_000) {
        heardClose.current = 'here';
        lastCloseCall = performance.now();
        begin = true;
      }
      void sound.nearCall(striking ? 0 : 0.2 * prox * hush, callPan, begin);
      // Now and then, one small sound that fits where you are and the hour: about every twenty seconds.
      if (!striking && close > 0.15 && Math.random() < 0.02) {
        const at = districtHere(v.cx, v.cy);
        const home = at === 'terraces' || at === 'quarter' || at === 'tinhill' || at === 'oldtown' || at === 'garden';
        const weekday = plan.day !== 'friday';
        const night = day < 0.3;
        const dawn = h >= 5 && h < 7.5;
        const nearTo = (qs: Rect[], m: number) => near(qs)[0] < m;
        const out = at === 'kilns' || at === 'camp' || at === 'groves';
        // The freight train: never in the first minute and a half, at most every four minutes. At night it carries across the whole city.
        const nearRail = nearTo(zones.rail, 200);
        const trainOk = performance.now() - SESSION_START > 90_000 && performance.now() - lastTrain > 240_000;
        // By the mosque: pigeons, and at prayer times people arriving, slipping off their shoes. No mopeds or radios.
        const byMosque = nearTo(zones.mosque, 110) && !night;
        const pool: [CityCue, number][] = at === 'desert'
          ? [['cue-goats', night ? 0.2 : 2], ['cue-dog', night ? 1 : 0.3], ['cue-canvas', 0.8]]
          : byMosque
          ? [['cue-pigeons', 1.5], ['cue-gathering', prayerNow(h, plan.day) ? 2.5 : 0.15]]
          : night
          ? [['cue-dog', 1], ...(at === 'tinhill' || at === 'camp' ? [['cue-generator', 2] as [CityCue, number]] : []), ...(at === 'canal' || Math.abs(v.cx - rx) < 60 ? [['cue-frogs', 2] as [CityCue, number]] : []), ['cue-train', trainOk ? (nearRail ? 0.8 : 0.35) : 0]]
          : dawn
            ? [['cue-rooster', at === 'tinhill' || at === 'oldtown' || out ? 2 : 1], ['cue-shutter', at === 'market' || at === 'oldtown' ? 2 : 0.5], ['cue-pigeons', 0.3], ['cue-pump', at === 'groves' ? 3 : 0], ['cue-jerrycan', nearTo(zones.taps, 60) ? 3 : 0], ['cue-bricks', at === 'kilns' ? 2 : 0]]
            : [
                ['cue-train', trainOk && nearRail ? 0.6 : 0],
                ['cue-pump', at === 'groves' && (h < 10 || h >= 16) ? 2 : 0],
                ['cue-canvas', at === 'camp' ? 2 : 0],
                ['cue-jerrycan', nearTo(zones.taps, 60) && (h < 10 || h >= 17) ? 2.5 : 0],
                ['cue-bricks', nearTo(zones.bricks, 70) && (h < 11 || h >= 15) ? 2.5 : 0],
                ['cue-pigeons', 0.3],
                ['cue-moped', out ? 0.3 : 0.8],
                ['cue-workshop', at === 'workshops' && weekday && h >= 8 && h < 17 ? 3 : 0],
                ['cue-sellers', at === 'market' && h >= 9 && h < 14 ? 3 : 0],
                ['cue-bus', nearTo(zones.bus, 90) && h >= 6 && h < 21 ? 3 : 0],
                ['cue-chimes', at === 'garden' ? 2 : 0],
                ['cue-kitchen', home && ((h >= 6 && h < 8.5) || (h >= 18 && h < 20.5)) ? 2 : 0],
                ['cue-radio-music', home && h >= 10 ? 0.8 : 0],
                ['cue-siren', nearTo(zones.hospital, 160) ? 0.3 : 0],
              ];
        const total = pool.reduce((n, [, w]) => n + w, 0);
        let r = Math.random() * total;
        const pick = pool.find(([, w]) => (r -= w) < 0)?.[0];
        if (pick === 'cue-train') lastTrain = performance.now();
        if (pick) sound.cue(pick, (Math.random() - 0.5) * 1.4, pick === 'cue-train' ? (nearRail ? 0.14 : 0.06) : (pick === 'cue-siren' ? 0.1 : pick === 'cue-pigeons' ? 0.08 : 0.16) + 0.1 * close);
      }
    };
    tick();
    const id = window.setInterval(tick, 400);
    return () => clearInterval(id);
  }, [soundOn, plan.hour, plan.day, striking, zones, view]); // eslint-disable-line react-hooks/exhaustive-deps
  // The call to prayer: at dawn and before Friday noon prayers, and softer at the other prayers. It comes from the
  // minaret: clear and close when you're near the mosque, faint and far off across the city, placed left or right.
  const prayerKey = useRef('');
  const heardClose = useRef(''); // the prayer already heard from close by, so coming near again doesn't repeat it
  const callToPrayer = (k: string) => {
    const loud = k === 'dawn' || k === 'friday';
    const m = mapRef.current;
    const min = world.buildings.find((b) => b.kind === 'minaret');
    let near = 0.3;
    let pan = 0;
    if (m && min) {
      const v = m.view;
      const close = Math.max(0, Math.min(1, (v.zoom - 1.3) / 4));
      near = Math.max(0, 1 - Math.hypot(min.cx - v.cx, min.cy - v.cy) / 450) * (0.45 + 0.55 * close);
      const half = (canvasRef.current?.clientWidth ?? 800) / 2;
      pan = Math.max(-0.8, Math.min(0.8, ((min.cx - v.cx) * m.cam().s) / half));
    }
    // Soft but clearly there: a far-off voice over the city, clearer near the mosque, never loud.
    sound.cue('amb-call-to-prayer', pan, (loud ? 0.13 : 0.07) + near * (loud ? 0.15 : 0.1));
  };
  useEffect(() => {
    if (!soundOn) return;
    const k = prayerNow(plan.hour, plan.day);
    if (k && k !== prayerKey.current) callToPrayer(k);
    prayerKey.current = k;
  }, [soundOn, plan.hour, plan.day]); // eslint-disable-line react-hooks/exhaustive-deps

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
          setMatrix(e.data.out.map((s) => ({ weapon: s.c.weapon, fuze: s.c.fuze, label: [weapon(s.c.weapon).short, modeOf(s.c.weapon, s.c.fuze).name], p90: s.p90, pk: s.pk })));
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
      const cands: Candidate[] = SEARCH_WEAPONS.flatMap((w) => FUZES.map((f) => ({ weapon: w.id, fuze: f.id, heading: plan.heading, aim: 'custom' as const, hour: plan.hour })));
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
  const resultsRef = useRef(results);
  resultsRef.current = results;
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
  const demoDone = useRef<((all: Scored[]) => void) | null>(null); // what the guide does when the recorded search finishes
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
    const per = Math.ceil(all.length / 30); // about three seconds: quick, so the guide can move on
    demoTimer.current = window.setInterval(() => {
      n = Math.min(all.length, n + per);
      setResults(all.slice(0, n));
      setSimulated(n * 120);
      setStatus({ running: n < all.length, done: n, total: all.length, busy: n < all.length ? 4 : 0, workers: 4, rate: per * 10 });
      if (n >= all.length) {
        stopDemo();
        const done = demoDone.current;
        demoDone.current = null;
        done?.(all);
      }
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
    spotlight,
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
    // Camera moves are timed flights: they ease in and out, zoom at an even rate, and take longer the further they go.
    let flight: { f: { cx: number; cy: number; zoom: number }; from: { cx: number; cy: number; zoom: number }; t: number; dur: number } | null = null;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const f = focusRef.current;
      if (!f) flight = null;
      else {
        const v = map.view;
        if (!flight || flight.f !== f) {
          const { s } = map.cam();
          const far = Math.hypot(f.cx - v.cx, f.cy - v.cy) * s + Math.abs(Math.log(f.zoom / v.zoom)) * 350;
          flight = { f, from: { cx: v.cx, cy: v.cy, zoom: v.zoom }, t: 0, dur: f.dur ?? 0.8 + Math.min(1, far / 900) };
        }
        flight.t += dt;
        const u = Math.min(1, flight.t / flight.dur);
        const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; // ease in and out
        const a = flight.from;
        v.zoom = Math.exp(Math.log(a.zoom) + (Math.log(f.zoom) - Math.log(a.zoom)) * e);
        v.cx = a.cx + (f.cx - a.cx) * e;
        v.cy = a.cy + (f.cy - a.cy) * e;
        map.clampView();
        if (u >= 1) {
          focusRef.current = null;
          flight = null;
        }
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

  // Build the 3D model ahead of time, quietly, while the opening card is up: the briefing ends in 3D,
  // and the switch should be instant. It stays paused while the flat map is showing.
  const [want3d, setWant3d] = useState(false);
  useEffect(() => {
    const idle = (window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const id = window.setTimeout(() => (idle ? idle(() => setWant3d(true), { timeout: 2500 }) : setWant3d(true)), 1200);
    return () => window.clearTimeout(id);
  }, []);
  useEffect(() => {
    if (modelRef.current) modelRef.current.paused = view !== 'model';
  }, [view, modelReady]);
  useEffect(() => {
    if ((view !== 'model' && !want3d) || modelRef.current) return;
    let alive = true;
    import('../view/model3d').then(({ Model3D }) => {
      if (!alive || !canvas3dRef.current || !labels3dRef.current) return;
      const getFrame = (): Frame3D | null => {
        const f = frameRef.current;
        const m = mapRef.current;
        if (!f || !m) return null;
        const st = strikeRef.current;
        const t = m.strikeTime();
        return { world: f.world, plan: f.plan, pop: f.pop, est: f.est, layers: f.layers, circleR: f.circleR, outcome: f.outcome, ruins: f.ruins, strike: st && t != null ? { ...st, t } : null, walkers: m.crowd.visible(), cars: m.crowd.cars, clock: m.time };
      };
      modelRef.current = new Model3D(canvas3dRef.current, labels3dRef.current, world, getFrame);
      modelRef.current.paused = viewRef.current !== 'model';
      setModelReady(true);
    });
    return () => {
      alive = false;
    };
  }, [view, world, want3d]);
  // Switching views keeps your place: the 3D camera looks at the middle of the flat map, from a height that
  // matches the zoom, and the flat map comes back centred on whatever the 3D camera was looking at.
  const lastView = useRef(view);
  const tourBack = useRef(false);
  useEffect(() => {
    const was = lastView.current;
    lastView.current = view;
    const map = mapRef.current;
    const model = modelRef.current;
    if (!map || !model || !modelReady) return;
    const K = 900; // metres of camera distance at map zoom 1
    if (view === 'model') model.jumpTo(map.view.cx, map.view.cy, K / map.view.zoom);
    else if (was === 'model') {
      const l = model.lookingAt();
      // Coming back from the briefing's 3D look, the next step's own camera move stands; otherwise stop any flight.
      if (tourBack.current) tourBack.current = false;
      else focusRef.current = null;
      map.view.zoom = K / l.dist;
      map.view.cx = l.x;
      map.view.cy = l.y;
      map.clampView();
    }
  }, [view, modelReady]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const openPeople = (wx: number, wy: number, px: number, py: number, direct = false) => {
    // Clicking the map while a card is open just closes it (except when counting people, building after building).
    if (!direct && (place || pop)) {
      setPlace(null);
      return setPop(null);
    }
    const b = mapRef.current?.buildingAt(wx, wy);
    if (b?.id === target.buildingId) return setPop(null);
    if (!b || !b.capacity) {
      // Up close only named places (a park, a square) have a card; streets, the canal and whole districts
      // only when you're high above the city.
      // Named places (a park, a square) show on hover; a click opens a card only for districts and streets,
      // and only when you're high above the city.
      const high = (mapRef.current?.view.zoom ?? 1) <= 2;
      if (!high) return;
      const st = placeAt(world, wx, wy);
      if (st.named) return;
      return setPlace({ story: st, x: px, y: py });
    }
    setPlace(null);
    setPop({ bid: b.id, x: px, y: py, n: obs[b.id] ?? shownCount(popNow, b) });
  };
  // Can this building be made the target? Not a ruin, not the current target, and someone must use it.
  const targetable = (b: ReturnType<MapView['buildingAt']>) => !!b && !ruins.includes(b.id) && b.id !== target.buildingId;
  // Target mode aims wherever you click: the building under the pointer, or else that very spot on the ground.
  const pickAt = (x: number, y: number) => {
    const under = mapRef.current?.buildingAt(x, y) ?? null;
    return targetable(under) ? under : null;
  };
  const aimAt = (x: number, y: number) => {
    if (onBridge(x, y)) return chooseTarget('bridge');
    const b = mapRef.current?.buildingAt(x, y) ?? null;
    if (b && ruins.includes(b.id)) return; // a ruin can't be the target again
    if (b && b.id === target.buildingId) return;
    if (b) return retargetTo(b.id);
    chooseTarget(groundId(x, y));
  };
  // The bridge isn't a building, so Target mode checks for it by position.
  const onBridge = (x: number, y: number) => {
    const q = targetOf(world, 'bridge').rect;
    return plan.target !== 'bridge' && !ruins.includes(BRIDGE_RUIN) && x >= q.x && x <= q.x + q.w && y >= q.y - 1 && y <= q.y + q.h + 1;
  };
  const retargetTo = (bid: number) => {
    const briefed = world.targets.find((t) => t.buildingId === bid);
    chooseTarget(briefed ? briefed.id : `b:${bid}`);
  };
  // Two fingers on the map: pinch to zoom around the point between them, and move them to pan.
  const fingers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; zoom: number; wx: number; wy: number } | null>(null);
  const pinchState = () => {
    const [a, b] = [...fingers.current.values()];
    return { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };
  const onDown = (e: React.PointerEvent) => {
    const m = mapRef.current;
    if (!m || striking) return;
    if (e.pointerType === 'touch') fingers.current.set(e.pointerId, localXY(e));
    if (fingers.current.size === 2) {
      // A second finger: stop whatever the first was doing, and start pinching.
      drag.current = null;
      setAimDrag(false);
      setHeadingDrag(false);
      setRetarget(null);
      const s = pinchState();
      const w = m.toWorld(s.mx, s.my);
      pinch.current = { d: s.d, zoom: m.view.zoom, wx: w.x, wy: w.y };
      focusRef.current = null;
      (e.target as Element).setPointerCapture(e.pointerId);
      return;
    }
    if (fingers.current.size > 2) return;
    stopTour(); // touching the map ends the guide's little tour
    const p = localXY(e);
    const w = m.toWorld(p.x, p.y);
    focusRef.current = null;
    if (countMode) return openPeople(w.x, w.y, p.x, p.y, true);
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
    if (fingers.current.has(e.pointerId)) fingers.current.set(e.pointerId, localXY(e));
    if (pinch.current && fingers.current.size >= 2) {
      const pc = pinch.current;
      const s = pinchState();
      m.view.zoom = pc.zoom * (s.d / pc.d);
      m.clampView();
      // Keep the spot that was between the fingers under them.
      const now = m.toWorld(s.mx, s.my);
      m.view.cx += pc.wx - now.x;
      m.view.cy += pc.wy - now.y;
      m.clampView();
      return;
    }
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
    let named: PlaceStory;
    const who = outcome ? personAtPoint(px, py, wx, wy) : '';
    const fig = !who ? figureUnder(px, py, wx, wy) : null;
    if (who) text = who;
    else if (fig) {
      const f = FIGURES.find((q) => q.id === fig);
      text = fig === 'moto' ? '<b>A red motorbike</b><span>Click to look</span>' : fig === 'samir' ? `<b>${SAMIR.name}</b><span>The courier · click</span>` : `<b>${f!.name}</b><span>${f!.role} · click to talk</span>`;
    }
    else if (b && mapMode === 'target') {
      const why = b.id === target.buildingId ? 'The target. Drag it onto another building' : ruins.includes(b.id) ? 'Already destroyed' : `Click to make this the target${b.protected ? ' · protected site' : ''}`;
      text = `<b>${placeName(b)}</b><span>${why}</span>`;
    } else if (!b && mapMode === 'target') {
      text = onBridge(wx, wy) ? '<b>Boulevard bridge</b><span>Click to make this the target</span>' : '<b>Open ground</b><span>Click to target this spot</span>';
    } else if (!b && mapMode === 'explore' && (named = placeAt(world, wx, wy)).named) {
      text = `<b>${named.title}</b><span>${named.line.split('. ')[0].replace(/\.$/, '')}.</span>`;
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
  // Someone from the secret file under the pointer (a few pixels' grace, more on a phone).
  const figureUnder = (px: number, py: number, wx: number, wy: number) => {
    const m = mapRef.current;
    if (!m) return null;
    const r = Math.abs(m.toWorld(px + (phone ? 18 : 11), py).x - wx);
    return figureAt(wx, wy, Math.max(1.4, r), plan.hour);
  };
  // A red ring under the pointer: who they were.
  const personAtPoint = (px: number, py: number, wx: number, wy: number) => {
    const m = mapRef.current;
    if (!m) return '';
    const r = Math.abs(m.toWorld(px + (phone ? 16 : 9), py).x - wx);
    const h = m.hurtAt(wx, wy, r);
    if (!h) return '';
    const friday = plan.day === 'friday';
    if (h.kind === 'in') return personLine(personIn(h.b, h.i, plan.hour, friday), placeName(h.b));
    if (h.kind === 'car') return personLine(personInCar(h.c), 'in a car');
    const here = placeAt(world, h.w.x, h.w.y);
    return personLine(personOut(h.w, plan.hour, here.named ? here.title : undefined), here.named ? here.title : undefined);
  };
  const onUp = (e: React.PointerEvent) => {
    fingers.current.delete(e.pointerId);
    if (pinch.current) {
      // Lifting a finger ends the pinch; nothing counts as a tap.
      if (fingers.current.size < 2) pinch.current = null;
      drag.current = null;
      return;
    }
    const d = drag.current;
    drag.current = null;
    setAimDrag(false);
    setHeadingDrag(false);
    setRetarget(null);
    const m = mapRef.current;
    if (d?.mode === 'retarget' && m && e.type === 'pointerup') {
      const p = localXY(e);
      const w = m.toWorld(p.x, p.y);
      aimAt(w.x, w.y);
      return;
    }
    if (d?.mode === 'pan' && m && e.type === 'pointerup' && mapMode === 'target') {
      const p = localXY(e);
      if (Math.hypot(p.x - d.x, p.y - d.y) < 5) {
        const w = m.toWorld(p.x, p.y);
        const who = figureUnder(p.x, p.y, w.x, w.y);
        if (who) return onFigure(who);
        aimAt(w.x, w.y);
      }
      return;
    }
    if (d?.mode === 'pan' && m && e.type === 'pointerup') {
      const p = localXY(e);
      if (Math.hypot(p.x - d.x, p.y - d.y) < 5) {
        const w = m.toWorld(p.x, p.y);
        // After a strike, tapping a red ring says who it was (phones have no hover).
        const who = outcome && !striking ? personAtPoint(p.x, p.y, w.x, w.y) : '';
        const el = tipRef.current;
        if (who && el) {
          el.innerHTML = who;
          el.style.display = '';
          el.style.transform = `translate(${Math.min(p.x + 10, (canvasRef.current?.clientWidth ?? 400) - 200)}px, ${p.y + 12}px)`;
          window.clearTimeout(tipHide.current);
          tipHide.current = window.setTimeout(hideTip, 4000);
          return;
        }
        const fig = figureUnder(p.x, p.y, w.x, w.y);
        if (fig) return onFigure(fig);
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
    // A picked building, or a protected place of worship, starts unconfirmed: whether it may be struck is for people to decide.
    setLawful(!id.startsWith('b:') && !id.startsWith('g:') && id !== 'mosque');
    setPlan({ target: id, aimX: a.x, aimY: a.y, hardness: t.hardness, stored: t.stored });
    // The camera stays where you put it: choosing a target never pans or zooms.
    poolRef.current?.stop();
    setResults([]);
    setPhase('idle');
    setLog([]);
    setTesting(null);
  };
  // Picking one of the four briefed targets: go there, and tell its story (in the narrator's voice, if sound is on).
  const pickPreset = (id: TargetId) => {
    chooseTarget(id);
    if (id === 'mosque') setPlan({ hour: 12.5, day: 'friday' }); // the one hour he is said to be there
    const c = targetCentre(targetOf(world, id));
    const telling = guide == null && id in TARGET_STORIES;
    const offset = telling && !phone; // on a phone the story is only a small title, so no need to make room
    // With a story showing (bottom-left), sit the target up and to the right so both can be seen.
    const m = mapRef.current;
    const px = m ? 1 / m.cam().s : 0.4;
    const zk = 3.2 / (m?.view.zoom || 3.2);
    flyTo(offset ? c.x - 200 * px * zk : c.x, offset ? c.y + 90 * px * zk : c.y, telling ? 3.2 : 3.6);
    if (!telling) return;
    const k = id as keyof typeof TARGET_STORIES;
    setStory(k);
    window.clearTimeout(storyTimer.current);
    void sound.narrate(`voice/story-${k}`).then((secs) => {
      storyTimer.current = window.setTimeout(() => setStory((s) => (s === k ? null : s)), Math.max(14, secs + 3) * 1000);
    });
  };
  const closeStory = () => {
    setStory(null);
    window.clearTimeout(storyTimer.current);
    sound.stopVoice();
  };
  const goGuide = (i: number | null) => {
    if (i != null) setStory(null);
    setGuide(i);
    mobileTimers.current.forEach(clearTimeout);
    mobileTimers.current = [];
    demoDone.current = null;
    // Only the steps about Jev's own panels (its reading of the reports, its search) are worth a trip down the page.
    if (phone && i != null && GUIDE[i].tab && (GUIDE[i].glow || GUIDE[i].demo)) {
      // On a phone the panels sit under the map: glide down to the one this step is about, then back up.
      const demo = !!GUIDE[i].demo;
      // Jev's search is quick about it; the reading of the reports takes its time, a slow glide each way.
      const ms = demo ? 700 : 1600;
      const down = () => glide((document.querySelector('.mobile-tabs')?.getBoundingClientRect().top ?? 0) + window.scrollY, ms);
      const up = () => glide(0, ms);
      mobileTimers.current = [window.setTimeout(down, demo ? 1200 : 3200), ...(demo ? [] : [window.setTimeout(up, 10500)])];
      // At Jev's step: the moment the search finishes, try its pick, as if you'd tapped it, and go back up to see it on the map.
      if (demo)
        demoDone.current = (all) => {
          const b = best(all, minPk);
          if (b) applyCandidate(b.c);
          mobileTimers.current.push(window.setTimeout(up, 900));
        };
    }
    stopDemo();
    stopTour();
    // Past the briefing, the guide works on the flat map: leave 3D, however it got there.
    if (guide === 0 && i !== 0 && viewRef.current === 'model') {
      modelRef.current?.stopOrbit();
      tourBack.current = true;
      setView('map');
    }
    if (i != null && GUIDE[i].tour) startTour();
    if (i != null && GUIDE[i].demo) void startDemo();
    else if (phaseRef.current !== 'idle' && (i == null || (guide != null && GUIDE[guide].demo))) {
      // Leaving the demo: clear it, so nothing recorded is mistaken for a live search.
      setResults([]);
      setPhase('idle');
      setLog([]);
    }
    // "Change the hour" plays through the day; any other step (or leaving the guide) stops it.
    setDayPlay(i != null && !!GUIDE[i].play);
    if (i == null) {
      guideSeq.current++;
      // Leaving the guide: back to the standard view, every layer on.
      setLayers({ people: true, circle: true, pattern: true, impacts: true, labels: true, protect: true, danger: true });
      return sound.stopVoice();
    }
    const g = GUIDE[i];
    const seq = ++guideSeq.current;
    void sound.voice(i + 1).then((secs) => {
      if (!g.cues || seq !== guideSeq.current) return;
      // Build the picture up as the narrator gets to each part; without narration, one after another.
      g.cues.forEach((c, k) => mobileTimers.current.push(window.setTimeout(() => setLayers((l) => ({ ...l, ...c.layers })), secs ? c.at * secs * 1000 : 1500 + k * 2500)));
    });
    if (g.plan) {
      const tgt = g.plan.target ?? plan.target;
      const t = targetOf(world, tgt);
      const a = targetCentre(t);
      setPlan(g.plan.target ? { ...g.plan, aimX: a.x, aimY: a.y, hardness: t.hardness, stored: t.stored } : g.plan);
    }
    // Leaving a step that builds its picture up: finish it, so the next step starts from the whole picture.
    const was = guide != null ? GUIDE[guide].cues : undefined;
    if (was) setLayers((l) => Object.assign({ ...l }, ...was.map((x) => x.layers)));
    if (g.layers) setLayers((l) => ({ ...l, ...g.layers }));
    if (g.focus && !g.tour) focusRef.current = g.focus; // the tour flies its own way in
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
  // The briefing's tour: once, on arrival, the map points at each place in the story and comes back.
  const tour3d = useRef(false); // the briefing switched to 3D for its last look at the school
  function stopTour() {
    tourTimers.current.forEach(clearTimeout);
    tourTimers.current = [];
    setSpotlight(null);
    if (tour3d.current) {
      tour3d.current = false;
      modelRef.current?.stopOrbit();
      tourBack.current = true;
      setView('map');
    }
  }
  function startTour() {
    const wh = targetOf(world, 'warehouse');
    const school = world.buildings.find((b) => b.name === 'Cotton Street School');
    const depot = world.buildings.filter((b) => b.name === 'Fuel Depot');
    const mid = (bs: { cx: number; cy: number }[]) => ({ x: bs.reduce((a, b) => a + b.cx, 0) / bs.length, y: bs.reduce((a, b) => a + b.cy, 0) / bs.length });
    const whB = wh.buildingId != null ? world.buildings[wh.buildingId] : null;
    const stops: [number, () => void][] = [];
    // The opening: if we're not already at the guide's home view (the opening card glides there), pull back a
    // little for a sense of scale, then glide slowly in.
    const home = guideHome();
    const m0 = mapRef.current;
    const there = !!m0 && Math.hypot(m0.view.cx - home.cx, m0.view.cy - home.cy) < 60 && Math.abs(Math.log(m0.view.zoom / home.zoom)) < 0.25;
    if (!there) {
      focusRef.current = { ...home.back, dur: 1.1 };
      if (view === 'model') modelRef.current?.flyTo(home.back.cx, home.back.cy, 900, 1.1);
      stops.push([
        1200,
        () => {
          focusRef.current = { cx: home.cx, cy: home.cy, zoom: home.zoom, dur: 3.6 };
          if (view === 'model') modelRef.current?.flyTo(home.cx, home.cy, 560, 3.6);
        },
      ]);
    }
    if (whB) stops.push([there ? 300 : 1200, () => setSpotlight({ ids: [whB.id], name: 'Warehouse 14', tone: 'target' })]);
    // First look at the school: in close, the building and its playground filling the view, for a few seconds.
    const yard = world.spaces.find((sp) => sp.name === 'School yard');
    const schoolBox = school && [...school.rects, ...(yard ? [yard.rect] : [])].reduce((u, q) => ({ x0: Math.min(u.x0, q.x), y0: Math.min(u.y0, q.y), x1: Math.max(u.x1, q.x + q.w), y1: Math.max(u.y1, q.y + q.h) }), { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 });
    if (school && schoolBox) stops.push([7000, () => (setSpotlight({ ids: [school.id], name: 'Cotton Street School', tone: 'protect' }), flyTo((schoolBox.x0 + schoolBox.x1) / 2, (schoolBox.y0 + schoolBox.y1) / 2 + 9, phone ? 7.6 : 9))]);
    if (depot.length) {
      const c = mid(depot);
      stops.push([11000, () => (setSpotlight({ ids: depot.map((b) => b.id), name: 'Fuel Depot', tone: 'hazard' }), flyTo(c.x, c.y, 4))]);
    }
    // Last: the school in 3D, circling slowly over the playground, for the rest of the briefing.
    if (school && schoolBox)
      stops.push([
        15000,
        () => {
          setSpotlight({ ids: [school.id], name: 'Cotton Street School', tone: 'protect' });
          // Circle the playground itself, where the children are.
          const cx = yard ? yard.rect.x + yard.rect.w / 2 : (schoolBox.x0 + schoolBox.x1) / 2;
          const cy = yard ? yard.rect.y + yard.rect.h / 2 : (schoolBox.y0 + schoolBox.y1) / 2;
          focusRef.current = { cx, cy, zoom: 6, dur: 1.2 };
          if (view === 'model') return modelRef.current?.orbit(cx + 10, cy, 105, 100, 29, 1);
          tour3d.current = true;
          // The model may still be building: wait for it, and for the switch to place the camera, then glide in and circle.
          const wait = (n: number) =>
            tourTimers.current.push(
              window.setTimeout(() => {
                if (modelRef.current) tourTimers.current.push(window.setTimeout(() => modelRef.current?.orbit(cx + 10, cy, 105, 100, 29, 1), 350));
                else if (n < 60) wait(n + 1);
              }, 150),
            );
          tourTimers.current.push(
            window.setTimeout(() => {
              setView('model');
              wait(0);
            }, 1300),
          );
        },
      ]);
    tourTimers.current = stops.map(([t, f]) => window.setTimeout(f, t));
  }
  // On the map, pan and zoom; in 3D, glide the camera there too.
  const flyTo = (x: number, y: number, zoom = 4) => {
    focusRef.current = { cx: x, cy: y, zoom };
    if (view === 'model') modelRef.current?.flyTo(x, y, zoom <= 2.5 ? 320 : zoom <= 4 ? 190 : 130);
  };
  // ------------------------------------------------------------ the secret mission

  const MISSION_AUDIO = ['voice/mission-brief', 'voice/mission-tea', 'voice/mission-mech', 'voice/mission-fish', 'voice/mission-samir', 'moto', 'mission-sting', 'paper-flutter'];
  /** Someone talks: the card shows at once, the words come in with the voice when it has loaded. */
  const speak = (t: Talk, voice?: string) => {
    setTalk({ ...t, secs: voice && soundOn ? undefined : 0 });
    if (!voice || !soundOn) return;
    void sound.narrate(voice).then((secs) => setTalk((c) => (c && c.key === t.key ? { ...c, secs } : c)));
  };
  const hush = () => {
    setTalk(null);
    sound.stopVoice();
  };
  /** Go to whoever the file wants next; if they aren't there at this hour, turn the clock to when they are. */
  const goMission = (s = missionRef.current) => {
    const c = current(s);
    if (!c) return;
    const spot = c === 'samir' ? MEETS[s.meet] : c;
    if (!inHours(plan.hour, spot.from, spot.to)) {
      setDayPlay(false);
      setPlan({ hour: (spot.from + 0.25) % 24 });
    }
    stopTour();
    setGuide(null);
    flyTo(spot.x, spot.y, phone ? 7 : 8.5);
    if (c === 'samir') sound.play('moto', 0.5);
  };
  const briefMission = (s: MissionState) =>
    speak(
      {
        key: `brief-${Date.now()}`,
        name: 'Your handler',
        role: 'A new file: The Courier',
        text: HANDLER_BRIEF.text,
        tone: 'handler',
        actions: [
          {
            label: 'Take the file',
            primary: true,
            onClick: () => {
              hush();
              sound.play('mission-sting');
              const n = { ...s, on: true, step: 1 };
              setMission(n);
              goMission(n);
            },
          },
        ],
      },
      HANDLER_BRIEF.voice,
    );
  const startMission = () => {
    const s = newMission(missionRef.current);
    setMission(s);
    setMissionEnd(null);
    sound.preload(MISSION_AUDIO.concat(`voice/mission-baker-${MEETS[s.meet].key}`));
    briefMission(s);
  };
  /** Someone in the file (or the red motorbike) was clicked. */
  const onFigure = (id: FigureId | 'moto') => {
    const s = missionRef.current;
    const key = `${id}-${Date.now()}`;
    sound.play('ui-click');
    if (id === 'moto')
      return speak({
        key,
        name: 'A red motorbike',
        role: 'Somewhere on the Long Boulevard',
        text: s.on && s.step >= 2 ? 'Too fast for the street, no plate on the back. Gone before you can see his face. You won’t catch him on the move: find out where he stops.' : 'Too fast for the street, no plate on the back. Gone before you can see his face.',
        tone: 'red',
        actions: [],
      });
    if (id === 'samir') {
      const m = MEETS[s.meet];
      return speak(
        {
          key,
          name: SAMIR.name,
          role: `The courier · ${m.place}`,
          text: SAMIR.line,
          tone: 'red',
          actions: [
            {
              label: 'Mark him as the target',
              primary: true,
              onClick: () => {
                hush();
                chooseTarget(groundId(m.x, m.y));
                setLawful(true); // the file says so; whether anyone else is standing there is still up to you
                setMapMode('explore');
                setStrikeOpen(true);
                flyTo(m.x, m.y, 4.4);
              },
            },
            { label: 'Not yet', onClick: hush },
          ],
        },
        SAMIR.voice,
      );
    }
    const f = FIGURES.find((q) => q.id === id)!;
    const n = FIGURES.indexOf(f) + 1;
    const card = (text: string, actions: Talk['actions'] = []) => speak({ key, name: f.name, role: f.role, text, tone: 'gold', actions });
    if (!s.on || s.step === 0 || s.step === 6) return card(STRANGER[id], s.step === 6 ? [] : [{ label: 'Open the secret file', primary: true, onClick: startMission }]);
    if (n < s.step) return card(DONE[id]);
    if (n > s.step) return card(EARLY[id]);
    const b = id === 'baker' ? bakerLine(MEETS[s.meet]) : null;
    speak(
      {
        key,
        name: f.name,
        role: f.role,
        text: b?.line ?? f.line,
        tone: 'gold',
        actions: [
          {
            label: 'Note it in the file',
            primary: true,
            onClick: () => {
              hush();
              sound.play('mission-sting');
              const cur = missionRef.current;
              setMission({ ...cur, step: n + 1, clues: [...cur.clues, b?.clue ?? f.clue] });
            },
          },
        ],
      },
      b?.voice ?? f.voice,
    );
  };
  /** The people a strike hurt, by name, for the end of the file. */
  const namesOf = (o: Outcome) => {
    const out: string[] = [];
    for (const [bid, slots] of Object.entries(o.hurtSlots))
      for (const i of slots) {
        const b = world.buildings[+bid];
        const p = personIn(b, i, plan.hour, plan.day === 'friday');
        out.push(`${p.name}, ${p.age === 0 ? 'a baby' : p.age}: ${p.doing}`);
      }
    return out;
  };
  const finishMission = (result: 'clean' | 'hurt' | 'miss', others: number, names: string[]) => {
    const s = missionRef.current;
    if (result === 'miss') setMission({ ...s, step: 4, meet: (s.meet + 1 + Math.floor(Math.random() * (MEETS.length - 1))) % MEETS.length, clues: s.clues.slice(0, 3) });
    else setMission({ ...s, step: 6, result });
    setMissionEnd({ result, others, names });
    void sound.narrate(ENDINGS[result].voice);
  };
  // The way in: tucked away at the very bottom of the page (the plan panel's foot on a desktop).
  const secretBtn = (where: string) => (
    <div className={`secret-foot ${where}`}>
      <button
        className={`mission-btn ${mission.on ? 'on' : ''}`}
        onClick={() => {
          if (mission.on) return setMission({ ...mission, on: false });
          if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' }); // back up to the map
          if (mission.step >= 1 && mission.step < 6) return setMission({ ...mission, on: true });
          startMission();
        }}
        aria-pressed={mission.on}
        title="A secret mission: find the courier"
      >
        <span aria-hidden>✦</span> {mission.on ? 'Put the secret file away' : mission.step >= 1 && mission.step < 6 ? 'Back to the secret file' : 'Secret file'}
      </button>
      <button className="theme-btn" onClick={() => setDark(!dark)} aria-pressed={dark} title="Switch between light and dark">
        {dark ? '☀ Light mode' : '☾ Dark mode'}
      </button>
    </div>
  );
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
    const mega = !!weapon(plan.weapon).mega;
    // The biggest bomb: start a little further out, so the pull-back after it has somewhere to go.
    focusRef.current = mega ? { cx: plan.aimX, cy: plan.aimY + 10, zoom: 2.4, dur: 1.4 } : { cx: plan.aimX, cy: plan.aimY + 10, zoom: Math.max(3.2, m.view.zoom) };
    if (mega && view === 'model') modelRef.current?.flyTo(plan.aimX, plan.aimY, 460, 1.4);
    // Rolling again replaces the last strike; a new strike adds to the ruins.
    const before = outcome && strikeRef.current ? strikeRef.current.before : ruins;
    setRuins(before);
    // The sound of it: the aircraft, the call, the impact, the stamp, then what the radio says.
    // Timed to the plane: the jet is loudest as it passes over the target (~1.9 s); the falling bomb's scream peaks just
    // before it lands (2.6 s), and the blast covers its tail. The biggest bomb comes from a slow, droning cargo plane.
    if (mega) sound.play('aircraft-cargo', 0);
    else sound.play('aircraft-approach', 0.65);
    sound.radio('radio-04-away', 0.9);
    sound.play('bomb-whistle', 1.85);
    m.onImpact = (o) => {
      setOutcome(o);
      setRuins([...new Set([...before, ...o.damaged])]);
      // The secret file: was the courier there, and did it reach him?
      const ms = missionRef.current;
      const mm = MEETS[ms.meet];
      if (ms.on && ms.step === 5 && plan.target === groundId(mm.x, mm.y)) {
        const killed = inHours(plan.hour, mm.from, mm.to) && Math.hypot(o.ix - mm.x, o.iy - mm.y) < Math.max(8, weapon(plan.weapon).blast * 1.1);
        if (killed) {
          scatterLetters(mm.x, mm.y);
          sound.play('paper-flutter', 0.8);
        }
        const names = namesOf(o).slice(0, 5);
        window.setTimeout(() => finishMission(killed ? (o.count > 0 ? 'hurt' : 'clean') : 'miss', o.count, names), (stampDelay(o) + 3.4) * 1000);
      }
      // The boom follows the bomb: the 2,000-lb shakes the room, the smallest is a hard crack.
      if (mega) {
        // Its own long, rolling boom; and the camera pulls slowly back to show how much of the city is gone.
        sound.play('impact-mega');
        sound.play('impact', 0, 0.7);
        focusRef.current = { cx: o.ix + (world.city.w / 2 - o.ix) * 0.35, cy: o.iy + (world.city.h / 2 - o.iy) * 0.35, zoom: 1.05, dur: 6.5 };
        // In 3D the same: a long, slow pull up and back over the city.
        if (view === 'model') modelRef.current?.flyTo(o.ix + (world.city.w / 2 - o.ix) * 0.35, o.iy + (world.city.h / 2 - o.iy) * 0.35, 1150, 6.5);
      } else sound.play('impact', 0, 0.45 + 0.55 * Math.min(1, weapon(plan.weapon).blast / 22));
      // Whatever else goes off, a beat later. Fuel is the loudest; several tanks together share the volume.
      const each = 1 / Math.sqrt(Math.max(1, o.blasts.length / 2));
      for (const b of o.blasts) sound.play('impact', b.at, (b.kind === 'fuel' ? 0.6 : 0.45) * each);
      // The verdict waits until everything has gone off, so you see it happen first.
      const verdict = stampDelay(o);
      // What you hear afterwards depends on how many were hurt, and is quieter at night (fewer people outside).
      const hurt = o.count;
      const after = hurt === 0 ? 'after-0' : hurt <= 3 ? 'after-few' : hurt <= 15 ? 'after-some' : hurt <= 50 ? 'after-many' : 'after-mass';
      const dark = nightness(plan.hour);
      sound.play(after, 1.1, 0.55 * (1 - dark * 0.35));
      sound.play('stamp', verdict + 0.05);
      // After the blast has settled: one call with the result, then a quiet "stand by".
      sound.radio(o.destroyed ? 'radio-06-destroyed' : 'radio-07-intact', verdict + 1.9);
      sound.radio('radio-08-bda', verdict + 2.7);
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

      <Step n={2} title="Weapon" summary={`${w.short} · ${modeOf(plan.weapon, plan.fuze).name}${weaponWarn ? ` · destroys it ${pct(est!.pk)}` : ''}`} status={weaponWarn ? 'warn' : 'ok'} open={open.has('weapon')} onToggle={() => toggleStep('weapon')}>
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
              className={`${plan.weapon === wp.id ? 'on' : ''} ${wp.special ? 'special' : ''}`}
              title={wp.special ? 'Only by hand: Jev never considers it' : undefined}
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
        <Seg value={plan.fuze} onChange={(f) => setPlan({ fuze: f })} options={FUZES.map((f) => [f.id, modeOf(plan.weapon, f.id).name] as [typeof f.id, string])} />
        <p className="hint">{modeOf(plan.weapon, plan.fuze).note}</p>
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

      <Step n={6} title="Decide" summary={lawful ? 'Release, or call it off' : 'No lawful target, no strike'} status={lawful ? undefined : 'stop'} open={open.has('decide') || true} onToggle={() => toggleStep('decide')}>
        <div className="decide">
          <button className="btn danger big" onClick={authorise} disabled={!lawful || striking || !est}>
            Authorise strike…
          </button>
          <button className="btn calm" onClick={callOff} disabled={striking}>
            Call it off
          </button>
        </div>
        <p className="hint">Whether the harm is excessive against the military advantage is a human judgment. The model can't make it.</p>
      </Step>
      {secretBtn('desk')}
    </div>
  );

  const estimateDock = est ? (
    <div className="dock-scroll">
      <section className="card tiles-card">
        <span className="src corner">{est.runs} replays</span>
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
        <h3>
          How bad could it be? <span className="src">{est.runs} replays</span>
        </h3>
        <p className="sub">{est.runs} runs, each with a different landing point and a different count of people.</p>
        <Distribution est={est} rules={rules} />
      </section>
      <section className="card">
        <h3>
          Where the harm comes from <span className="src">{est.runs} replays</span>
        </h3>
        <p className="sub">Expected people killed or badly hurt. Click a place to see it.</p>
        <Breakdown world={world} est={est} onPick={pickPlace} />
        {est.secondary > 0.01 && <p className="hint warn">Something else went off in {pct(est.secondary)} of runs: stored weapons or fuel.</p>}
      </section>
      <section className="card">
        <h3>
          Every weapon, every fuze <span className="src">150 replays each</span>
        </h3>
        <p className="sub">
          Planning figure at {fmtHour(plan.hour)}, heading {compassName(plan.heading)}, from a quick 150-run check. Below each number: how often the target is destroyed; ✕ misses the {pct(minPk)} requirement. Click a cell to use it.
        </p>
        {matrix.length ? (
          <OptionsMatrix
            cells={matrix}
            weapons={SEARCH_WEAPONS.map((x) => [x.id, x.short])}
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
            <p className="powered">Runs here, on your computer: the simulator, using Jev's reading of who is inside</p>
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
        <h3>
          Trade-offs <span className="src">plan search</span>
        </h3>
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
          {SEARCH_WEAPONS.map((wp) => (
            <label key={wp.id} className="check small">
              <input
                type="checkbox"
                checked={allowed.includes(wp.id)}
                onChange={(e) => {
                  const next = e.target.checked ? [...allowed, wp.id] : allowed.filter((x) => x !== wp.id);
                  if (next.length) setAllowed(SEARCH_WEAPONS.map((x) => x.id).filter((x) => next.includes(x)));
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
        <h3>Best so far</h3>
        {bestNow ? (
          <div className="best-now">
            <b>{describe(bestNow.c)}</b>
            <span>
              Planning figure {bestNow.p90} · destroys the target {pct(bestNow.pk)}
            </span>
          </div>
        ) : (
          <p className="hint">{phase === 'search' ? 'Nothing meets the requirement yet…' : 'Press Run Jev.'}</p>
        )}
        {phase === 'search' && testing && (
          <div className="flip small" key={key(testing)}>
            <span className="k">trying</span>
            <Chip k="Weapon" v={weapon(testing.weapon).short} />
            <Chip k="Fuze" v={modeOf(testing.weapon, testing.fuze).name} />
            <Chip k="Heading" v={HEADING_NAMES[testing.heading]} />
            <Chip k="Aim" v={testing.aim} />
            <Chip k="Hour" v={fmtHour(testing.hour)} />
          </div>
        )}
        {log.length > 0 && (
          <details className="log-fold">
            <summary>Full log ({log.length})</summary>
            <div className="log" ref={logRef}>
              {log.map((l, i) => (
                <div key={i} className={l.kind}>
                  {l.t}
                </div>
              ))}
            </div>
          </details>
        )}
      </section>
    </div>
  );

  return (
    <div className={`app m-${mobileTab} ${mapFull ? 'mapfull' : ''} ${guide != null ? 'guiding' : ''}`}>
      <header className="top">
        <div className="brand">
          <b>Collateral Damage</b>
          <span>Jev engine</span>
        </div>
        <nav className="targets" aria-label="Targets">
          <div className="stories-wrap" ref={storiesRef}>
            <button className={`stories-btn ${storiesOpen ? 'open' : ''}`} onClick={() => setStoriesOpen(!storiesOpen)} aria-expanded={storiesOpen} title="The briefed targets, and the people around them">
              <span className="k">Targets</span>
              <b>{world.targets.some((t) => t.id === plan.target) ? target.short : 'Choose'}</b>
              <span aria-hidden>▾</span>
            </button>
            {storiesOpen && (
              <div className="stories-pop" role="menu">
                {(
                  [
                    ['In the city', (q: Rect) => q.y < 700 && q.x < world.city.w],
                    ['Beyond the city', (q: Rect) => q.y >= 700 || q.x >= world.city.w],
                  ] as const
                ).map(([label, inGroup]) => (
                  <div key={label} className="stories-group">
                    <span className="k">{label}</span>
                    {world.targets
                      .filter((t) => inGroup(t.rect))
                      .map((t) => (
                        <button
                          key={t.id}
                          role="menuitem"
                          className={plan.target === t.id ? 'on' : ''}
                          onClick={() => {
                            setStoriesOpen(false);
                            pickPreset(t.id);
                          }}
                        >
                          <b>{t.name}</b>
                          <span>{t.note}</span>
                        </button>
                      ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          {(plan.target.startsWith('b:') || plan.target.startsWith('g:')) && (
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
            <canvas
              ref={canvas3dRef}
              className={`canvas3d ${view === 'model' ? 'on' : ''}`}
              aria-label="The city as a tilted model"
              onPointerDown={(e) => (down3d.current = { x: e.clientX, y: e.clientY })}
              onPointerUp={(e) => {
                // A tap (not a drag) on someone from the secret file, in 3D.
                const d0 = down3d.current;
                down3d.current = null;
                if (!d0 || Math.hypot(e.clientX - d0.x, e.clientY - d0.y) > 5) return;
                const g = modelRef.current?.groundAt(e.clientX, e.clientY);
                const who = g && figureAt(g.x, g.y, Math.max(1.6, g.mpp * (phone ? 20 : 13)), plan.hour);
                if (who) onFigure(who);
              }}
            />
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

            {!striking && !outcome && !confirm && !(phone && guide != null) && (
              <div className={`strike-dock ${strikeOpen ? 'open' : ''}`} role="group" aria-label="Decide">
                {strikeOpen ? (
                  <>
                    <button className="act strike pulse" onClick={authorise} disabled={!lawful || !est} title={!lawful ? 'No lawful target: confirm it in the Target step first' : 'Opens the final decision'}>
                      Authorise strike
                    </button>
                    <button
                      className="act off"
                      onClick={() => {
                        setStrikeOpen(false);
                        callOff();
                      }}
                    >
                      Call off
                    </button>
                  </>
                ) : (
                  <button className="act strike tab" onClick={() => setStrikeOpen(true)} title="Authorise or call off">
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
            {mission.on && !missionEnd && !striking && (
              <MissionHud
                s={mission}
                hour={shownPlan.hour}
                onGo={() => goMission()}
                onBrief={() => briefMission(mission)}
                onNew={startMission}
                onHide={() => {
                  hush();
                  setMission({ ...mission, on: false });
                }}
              />
            )}
            {talk && <TalkCard talk={talk} onClose={hush} />}
            {missionEnd && (
              <EndCard
                {...missionEnd}
                onAgain={() => {
                  sound.stopVoice();
                  const miss = missionEnd.result === 'miss';
                  setMissionEnd(null);
                  if (miss) goMission();
                  else startMission();
                }}
                onClose={() => {
                  sound.stopVoice();
                  setMissionEnd(null);
                }}
              />
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
              <button className="full-btn" onClick={toggleMapFull} aria-pressed={mapFull} title={mapFull ? 'Leave full screen' : 'Map full screen'}>
                {mapFull ? '✕' : '⤢'}
              </button>
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
                  <button onClick={() => (focusRef.current = { cx: world.city.w / 2, cy: world.city.h / 2, zoom: 1 })}>City</button>
                  <button
                    onClick={() => {
                      const c = targetCentre(target);
                      focusRef.current = { cx: c.x, cy: c.y, zoom: mapRef.current?.view.zoom ?? 3.2 }; // slide over to it, same zoom
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
                    {w.name}, {modeOf(plan.weapon, plan.fuze).name.toLowerCase()}{w.kinetic ? '' : ' fuze'}, arriving from the {compassName(plan.heading + 180)}, {plan.day === 'friday' ? 'Friday' : 'a weekday'} at {fmtHour(plan.hour)}.
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
              <div className={`guide ${phone ? 'compact' : ''}`}>
                <span className="n">
                  {guide + 1}/{GUIDE.length}
                </span>
                <div>
                  <h4>{GUIDE[guide].title}</h4>
                  {!phone && <p>{GUIDE[guide].text}</p>}
                </div>
                {phone && !soundOn && (
                  <button
                    className="guide-listen"
                    onClick={() => {
                      sound.setEnabled(true);
                      void sound.voice(guide + 1);
                    }}
                    aria-label="Turn the narration on"
                  >
                    🔈
                  </button>
                )}
                <div className="guide-nav">
                  <button onClick={() => goGuide(Math.max(0, guide - 1))} disabled={guide === 0} aria-label="Back">
                    {phone ? '‹' : 'Back'}
                  </button>
                  {guide < GUIDE.length - 1 ? (
                    <button className="primary" onClick={() => goGuide(guide + 1)} aria-label="Next">
                      {phone ? '›' : 'Next'}
                    </button>
                  ) : (
                    <button className="primary" onClick={() => goGuide(null)}>
                      Done
                    </button>
                  )}
                  {phone && (
                    <button className="guide-x" onClick={() => goGuide(null)} aria-label="Leave the guide">
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )}

            {outcome && (
              <div className={`stamp ${outcome.destroyed ? 'hit' : 'miss'}`} key={`${outcome.ix},${outcome.iy}`} aria-live="assertive" style={{ animationDelay: `${stampDelay(outcome)}s` }}>
                <b>{outcome.destroyed ? 'Target destroyed' : 'Target missed'}</b>
                <span>
                  {outcome.count} {outcome.count === 1 ? 'person' : 'people'} killed or badly hurt
                </span>
              </div>
            )}
            {outcome && (
              <div className="outcome" style={{ animationDelay: `${stampDelay(outcome) + 2.4}s` }}>
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
                  {world.buildings.some((b) => b.name === 'Power Station' && outcome.damaged.includes(b.id)) && ' The power station is down: the city goes dark, water pumps stop, and the hospital runs on its generators while the diesel lasts.'}
                </p>
                <p className="muted rings">Every red ring on the map is a person killed or badly hurt. {phone ? 'Tap' : 'Point at'} one to see who.</p>
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

            {story && guide == null && !striking && (
              <div className={`storycard ${phone ? 'chip' : ''}`} key={story} role="status">
                <div className="pop-head">
                  <div>
                    {!phone && <span className="kind">Why it’s a target, and who is around it</span>}
                    <b>{TARGET_STORIES[story].title}</b>
                  </div>
                  <button className="x" onClick={closeStory} aria-label="Close">
                    ×
                  </button>
                </div>
                {!phone && <p>{TARGET_STORIES[story].text}</p>}
              </div>
            )}
            {place && !striking && (
              <div
                className="placecard"
                key={place.story.title}
                style={{
                  left: place.x + 18 + 270 < (canvasRef.current?.clientWidth ?? 400) - 10 ? place.x + 18 : Math.max(10, place.x - 18 - 270),
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
                  left: pop.x + 24 + 310 < (canvasRef.current?.clientWidth ?? 400) - 10 ? pop.x + 24 : Math.max(10, pop.x - 24 - 310),
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
        <div className={`intro ${introLeaving ? 'leaving' : ''}`} role="dialog" aria-modal="true" aria-labelledby="intro-title">
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
              <button className={`btn primary big ${telling ? 'telling' : ''}`} onClick={() => void stepIn()} disabled={!!telling && !telling.skip} autoFocus>
                {telling ? 'Skip →' : 'Step in →'}
              </button>
              <button className="btn" onClick={() => closeIntro(false)}>
                Look around first
              </button>
            </div>
            {telling && (
              <div className="intro-progress" aria-hidden>
                <i style={{ animationDuration: `${telling.ms}ms` }} />
              </div>
            )}
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
      {secretBtn('phone')}
    </div>
  );
}

const describe = (c: Candidate) => `${weapon(c.weapon).short}, ${modeOf(c.weapon, c.fuze).name.toLowerCase()}, heading ${compassName(c.heading)}, aim ${c.aim}, ${fmtHour(c.hour)}`;

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
