# People engine ("Living" people)

Switch at the foot of the page: **People: Classic / Living**, remembered in the browser. Classic is the original
model, untouched. Living is built alongside it.

**Restore point:** commit `e128eb7` is the last version before the engine. To go back completely:
`git checkout e128eb7` (or revert the engine commits after it).

## Steps
1. **One people model** (done): residents of each district go to workplaces, schools, the souk, mosques and open
   spaces near home; each household its own size; districts on their own hours. Same totals per kind of place as
   Classic, different spread. Feeds the estimate, Jev's search, the map and 3D. Code: `src/jev/people.ts`, the
   `alive` flag on `population()`.
2. **Strike reactions** (next): flee near the blast, stay in further out, then a crowd returns to help; a second
   strike on the same spot counts them.
3. **Zone effects** (later): parents at the school gate, the souk closing for the day, fewer at the next Friday prayers.
