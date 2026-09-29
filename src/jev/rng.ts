// Seeded randomness. Every number Jev produces can be reproduced from its seed.

export type Rng = () => number;

/** mulberry32: small, fast, good enough for simulation. */
export function rng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normal(r: Rng): number {
  let u = 0;
  while (u === 0) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

/** Marsaglia–Tsang gamma with shape k and scale 1. */
export function gamma(r: Rng, k: number): number {
  if (k < 1) return gamma(r, k + 1) * Math.pow(r(), 1 / k);
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = normal(r);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = r();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function poisson(r: Rng, mean: number): number {
  if (mean <= 0) return 0;
  if (mean > 40) return Math.max(0, Math.round(mean + Math.sqrt(mean) * normal(r)));
  const L = Math.exp(-mean);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= r();
  } while (p > L);
  return k - 1;
}

/** Binomial(n, p): exact for small n, normal approximation for large. */
export function binomial(r: Rng, n: number, p: number): number {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return n;
  if (n <= 16) {
    let k = 0;
    for (let i = 0; i < n; i++) if (r() < p) k++;
    return k;
  }
  const m = n * p;
  const sd = Math.sqrt(m * (1 - p));
  return Math.max(0, Math.min(n, Math.round(m + sd * normal(r))));
}
