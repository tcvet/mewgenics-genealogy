# Mutation mechanics (from the wiki)

Source: https://mewgenics.wiki.gg/wiki/Mutations (fetched 2026-07-13).
Companion data file: `mutations.json` (764 mutations parsed from the same page).

## Data shape (`mutations.json`)

Each entry: `{ id, title, type, description, effects, icon }`.

- `id` — the game's internal id, e.g. `body.301`, `eyes.314`. The prefix is the
  body-part group: `body`, `head`, `tail`, `mouth`, `texture` (fur), `eyes`,
  `ears`, `eyebrows`, `legs`, plus four asymmetric removals (`arm1.-2`,
  `arm2.-2`, `leg1.-2`, `leg2.-2`). Ids are unique across all 764 entries.
- `title` — the mutation's name from dev comments. Empty for the 379 "Common"
  mutations (they are unnamed +2/-1 stat variants) and the one Melted Body
  Mutation.
- `type` — wiki category, e.g. `Body Mutation`, `Common Eye Mutation`,
  `Limb Birth Defect`, `Animal Ear Mutation`.
- `description` — in-game flavor/summary text (may be empty).
- `effects` — full effect text, plain text with `- ` list items.
- `icon` — SVG filename on the wiki (`https://mewgenics.wiki.gg/images/<icon>`),
  `null` for 4 entries without an image.

## Key facts for a genealogy tracker

- **Birth defects scale with inbreeding: chance = 1.5 × inbreeding coefficient**
  of the newborn kitten. This ties directly into our COI math (`pairCOI`).
- Mutations are usually inherited and gained **symmetrically**: left/right parts
  with identical mutations count as one. A cat has **10 part-groups**:
  - symmetric parts: body, head, tail, mouth, fur;
  - asymmetric parts (left/right): legs, arms, eyes, eyebrows, ears.
- Arms and legs are separate part-groups, but per the wiki "Arm and Leg
  mutations are drawn from the same pool, referred to here as 'Limbs'" — the
  `legs.*` ids apply to either; only the four removals (`arm1/arm2/leg1/leg2.-2`)
  are side-specific. (The wiki titles `leg2.-2` "No left leg" — a typo for
  "No right leg", fixed in the app's generated catalog.)
- Kittens of parents with asymmetric mutations inherit either side
  symmetrically due to the breeding process.
- Kittens over 90% inbred can be born with up to 12 "mutations" (the extra 2
  are asymmetric birth defects from breeding).
- During adventures a cat can carry up to 15 different mutations
  (5 symmetric + 5 left + 5 right) via asymmetric events.

## How mutations are acquired (outside breeding)

- Overnight house event with chance equal to the room's Mutation%.
- With Mutation stat ≤ 10 only "common" mutations (+2/-1 stat) can be rolled;
  each point above 10 adds +2.5% chance to roll from the full pool,
  guaranteed at 50 Mutation.
- Events, the Act 3 Time Machine (+1 Mutation), and battle effects
  (Cancer, Lil' Tumor, Unstable DNA, Toxic Canister, Uranium Rod, The Shimmer
  weather, Parasite/Radioactive set bonuses) also grant mutations.
- Tag-restricted sources: "Animal" (Mysterious Creature event), "Bird"
  (Gizzard), "Extra" (Steven Fetus event), "Melted" (Viper Booze / Viper
  Bottle). Tags have no other gameplay purpose.

## Birth defects (bad-outcome sources besides inbreeding)

Events: "Cats in Heat" (The Past version), "Vibrating Meteor",
"Small Black Hole", "Throbbing Artery" (1 and 2).
