// Armed presence: what is really there, and what the reports say about it. The simulation knows the truth; the player
// never sees it, only the reports and Jev's judgement of them, until after a strike. Armed men are never counted in
// the civilian figures, and nothing here changes the harm estimate. Living only.
import type { World } from './city';
import type { Day } from './life';
import { rng } from './rng';

export const ARMED = {
  none: 'No evidence of armed men',
  possible: 'Armed men possibly present',
  likely: 'Armed men likely present',
  confirmed: 'Armed men confirmed present',
} as const;
export type ArmedChoice = keyof typeof ARMED;

const within = (h: number, a: number, b: number) => (a <= b ? h >= a && h < b : h >= a || h < b);

let safe: { w: World; ids: number[] } | null = null;
/** Two houses used as safehouses: on Tin Hill and in the Old Town, fixed per city. */
function safehouses(w: World) {
  if (safe?.w === w) return safe.ids;
  const r = rng(w.seed * 104729 + 7);
  const ids: number[] = [];
  for (const d of ['tinhill', 'oldtown']) {
    const homes = w.buildings.filter((b) => b.district === d && b.kind === 'home' && !b.name);
    if (homes.length) ids.push(homes[Math.floor(r() * homes.length)].id);
  }
  safe = { w, ids };
  return ids;
}

/** How many armed men are really in this building at this hour (usually none). */
export function armedTruth(w: World, id: number | null | undefined, hour: number, day: Day): number {
  if (id == null) return 0;
  const b = w.buildings[id];
  if (!b) return 0;
  const h = ((hour % 24) + 24) % 24;
  if (b.name === 'Warehouse 14') return within(h, 18, 23) ? 3 : within(h, 8, 10) && day === 'weekday' ? 1 : 0;
  if (safehouses(w).includes(id)) return within(h, 20, 6) ? 2 : within(h, 12, 14) ? 1 : 0;
  return 0;
}

/**
 * What the sources say: an informant (right more often than not, sometimes wrong both ways) and, after long enough
 * watching, what an observer saw. Fixed per building, hour and amount of watching, like the other reports.
 */
export function armedReports(w: World, id: number, name: string, hour: number, day: Day, watched: number): string[] {
  const truth = armedTruth(w, id, hour, day);
  const r = rng(w.seed * 31337 + id * 17 + Math.floor(hour) * 5 + watched + (day === 'friday' ? 3 : 0));
  const out: string[] = [];
  const says = truth > 0 ? r() < 0.7 : r() < 0.18; // a true tip, or a false one
  out.push(says ? `Informant (reliability unknown): armed men use ${name}, mostly ${truth > 0 && hour >= 17 ? 'in the evenings' : 'at night'}.` : `No informant reporting on armed men at ${name}.`);
  if (watched >= 12) {
    const saw = truth > 0 ? r() < 0.6 : r() < 0.06;
    out.push(saw ? `Observer, ${watched} hours on ${name}: ${Math.max(1, truth)} men carrying long bags went in.` : `Observer, ${watched} hours on ${name}: nobody seen carrying weapons.`);
  }
  return out;
}

/** Offline: a plain reading of the same reports, no AI. */
export function ruleArmed(reports: string[]): ArmedChoice {
  const tip = reports.some((x) => x.startsWith('Informant') && x.includes('armed men use'));
  const saw = reports.some((x) => x.includes('carrying long bags'));
  return tip && saw ? 'likely' : tip || saw ? 'possible' : 'none';
}
