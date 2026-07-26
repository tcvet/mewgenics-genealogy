# Mewgenics Genealogy

A local web app for keeping track of your cats' family tree in Mewgenics.
No backend: everything runs in the browser, data lives in localStorage with
JSON export/import.

The app is organized into screens, switched with the tabs in the top bar:
a cat browser, a breeding planner, a roll call, statistics, a legacy report
(which bonded pairs keep each mutation in the house), the interactive
family tree (actually a DAG — inbreeding is handled correctly, and the map
lays itself out automatically) and settings.

The UI is in English by default; Русский, Deutsch, Français, Español,
Português (BR), 简体中文, 日本語 and 한국어 can be selected on the ⚙️ Settings
screen.

## Running (Deno)

```sh
deno install        # install dependencies (once)
deno task dev       # dev server → http://localhost:5173
```

Static build: `deno task build` → the `dist/` folder (can be hosted on GitHub Pages).
Node.js works too: `npm install && npm run dev`.

## The screens

### 🐈 Cats — the browser

The everyday view: a filter bar over a card grid, with the full cat editor in
a column on the right.

- **Filters**: name search, “In the house” (on by default — cats that left
  home are hidden), sex, class, room; sort by name, stat total (Σ) or most
  recently added.
- **Cards** speak the same visual language as the map: the class color fills
  the card, sex is a colored ♀/♂/? chip, non-straight cats carry a pride-flag
  chip, and small chips show the stat total, the mutation count, the room and
  a 💞 for cats in an established bond (hover it to see the partners).
- **Click a card** to open the editor: name, sex, orientation, room, class,
  base stats, mutations, notes, plus the cat's own F (inbreeding coefficient)
  and its parents — parent names are links, so you can walk up a pedigree
  with clicks. “Show in the tree” jumps to the map centered on the cat;
  “Show mate COI” opens the breeding screen with the cat preselected.
- **“Left home”** marks a cat that no longer lives in the house
  (died/sold/left): the card is dimmed and struck through, the cat drops out
  of the default browser view and of breeding candidates, but stays in the
  pedigree and still counts as an ancestor in inbreeding calculations.

### 💕 Breeding — the litter planner

Three columns, left to right:

1. **First parent** — a searchable list of the cats in the house. The
   “＋ Founder” button on top adds a parentless cat (stray cats usually enter
   the tree together with their first litter).
2. **Partners** — every compatible partner for the picked cat with the COI of
   their potential offspring, color-coded with the game's five inbreeding
   tiers: green — below 10% (not inbred), yellow — 10–25% (slightly),
   orange — 25–50% (moderately), red — 50–80% (highly), maroon — above 80%
   (extremely inbred). Sortable by COI (default), name or stat total.
3. **The litter form** — the pair's offspring COI, a name row per kitten
   (Enter adds the next one), a sex toggle and a compact orientation-flag
   button per kitten, and the parents' mutations as one-click chips under
   every kitten row, so you can record what each newborn inherited right as
   the litter is born.

Compatibility follows the game: same-sex pairs can never have a litter,
straight cats breed only with opposite-sex straight cats, bi cats only with
opposite-sex bi cats, and gay cats only with a “?”-sex cat (“?” mates with
anyone).

**Bonds.** Once two cats become an established couple, select them and hit
“💞 Make a pair” above the litter form. Bonded cats disappear from other
cats' partner lists (the “💞 Show bonded cats” toggle reveals them, dimmed),
a cat's own partner is pinned on top of its list and preselected when it is
the only one, and every screen marks bonded cats with a 💞 chip. A pair can
grow into a collective (“Add to the collective” with a third cat) and is
dissolved from the same spot (💔); a single cat can also be removed from its
bond in the cat editor. The exclusion is soft — bonded candidates stay
clickable once revealed — and a cat whose partners all left home counts as
free again automatically.

### 📋 Roll call — syncing with the game

An alphabetical checklist of every cat still at home: walk your in-game
roster and tick each cat you find here (a cat present in the game but missing
from the list is one you forgot to add). “Finish” shows the cats that were
never ticked, pre-marked — untick anyone you merely overlooked and apply to
set the rest to “left home”. The ticks survive page reloads and tab switches;
while a session is running, the tab carries a green dot.

### 📊 Statistics

