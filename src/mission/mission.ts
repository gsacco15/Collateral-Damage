// The secret mission, "The Courier": a man the file calls the Engineer never uses a phone, so his orders go by hand,
// with one courier on a red motorbike. Four people in the city have seen him, each only at their own hours of the
// day or night: a tea seller in the souk, a mechanic at the vehicle yard, an old fisherman on the quay, a baker in
// the Old Town. Each gives the next. The last tells you where he'll be, and when; that changes every time.
// The strike at the end goes through the same estimate as every other: who else is standing there is up to you.
import type { Ent, SceneCtx } from '../view/lifeScene';

export type FigureId = 'tea' | 'mech' | 'fish' | 'baker' | 'samir';

export interface Figure {
  id: FigureId;
  name: string;
  role: string;
  x: number;
  y: number;
  face: number;
  from: number; // hours they're there (wrapping past midnight)
  to: number;
  voice: string; // under voice/
  line: string;
  clue: string; // what goes in the file
  where: string;
  when: string;
  sit?: boolean;
  wear?: 'bare' | 'cap' | 'keffiyeh' | 'ghutra' | 'turban' | 'hijab' | 'shawl';
  id2: number; // picks their clothes and skin
}

/** Where the courier meets the next man: one of three, drawn when the mission starts. */
export interface Meet {
  key: 'a' | 'b' | 'c';
  place: string;
  x: number;
  y: number;
  from: number;
  to: number;
  when: string;
}
export const MEETS: Meet[] = [
  { key: 'a', place: 'the bus station, the far bays', x: 662, y: 404, from: 12, to: 13.5, when: 'noon' },
  { key: 'b', place: 'the pump house in the groves', x: 664, y: 782, from: 5, to: 6.5, when: 'before sunrise' },
  { key: 'c', place: 'the old camp in the desert', x: 1232, y: 238, from: 22, to: 23.5, when: 'late at night' },
];

export const HANDLER_BRIEF = {
  voice: 'voice/mission-brief',
  text: 'A new file. The man we call the Engineer never touches a phone. Every order he gives travels by hand, with one courier, on a red motorcycle. Find the people who have seen him. Start at the souk, in the morning. The tea seller there sees everyone.',
};

export const FIGURES: Figure[] = [
  {
    id: 'tea',
    name: 'Abu Karim',
    role: 'Tea seller, the souk',
    x: 511,
    y: 398,
    face: Math.PI / 2,
    from: 6,
    to: 17,
    voice: 'voice/mission-tea',
    line: 'Tea? Sit, sit. The red motorbike… yes. Every morning, before the shutters go up. He drinks standing, like he is late for his own wedding. Pays with new notes, always new. And the bike coughs, like my uncle. Go and see Yusuf, at the workshops by the vehicle yard. Yusuf fixes everything that coughs.',
    clue: 'Red motorbike, every morning at the souk. Pays in new notes. The bike is failing: Yusuf the mechanic, by the vehicle yard.',
    where: 'The souk',
    when: 'in the day, 6 am to 5 pm',
    sit: true,
    wear: 'keffiyeh',
    id2: 1,
  },
  {
    id: 'mech',
    name: 'Yusuf',
    role: 'Mechanic, the vehicle yard',
    x: 58,
    y: 522,
    face: 0,
    from: 8,
    to: 18,
    voice: 'voice/mission-mech',
    line: 'I don’t know his name. I know his bike. Red, old, the brakes are finished, I told him twice. He said he has no time. Once he left his helmet here. It smelled of the river… of fish. Go to the quay, after dark. The old men who fish there, they never sleep.',
    clue: 'He left his helmet at the yard: it smelled of the river. The old men who fish the quay at night.',
    where: 'The vehicle yard',
    when: 'in the day, 8 am to 6 pm',
    wear: 'cap',
    id2: 6,
  },
  {
    id: 'fish',
    name: 'Hajj Mahmoud',
    role: 'Fisherman, the east quay',
    x: 767.5,
    y: 612,
    face: Math.PI,
    from: 20,
    to: 5,
    voice: 'voice/mission-fish',
    line: 'At night the water is honest, my son. He crosses the camp footbridge after midnight, no light on the bike. And before dawn he goes to the bakery in the Old Town. Umm Rami’s. She gives him bread… and he gives her something that is not money.',
    clue: 'Crosses the camp footbridge after midnight, no lights. Before dawn: Umm Rami’s bakery in the Old Town.',
    where: 'The east quay',
    when: 'at night, 8 pm to 5 am',
    sit: true,
    wear: 'turban',
    id2: 3,
  },
  {
    id: 'baker',
    name: 'Umm Rami',
    role: 'Baker, the Old Town',
    x: 552.6,
    y: 311,
    face: Math.PI,
    from: 3.5,
    to: 7.5,
    voice: 'voice/mission-baker-a',
    line: '', // depends on where he's going: see bakerLine
    clue: '',
    where: 'Umm Rami’s bakery, the Old Town',
    when: 'before dawn, 3:30 to 7:30 am',
    wear: 'hijab',
    id2: 2,
  },
];

