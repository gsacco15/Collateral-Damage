# Audio brief: Collateral Damage

## Status

- **Made with ElevenLabs and in `public/audio/`** (the canvas *Collateral Damage — sounds and voices* holds every node):
  - the sound effects and ambience beds, including the places in the city: park, canal, pitch, school, boulevard traffic, and the wind high above;
  - the guide, told as a story (voice: *Artaius*, ElevenLabs v3, spoken softly); the app shortens any pause longer than 0.8 s;
  - the radio: twelve calls between Cell (*Daniel*) and Overwatch (*Brian*), including Jev starting and finishing, an abort when the release button is let go early, and calling the strike off.
- **Still to make (optional):** `music-bed`.

Hand this whole file to the AI or tools you use to make the sounds and voices. It has the context, the tone, every file needed with its specs, and the scripts.

---

## Prompt to paste first

> You are the sound designer and voice director for **Collateral Damage**, an interactive web explainer. It's a paper-model city seen from above, where a player plans an air strike on a building said to hold weapons. The player estimates how many civilians could be killed or hurt, and sees who would have to approve that number. An engine called **Jev** reads the intelligence, replays the strike thousands of times with different luck, and searches for the plan that harms the fewest people.
>
> The tone is **sober, calm and documentary**, like a quiet BBC or Vox explainer. It is never a game about scoring damage, and never gung-ho or action-movie. The city is fictional and made of paper. It is a mixed Middle-Eastern-style town, with no real country, army, unit or place named.
>
> Make every file in the list below to the specs given. Keep sounds soft, dry and short unless a length is given. Loops must loop seamlessly. Name the files exactly as listed.

---

## The world, so the sounds fit

- **The city:** about 40,000 people, all paper and card, as if photographed on a table. There are eight districts:
  - The Terraces (concrete flats)
  - Civic Centre (hospital, school, park)
  - Old Town (mud-brick lanes, the Great Mosque)
  - Market Quarter (the souk, a bus station)
  - The Workshops (warehouses, a fuel depot)
  - Weavers' Quarter
  - Garden Side (villas)
  - Tin Hill (tin-roofed shacks)

  A canal with three bridges runs through it, and a boulevard crosses it.
- **Time of day matters:** the player scrubs through a 24-hour weekday or Friday.
  - Mornings: school and traffic.
  - Midday: the market. Friday noon: prayers at the Great Mosque.
  - Evenings: families home.
  - Nights: quiet, dogs, the odd car.
- **The player's room:** a targeting cell. It's quiet and focused: hum, air conditioning, the odd keyboard, a distant radio.
- **The strike:** the player holds a red button to release. A paper plane crosses the map, the bomb lands, dust rises, and a rubber stamp says **TARGET DESTROYED** or **TARGET MISSED** with the number hurt. Then a result card. The moment should feel heavy and quiet afterwards, not triumphant.

---

## Technical specs (all files)

| | Ambience and music | UI sounds | Strike sounds | Voice |
|---|---|---|---|---|
| Format | `.mp3` 192 kbps (or `.ogg`) | `.mp3` | `.mp3` | `.mp3` 192 kbps |
| Sample rate | 44.1 kHz | 44.1 kHz | 44.1 kHz | 44.1 kHz |
| Channels | stereo | mono | stereo | mono |
| Loudness | about −30 LUFS, quiet beds | about −24 LUFS, subtle | about −16 LUFS peak moments | −16 LUFS, clean, no music under it |
| Silence | loop points with no gap or click | trim to the sound | ~50 ms lead-in | 150 ms head and tail |

Put everything in `public/audio/` (voice in `public/audio/voice/`). The app will add a sound on/off button, off by default, and fade between beds.

---

## 1. Ambience and music

| File | What | Length |
|---|---|---|
| `amb-city-day.mp3` | Distant town by day: faint traffic, a moped, voices far off, birds, a shop shutter. Nothing close or loud. Loops. | 60 s |
| `amb-city-night.mp3` | Town at night: crickets, a far dog, a rare car, a generator hum somewhere. Loops. | 60 s |
| `amb-call-to-prayer.mp3` | A distant, echoing call to prayer across rooftops, soft and respectful. Plays at dawn and before Friday noon prayers. Not looped. | 20–40 s |
| `amb-market.mp3` | Market murmur: haggling voices (no clear words), crates, a cart. Faint. Plays near the souk. Loops. | 30 s |
| `amb-cell-room.mp3` | The targeting room: low electrical hum, air conditioning, an occasional soft keyboard or chair creak. Plays under the planning. Loops. | 60 s |
| `music-bed.mp3` | Sparse, tense, minimal. A low pulse or held strings, no melody, no drums. Must sit under speech. Loops. | 90–120 s |

