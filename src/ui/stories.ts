// Small stories for the places in the city: who lives and works there, what a day there sounds like.
// Invented, like the city. They're here so the map is a place with people in it, not a grid of targets.
import { riverX, type Rect, type Space, type World } from '../jev';

export interface PlaceStory {
  title: string;
  kind: string; // "District", "Park", "Street"…
  line: string;
  when?: string; // when it's busy
  named?: boolean; // a particular place (a park, a square), not a street or a district
}

const DISTRICTS: Record<string, Omit<PlaceStory, 'title' | 'kind'>> = {
  terraces: { line: 'Concrete blocks of flats, four to nine floors. Washing on every balcony, satellite dishes on every roof. Most families here have three generations under one roof.', when: 'Full at night; the lifts stop working most afternoons.' },
  civic: { line: "Offices, the hospital, a school and the park. Nurses on the night shift cross paths with clerks on the morning bus.", when: 'Busy on weekday mornings.' },
  oldtown: { line: 'Mud-brick lanes too narrow for cars, around the Great Mosque. Some houses have belonged to the same family for two hundred years.', when: 'Crowded at Friday noon prayers.' },
  garden: { line: 'Villas behind walls, orange trees, a football pitch. Doctors, teachers and a retired judge who feeds the street cats.', when: 'Quiet by day; the pitch fills on Friday afternoons.' },
  workshops: { line: 'Warehouses, garages and the fuel depot. Mechanics, welders, a man who has fixed the same bus for twenty years.', when: 'Busy by day, empty at night.' },
  quarter: { line: 'The Weavers’ Quarter: small workshops downstairs, families upstairs. You can hear the looms from the street.', when: 'Always someone at home.' },
  market: { line: 'The souk and the bus station. Everything is for sale here, from phone cards to live chickens.', when: 'Packed from ten until two.' },
  tinhill: { line: 'Tin-roofed houses built by people who came here with nothing, one room at a time. Tin stops nothing.', when: 'Full at night.' },
  canal: { line: 'Open water and tree-lined quays. Boys fish off the bridges; old men play backgammon in the shade.', when: 'Evenings, when it cools down.' },
};

const PLACES: Record<string, Omit<PlaceStory, 'title' | 'kind'>> = {
  'Olive Park': { line: 'Eighty old olive trees and a playground. Grandparents on benches, children on the swings, a man who sells cold water from a cart.', when: 'Late afternoon and evening.' },
  'Bus Station': { line: 'Minibuses to every town within a day’s drive. Drivers shout destinations; students sleep against their bags.', when: 'Early morning and evening rush.' },
  Stadium: { line: 'A dusty pitch with one stand. The local team has not won a match all season, and nobody minds.', when: 'Friday afternoons.' },
  Cemetery: { line: 'Whitewashed graves under cypress trees. Families come on Fridays to sit with the dead and bring water for the plants.', when: 'Friday mornings.' },
  'Great Mosque': { line: 'Eight hundred years old, rebuilt three times. The courtyard is the coolest place in the city at noon.', when: 'Friday noon: thousands.' },
  'Covered Market': { line: 'The souk: spice sellers, tailors, a café that has served the same sweet tea since before anyone can remember.', when: 'Ten until two.' },
  'City Hospital': { line: 'Four hundred beds and one working lift. The maternity ward is on the top floor.', when: 'Never empty.' },
  'Cotton Street School': { line: 'Three hundred children, two shifts. The headteacher knows every one of them by name.', when: 'Weekdays, eight until two.' },
  'North School': { line: 'A newer school, concrete, with a basketball hoop that has no net.', when: 'Weekdays, eight until two.' },
  'Quarter Clinic': { line: 'Two doctors, one nurse, a queue that starts before dawn.', when: 'Weekday mornings.' },
  'District Office': { line: 'Birth certificates, land deeds, complaints about the water supply.', when: 'Weekday mornings.' },
  'Old Square': { line: 'A paved square under a single huge fig tree. Men argue about football here; women buy bread from the oven in the corner.', when: 'Mornings and after sunset.' },
  'The Souk': { line: 'Stalls under canvas and corrugated tin. A boy sells sugar cane juice; his grandfather sold it on the same spot.', when: 'Ten until two, and Thursday evenings.' },
  'Mosque courtyard': { line: 'Marble worn smooth by eight centuries of bare feet. Pigeons, a fountain for washing before prayer, shade by noon.', when: 'Friday noon: shoulder to shoulder.' },
  'School yard': { line: 'Chalk lines for hopscotch, a football that is mostly tape. Break time is the loudest ten minutes of the day on Cotton Street.', when: 'Weekdays, ten and twelve.' },
  'North School yard': { line: 'A concrete yard and one tree everybody wants to sit under.', when: 'Weekdays at break.' },
  'Office forecourt': { line: 'Where people queue for the District Office, holding folders of papers they have been asked for twice already.', when: 'Weekday mornings.' },
  'Vehicle Yard': { line: 'Trucks, a fuel bowser, a mechanic’s hut. Drivers wait here for loads, drinking tea from glasses.', when: 'By day.' },
  'Water Point': { line: 'Tin Hill’s only tap. Children fill yellow jerrycans and carry them home two at a time.', when: 'Early morning and evening.' },
  'Fountain Circus': { line: 'The roundabout at the heart of the city. The fountain has not worked in years, but people still meet "at the fountain".', when: 'Rush hours.' },
};