export const SAMIR = {
  name: 'Samir',
  role: 'The courier',
  voice: 'voice/mission-samir',
  line: 'You have been asking about me. Everyone talks, in this city. I only carry letters. I have never opened one. You think that matters to them? It does not matter to you either.',
};

export function bakerLine(m: Meet) {
  const at = m.key === 'a' ? 'Today it is noon, at the bus station, the far bays.' : m.key === 'b' ? 'Tomorrow, before the sun, at the pump house in the groves.' : 'Tonight, late, at the old camp in the desert, where the herders are.';
  return {
    voice: `voice/mission-baker-${m.key}`,
    line: `Not here. Keep your voice down. Samir. His name is Samir. He takes the letters from the bread, and he goes to meet the next man. ${at} Please… I have children. I did not tell you this.`,
    clue: `The courier is Samir. He meets the next man at ${m.place}, ${m.when}.`,
  };
}

export const ENDINGS = {
  clean: { voice: 'voice/mission-end-clean', text: 'Courier down. No one else near him. The Engineer’s line has gone quiet. For now. Somewhere tonight, a letter is not going to arrive. Close the file.' },
  hurt: { voice: 'voice/mission-end-hurt', text: 'Courier down. He was not alone. We will count the others later… they have names too. The Engineer will find another pair of hands by the end of the week. Close the file.' },
  miss: { voice: 'voice/mission-end-miss', text: 'He’s gone. The bike was seen heading out of town. He knows now. He’ll change the route, and so will the Engineer. We start again.' },
};

// ---------------------------------------------------------------- state

export interface MissionState {
  on: boolean; // the mission is being played (markers show)
  step: number; // 0 brief, 1 tea, 2 mech, 3 fish, 4 baker, 5 find Samir, 6 over
  meet: number; // index into MEETS
  clues: string[];
  result?: 'clean' | 'hurt' | 'miss';
}
const KEY = 'cd-mission-1';
export function loadMission(): MissionState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as MissionState | null;
    if (s && typeof s.step === 'number') return s;
  } catch {
    /* no storage */
  }
  return { on: false, step: 0, meet: 0, clues: [] };
}
export function saveMission(s: MissionState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* no storage */
  }
}
/** A fresh file: the meeting is drawn anew (the first time, always the bus station at noon). */
export function newMission(prev?: MissionState): MissionState {
  const first = !prev || prev.result == null;
  return { on: true, step: 0, meet: first ? 0 : Math.floor(Math.random() * MEETS.length), clues: [] };
}

export const inHours = (h: number, from: number, to: number) => {
  const x = ((h % 24) + 24) % 24;
  return from <= to ? x >= from && x < to : x >= from || x < to;
};

/** Who the file wants you to find next. */
export function current(s: MissionState): Figure | 'samir' | null {
  if (s.step >= 1 && s.step <= 4) return FIGURES[s.step - 1];
  if (s.step === 5) return 'samir';
  return null;
}

