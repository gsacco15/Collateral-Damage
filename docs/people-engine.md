# People engine ("Living" people)

Switch at the foot of the page: **People: Classic / Living**, remembered in the browser. Classic is the original
model, untouched. Living is built alongside it.

**Restore point:** commit `e128eb7` is the last version before the engine. To go back completely:
`git checkout e128eb7` (or revert the engine commits after it).

## The population stack (how the engine is organised)

```
CITY POPULATION
  ├── Regular population      homes · workers · students · shoppers        (Living model: built)
  ├── Special civilian groups unhoused · vendors · elderly · displaced · visitors · aid workers   (later)
  ├── Organised actors        police/security · emergency response · armed groups · clandestine operatives (later)
  ├── Animals                 dogs · goats · birds                          (scripted now; react later)
  └── Mission characters      the courier and the four witnesses            (scripted now)
```
Movement, counts and harm stay rules and maths. Jev (TypeSafe) will steer group behaviour with narrow, cached
questions per district and after strikes, never individuals, never the physics.

## Steps
1. **One people model** (done): residents of each district go to workplaces, schools, the souk, mosques and open
   spaces near home; each household its own size; districts on their own hours. Same totals per kind of place as
   Classic, different spread. Feeds the estimate, Jev's search, the map and 3D. Code: `src/jev/people.ts`, the
   `alive` flag on `population()`.
1b. **Living made visible** (done): pavement walkers by district (souk and civic streets busy, villa lanes quiet),
   and a steady trickle of people walking each hour's real trips (home to school and work in the morning, home in
   the evening, to the mosque on Friday). Capped at about 80 on the move. `trips()` and `streetD` in `life.ts`.
2. **Strike reactions** (done, Living only; rules in `aftermath()` in `life.ts`): each strike is remembered as a
   mark (where, hour, day, severity). For about 3 hours, fading by 8 (fewer at night):
   - a crowd returns to help at the ruin (10 to 55 people) and a second strike counts them;
   - within ~250 m shops and offices empty, people stay in, streets and squares go quiet;
   - the souk within ~450 m shuts for the rest of the day;
   - a school within ~600 m in school hours empties, parents crowd its gate;
   - families gather at the nearest hospital, which fills;
   - people, animals, teahouse circles and fishermen clear away nearby and return as it fades.
   The estimate, Jev's searches (workers get the marks), the map and 3D all use it. Rebuild the city clears it.
   The outcome card compares a roll with the estimate the strike was planned on.
3. **Jev behaviour director** (built; Living only; `src/jev/behave.ts`, `api/behave.ts`, `src/ui/behaveLive.ts`):
   - one call per hour for the whole city: five questions per district (street, work, school, market, prayer),
     given what the city is still reacting to (recent strikes, bucketed);
   - one call per strike: how the area responds (help at the ruin, shops shut, school pickup, hospital, quiet streets);
   - answers are five-step tones turned into capped multipliers (0.4 to 1.45×) on the rules; people who stay away go
     home, nobody appears or vanishes; landmarks and the physics are never touched;
   - keyed by hour, day and bucketed events, cached by the server and CDN: each question paid for once;
   - never waited on: rules act at once, Jev's answer nudges them on arrival, with a short note on the map;
   - offline (no key, local preview): rules only.

## Groups outside the usual pattern (built, Living only; `groupsOf()` in `life.ts`)
Small counted groups with their own hours, drawn in the scene and counted by the estimate like anyone else:
- **Sleeping rough:** under the canal bridges and in the park and square at night; round the souk and bus station by day.
- **Street vendors:** round the souk, at the bus station, along the boulevard; a sweets seller at the school gate
  at the start and end of the school day. Fewer at Friday prayers.
- **Police:** checkpoints at the main bridges, officers outside the station (dark blue, caps).
- **After a strike:** medics at the ruin for the first hours (white, red band); police hold a cordon for longer.
  Vendors and people sleeping rough nearby move off.

## Armed presence (built, Living only; `src/jev/armed.ts`)
- **Hidden truth:** armed men use Warehouse 14 in the evenings (and a guard some weekday mornings) and two safehouses
  (Tin Hill, Old Town) at night. Never drawn, never counted as civilians, never changes the harm estimate.
- **What you see:** an informant line (right about 70% of the time when they are there, a false tip about 18% when
  not) and, after 12+ hours watching, an observer line. Jev judges No evidence / Possible / Likely / Confirmed;
  offline, a simple rule reads the same reports.
- **After the strike:** the result card reveals the truth ("Armed men were there: 3. Not counted in the civilian
  figures." or "No armed men were there. Whatever the reports said.").

## Characters (2D and 3D)
Police in dark blue with peaked caps; medics in white with a red band; vendors with a tray of goods; people
sleeping rough with a bedroll at night. At a strike: a patrol car with lights, a fire engine and a white ambulance.

## Still to come
- Named characters for the new groups (a first responder, an officer, an operative).