const KIND_NAME: Partial<Record<Space['kind'], string>> = { park: 'Park', pitch: 'Sports', market: 'Market', cemetery: 'Cemetery', busstation: 'Transport', plaza: 'Square', playground: 'Playground', yard: 'Yard', courtyard: 'Courtyard' };

const inRect = (q: Rect, x: number, y: number, pad = 0) => x >= q.x - pad && x <= q.x + q.w + pad && y >= q.y - pad && y <= q.y + q.h + pad;

/** Where you clicked, if it wasn't a building: a named open space, the fountain, a street, the canal or the district. */
export function placeAt(w: World, x: number, y: number): PlaceStory {
  const sp = w.spaces.find((s) => inRect(s.rect, x, y) && s.name);
  if (sp?.name) return { title: sp.name, kind: KIND_NAME[sp.kind] ?? 'Open ground', named: true, ...(PLACES[sp.name] ?? { line: 'Open ground. Nothing here stops a fragment.' }) };
  if (Math.hypot(x - w.roundabout.x, y - w.roundabout.y) < w.roundabout.r + 6) return { title: 'Fountain Circus', kind: 'Landmark', named: true, ...PLACES['Fountain Circus'] };
  if (Math.abs(x - riverX(y)) < w.river.width / 2 + 4) return { title: 'The Canal', kind: 'Water', ...DISTRICTS.canal };
  const rd = w.roads.find((r) => inRect(r.rect, x, y, 1));
  const d = districtAt(w, x, y);
  const dist = w.districts.find((q) => q.id === d);
  if (rd) return { title: rd.name, kind: rd.kind === 'boulevard' ? 'Boulevard' : rd.kind === 'bridge' ? 'Bridge' : 'Street', line: `${rd.kind === 'boulevard' ? 'Four lanes, a median of palms, and most of the city’s traffic.' : rd.kind === 'bridge' ? 'One of three ways across the canal.' : 'A street in'} ${rd.kind === 'street' && dist ? `${dist.name}. ${DISTRICTS[d]?.line.split('. ')[0] ?? ''}.` : ''}`.trim(), when: rd.kind === 'boulevard' ? 'Rush hours, and every Friday evening.' : undefined };
  return { title: dist?.name ?? 'The city', kind: 'District', ...(DISTRICTS[d] ?? { line: '' }) };
}

/** A story for a named building, if it has one. */
export const storyFor = (name: string | undefined) => (name ? PLACES[name] : undefined);

function districtAt(w: World, x: number, y: number): string {
  const bl = w.blocks.find((b) => inRect(b, x, y, 8));
  if (bl) return bl.district;
  let best = w.districts[0];
  for (const d of w.districts) if (Math.hypot(d.x - x, d.y - y) < Math.hypot(best.x - x, best.y - y)) best = d;
  return best.id;
}
