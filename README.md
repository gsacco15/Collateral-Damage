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

### Jev, the live model (TypeSafe)

[Jev](https://docs.typesafe.ai) reads the intelligence. For the current target and hour, the page asks `/api/jev` (an edge function in `api/jev.ts`). That function builds field reports: overhead images, phone signals, an old census and, if you've watched, an observer's count. The reports disagree. It sends them to Jev with one typed **Score** question per site ("how many people are inside?") and one **Choice** ("do the sources agree?"). Jev answers with a probability for each head count. The simulator then draws from that distribution every time it replays the strike, instead of from its own built-in guess. The Estimate tab shows the reading: each judgment, its confidence, the reports and the tokens used.

- **Key:** set `TYPESAFE_API_KEY` (or `JEV_API_KEY`) in Vercel → Project → Settings → Environment Variables. It never reaches the browser. Without it, the page says so and uses the built-in guess.
- **Cost:**
  - One call is about 600–2,200 input tokens: at the reported $0.042 per million input tokens, about $0.0001.
  - Jev is called once per target and hour, never per simulated strike; a search asks for its 8 hours.
  - The function only accepts a known target, hour, day and amount of watching, so there are at most 1,152 distinct readings, about $0.11 even if every one were asked. Answers are cached by Vercel's CDN for 30 days, so repeat visits are free.
- **Code:** the request, questions and levels are in `src/jev/intel.ts` and `src/jev/levels.ts`; tests in `src/jev/intel.test.ts`.

### Deploy (Vercel)

A static site: Jev runs entirely in the browser, in web workers, so there is no server to set up. In Vercel, **Add New → Project**, import this repository, and deploy; `vercel.json` sets the build (Jev's tests, then `vite build`) and the output folder. Every push then gets its own preview URL.

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

A planning HUD around the paper city. The map stays clear: every panel sits beside or below it, never on top, and each one folds away.

- **Top bar**: the four targets as missions, places explored, the guide, Map / 3D, and the panel switches: Plan (`P`), Timeline (`T`), Estimate (`E`) and full map (`F`). A hidden panel leaves a slim tab on the map's edge to bring it back; the estimate's tab keeps the planning figure and who must sign off in view. Your layout is remembered.
- **Layers** (`L`): one button on the map opens the layer list, with what each shows and the danger scale.
- **Plan dock** (left): six steps, each with a one-line summary and a status: target (briefing, protected sites and hazards in range, lawful), weapon and fuze, approach and aim (a heading dial; drag the crosshair on the map), intelligence (hours watched, counting people), rules and sign-off, decide.
- **Map** (centre): the danger field (the chance someone in the open is killed or badly hurt, with 1-in-10 and 1-in-2 contours, shadowed by buildings), people, fragments, the crude circle, landings, protected sites, labels found by exploring. Click any building for overhead / phone / census counts.
- **The drawer** (under the map), two tabs:
  - **The day**: the expected harm and the nine-in-ten band for every hour of a weekday or a Friday; drag the playhead to change the hour.
  - **Jev at work**: Jev's workers, the queue and the trade-off chart as it searches.
- **Estimate** (right): headline numbers, who must approve, the distribution of runs and the chance of at least N people (two charts on one x-axis, never two y-axes), where the harm comes from (by source and by place), and every weapon against every fuze.
- **Jev** (right, second tab): the parallel search with throttle, workers, requirement and search space; the trade-off chart with its frontier; Jev's pick; the log.
- **3D**: the same city, people and strike as a tilted model, loaded on demand.

### Playing with it

- **Step in**: the opening scene sets up the story; the guide walks through it in ten steps, pulsing the ring when it asks what's within reach.
- **Any building can be the target**: click it and choose *Make this the target*. The four briefed targets keep their briefings and quirks; any other building follows the general rules, its toughness coming from its material, floors and size. A picked building starts *not* confirmed as lawful: that's a judgment for people.
- **The ruins stay**: after a strike, *Next target* keeps the rubble. Nobody is inside a ruin any more, in the estimate and in Jev's search. *Roll again* replaces the last strike; *Rebuild the city* clears everything.

- **Drag the aim** on the target, and **drag the paper plane** circling the aim to choose the direction of attack. `,` and `.` turn it too; `[` and `]` step the hour.
- **Point anywhere**: the readout says who is inside a building, or how likely someone standing in the open there is to be killed or badly hurt.
- **Explore**: landmarks and streets are named as you find them; the Explored menu flies you back to anything you've found.
- **Jev at work**: when Jev runs, the drawer under the map shows its workers spinning up, the queue draining, each worker lane scoring a plan and flashing the grid of its simulated strikes, and each result flying into the trade-off chart, with a running count of simulated strikes. Change the speed, pause it, or change the plan's assumptions and watch it re-score.
- **The decision is yours**: Authorise strike opens a final-decision screen with the numbers, who must approve and any protected sites in range. Press and hold the red button until the ring fills; let go early and nothing happens. Then: weapon away, a countdown, impact, one outcome.

### Sound (`src/ui/sound.ts`, `public/audio/`)

Off until you turn it on: the speaker button in the top bar, `M`, or *Listen* on the opening card.
- **Ambience:** day or night beds follow the hour; the operations room hums underneath; the market is heard when you look at the souk; the call to prayer plays at dawn and before Friday noon.
- **The interface:** soft paper clicks, a fold when you pick a weapon, a chime when you find a place, and Jev's spin-up, ticks and finish.
- **The strike:** the hold tone; the aircraft; the impact, the stamp and the aftermath. Radio lines play through a band-pass "radio" filter with squelch.
- **The guide:** narrated.

Sounds were generated with ElevenLabs; see `docs/audio-brief.md` for the list, the scripts and which files are still to come. Missing files are simply skipped.

### The paper look (`src/view/textures.ts`, `drawCity.ts`)

Every surface is a sheet of generated paper, laid in metres and turned per building so no two roofs match. The papers are crumpled white paper, grey card, kraft cardboard, tin, tile, sand, ground, road and grass, each made from soft facets, creases with a lit edge, fibres and grain. Roofs have slightly torn edges, a bright edge on the sun's side and a soft contact shadow. Trees are crumpled paper balls. A collapsed building becomes a heap of torn sheets and broken card in grey dust.

## Later

- A **live clock**: people move continuously and Jev re-estimates as they do, instead of stepping by the hour.
