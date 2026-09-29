// Shared paper look: palette, sun, colour grading through the day.

export const C = {
  ground: '#e7ddcc',
  pavement: '#ddd2c0',
  street: '#b5aca1',
  road: '#8f8781',
  lane: '#efe8da',
  water: '#9fb4bd',
  waterDeep: '#86a0ab',
  quay: '#cfc4b2',
  white: '#f3f1ec',
  whiteEdge: '#d6d1c7',
  grey: '#c9c4bb',
  greyEdge: '#aaa49a',
  kraft: '#c99f69',
  kraftEdge: '#a7804f',
  tin: '#a9aeb0',
  tinEdge: '#858b8e',
  terracotta: '#c47a5a',
  terracottaEdge: '#9c5a3e',
  tree: '#76863f',
  treeLight: '#a9b865',
  grass: '#b7c08a',
  ink: '#1d1b18',
  red: '#b4472d',
  jev: '#2d5a86',
  protect: '#2f6f8f',
  hazard: '#c98a1e',
};

export const SKIN = ['#6b4a32', '#8a6040', '#a97a52', '#c4966a', '#5a3d2a'];
export const CLOTH = ['#3d4f6b', '#8b3a2e', '#e7e1d4', '#6e7a4a', '#2f2c29', '#b48a3c', '#5b6d80', '#9a6b8a', '#d9c7a4'];

export interface Sun {
  dx: number; // shadow offset per metre of height
  dy: number;
  alpha: number;
  day: boolean;
  elev: number;
}

export function sun(hour: number): Sun {
  const h = ((hour % 24) + 24) % 24;
  const day = h >= 5.6 && h <= 18.4;
  const t = (h - 6) / 12;
  const elev = day ? Math.max(0.06, Math.sin(Math.PI * Math.min(1, Math.max(0, t))) * 1.15) : 0.5;
  const az = day ? Math.PI / 2 + Math.PI * t : Math.PI * 0.75 + (h < 12 ? h + 24 - 18 : h - 18) * 0.05;
  const len = day ? Math.min(3.4, 0.8 / Math.tan(Math.min(1.35, elev))) + 0.45 : 0.7;
  return { dx: -Math.sin(az) * len, dy: Math.cos(az) * len, alpha: day ? 0.3 + 0.12 * Math.min(1, elev * 1.6) : 0.2, day, elev };
}

const GRADE: [number, [number, number, number], number][] = [
  [0, [70, 86, 140], 0.62],
  [4.5, [70, 86, 140], 0.6],
  [6, [238, 170, 120], 0.34],
  [7.5, [255, 214, 170], 0.16],
  [10, [255, 246, 232], 0.06],
  [14, [255, 244, 228], 0.06],
  [17, [255, 206, 150], 0.18],
  [18.6, [226, 132, 98], 0.36],
  [20, [95, 96, 150], 0.52],
  [21.5, [70, 86, 140], 0.62],
  [24, [70, 86, 140], 0.62],
];

export function grade(hour: number) {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 0; i < GRADE.length - 1; i++) {
    const [h0, c0, s0] = GRADE[i];
    const [h1, c1, s1] = GRADE[i + 1];
    if (h >= h0 && h <= h1) {
      const t = (h - h0) / (h1 - h0 || 1);
      return { rgb: c0.map((v, k) => Math.round(v + (c1[k] - v) * t)) as [number, number, number], s: s0 + (s1 - s0) * t };
    }
  }
  return { rgb: [255, 255, 255] as [number, number, number], s: 0 };
}

export function nightness(hour: number) {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 7 && h <= 17.5) return 0;
  if (h > 17.5 && h < 20.5) return (h - 17.5) / 3;
  if (h >= 20.5 || h <= 5) return 1;
  return 1 - (h - 5) / 2;
}

export function shade(hex: string, amt: number) {
  const p = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${p.map((v) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)))).join(',')})`;
}

export function hexA(hex: string, a: number) {
  const p = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${p.join(',')},${a})`;
}

export function mix(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',')})`;
}
