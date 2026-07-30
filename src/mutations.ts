// the `with` attribute keeps the module importable by ad-hoc Deno test scripts
import raw from './data/mutations.json' with { type: 'json' };
import { MUTATION_SLOTS, STAT_KEYS, type Cat, type MutationSlot, type StatKey } from './types';

/**
 * The game's mutation catalog, scraped from https://mewgenics.wiki.gg/wiki/Mutations
 * (see `data/mutations-mechanics.md` for provenance and the full raw dump).
 * Two kinds of entries share one id space:
 * - named — unique mutations and birth defects ("Cactus Bod", "No left arm"…);
 * - common — the unnamed "+2 stat, −1 stat" variants; every catalog group has
 *   all 42 ordered stat pairs, so a common is addressed by (slot, up, down).
 * Entries carry a catalog *group*, not a slot: arm and leg mutations are drawn
 * from the shared `limbs` pool (per the wiki), which both the `arms` and
 * `legs` slots accept; the four side removals are group `arms`/`legs` only.
 * A cat stores at most one mutation id per body-part slot (`Cat['mutations']`);
 * `normMutations` re-validates the slot↔id pairing on load.
 */

/** `limbs` — the shared arm+leg pool; other groups coincide with their slot. */
export type CatalogGroup = MutationSlot | 'limbs';

export interface NamedMutation {
  id: string;
  group: CatalogGroup;
  title: string;
  /** in-game description, or the wiki effect text when the game has none */
  desc?: string;
  /** birth defects are listed separately in the picker */
  defect?: boolean;
}

export interface CommonMutation {
  id: string;
  group: CatalogGroup;
  up: StatKey;
  down: StatKey;
}

export const NAMED_MUTATIONS = raw.named as NamedMutation[];
export const COMMON_MUTATIONS = raw.common as CommonMutation[];

/** Catalog groups each slot draws from (arms/legs share the limbs pool). */
const SLOT_GROUPS: Record<MutationSlot, CatalogGroup[]> = {
  head: ['head'],
  eyes: ['eyes'],
  eyebrows: ['eyebrows'],
  ears: ['ears'],
  mouth: ['mouth'],
  body: ['body'],
  arms: ['limbs', 'arms'],
  legs: ['limbs', 'legs'],
  tail: ['tail'],
  texture: ['texture'],
};

/** The group whose commons a slot uses (side-removal groups have no commons). */
const commonGroup = (slot: MutationSlot): CatalogGroup => SLOT_GROUPS[slot][0];

export const NAMED_BY_SLOT: Record<MutationSlot, NamedMutation[]> = Object.fromEntries(
  MUTATION_SLOTS.map((s) => [
    s,
    NAMED_MUTATIONS.filter((m) => SLOT_GROUPS[s].includes(m.group)).sort((a, b) =>
      a.title.localeCompare(b.title),
    ),
  ]),
) as Record<MutationSlot, NamedMutation[]>;

const namedById = new Map(NAMED_MUTATIONS.map((m) => [m.id, m]));
const commonById = new Map(COMMON_MUTATIONS.map((m) => [m.id, m]));
const commonByKey = new Map(COMMON_MUTATIONS.map((m) => [`${m.group}|${m.up}|${m.down}`, m.id]));

export const getNamed = (id: string) => namedById.get(id);
export const getCommon = (id: string) => commonById.get(id);

/** Id of the common "+2 up, −1 down" mutation for a slot (null for up === down). */
export function commonId(slot: MutationSlot, up: StatKey, down: StatKey): string | null {
  return commonByKey.get(`${commonGroup(slot)}|${up}|${down}`) ?? null;
}

/** The slots that accept this mutation id (arms AND legs for the limbs pool). */
export function slotsFor(id: string): MutationSlot[] {
  const group = namedById.get(id)?.group ?? commonById.get(id)?.group;
  if (!group) return [];
  return MUTATION_SLOTS.filter((s) => SLOT_GROUPS[s].includes(group));
}

/**
 * Locale-independent short label: the named title, or "+2 STR −1 LCK" built
 * from the stat keys (the same abbreviations the stats matrix uses).
 */