// ---------------------------------------------------------------- in the scene

// The live state the scene reads (set by the app), and where Samir fell, for the letters.
let live: MissionState = loadMission();
let letters: { x: number; y: number; t0: number } | null = null;
let gone = false; // Samir was killed: he's no longer about
export function setLive(s: MissionState) {
  live = s;
  if (s.step < 6) gone = false;
}
export function scatterLetters(x: number, y: number) {
  letters = { x, y, t0: performance.now() / 1000 };
  gone = true;
}
export function clearLetters() {
  letters = null;
}

/** Where the red motorbike is at this moment: parked at the meeting in its hour, otherwise on the move. */
export function samirAt(s: MissionState, hour: number, time: number): { x: number; y: number; a: number; parked: boolean } | null {
  if (gone) return null;
  const m = MEETS[s.meet] ?? MEETS[0];
  if (s.step === 5 && inHours(hour, m.from, m.to)) return { x: m.x, y: m.y, a: 0, parked: true };
  // Up and down the Long Boulevard and back along Cotton Street, never stopping long.
  const span = 880;
  const u = (time * 8.5) % (span * 2);
  const east = u < span;
  const d = east ? u : span * 2 - u;
  return east ? { x: 120 + d, y: 352.2, a: 0, parked: false } : { x: 120 + d, y: 347.8, a: Math.PI, parked: false };
}

export function missionEnts(c: SceneCtx): Ent[] {
  const out: Ent[] = [];
  const s = live;
  const far = (x: number, y: number) => !c.away || Math.hypot(x - c.away.x, y - c.away.y) > c.away.r * 0.5;
  const want = s.on ? current(s) : null;
  const bob = Math.sin(c.time * 2.2) * 0.25;
  for (const f of FIGURES) {
    if (!inHours(c.hour, f.from, f.to) || !far(f.x, f.y)) continue;
    out.push({ t: 'person', x: f.x, y: f.y, face: f.face, id: f.id2, wear: f.wear, sit: f.sit });
    if (f.id === 'tea') {
      out.push({ t: 'table', x: f.x + 1.2, y: f.y - 0.2 });
      out.push({ t: 'stool', x: f.x - 1.3, y: f.y + 0.4 });
      out.push({ t: 'clutter', kind: 'crate', x: f.x + 0.6, y: f.y - 1.4, a: 0.2, col: '#b08a5e' });
    }
    if (f.id === 'mech') {
      out.push({ t: 'clutter', kind: 'tyres', x: f.x - 2, y: f.y + 1.2, a: 0, col: '#2a2826' });
      out.push({ t: 'moto', x: f.x + 2.2, y: f.y - 0.6, a: 0.4, col: '#7a7f86', rider: false });
    }
    if (f.id === 'fish') {
      out.push({ t: 'rod', x: f.x - 0.6, y: f.y, a: Math.PI + 0.25, len: 6, seed: 7, z: 1.2 });
      out.push({ t: 'bucket', x: f.x + 0.9, y: f.y + 0.4 });
      out.push({ t: 'glow', x: f.x + 0.4, y: f.y - 0.8, r: 3.5, a: 0.5 * c.night, col: '255,200,120', z: 1.2 });
    }
    if (f.id === 'baker') {
      out.push({ t: 'glow', x: f.x + 1, y: f.y, r: 4, a: 0.55 * Math.max(0.3, c.night), col: '255,170,90', z: 1.4 });
      out.push({ t: 'clutter', kind: 'sacks', x: f.x - 0.4, y: f.y + 1.3, a: 0.4, col: '#d9ccb0' });
    }
    if (want && want !== 'samir' && want.id === f.id) out.push({ t: 'mark', x: f.x, y: f.y, z: 3.4 + bob, col: '#e0a82e', spin: c.time * 1.6 });
  }
  const sm = samirAt(s, c.hour, performance.now() / 1000); // one clock for both views, and for clicks
  if (sm && far(sm.x, sm.y)) {
    if (sm.parked) {
      out.push({ t: 'moto', x: sm.x + 1.6, y: sm.y + 0.8, a: -0.5, col: '#c23b2e', rider: false });
      out.push({ t: 'person', x: sm.x, y: sm.y, face: 0, id: 4, wear: 'bare' });
      // The next man, the one he's come to meet.
      out.push({ t: 'person', x: sm.x + 1.3, y: sm.y - 0.6, face: Math.PI, id: 5, wear: 'ghutra' });
      if (s.on) out.push({ t: 'mark', x: sm.x, y: sm.y, z: 3.4 + bob, col: '#c23b2e', spin: c.time * 1.6 });
    } else out.push({ t: 'moto', x: sm.x, y: sm.y, a: sm.a, col: '#c23b2e', rider: true });
  }
  // The end: the letters he carried, blown up into the air and drifting down over the street.
  if (letters) {
    const k = performance.now() / 1000 - letters.t0;
    if (k > 16) letters = null;
    else
      for (let i = 0; i < 36; i++) {
        const a = i * 2.39996;
        const v = 0.6 + ((i * 37) % 11) / 11;
        const up = Math.min(k, 1.2);
        const rise = 14 * v * up - 1.5 * v * up * up; // thrown up, then…
        const fall = Math.max(0, k - 1.2) * (0.9 + (i % 4) * 0.15); // …floating down, slowly, swinging
        const z = Math.max(0.05, rise + 2 - fall);
        const drift = Math.min(k, 9) * (1.6 + (i % 5) * 0.4);
        out.push({
          t: 'letter',
          x: letters.x + Math.cos(a) * (2 + drift) + Math.sin(k * 1.7 + i) * 0.8,
          y: letters.y + Math.sin(a) * (2 + drift) * 0.8,
          z,
          a: k * (1.5 + (i % 3)) + i,
          tilt: z > 0.1 ? Math.sin(k * 2.3 + i) * 0.9 : 0,
        });
      }
  }
  return out;
}

