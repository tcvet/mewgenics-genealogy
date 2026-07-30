// the `with` attribute keeps the module importable by ad-hoc Deno test scripts
import raw from './data/abilities.json' with { type: 'json' };
import { CLASSES, type Cat, type ClassKey } from './types';
import { LEGACY_STATUS_ORDER, type LegacyBond, type LegacyStatus } from './mutations';

/**
 * The game's ability catalog, scraped from https://mewgenics.wiki.gg/wiki/Abilities
 * (the full raw dump with upgraded texts lives in `data/abilities.json`).
 * Unlike mutations, abilities have no slot structure: a cat simply carries a
 * list of ability ids (`Cat.abilities`), curated by hand — the point is to
 * track the skills worth keeping in the house, not to model the game's
 * learning rules. Ids are name slugs; the handful of name collisions
 * ("Power Up" of two classes, "Math!" vs "Math?") carry a class suffix.
 */

/** The game's 12 classes + the wiki's two extra pools. */
export type AbilityClass = ClassKey | 'collarless' | 'jester';

export type AbilityType = 'active' | 'passive' | 'basic';

export interface Ability {
  id: string;
  name: string;
  class: AbilityClass;
  type: AbilityType;
  /** base (unupgraded) in-game description */
  desc?: string;
  /** base cost line, e.g. "3 Mana" or "1 Damage, 3 Mana" */
  cost?: string;
}

export const ABILITIES = raw.abilities as Ability[];

/** Display/grouping order: the generic pool first, then the game's classes. */
export const ABILITY_CLASSES: AbilityClass[] = [
  'collarless',
  ...CLASSES.map((c) => c.id),
  'jester',
];

const byId = new Map(ABILITIES.map((a) => [a.id, a]));

export const getAbility = (id: string) => byId.get(id);

/** Locale-independent label (ability names come from the game). */
export const abilityLabel = (id: string) => byId.get(id)?.name ?? id;

/**
 * Normalize a possibly-missing/foreign `abilities` value (older saves/imports):
 * known ability ids only, deduplicated, original order kept.
 */
export function normAbilities(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const id of value) {
    if (typeof id !== 'string' || !byId.has(id) || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

/** One inventory row: an ability someone in the house carries. */
export interface HouseAbility {
  id: string;
  /** all carriers: living first, then gone */
  carriers: Cat[];
  /** carriers still in the house (`gone` excluded) — the panel's ×N count */
  living: number;
}

/**
 * Inventory of the abilities the house currently has. Only abilities with at
 * least one living carrier are listed, but gone carriers stay in `carriers`.
 * Order: class order (generic pool first), then more living carriers first,
 * then by name — the stats screen groups consecutive rows by class.
 */
export function houseAbilities(cats: Cat[]): HouseAbility[] {
  const byAbility = new Map<string, Cat[]>();
  for (const cat of cats)
    for (const id of cat.abilities) {
      const list = byAbility.get(id);
      if (list) list.push(cat);
      else byAbility.set(id, [cat]);
    }
  const clsOrder = (id: string) => ABILITY_CLASSES.indexOf(byId.get(id)!.class);
  return [...byAbility.entries()]
    .map(([id, all]) => {
      const living = all.filter((c) => !c.gone);
      const gone = all.filter((c) => c.gone);
      return { id, carriers: [...living, ...gone], living: living.length };
    })
    .filter((r) => r.living > 0)
    .sort(
      (a, b) =>
        clsOrder(a.id) - clsOrder(b.id) ||
        b.living - a.living ||
        abilityLabel(a.id).localeCompare(abilityLabel(b.id)),
    );
}

/** One row of the ability legacy report: an ability and who keeps it alive. */
export interface AbilityLegacyRow {
  id: string;
  status: LegacyStatus;
  /** active bonds with at least one living carrier */
  bonds: LegacyBond[];
  /** living carriers not covered by any of those bonds */
  loose: Cat[];
  /** carriers that left the house (all of the carriers for `lost` rows) */
  gone: Cat[];
}

/**
 * The preservation report over the recorded abilities — same rules as the
 * mutation `legacyReport`: an ability counts as kept while an active bond
 * (≥2 living members) contains a living carrier. Every recorded ability
 * counts — the list is hand-curated, so there is no noise to skip.
 */
export function abilityLegacyReport(
  cats: Cat[],
  bonds: Map<string, Cat[]>,
): AbilityLegacyRow[] {
  const byAbility = new Map<string, Cat[]>();
  for (const cat of cats)
    for (const id of cat.abilities) {
      const list = byAbility.get(id);
      if (list) list.push(cat);
      else byAbility.set(id, [cat]);
    }
  const rows: AbilityLegacyRow[] = [];
  for (const [id, all] of byAbility) {
    const living = all.filter((c) => !c.gone);
    const gone = all.filter((c) => c.gone);
    if (living.length === 0) {
      rows.push({ id, status: 'lost', bonds: [], loose: [], gone });
      continue;
    }
    const held = new Map<string, LegacyBond>();
    for (const c of living) {
      if (!c.bondId || held.has(c.bondId)) continue;
      const members = (bonds.get(c.bondId) ?? []).filter((m) => !m.gone);
      if (members.length < 2) continue;
      held.set(c.bondId, {
        bondId: c.bondId,
        carriers: members.filter((m) => m.abilities.includes(id)),
        others: members.filter((m) => !m.abilities.includes(id)),
      });
    }
    const loose = living.filter((c) => !(c.bondId && held.has(c.bondId)));
    const status: LegacyStatus =
      held.size > 0 ? 'secured' : living.length === 1 ? 'last' : 'loose';
    rows.push({ id, status, bonds: [...held.values()], loose, gone });
  }
  return rows.sort(
    (a, b) =>
      LEGACY_STATUS_ORDER[a.status] - LEGACY_STATUS_ORDER[b.status] ||
      abilityLabel(a.id).localeCompare(abilityLabel(b.id)),
  );
}
