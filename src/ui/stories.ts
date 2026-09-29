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
  desert: { line: 'An hour east on a dirt track: sand to the horizon, an old camp half buried by the wind, and a herding family who winter there with their goats. At night you can see every star.', when: 'The family is home at night; out with the flock by day.' },
  kilns: { line: 'The Kilnworks: brick kilns, a flour mill that never stops, and the freight line out of town. The chimneys smoke from before dawn; whole families work the brick yard together.', when: 'Early mornings at the kilns; the mill all night.' },
  groves: { line: 'Date palms, plastic greenhouses and a web of little channels fed by the canal. The same three families have farmed here for generations.', when: 'Dawn and dusk, out of the heat.' },
  camp: { line: 'Amal Camp: families who fled the fighting in the villages, in rows of white tents. Some arrived last week, some six years ago. Canvas stops nothing.', when: 'Full at night, and most of the day: there is nowhere else to be.' },
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
  'Flour Mill': { line: 'It grinds the flour for half the city’s bread. Three shifts, day and night; the night shift sings to stay awake.', when: 'Never empty.' },
  'Grain Silos': { line: 'Four concrete silos, the tallest things south of the boulevard. Pigeons live in the gaps under the roofs.', when: 'Nobody inside.' },
  "Workers' Hostel": { line: 'Bunk rooms for the kiln and mill workers, men who send almost everything they earn home to the villages.', when: 'Full at night; by day, whoever is off shift.' },
  'Mill yard': { line: 'Flour trucks wait here to be loaded. The drivers play cards on upturned crates.', when: 'Mornings.' },
  'Brick Kilns': { line: 'Three kilns, fired for days at a time. Whole families work them, children stacking the green bricks beside their parents.', when: 'Dawn until the heat, then late afternoon.' },
  'Kiln chimney': { line: 'You can see the smoke from anywhere in the city. When it stops, people ask why.', when: '' },
  'Brick yard': { line: 'Rows of wet clay bricks drying in the sun, turned by hand one at a time. Forty thousand a day, a woman here says.', when: 'Early morning.' },
  Scrapyard: { line: 'Cars, fridges, tangles of rebar. Boys sort copper wire for a few coins a kilo.', when: 'By day.' },
  Greenhouses: { line: 'Tunnels of plastic sheet over tomatoes and cucumbers. Inside it is ten degrees hotter; work stops at nine.', when: 'Dawn.' },
  Farmhouse: { line: 'Mud walls, a vine over the door, a grandmother who remembers when the canal was dug.', when: 'Always someone home.' },
  'Pump House': { line: 'An old diesel pump lifts water from the canal into the channels. When it breaks, the whole grove waits.', when: 'Dawn and dusk.' },
  'Date grove': { line: 'Three hundred palms in rows, each one tended by hand. The harvest is in autumn; the children climb for the first dates.', when: 'Dawn and dusk.' },
  'Tent School': { line: 'Two hundred children in a tent built for sixty. Lessons in two shifts; the blackboard is a painted sheet of plywood.', when: 'Weekdays, eight until one.' },
  'Camp Clinic': { line: 'One doctor, two nurses and a queue from before dawn: coughs, dehydration, babies born in tents.', when: 'Mornings.' },
  'Distribution Point': { line: 'Flour, oil, lentils, once a week per family. The queue starts at six; nobody wants to be at the back.', when: 'Weekday mornings: hundreds in the open.' },
  'Water tanks': { line: 'Filled by truck every morning. When the truck is late, everyone knows.', when: '' },
  'Camp Taps': { line: 'Six taps for the whole camp. Girls carry the water home in yellow jerrycans, talking the whole way.', when: 'Early morning and evening.' },
  'Dirt Pitch': { line: 'Goals made from tent poles. The camp league has eleven teams, all named after villages that are not there any more.', when: 'Late afternoon.' },
  'Old barracks': { line: 'Built for training, years ago, and left. One room now has carpets on the floor and a gas stove: Salem’s family winters here.', when: 'Full at night.' },
  Guardhouse: { line: 'Empty. Someone has painted a goat on the door.', when: '' },
  'Old radio mast': { line: 'Rusting, and no longer connected to anything. It is the tallest thing for twenty kilometres; the herders steer by it.', when: '' },
  'Water tower': { line: 'Filled by a tanker once a month. The goats know the sound of the truck.', when: '' },
  'Herders’ tents': { line: 'Black goat-hair tents, the way Salem’s grandfather made them. Tea is always on.', when: 'Evenings, when the flock comes in.' },
  'Fountain Circus': { line: 'The roundabout at the heart of the city. The fountain has not worked in years, but people still meet "at the fountain".', when: 'Rush hours.' },
};

