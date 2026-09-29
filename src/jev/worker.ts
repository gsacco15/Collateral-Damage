// Jev's worker: scores candidate plans off the main thread.
import { buildCity } from './city';
import { score, type Job, type Scored } from './search';

export interface JobOut {
  job: number;
  out: Scored[];
}

self.onmessage = (e: MessageEvent<Job>) => {
  const out: JobOut = { job: e.data.job, out: score(buildCity(e.data.seed), e.data) };
  (self as unknown as Worker).postMessage(out);
};
