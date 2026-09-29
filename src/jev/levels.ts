// The head-count levels Jev answers in, and how the simulator uses an answer. No imports: life.ts and intel.ts both use it.

/** How many people are inside: the levels Jev chooses between. */
export const LEVELS: { label: string; lo: number; hi: number; text: string }[] = [
  { label: 'Empty', lo: 0, hi: 0, text: 'Empty: nobody inside' },
  { label: '1–5', lo: 1, hi: 5, text: 'A few: 1 to 5 people' },
  { label: '6–20', lo: 6, hi: 20, text: 'Some: 6 to 20 people' },
  { label: '21–60', lo: 21, hi: 60, text: 'Many: 21 to 60 people' },
  { label: '60+', lo: 61, hi: 200, text: 'Crowded: more than 60 people' },
];

/** What the simulator uses: for each building, the chance of each level. */
export type Intel = Record<number, number[]>;

/** Expected people for a reading, capped by what the building holds. */
export function judgedMean(p: number[], capacity: number) {
  return LEVELS.reduce((m, l, i) => m + p[i] * ((Math.min(l.lo, capacity) + Math.min(l.hi, Math.max(l.lo, capacity))) / 2), 0);
}

/** Draw a head count from Jev's answer: pick a level by its probability, then a number within it. */
export function sampleJudged(r: () => number, p: number[], capacity: number) {
  let u = r();
  let i = 0;
  while (i < p.length - 1 && u > p[i]) u -= p[i++];
  const l = LEVELS[i];
  const lo = Math.min(l.lo, capacity);
  const hi = Math.min(l.hi, Math.max(l.lo, capacity));
  return lo + Math.floor(r() * (hi - lo + 1));
}