/** The mission figure (or the red motorbike) near a point on the map, if any, at this hour. */
export function figureAt(x: number, y: number, r: number, hour: number): FigureId | 'moto' | null {
  let best: FigureId | 'moto' | null = null;
  let bd = r;
  for (const f of FIGURES) {
    if (!inHours(hour, f.from, f.to)) continue;
    const d = Math.hypot(f.x - x, f.y - y);
    if (d < bd) (bd = d), (best = f.id);
  }
  const sm = samirAt(live, hour, performance.now() / 1000);
  if (sm) {
    const d = Math.hypot(sm.x - x, sm.y - y);
    if (d < bd * (sm.parked ? 1 : 1.6)) best = sm.parked ? 'samir' : 'moto';
  }
  return best;
}

/** What they say before you know what to ask, once they've told you, and if you come too early. */
export const STRANGER: Record<FigureId, string> = {
  tea: 'Tea, two pounds. He looks at you a moment too long, as if he’s been expecting someone to ask him something.',
  mech: 'Busy. He wipes his hands and watches the road, the way people do when they’re waiting for a particular engine.',
  fish: 'An old man with a line in the water. He hasn’t caught anything in an hour, and doesn’t seem to mind.',
  baker: 'The first bread of the day. She glances at the street each time a motorbike goes by.',
  samir: '',
};
export const DONE: Record<FigureId, string> = {
  tea: 'I told you what I know. Drink your tea.',
  mech: 'I said what I said. Now I have work.',
  fish: 'The water has nothing more to say tonight.',
  baker: 'Please. Go. Don’t come here again.',
  samir: '',
};
export const EARLY: Record<FigureId, string> = {
  tea: 'Tea, two pounds. Questions cost more.',
  mech: 'Who sent you? Nobody? Then come back when somebody does.',
  fish: 'Shh. You’ll scare the fish.',
  baker: 'We’re not open to strangers. Go home.',
  samir: '',
};