## 2. Interface

| File | What | Length |
|---|---|---|
| `ui-hover.mp3` | A very soft paper tick. | <0.1 s |
| `ui-click.mp3` | A paper tap or a small fold. | <0.15 s |
| `ui-toggle.mp3` | Two quick notes, like flicking a paper tab. | 0.2 s |
| `ui-discover.mp3` | A soft, warm chime for finding a new place on the map. | 0.5 s |
| `ui-weapon.mp3` | A crisp origami fold, for picking a weapon (the weapon unfolds on screen). | 0.4 s |

## 3. Jev at work

| File | What | Length |
|---|---|---|
| `jev-start.mp3` | Machine spin-up: a soft rising whir with a few relay clicks. Not sci-fi. | 1.5 s |
| `jev-tick.mp3` | A tiny, dry tick for each batch of plans finished. Plays often, so it must be almost subliminal. | <0.05 s |
| `jev-read.mp3` | Paper shuffle and a soft stamp, for when Jev reads the intelligence reports. | 0.6 s |
| `jev-done.mp3` | A resolved two-tone, calm, like a task quietly finishing. | 0.6 s |

## 4. The strike

| File | What | Length |
|---|---|---|
| `hold-charge.mp3` | A rising tone while the player holds the release button. It must build for exactly 1.6 s, then stop. | 1.6 s |
| `aircraft-approach.mp3` | **The key sound.** A jet from far away to overhead, the rumble building, then passing. High altitude, not a fly-past show. | 3–4 s |
| `bomb-whistle.mp3` | A short falling whistle (optional: real guided bombs are nearly silent; we may use it quietly). | 1–2 s |
| `impact.mp3` | A deep, heavy thud and blast, then debris and dust settling. Felt more than heard: lots of low end, not a movie explosion. | 3–4 s |
| `aftermath.mp3` | A ringing in the ears fading into faint car alarms, a dog, distant shouting (no clear words). | 5–8 s |
| `stamp.mp3` | A rubber stamp pressed hard onto paper on a desk. | 0.3 s |
| `radio-static.mp3` | A short radio squelch, used before and after each radio line. | 0.3 s |

---

## 5. Radio lines

Two voices on a military radio net, speaking calmly and professionally. They're flat, clipped and unhurried; nobody is excited. Process lightly: band-limited to about 300–3,000 Hz, a touch of distortion and squelch. Use only these made-up call signs: **Overwatch** (the observer) and **Cell** (the targeting cell).

| File | Voice | Line | When |
|---|---|---|---|
| `radio-01-pol.mp3` | Overwatch | "Cell, Overwatch. Pattern of life confirmed on target." | Jev finishes reading the intelligence |
| `radio-02-estimate.mp3` | Cell | "Estimate is up. Request goes to the commander." | The final-decision screen opens |
| `radio-03-cleared.mp3` | Cell | "Cleared hot." | The hold button fills |
| `radio-04-away.mp3` | Overwatch | "Weapon away. Thirty seconds." | The plane releases |
| `radio-05-splash.mp3` | Overwatch | "Splash." | Impact |
| `radio-06-destroyed.mp3` | Overwatch | "Target destroyed." | After impact, if destroyed |
| `radio-07-intact.mp3` | Overwatch | "Negative. Target intact." | After impact, if missed |
| `radio-08-bda.mp3` | Cell | "Stand by for battle damage assessment." | As the result card appears |

---

## 6. Guide voice

One narrator, telling the story as the guide goes: calm, warm, unhurried, about the people in the city as much as the method. The narration doesn't read the on-screen text word for word. The current scripts are on the ElevenLabs canvas (the `voice/guide-00` to `guide-10` nodes, model `eleven_v3`, with `[softly]` and `[pause]` tags). The opening:

> Somewhere in this city, a man is pouring his first coffee of the day. A girl is late for school... again. An old woman walks her dog along the canal, the way she has every morning for eleven years. Forty thousand people live here. They're made of paper. But lives like theirs are real, in cities like this one, all over the world. …

## 7. Places in the city (ambience, looped)

`amb-park`, `amb-water`, `amb-pitch`, `amb-school`, `amb-traffic`, `amb-wind`. The app fades each in by how close the map's centre is to that place and how far you're zoomed in; high above the city, the places fade into one hum and a soft wind.

## Checklist to send back

- [ ] 6 ambience and music files
- [ ] 5 interface sounds
- [ ] 4 Jev sounds
- [ ] 7 strike sounds
- [ ] 8 radio lines
- [ ] 11 guide narrations
- [ ] All named exactly as above; loops checked for clicks; loudness roughly as in the specs table

41 files in all. Drop them in `public/audio/` (voice in `public/audio/voice/`) and the app will be wired to them.
