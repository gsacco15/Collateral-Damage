# Collateral Damage

An interactive, paper-model explainer of **collateral damage estimation**: how militaries estimate, before a strike, how many civilians may be killed or badly hurt, and who must approve it.

Pick a target in a paper city, choose the weapon, fuze, direction of attack, aim point, hour and day, and watch **Jev**, the simulation engine underneath, rerun the estimate hundreds of times. Or let Jev sweep thousands of plans in parallel web workers while you watch and throttle it.

> An explainer, not a targeting tool. The city, weapon effects, pattern of life, materials, shielding and approval levels are simplified and invented for teaching. The two approval thresholds are as reported in the press. Real estimates rest on classified data, and the decisions that matter, whether a target is lawful and whether the harm is excessive, are made by people.

Inspired by an explainer video by [Tobias Schneider](https://x.com/tobiaschneider).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Jev's tests
npm run build      # static site in dist/
```

Share a view with `#at=x,y,zoom` (metres and zoom), plus optionally `&h=hour&d=friday`, e.g. `/#at=585,200,4.2&h=12.5&d=friday` for Friday prayers at the Great Mosque.

## Jev, the engine (`src/jev/`)

Typed, seeded and pure: no DOM. The page, the map, the 3D model and every worker run the same code, so any plan's numbers can be reproduced exactly.

| File | What it does |
| --- | --- |
| `city.ts` | The city: 8 districts, named streets, a canal with 3 bridges, ~900 buildings, open spaces, compound walls, trees, 4 targets, places to discover, and a 2 m occupancy grid |
| `life.ts` | Pattern of life: hour-by-hour schedules for every kind of building and open space, weekday and Friday; overhead / phone / census sources |
| `effects.ts` | Weapons, fuzes, detonation height, blast and fragment harm in 3D, fragments blocked by buildings and walls, collapse by material |
| `estimate.ts` | The Monte Carlo estimate; the crude circle (protected sites, hazards, open ground); who signs off |
| `search.ts`, `pool.ts`, `worker.ts` | Jev's search: every weapon × fuze × direction × aim × hour, scored in a throttleable pool of workers |

### What changes the estimate

- **Weapon and fuze**: blast and fragment radii, accuracy; delay fuzes go off a floor down and walls catch the fragments; airbursts spray widest.
- **Direction of attack**: fragments lean the way the bomb travels.
- **Aim point**: drag it anywhere on the target.
- **Materials**: concrete shields more than brick, mud brick, or tin sheet; tall concrete only comes down under a big blast, mud brick and tin under a small one.
- **Floors**: people are placed floor by floor; floor slabs damp a blast between storeys.
- **Buildings and walls in the way**: fragments are traced across the grid; each building or wall crossed stops most of them. The map shows the shadows this casts in the spray.
- **Hour and day**: homes full at night, the school full on weekdays, the mosque packed at Friday noon, the stadium on a Friday afternoon, the souk and bus station by day, traffic on the boulevard.
- **Open ground**: people in squares, markets, yards, the stadium and the street have no walls at all; people in cars a little.
- **Hazards**: fuel tanks can go off; weapons stored in the target can too.
- **Protected sites**: a hospital, school or place of worship inside the circle pushes sign-off up a level.
- **What you've seen**: hours of observation narrow the guess; logging a count for a building replaces the guess.

### The targets

| Target | The dilemma |
| --- | --- |
| Warehouse 14 | Said to hold weapons. A school across the road, a fuel depot round the corner. |
| Tower 7, top floor | A reported command post above eight floors of families. |
| Vehicle yard | Trucks in an open yard: easy at night, crowded by day. |
| Boulevard bridge | A supply route, and the road from Tin Hill to the hospital. Only big weapons drop it. |

## The app (`src/ui/`, `src/view/`)

A planning HUD around the paper city:

- **Top bar**: the four targets as missions, places explored, the guide, Map / 3D.
- **Plan dock** (left): six steps, each with a one-line summary and a status: target (briefing, protected sites and hazards in range, lawful), weapon and fuze, approach and aim (a heading dial; drag the crosshair on the map), intelligence (hours watched, counting people), rules and sign-off, decide.
- **Map** (centre): the danger field (the chance someone in the open is killed or badly hurt, with 1-in-10 and 1-in-2 contours, shadowed by buildings), people, fragments, the crude circle, landings, protected sites, labels found by exploring. Click any building for overhead / phone / census counts.
- **Timeline** (under the map): the expected harm and the nine-in-ten band for every hour of a weekday or a Friday; drag the playhead to change the hour.
- **Estimate** (right): headline numbers, who must approve, the distribution of runs and the chance of at least N people (two charts on one x-axis, never two y-axes), where the harm comes from (by source and by place), and every weapon against every fuze.
- **Jev** (right, second tab): the parallel search with throttle, workers, requirement and search space; the trade-off chart with its frontier; Jev's pick; the log.
- **3D**: the same city, people and strike as a tilted model, loaded on demand.

## Later

- A **live clock**: people move continuously and Jev re-estimates as they do, instead of stepping by the hour.
