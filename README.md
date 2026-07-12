# Mewgenics Genealogy

A local web app for keeping track of your cats' family tree in Mewgenics.
The tree (actually a DAG — inbreeding is handled correctly) lays itself out
automatically. No backend: everything runs in the browser, data lives in
localStorage with JSON export/import.

The UI is in English by default; Русский, Deutsch, Français, Español,
Português (BR), 简体中文, 日本語 and 한국어 can be selected in the ⚙️ settings
menu in the top-right corner.

## Running (Deno)

```sh
deno install        # install dependencies (once)
deno task dev       # dev server → http://localhost:5173
```

Static build: `deno task build` → the `dist/` folder (can be hosted on GitHub Pages).
Node.js works too: `npm install && npm run dev`.

## How to use

- **Click a cat** to select it: an edit panel appears on the right (name, sex,
  orientation, room, class, base stats, notes).
- **Click two compatible cats** to open the new-litter form; pressing Enter
  in the name field adds the next kitten.
- **Orientation** (as in the game): straight by default, bi or gay via the
  flag toggle in the cat panel. It affects breeding: same-sex pairs can never
  have a litter, straight cats breed only with opposite-sex straight cats,
  bi cats only with opposite-sex bi cats, and gay cats only with a “?”-sex
  cat (“?” mates with anyone). Non-straight cats carry a small pride-flag
  chip on their card; straight cats carry no flag, like in the game.
- **“＋ Cat”** adds a founder cat without parents.
- **“Set parents”** (in the cat panel) links existing cats as mother/father:
  click them on the map (female → mother, male → father, “?” → a free slot).
  The cat itself and its descendants are unavailable to prevent cycles. Handy
  when the parents were found and added after the child.
- **Room** is an optional cat attribute (floor 1/2 left/right, attic), shown as
  a small chip on the node.
- **Class** is an optional cat attribute picked from a dropdown (the game's 12
  classes, Fighter to Monk); the card takes the class color as its background,
  and the text automatically switches between dark and light for readability.
  Sex is shown as a colored ♀/♂/? chip, and parent pairs are joined through a
  heart ♥.
- **Base stats** (STR/DEX/CON and INT/SPD/CHA/LCK, grouped as in the game) are
  set in a click matrix: pick 3–7 in a stat's row or “–” for unset; clicking a
  value in the header row fills every stat with it at once.
- **Search** (top bar) — type a name and pick a cat from the list (or press
  Enter) — the map jumps to it and selects it. Picking from search acts like
  clicking the cat: a second found cat is added to the selection (so a litter
  pair can be assembled entirely via search), and in “Set parents” mode the
  found cat becomes a parent.
- **Parent highlighting** — when a cat is selected, the edges to its mother and
  father light up.
- **Mini-map** (bottom-right) shows the whole tree: click a spot to jump there,
  drag inside it to pan the view, scroll over it to zoom.
- The help panel (right) can be collapsed with the ✕ button.
- **“Left home”** marks a cat that no longer lives in the house
  (died/sold/left): the card is dimmed and struck through, and the cat is not
  shown among candidates in “mate COI” mode. It stays in the pedigree and still
  counts as an ancestor in inbreeding calculations.
- **“Pedigree”** shows only the ancestors and descendants of the selected cat
  (the toolbar button returns to the full tree).
- **“Show mate COI”** displays, on every compatible cat (by sex and
  orientation), the inbreeding coefficient (COI) of their potential offspring:
  green — 0, yellow — ≤6.25% (first-cousin level), red — above.
- The cat panel shows the cat's own **F** (inbreeding coefficient), and when a
  pair is selected — the predicted COI of a future litter.
- Data is autosaved to the browser's localStorage; **Export/Import** (in the ⚙️
  settings menu in the top-right corner, along with **Reset** and the language
  switcher) works with a JSON file (export regularly as a backup).

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
- `src/layout.ts` — auto-layout via ELK (layered): every parent pair gets a
  “union node” (the heart) from which edges go to the litter's kittens.
- `src/i18n.tsx` — translations (dictionaries + React context, no dependencies).
- `src/App.tsx` — the UI, built on React Flow (@xyflow/react).

## License

MIT — see [LICENSE](LICENSE).