House statistics — how many cats are in the house, the breakdown into
females, males and “?”-sex cats, how many have every base stat at 7, and the
overall total in the tree — next to the **mutation inventory**: every
mutation carried by the cats currently in the house, grouped by body part
with carrier counts. Click a mutation to unfold its carriers (gone carriers
are struck through, so you can trace where a line's mutation came from);
click a carrier to open it in the browser.

### 🧬 Legacy — mutation preservation

If you keep bonded pairs specifically so that a mutation stays in the house,
this screen replaces the spreadsheet: everything is derived from the cats'
mutations and bonds, nothing to maintain by hand. A named mutation counts as
**kept** while an active bond (two or more members still in the house) has a
carrier — the pair can always breed the mutation back.

- **By mutation** (default): every named mutation the house has seen, worst
  first, with a status pill — red “last carrier” (a single carrier and no
  bond), yellow “not secured” (carriers, but none in an active bond), green
  “secured” (kept by a bond; ✓✓ marks a bond whose every member is a
  carrier). Each row lists the keeping bonds and the unbonded carriers; a
  “💞 Find a partner” button on problem rows jumps to the breeding screen
  with the carrier preselected. A grey “Lost” section at the bottom lists
  mutations that left the house entirely — carried only by cats that are
  gone.
- **By bond**: the same report pivoted — every active bond with the mutations
  it keeps, and a ⚠ “sole keeper” warning where no other bond has the
  mutation (dissolve that pair and the mutation hangs by a thread). Bonds
  that keep nothing are listed too.

Common +2/−1 mutations are deliberately ignored here — they are day-to-day
noise, not something to preserve. Cat names jump to the browser everywhere.

### 🌳 Tree — the family map

The interactive DAG, laid out automatically: parent pairs join through a
heart ♥, kittens hang below. Click a cat to select it (the edges to its
parents and children light up), click two compatible cats to record a litter
right on the map.

- **Search** (top bar) jumps to a cat; picking from search acts like clicking
  the cat, so a litter pair can be assembled entirely via search.
- **“Pedigree”** (in the cat panel) shows only the ancestors and descendants
  of the selected cat; the toolbar button returns to the full tree.
- **“Show mate COI”** color-codes every compatible cat on the map by the COI
  of their potential offspring, with the same candidate list in a side panel.
- **“Set parents”** links existing cats as mother/father by clicking them on
  the map (female → mother, male → father, “?” → a free slot). The cat itself
  and its descendants are unavailable to prevent cycles. Handy when the
  parents were found and added after the child.
- **“🧬 Mutations”** highlights the carriers of a chosen mutation on the map
  (cyan ring, everyone else dims).
- **Mini-map** (bottom-right) shows the whole tree: click a spot to jump
  there, drag inside it to pan, scroll over it to zoom.

### ⚙️ Settings

The UI language, **Export/Import** (a JSON file — export regularly as a
backup) and **Reset**. Data is autosaved to the browser's localStorage.

## Cat properties

- **Sex** — female, male or “?” (mates with anyone); **orientation** as in
  the game — straight by default, bi or gay via the flag toggle (non-straight
  cats carry a small pride-flag chip; straight cats carry no flag, like in
  the game).
- **Room** (floor 1/2 left/right, attic) and **class** (the game's 12
  classes, Fighter to Monk) — optional attributes; the class color becomes
  the card background.
- **Base stats** (STR/DEX/CON and INT/SPD/CHA/LCK, grouped as in the game)
  are set in a click matrix: pick 3–7 in a stat's row or “–” for unset;
  clicking a value in the header row fills every stat with it at once.
- **Mutations** — the collapsible 🧬 section holds one mutation per body part
  (the game's 10 groups: head, eyes, brows, ears, mouth, body, arms, legs,
  tail, fur — breeding is always symmetric in the game, so left/right pairs
  count as one slot). Each slot offers the game's full catalog scraped from
  the [wiki](https://mewgenics.wiki.gg/wiki/Mutations): named mutations and
  birth defects by name, and the unnamed “common” ones as a +2/−1 stat pair
  picker. Arms and legs draw from the game's shared “Limbs” pool (only the
  “No left/right arm/leg” removals are side-specific). If the cat's parents
  have mutations, the matching slots show one-click “inherit from ♀/♂” chips.

## Inbreeding coefficient (COI)

Computed with Wright's method via the kinship coefficient: the offspring's COI
is the probability that random alleles from the mother and the father are
identical by descent. Full siblings or parent×child → 25%, half siblings →
12.5%, first cousins → 6.25%. All common ancestors are taken into account
(including repeated inbreeding), see `src/genealogy.ts`.

## Architecture

- `src/types.ts` — data model: each cat stores references to its mother and
  father; the tree is derived, not stored.
- `src/genealogy.ts` — ancestors/descendants/kinship (pure functions).
- `src/mutations.ts` + `src/data/mutations.json` — the game's mutation catalog
  (764 entries scraped from the wiki; raw scrape and notes in `data/`).
- `src/store.ts` — the cats store: state, localStorage persistence and data
  operations, shared by every screen.
- `src/App.tsx` — the shell: the top tab bar and the screens
  (`OverviewScreen`, `BreedingScreen`, `RollCallScreen`, `StatsScreen`,
  `LegacyScreen`, `TreeScreen`, `SettingsScreen`); shared widgets live in `controls.tsx`,
  `CatPanel.tsx`, `forms.tsx` and `MateList.tsx`.
- `src/layout.ts` — auto-layout of the map via ELK (layered): every parent
  pair gets a “union node” (the heart) from which edges go to the litter's
  kittens; the tree screen renders it with React Flow (@xyflow/react).
- `src/i18n.tsx` — translations (dictionaries + React context, no dependencies).

## License

MIT — see [LICENSE](LICENSE).