export function mutationLabel(id: string): string {
  const named = namedById.get(id);
  if (named) return named.title;
  const common = commonById.get(id);
  if (common) return `+2 ${common.up.toUpperCase()} −1 ${common.down.toUpperCase()}`;
  return id;
}

/** First stat key different from `other` — a valid default for the common pickers. */
export function otherStat(other: StatKey): StatKey {
  return STAT_KEYS.find((k) => k !== other) ?? other;
}

/** One inventory row: a mutation present in the house, under a specific slot. */
export interface HouseMutation {
  slot: MutationSlot;
  id: string;
  /** all carriers of this mutation in this slot: living first, then gone */
  carriers: Cat[];
  /** carriers still in the house (`gone` excluded) — the panel's ×N count */
  living: number;
}

/**
 * Inventory of the mutations the house currently has, keyed by (slot, id) —
 * a shared-pool (limbs) mutation sitting on arms and on legs makes two rows.
 * Only mutations with at least one living carrier are listed, but gone
 * carriers stay in `carriers`: they show where a line's mutation came from.
 * Order: slot order, then more living carriers first, then by label.
 */
export function houseMutations(cats: Cat[]): HouseMutation[] {
  const rows: HouseMutation[] = [];
  for (const slot of MUTATION_SLOTS) {
    const bySlot = new Map<string, Cat[]>();
    for (const cat of cats) {
      const id = cat.mutations[slot];
      if (!id) continue;
      const list = bySlot.get(id);
      if (list) list.push(cat);
      else bySlot.set(id, [cat]);
    }
    const slotRows = [...bySlot.entries()]
      .map(([id, all]) => {
        const living = all.filter((c) => !c.gone);
        const gone = all.filter((c) => c.gone);
        return { slot, id, carriers: [...living, ...gone], living: living.length };
      })
      .filter((r) => r.living > 0)
      .sort(
        (a, b) =>
          b.living - a.living || mutationLabel(a.id).localeCompare(mutationLabel(b.id)),
      );
    rows.push(...slotRows);
  }
  return rows;
}

/* --- legacy report: which bonds keep each named mutation in the house --- */

export type LegacyStatus = 'secured' | 'loose' | 'last' | 'lost';

/** An active bond (≥2 living members) seen from one mutation's perspective. */
export interface LegacyBond {
  bondId: string;
  /** living members that carry the mutation (under this slot) */
  carriers: Cat[];
  /** the remaining living members; empty ⇒ the whole bond carries it */
  others: Cat[];
}

/** One row of the legacy report: a named mutation and who keeps it alive. */
export interface LegacyRow {
  slot: MutationSlot;
  id: string;
  /** secured — kept by a bond; loose — living carriers but no bond;
   *  last — a single unbonded living carrier; lost — gone carriers only */
  status: LegacyStatus;
  /** active bonds with at least one living carrier */
  bonds: LegacyBond[];
  /** living carriers not covered by any of those bonds */
  loose: Cat[];
  /** carriers that left the house (all of the carriers for `lost` rows) */
  gone: Cat[];
}

/** Problems-first ordering; shared with the ability legacy report. */
export const LEGACY_STATUS_ORDER: Record<LegacyStatus, number> = {
  last: 0,
  loose: 1,
  secured: 2,
  lost: 3,
};

/**
 * The preservation report over the named mutations the house has seen
 * (commons are day-to-day noise, not something to preserve). Keyed by
 * (slot, id) like `houseMutations`; `bonds` is the store's bondId index.
 * A mutation counts as kept while an active bond — two or more living
 * members — contains a living carrier: the bond can breed it back. A
 * carrier whose bond is widowed down to one member counts as loose.
 * Rows come sorted problems-first: last carrier, loose, secured, lost.
 */
