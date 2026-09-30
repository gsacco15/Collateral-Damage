// Who a red ring was: a name, an age, and what they were doing when the bomb fell.
// Invented, like everyone in the city, but drawn from where they were and the hour, so each one is plausible
// and stays the same person every time you look.
import { rng, type Building } from '../jev';
import type { Car, Walker } from '../view/crowd';
import type { Ent } from '../view/lifeScene';

export interface Person {
  name: string;
  age: number;
  doing: string;
}

const HER = ['Mariam', 'Layla', 'Noor', 'Huda', 'Salma', 'Rania', 'Aya', 'Dalia', 'Hana', 'Yasmin', 'Farah', 'Lina', 'Sara', 'Amal', 'Zainab', 'Rasha', 'Iman', 'Nadia', 'Reem', 'Samira', 'Fatima', 'Asma', 'Ruqaya', 'Suha'];
const HIM = ['Omar', 'Yusuf', 'Ali', 'Karim', 'Hamza', 'Sami', 'Tariq', 'Adam', 'Bilal', 'Nabil', 'Khalil', 'Faris', 'Ziad', 'Rami', 'Mahmoud', 'Hassan', 'Ibrahim', 'Jamal', 'Walid', 'Anas', 'Mustafa', 'Salim', 'Jabir', 'Idris'];

const pick = <T,>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)];
const between = (r: () => number, a: number, b: number) => a + Math.floor(r() * (b - a + 1));

function named(r: () => number, female: boolean, age: number, doing: string): Person {
  return { name: pick(r, female ? HER : HIM), age, doing };
}

/** An adult, a child or an elder, in proportions that suit a family home. */
function household(r: () => number) {
  const u = r();
  return u < 0.07 ? between(r, 0, 3) : u < 0.27 ? between(r, 4, 15) : u < 0.88 ? between(r, 16, 64) : between(r, 65, 88);
}

function atHome(r: () => number, age: number, hour: number) {
  if (hour >= 22 || hour < 6) return age < 4 ? 'asleep in the same room as their mother' : 'asleep';
  if (age < 4) return pick(r, ['at home with family', 'having a nap', 'playing on the floor']);
  if (age < 16) return hour < 8 ? 'getting ready for school' : hour >= 15 ? pick(r, ['doing homework', 'playing on the roof', 'watching cartoons']) : 'home from school, unwell';
  if (age >= 65) return pick(r, ['resting after lunch', 'listening to the radio', 'sitting by the window', 'having tea']);
  if (hour < 9) return pick(r, ['making breakfast', 'getting ready for work', 'hanging out the washing']);
  if (hour >= 18) return pick(r, ['eating dinner with family', 'watching the news', 'washing up after dinner']);
  return pick(r, ['cooking lunch', 'cleaning the house', 'at home, between shifts', 'looking after a sick parent']);
}

