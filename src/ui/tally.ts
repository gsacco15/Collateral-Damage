// Who one strike hurt, counted person by person: every red ring is someone the game knows (where they were, how old,
// what group they belonged to). Not an estimate: the tally of this one outcome.
import type { Building, World } from '../jev';
import type { Car, Walker } from '../view/crowd';
import type { Outcome } from '../view/map';
import { personIn, personInCar, personOut } from './people';

export interface Tally {
  total: number;
  who: { children: number; adults: number; elderly: number };
  where: [string, number][]; // most first
  groups: [string, number][]; // Living: helpers, parents, medics, police, vendors, people sleeping rough
}

const PLACE: Partial<Record<Building['kind'], string>> = {
  home: 'At home',
  apartment: 'At home',
  villa: 'At home',
  shack: 'At home',
  tent: 'At home',
  barracks: 'At home',
  school: 'At school',
  mosque: 'At the mosque',
  minaret: 'At the mosque',
  hospital: 'At the hospital or clinic',
  clinic: 'At the hospital or clinic',
  shop: 'At work or shopping',
  stand: 'At work or shopping',
};
const GROUP: Record<string, string> = {
  help: 'Came back to help',
  gate: 'Parents at the school gate',
  hospital: 'Families at the hospital',
  medic: 'Medics',
  security: 'Police',
  vendor: 'Street vendors',
  unhoused: 'Homeless, sleeping outside',
  elderly: 'Elderly, sitting out',
  displaced: 'Displaced families',
  visitor: 'Visitors off the bus',
  aid: 'Aid workers',
};

export function tallyOf(world: World, o: Outcome, walkers: Walker[], cars: Car[], hour: number, friday: boolean): Tally {
  const who = { children: 0, adults: 0, elderly: 0 };
  const where = new Map<string, number>();
  const groups = new Map<string, number>();
  const age = (a: number) => (a < 16 ? who.children++ : a >= 65 ? who.elderly++ : who.adults++);
  const add = (m: Map<string, number>, k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
  let total = 0;
  for (const [id, slots] of Object.entries(o.hurtSlots)) {
    const b = world.buildings[Number(id)];
    for (const i of slots) {
      age(personIn(b, i, hour, friday).age);
      add(where, PLACE[b.kind] ?? 'At work or shopping');
      total++;
    }
  }
  const byId = new Map(walkers.map((w) => [w.id, w]));
  for (const id of o.hurtWalkers) {
    const w = byId.get(id);
    if (!w) continue;
    age(personOut(w, hour).age);
    add(where, w.kind === 'space' && !w.crowd ? 'Out in a square, yard or market' : 'Out on the street');
    const g = w.role ?? w.crowd?.split('@')[0];
    if (g && GROUP[g]) add(groups, GROUP[g]);
    total++;
  }
  const carById = new Map(cars.map((c) => [c.id, c]));
  // A hit car had one or two people in it: the outcome's count already includes them; share the rest out here.
  const inCars = o.count - total;
  if (inCars > 0) {
    add(where, 'In cars', inCars);
    for (let k = 0; k < inCars; k++) {
      const c = carById.get(o.hurtCars[k % Math.max(1, o.hurtCars.length)]);
      age(c ? personInCar(c).age : 40);
    }
    total += inCars;
  }
  return { total, who, where: [...where].sort((a, b) => b[1] - a[1]), groups: [...groups].sort((a, b) => b[1] - a[1]) };
}