export function legacyReport(cats: Cat[], bonds: Map<string, Cat[]>): LegacyRow[] {
  const rows: LegacyRow[] = [];
  for (const slot of MUTATION_SLOTS) {
    const bySlot = new Map<string, Cat[]>();
    for (const cat of cats) {
      const id = cat.mutations[slot];
      if (!id || !namedById.has(id)) continue;
      const list = bySlot.get(id);
      if (list) list.push(cat);
      else bySlot.set(id, [cat]);
    }
    for (const [id, all] of bySlot) {
      const living = all.filter((c) => !c.gone);
      const gone = all.filter((c) => c.gone);
      if (living.length === 0) {
        rows.push({ slot, id, status: 'lost', bonds: [], loose: [], gone });
        continue;
      }
      const held = new Map<string, LegacyBond>();
      for (const c of living) {
        if (!c.bondId || held.has(c.bondId)) continue;
        const members = (bonds.get(c.bondId) ?? []).filter((m) => !m.gone);
        if (members.length < 2) continue;
        held.set(c.bondId, {
          bondId: c.bondId,
          carriers: members.filter((m) => m.mutations[slot] === id),
          others: members.filter((m) => m.mutations[slot] !== id),
        });
      }
      const loose = living.filter((c) => !(c.bondId && held.has(c.bondId)));
      const status: LegacyStatus =
        held.size > 0 ? 'secured' : living.length === 1 ? 'last' : 'loose';
      rows.push({ slot, id, status, bonds: [...held.values()], loose, gone });
    }
  }
  return rows.sort(
    (a, b) =>
      LEGACY_STATUS_ORDER[a.status] - LEGACY_STATUS_ORDER[b.status] ||
      MUTATION_SLOTS.indexOf(a.slot) - MUTATION_SLOTS.indexOf(b.slot) ||
      mutationLabel(a.id).localeCompare(mutationLabel(b.id)),
  );
}

/** One bond of the by-bond view: what it keeps and where it is irreplaceable. */
export interface LegacyBondRow<R extends { bonds: LegacyBond[] } = LegacyRow> {
  bondId: string;
  /** living members */
  members: Cat[];
  /** report rows this bond keeps */
  holds: R[];
  /** the subset of `holds` where no other bond keeps the mutation */
  sole: R[];
}

/**
 * The report pivoted to bonds: every active bond with what it keeps. Generic
 * over the row type, so mutation and ability rows can be pivoted together.
 * Bonds keeping nothing are listed too — a preservation pair that lost its
 * point is worth noticing. Sorted: irreplaceable bonds first, then by load.
 */
export function legacyBondRows<R extends { bonds: LegacyBond[] }>(
  rows: R[],
  bonds: Map<string, Cat[]>,
): LegacyBondRow<R>[] {
  const out: LegacyBondRow<R>[] = [];
  for (const [bondId, all] of bonds) {
    const members = all.filter((c) => !c.gone);
    if (members.length < 2) continue;
    const holds = rows.filter((r) => r.bonds.some((b) => b.bondId === bondId));
    const sole = holds.filter((r) => r.bonds.length === 1);
    out.push({ bondId, members, holds, sole });
  }
  return out.sort(
    (a, b) =>
      b.sole.length - a.sole.length ||
      b.holds.length - a.holds.length ||
      (a.members[0]?.name ?? '').localeCompare(b.members[0]?.name ?? ''),
  );
}

/**
 * Normalize a possibly-missing/foreign `mutations` value (older saves/imports):
 * keep known mutation ids sitting under a slot that accepts them; an id under
 * the wrong slot moves to the first free accepting slot (e.g. saves from the
 * 9-slot era kept arm removals under `legs`), the rest is dropped.
 */
export function normMutations(value: unknown): Cat['mutations'] {
  if (typeof value !== 'object' || value === null) return {};
  const source = value as Record<string, unknown>;
  const result: Cat['mutations'] = {};
  const misplaced: string[] = [];
  for (const slot of MUTATION_SLOTS) {
    const id = source[slot];
    if (typeof id !== 'string') continue;
    if (slotsFor(id).includes(slot)) result[slot] = id;
    else misplaced.push(id);
  }
  for (const id of misplaced) {
    const free = slotsFor(id).find((s) => !result[s]);
    if (free) result[free] = id;
  }
  return result;
}