/** Someone inside a building: slot i of building b, at this hour. */
export function personIn(b: Building, i: number, hour: number, friday: boolean): Person {
  const r = rng(b.id * 7919 + i * 104729 + 11);
  const female = r() < 0.5;
  const h = Math.floor(hour) % 24;
  switch (b.kind) {
    case 'school':
      if (!friday && h >= 7 && h < 15 && r() < 0.86) {
        const age = between(r, 6, 12);
        return named(r, female, age, h === 10 || h === 12 ? 'at break, in the yard' : `in class, Year ${age - 5}`);
      }
      return named(r, female, between(r, 24, 60), h >= 7 && h < 16 ? pick(r, ['teaching Year 3', 'marking books', 'in the staff room']) : 'the night caretaker');
    case 'hospital':
    case 'clinic': {
      const staff = r() < 0.35;
      return staff ? named(r, female, between(r, 23, 60), pick(r, ['a nurse on the ward', 'a doctor on shift', 'cleaning the corridor'])) : named(r, female, household(r), pick(r, ['waiting to be seen', 'a patient, recovering', 'visiting a relative']));
    }
    case 'mosque':
    case 'minaret':
      return named(r, r() < 0.2, between(r, 9, 80), friday && h >= 11 && h < 14 ? 'at Friday prayers' : pick(r, ['at prayer', 'reading quietly', 'sweeping the courtyard']));
    case 'shop':
    case 'stand':
      return r() < 0.4 ? named(r, female, between(r, 18, 66), 'behind the counter') : named(r, female, household(r), pick(r, ['buying bread', 'buying vegetables', 'waiting to pay']));
    case 'office':
    case 'hall':
      return named(r, female, between(r, 21, 63), pick(r, ['at a desk', 'in a meeting', 'on the phone', 'making tea for the office']));
    case 'workshop':
    case 'factory':
    case 'warehouse':
    case 'kiln':
    case 'silo':
      return named(r, r() < 0.15, between(r, 16, 62), pick(r, ['at the lathe', 'loading crates', 'welding a gate', 'firing the kiln', 'sweeping the floor', 'on a tea break']));
    case 'fueltank':
      return named(r, false, between(r, 19, 58), 'filling a tanker');
    case 'greenhouse':
      return named(r, female, between(r, 14, 70), 'picking tomatoes');
    case 'shelter':
    case 'tent': {
      // A shelter in town is a bus stop; in the camp it's someone's home.
      if (b.kind === 'shelter' && b.district !== 'camp') return named(r, female, between(r, 8, 78), pick(r, ['waiting for the minibus south', 'waiting for a bus home', 'selling tickets from a folding table', 'seeing a cousin off']));
      const age = household(r);
      return named(r, female, age, h >= 21 || h < 6 ? 'asleep in the tent' : age < 16 ? 'playing between the tents' : 'queueing for water');
    }
    case 'barracks':
      return named(r, false, between(r, 18, 40), h >= 22 || h < 6 ? 'asleep in the barracks' : 'on duty');
    case 'home':
    case 'apartment':
    case 'villa':
    case 'shack':
    default: {
      const age = household(r);
      return named(r, female, age, atHome(r, age, h));
    }
  }
}

const FEMALE_WEAR = new Set(['hijab', 'shawl', 'abaya', 'burqa']);

/** Someone outside: on the street, in a square or a yard. */
export function personOut(w: Walker, hour: number, place?: string): Person {
  const r = rng(w.id * 6007 + 3);
  const female = FEMALE_WEAR.has(w.wear) || (w.wear === 'bare' && r() < 0.5);
  // Living: the groups outside the usual pattern, and those who came after a strike, say who they were.
  const group = w.role ?? w.crowd?.split('@')[0];
  if (group === 'security') return named(r, false, between(r, 20, 50), pick(r, ['a police officer at the cordon', 'a police officer on duty at the checkpoint']));
  if (group === 'firefighter') return named(r, false, between(r, 22, 50), pick(r, ['a firefighter, putting out the fire', 'a firefighter, holding the hose']));
  if (group === 'medic') return named(r, female, between(r, 22, 55), pick(r, ['a medic, treating the wounded', 'a paramedic, carrying a stretcher']));
  if (group === 'vendor') return named(r, female, between(r, 14, 70), pick(r, ['selling tea from a flask', 'selling sweets from a tray', 'selling phone cards and cigarettes']));
  if (group === 'unhoused') return named(r, female, between(r, 12, 80), pick(r, ['sleeping rough, with nowhere else to go', 'living on the street since the war took the house']));
  if (group === 'help') return named(r, female, between(r, 14, 70), pick(r, ['came back to dig out the wounded', 'searching the rubble for a neighbour', 'carrying the injured out']));
  if (group === 'gate') return named(r, female, between(r, 22, 60), 'a parent, come to take their child home');
  if (group === 'elderly') return named(r, female, between(r, 66, 90), pick(r, ['sitting out on the doorstep', 'watching the street, as every morning', 'talking with a neighbour']));
  if (group === 'displaced') return named(r, female, between(r, 8, 70), pick(r, ['queuing for flour at the distribution point', 'carrying water back to the tent', 'waiting to register for aid']));
  if (group === 'visitor') return named(r, female, between(r, 18, 70), pick(r, ['just off the bus, visiting family', 'arrived this morning to see a doctor', 'waiting for a lift with their bags']));
  if (group === 'aid') return named(r, female, between(r, 23, 58), pick(r, ['an aid worker handing out flour', 'an aid worker registering families', 'a nurse at the camp clinic']));
  if (group === 'hospital') return named(r, female, between(r, 16, 75), 'waiting at the hospital for news of a relative');
  if (place && /school yard/i.test(place)) return named(r, female, between(r, 6, 12), 'playing in the school yard');
  if (place && /market|souk/i.test(place)) return named(r, female, household(r) || 30, 'shopping at the market');
  if (place && /park|garden/i.test(place)) return named(r, female, household(r), 'sitting in the park');
  const age = between(r, 9, 75);
  const h = Math.floor(hour) % 24;
  return named(r, female, age, age < 16 && h < 9 ? 'walking to school' : pick(r, ['walking home', 'on the way to the market', 'crossing the road', 'waiting for a lift', 'carrying shopping home']));
}