const KIND_NAME: Partial<Record<Space['kind'], string>> = { park: 'Park', pitch: 'Sports', market: 'Market', cemetery: 'Cemetery', busstation: 'Transport', plaza: 'Square', playground: 'Playground', yard: 'Yard', courtyard: 'Courtyard', field: 'Farmland', brickyard: 'Work', scrapyard: 'Work', distribution: 'Aid' };

const inRect = (q: Rect, x: number, y: number, pad = 0) => x >= q.x - pad && x <= q.x + q.w + pad && y >= q.y - pad && y <= q.y + q.h + pad;

/** Where you clicked, if it wasn't a building: a named open space, the fountain, a street, the canal or the district. */
export function placeAt(w: World, x: number, y: number): PlaceStory {
  const sp = w.spaces.find((s) => inRect(s.rect, x, y) && s.name);
  if (sp?.name) return { title: sp.name, kind: KIND_NAME[sp.kind] ?? 'Open ground', named: true, ...(PLACES[sp.name] ?? { line: 'Open ground. Nothing here stops a fragment.' }) };
  if (Math.hypot(x - w.roundabout.x, y - w.roundabout.y) < w.roundabout.r + 6) return { title: 'Fountain Circus', kind: 'Landmark', named: true, ...PLACES['Fountain Circus'] };
  if (Math.abs(x - riverX(y)) < w.river.width / 2 + 4 && !(Math.abs(y - 800) < 4 && y > 700)) return { title: 'The Canal', kind: 'Water', ...DISTRICTS.canal };
  const rail = w.extras.rail;
  if (Math.abs(y - rail.y) < 5 && x < rail.x1) return { title: 'The Railway', kind: 'Railway', line: 'The freight line out to the villages and the border. Two trains a day, if they come; children put coins on the rail to be flattened.', when: 'Morning and evening.' };
  const rd = w.roads.find((r) => inRect(r.rect, x, y, 1));
  const d = districtAt(w, x, y);
  const dist = w.districts.find((q) => q.id === d);
  if (rd) return { title: rd.name, kind: rd.kind === 'boulevard' ? 'Boulevard' : rd.kind === 'bridge' ? 'Bridge' : 'Street', line: `${rd.kind === 'boulevard' ? 'Four lanes, a median of palms, and most of the city’s traffic.' : rd.kind === 'bridge' ? (rd.name === 'Camp footbridge' ? 'A narrow footbridge: the way from Amal Camp to work in the Kilnworks and the groves. At dawn it is shoulder to shoulder.' : 'One of three ways across the canal.') : 'A street in'} ${rd.kind === 'street' && dist ? `${dist.name}. ${DISTRICTS[d]?.line.split('. ')[0] ?? ''}.` : ''}`.trim(), when: rd.kind === 'boulevard' ? 'Rush hours, and every Friday evening.' : undefined };
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

/** The briefed targets, told as the people around them. Narrated when you pick one from the top bar. */
export const TARGET_STORIES: Record<'warehouse' | 'tower' | 'yard' | 'bridge' | 'house' | 'depot' | 'office' | 'station' | 'mill' | 'pump' | 'camp' | 'mosque' | 'outpost', { title: string; text: string }> = {
  warehouse: {
    title: 'Warehouse 14',
    text: "Intelligence says rockets are stored inside, moved in over three nights last month, and that they could be fired from here within days. Across the street, Mrs Haddad's class of seven-year-olds is learning to count to a hundred. Round the corner, Karim is filling the fuel tanker he drives out to the villages every morning. Whatever is decided here, they are the ones who will live with it.",
  },
  tower: {
    title: 'Tower 7',
    text: "A source says the top floor is used as a command post: radios on the roof, a lookout, men who come and go after dark. Below them live nine floors of families. On the fourth, Samira is sewing a wedding dress for her niece; the wedding is on Friday. On the second, an old man keeps pigeons on his balcony and names every one. The children run the stairs, because the lift hasn't worked since spring. To reach the top floor, a bomb has to pass through all of them, or be small enough, and precise enough, not to.",
  },
  yard: {
    title: 'The vehicle yard',
    text: "The trucks that carry weapons to the front are said to leave from here, at night. Destroy the trucks, the reasoning goes, and fewer weapons arrive. By day it's where Yusuf's father fixes engines, and where the boys from the Workshops play football between the lorries at lunchtime. The tea seller parks his cart by the gate at eleven, every single day. At three in the morning the yard is nearly empty. At noon it isn't. The same place, two very different numbers.",
  },
  house: {
    title: 'A house on Tin Hill',
    text: "A commander is said to sleep here most nights, with his wife and three children. Next door, Fatima runs a sewing school from her front room; eight girls come every afternoon. The walls between the houses are tin. They stop nothing. He is the target. Everyone else on this lane is simply home.",
  },
  depot: {
    title: 'The fuel depot',
    text: "The report says it fuels the trucks that move weapons. It also fuels the ambulances, the bakery ovens, and the generators that keep Tin Hill's lights on. Karim fills his tanker here every morning. Four tanks of fuel: if they go up, the fire won't care who they were meant for.",
  },
  office: {
    title: 'The District Office',
    text: "On its roof, a radio mast said to relay orders to fighters in the east. Downstairs, every weekday, a queue: birth certificates, land deeds, pensions. Hana has worked the front desk for twenty-two years and knows half the city by name. Strike at night and the building is empty. Strike at ten, and the queue is out of the door.",
  },
  station: {
    title: 'The bus station',
    text: "A minibus is reported to be carrying weapons, one of the forty that leave from here every day. Students going home for the weekend. A grandmother with a crate of chickens. Drivers calling out the names of their towns. Which minibus? Nobody knows for sure. And nothing here stops a fragment.",
  },
  mosque: {
    title: 'The Great Mosque, Friday noon',
    text: "The most senior commander in the region, a man planners have hunted for years, is said to come here for Friday prayers. This is the only hour anyone can say where he will be. It is also the hour when the mosque, the courtyard and the lanes around it hold more people than anywhere else in the city: shopkeepers, grandfathers, boys in their best clothes, holding their fathers' hands. The mosque is on the no-strike list. Whether any target could justify this is not a question Jev can answer. Someone very senior would have to sign.",
  },
  outpost: {
    title: 'The old camp in the desert',
    text: "An hour east on a dirt track: sand banks, an obstacle course, a radio mast. Satellite images show a training camp. The images are two years old. The men left long ago. Salem's family winters here now: his wife, his mother, four children and two hundred goats. The tallest thing for twenty kilometres is the mast, and the children climb it to look for the tanker bringing water. From above, a tent looks like a tent. Nothing in the picture says who is inside.",
  },
  mill: {
    title: 'The Flour Mill',
    text: "A storeroom at the back is said to hide a workshop that builds rocket parts. The mill grinds the flour for half the city's bread, and it never stops: forty men on the night shift, forty more by day. Omar runs the rollers at night so he can walk his daughter to school in the morning. There is no empty hour to wait for. And if the mill stops, by the end of the week the bakeries do too.",
  },
  pump: {
    title: 'The Pump House',
    text: "A rocket team is said to fire from the groves at night, and to hide its launcher by the pump house. The pump is older than anyone who works it. Every dawn, Abu Salim starts it by hand and the water runs down the channels to three hundred palms. His granddaughter keeps bees beside the farmhouse. At night the groves are nearly empty. But without the pump, by summer, nothing here will be alive.",
  },
  camp: {
    title: 'A tent in Amal Camp',
    text: "A man who arrived last month is said to be recruiting for the fighters, from a tent in the middle of the camp. Around him: two hundred and sixty tents, and families who already fled once. Next row over, Maryam teaches the alphabet to children who have never seen a real classroom. The walls here are canvas. Nothing, not one thing, stops a fragment. And there is nowhere else for anyone to go.",
  },
  bridge: {
    title: 'The Boulevard Bridge',
    text: "It's the only crossing heavy trucks can use. Cut it, the report says, and supplies to the east slow to a crawl. It's also how people on Tin Hill reach the hospital. Twice a week, Amal pushes her mother across it in a wheelchair, for dialysis. Boys fish off the rail. At dusk, couples walk it, because it's the only place in the city that catches a breeze. Only a big bomb brings it down, and once it's gone, the hospital is an hour further away for everyone on the other side.",
  },
};
