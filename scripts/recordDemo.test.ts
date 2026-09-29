// Records one full Jev search for the guide, so the guide can replay it instead of running Jev live.
// Run with: RECORD=1 npx vitest run scripts/recordDemo.test.ts   (skipped otherwise)
import { writeFileSync } from 'node:fs';
import { test } from 'vitest';
import { buildCity, candidates, scoreDetailed, targetCentre, targetOf, type Plan } from '../src/jev';

declare const process: { env: Record<string, string | undefined> };

test.skipIf(!process.env.RECORD)('record the guide demo', () => {
  const world = buildCity();
  const t = targetOf(world, 'warehouse');
  const a = targetCentre(t);
  const base: Plan = { target: 'warehouse', weapon: 'large', fuze: 'instant', heading: 90, aimX: a.x, aimY: a.y, hour: 10, day: 'weekday', watched: 6, hardness: t.hardness, stored: t.stored };
  const cands = candidates({ weapons: ['large', 'medium', 'small', 'focused'], hours: [1, 4, 7, 10, 13, 16, 19, 22] }, 7);
  const { out } = scoreDetailed(world, { job: 1, seed: 7, base, obs: {}, runs: 120, cands });
  // Compact: [weapon, fuze, heading, aim, hour, pk, mean, p90]
  const rows = out.map((s) => [s.c.weapon, s.c.fuze, s.c.heading, s.c.aim, s.c.hour, Math.round(s.pk * 1000) / 1000, Math.round(s.mean * 10) / 10, s.p90]);
  writeFileSync('public/demo/jev-warehouse.json', JSON.stringify(rows));
}, 600_000);
