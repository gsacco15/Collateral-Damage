// Jev's worker: scores candidate plans off the main thread, and reports how long it took.
import { buildCity } from './city';
import { scoreDetailed, type Job, type Scored } from './search';

export interface JobOut {
  job: number;
  out: Scored[];
  runs: Uint16Array[]; // each plan's individual runs, for watching Jev work
  ms: number;
}

self.onmessage = (e: MessageEvent<Job>) => {
  const t0 = performance.now();
  const { out, runs } = scoreDetailed(buildCity(e.data.seed), e.data);
  const msg: JobOut = { job: e.data.job, out, runs, ms: performance.now() - t0 };
  (self as unknown as Worker).postMessage(msg);
};