/** Someone in a car. */
export function personInCar(c: Car): Person {
  const r = rng(c.id * 4001 + 5);
  return named(r, r() < 0.3, between(r, 19, 70), pick(r, ['driving to work', 'driving a taxi', 'a passenger, going home', 'delivering bread']));
}

/** Someone drawn as part of a scene (a café, the canal bank, the warehouse yard, a strike's responders): who, by what they're doing. */
export function personScene(e: Extract<Ent, { t: 'person' }>, night: boolean): Person {
  const r = rng(e.id * 5003 + 11);
  const female = r() < (e.role || e.smoke ? 0.08 : 0.35);
  if (e.role === 'firefighter') return named(r, false, between(r, 22, 50), pick(r, ['a firefighter, putting out the fire', 'a firefighter, holding the hose']));
  if (e.role === 'medic') return named(r, female, between(r, 22, 55), pick(r, ['a medic, treating the wounded', 'a paramedic, bringing a stretcher']));
  if (e.role === 'security') return named(r, false, between(r, 20, 50), 'a police officer, keeping people back from the ruin');
  const id = e.id;
  const doing =
    id >= 500 && id < 520 ? (night ? 'the night guard at the yard' : e.carry ? 'loading crates onto a truck' : pick(r, ['working in the yard', 'taking a break from loading'])) :
    id >= 400 && id < 500 ? pick(r, ['living in a shelter, sitting out', 'sitting outside the family shelter']) :
    id >= 300 && id < 400 ? 'picking over the landfill for scrap' :
    id >= 200 && id < 300 ? 'warming up by the fire' :
    id >= 140 && id < 200 ? 'out for a cigarette by the shop door' :
    id >= 100 && id < 140 ? (e.smoke ? 'sharing a hookah at the café' : 'drinking tea at the café') :
    id >= 80 && id < 100 ? 'fishing from the bank' :
    id >= 60 && id < 80 ? 'sitting with friends by the water' :
    e.sit ? pick(r, ['sitting by the canal', 'resting in the shade']) : pick(r, ['walking along the water', 'waiting for a friend']);
  return named(r, female, between(r, id >= 100 && id < 200 ? 18 : 12, 70), doing);
}

/** Someone on a bicycle. */
export function personCycling(i: number): Person {
  const r = rng(i * 7717 + 19);
  return named(r, r() < 0.12, between(r, 12, 60), pick(r, ['cycling to work', 'cycling home', 'delivering bread by bike', 'riding to the market', 'cycling to school']));
}

/** The tooltip's two lines. */
export const personLine = (p: Person, where?: string) => `<b>${p.name}, ${p.age === 0 ? 'a baby' : p.age}</b><span>${p.doing[0].toUpperCase()}${p.doing.slice(1)}${where ? ` · ${where}` : ''}</span>`;
