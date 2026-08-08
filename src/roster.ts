import {
  MUTATION_SLOTS,
  ROOMS,
  STAT_KEYS,
  type Cat,
  type MutationSlot,
  type RoomId,
  type StatKey,
} from './types';

/**
 * Roster rules: how many cats of which role a room holds, and how the cats of
 * one role are scored against each other. Answers one question — "a new cat is
 * here, who is the weakest of its role and leaves instead?".
 *
 * Kept free of React AND of `store.ts` (which imports this module for the
 * normalization, so the dependency may only go one way — same reason
 * `legacyReport` takes its bond index as a parameter).
 *
 * Categories are assigned by hand (`Cat.category`) and the list is house-wide,
 * so a cat keeps its role when it moves to another room; the quotas, the
 * scoring columns and the wanted-mutation list are per room.
 */

/** The scoring criteria; each is one column of the roster table. */
export type CriterionKey =
  | 'wish'
  | 'rare'
  | 'wishAbility'
  | 'rareAbility'
  | 'sevens'
  | 'statSum'
  | 'roomCOI'
  | 'categoryCOI'
  | 'children';

export const CRITERION_KEYS: CriterionKey[] = [
  'wish',
  'rare',
  'wishAbility',
  'rareAbility',
  'sevens',
  'statSum',
  'roomCOI',
  'categoryCOI',
  'children',
];

/** The COI-percent criteria — the table shows their raw percent next to scaled points. */
export const isCOICriterion = (c: Criterion): boolean =>
  c.key === 'roomCOI' || c.key === 'categoryCOI';

/** A sane starting scorecard; every weight is meant to be tuned in the table header. */
export const DEFAULT_WEIGHT: Record<CriterionKey, number> = {
  wish: 1,
  rare: 2,
  wishAbility: 1,
  rareAbility: 2,
  sevens: 5,
  statSum: 0.5,
  roomCOI: -0.5,
  categoryCOI: -0.5,
  children: -2,
};

/** Below this many carriers in the room a wanted mutation counts as rare. */
export const DEFAULT_RARE_MIN = 2;

export interface BuiltinCriterion {
  key: Exclude<CriterionKey, RareCriterion['key']>;
  /** points per unit of the criterion's value (negative — a penalty) */
  weight: number;
}

/**
 * The rarity columns — one over the wanted mutations, one over the wanted
 * skills: every wanted entry with fewer than `min` carriers in the room earns
 * its wishlist weight per missing carrier — linear, so the scarcer, the
 * dearer each of its carriers. `min` 2 is the retired "only carrier"/"only
 * skill" column: only a sole carrier scores.
 */
export interface RareCriterion {
  key: 'rare' | 'rareAbility';
  /** carriers at which a wanted mutation or skill stops counting as rare */
  min: number;
  weight: number;
}

export const isRareCriterion = (c: Criterion): c is RareCriterion =>
  c.key === 'rare' || c.key === 'rareAbility';

/** How a stat column turns the stat into the scored value (× weight = points). */
export type StatCritMode = 'value' | 'below' | 'belowFlat' | 'above' | 'aboveFlat';

export const STAT_CRIT_MODES: StatCritMode[] = [
  'value',
  'below',
  'belowFlat',
  'above',
  'aboveFlat',
];

/**
 * A parameterized column over one stat: the stat itself ('value'), points per
 * point of shortfall/excess against a threshold ('below'/'above'), or flat
 * points for merely being past it ('belowFlat'/'aboveFlat' — value is 0 or 1,
 * so the points are exactly the weight). Several stat columns may coexist,
 * even over the same stat (a soft threshold and a harsh one).
 */
export interface StatCriterion {
  key: 'stat';
  /** identity of the column — the react key and the removal handle */
  id: string;
  stat: StatKey;
  /** true — base + event mods (the real value), false — the base stat alone */
  real: boolean;
  mode: StatCritMode;
  /** ignored in 'value' mode */
  threshold: number;
  weight: number;
}

export type Criterion = BuiltinCriterion | StatCriterion | RareCriterion;

/** Stable identity of a column: builtins by key, stat columns by their own id. */
export const critId = (c: Criterion): string => (c.key === 'stat' ? c.id : c.key);

export const makeStatCriterion = (init: Omit<StatCriterion, 'key' | 'id'>): StatCriterion => ({
  key: 'stat',
  id: crypto.randomUUID(),
  ...init,
});

/** The measured value of a stat column for one cat (before the weight). */
export function statCritValue(cat: Cat, c: StatCriterion): number {
  const base = cat.stats[c.stat];
  // an unset stat is unknown, not zero — it neither earns nor costs points
  if (base == null) return 0;
  const v = c.real ? base + (cat.statMods[c.stat] ?? 0) : base;
  switch (c.mode) {
    case 'value':
      return v;
    case 'below':
      return Math.max(0, c.threshold - v);
    case 'belowFlat':
      return v < c.threshold ? 1 : 0;
    case 'above':
      return Math.max(0, v - c.threshold);
    case 'aboveFlat':
      return v > c.threshold ? 1 : 0;
  }
}

/** A mutation the room exists to keep, and what carrying it is worth. */
export interface WishMutation {
  slot: MutationSlot;
  id: string;
  weight: number;
}

/** A skill the room exists to keep (catalog id, see `abilities.ts`). */
export interface WishAbility {
  id: string;
  weight: number;
}

/** A roster role. House-wide: the same "carriers" category is used by every room. */
export interface CategoryDef {
  id: string;
  name: string;
  color: string;
}

/** A category's slots: one plain number, or reserved by sex ('?' fills either). */
export type Quota = number | { F: number; M: number };

export const quotaTotal = (q: Quota): number => (typeof q === 'number' ? q : q.F + q.M);

/** What one category is worth in one room. */
export interface CategoryPolicy {
  quota: Quota;
  criteria: Criterion[];
}

export interface RoomPolicy {
  wishlist: WishMutation[];
  wishAbilities: WishAbility[];
  /** category id → policy; a category absent here is simply not used in this room */
  categories: Record<string, CategoryPolicy>;
}

/** The room's planned size — no stored capacity, just every role's slots summed. */
export const roomSlots = (policy: RoomPolicy): number =>
  Object.values(policy.categories).reduce((sum, cp) => sum + quotaTotal(cp.quota), 0);

export interface RosterConfig {
  categories: CategoryDef[];
  rooms: Partial<Record<RoomId, RoomPolicy>>;
}

/** Category chip colors — deliberately unlike the class palette (that channel is taken). */
export const CATEGORY_COLORS = [
  '#7fb2e5',
  '#e5a97f',
  '#8fd18b',
  '#d18bc8',
  '#d1c58b',
  '#8bd1cc',
  '#b9a0e5',
  '#e58b8b',
];

export const defaultRoster = (): RosterConfig => ({ categories: [], rooms: {} });

export const defaultRoomPolicy = (): RoomPolicy => ({
  wishlist: [],
  wishAbilities: [],
  categories: {},
});

/** The room's rules, falling back to the defaults for a room never configured. */
export const roomPolicy = (config: RosterConfig, room: RoomId): RoomPolicy =>
  config.rooms[room] ?? defaultRoomPolicy();

export const defaultCriteria = (keys: CriterionKey[]): Criterion[] =>
  keys.map((key) =>
    key === 'rare' || key === 'rareAbility'
      ? { key, min: DEFAULT_RARE_MIN, weight: DEFAULT_WEIGHT[key] }
      : { key, weight: DEFAULT_WEIGHT[key] },
  );

export function makeCategory(name: string, index: number): CategoryDef {
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
  };
}

/**
 * The starter roster offered on an unconfigured room — the arrangement this
 * screen was built around: mutation carriers fill the room, a fixed block of
 * slots is reserved for unrelated cats from outside, a few for special ones.
 * The names come from the UI (the dictionaries), the numbers from here.
 */
export type SeedKey = 'carriers' | 'outsiders' | 'special';

export const SEED_PRESETS: {
  key: SeedKey;
  quota: Quota;
  criteria: CriterionKey[];
}[] = [
  {
    key: 'carriers',
    quota: 14,
    criteria: ['wish', 'rare', 'sevens', 'statSum', 'roomCOI'],
  },
  {
    key: 'outsiders',
    quota: { F: 3, M: 3 },
    criteria: ['roomCOI', 'children', 'sevens'],
  },
  { key: 'special', quota: 4, criteria: ['statSum', 'sevens'] },
];

/** Key of one wanted mutation — the (slot, id) pair, as in the legacy report. */
export const wishKey = (w: { slot: MutationSlot; id: string }) => `${w.slot}|${w.id}`;

/** Who in the room carries each wanted mutation (key → carriers, empty entries kept). */
export function wishCarriers(roomCats: Cat[], wishlist: WishMutation[]): Map<string, Cat[]> {
  const map = new Map<string, Cat[]>();
  for (const w of wishlist) {
    map.set(
      wishKey(w),
      roomCats.filter((c) => c.mutations[w.slot] === w.id),
    );
  }
  return map;
}

/** Who in the room carries each wanted skill (ability id → carriers). */
export function wishAbilityCarriers(
  roomCats: Cat[],
  wishAbilities: WishAbility[],
): Map<string, Cat[]> {
  const map = new Map<string, Cat[]>();
  for (const w of wishAbilities) {
    map.set(
      w.id,
      roomCats.filter((c) => c.abilities.includes(w.id)),
    );
  }
  return map;
}

/** Everything a score needs beyond the cat itself; built once per room render. */
export interface ScoreCtx {
  wishlist: WishMutation[];
  /** wanted mutation key → its carriers in the room (see `wishCarriers`) */
  carriers: Map<string, Cat[]>;
  wishAbilities: WishAbility[];
  /** wanted ability id → its carriers in the room (see `wishAbilityCarriers`) */
  abilityCarriers: Map<string, Cat[]>;
  /** cat id → average COI with the room's compatible partners (0..1); null — no partners */
  roomCOI: Map<string, number | null>;
  /** like `roomCOI`, but the partners narrowed to the cat's own category — the
   * number does not swing when another category (say, fresh blood) grows */
  categoryCOI: Map<string, number | null>;
  /** cat id → how many children it has (house-wide, gone ones included) */
  childCount: Map<string, number>;
}

export interface ScorePart {
  crit: Criterion;
  /** the measured value (mutation points, sevens, Σ stats, COI %, children…) */
  value: number;
  /** value × weight — what lands in the total */
  points: number;
}

export interface CatScore {
  total: number;
  parts: ScorePart[];
  /** the wanted mutations the cat carries */
  hits: WishMutation[];
  /** …of those, the ones nobody else in the room carries */
  sole: WishMutation[];
  /** the wanted skills the cat carries */
  abilityHits: WishAbility[];
  /** …of those, the ones nobody else in the room carries */
  abilitySole: WishAbility[];
}

const sevens = (cat: Cat) => STAT_KEYS.filter((k) => cat.stats[k] === 7).length;

const statTotal = (cat: Cat) => STAT_KEYS.reduce((sum, k) => sum + (cat.stats[k] ?? 0), 0);

/**
 * Score one cat against one category's criteria. Scores are only ever compared
 * inside a category — different criteria sets make cross-category totals
 * meaningless, so the screen never ranks a whole room at once.
 */
export function scoreCat(cat: Cat, criteria: Criterion[], ctx: ScoreCtx): CatScore {
  const hits = ctx.wishlist.filter((w) => cat.mutations[w.slot] === w.id);
  const sole = hits.filter((w) => {
    const carriers = ctx.carriers.get(wishKey(w)) ?? [];
    return carriers.length === 1 && carriers[0].id === cat.id;
  });
  const abilityHits = ctx.wishAbilities.filter((w) => cat.abilities.includes(w.id));
  const abilitySole = abilityHits.filter((w) => {
    const carriers = ctx.abilityCarriers.get(w.id) ?? [];
    return carriers.length === 1 && carriers[0].id === cat.id;
  });
  const value = (c: BuiltinCriterion | RareCriterion): number => {
    switch (c.key) {
      case 'wish':
        return hits.reduce((sum, w) => sum + w.weight, 0);
      case 'rare':
        // (min − carriers) × the mutation's wishlist weight, per rare mutation
        // carried — losing one of two carriers doubles what the last one holds
        return hits.reduce((sum, w) => {
          const carriers = ctx.carriers.get(wishKey(w))?.length ?? 0;
          return sum + Math.max(0, c.min - carriers) * w.weight;
        }, 0);
      case 'wishAbility':
        return abilityHits.reduce((sum, w) => sum + w.weight, 0);
      case 'rareAbility':
        // the mutation rarity above, verbatim, over the wanted skills
        return abilityHits.reduce((sum, w) => {
          const carriers = ctx.abilityCarriers.get(w.id)?.length ?? 0;
          return sum + Math.max(0, c.min - carriers) * w.weight;
        }, 0);
      case 'sevens':
        return sevens(cat);
      case 'statSum':
        return statTotal(cat);
      // as a percentage, so the weight reads like "points per COI percent"
      case 'roomCOI':
        return (ctx.roomCOI.get(cat.id) ?? 0) * 100;
      case 'categoryCOI':
        return (ctx.categoryCOI.get(cat.id) ?? 0) * 100;
      case 'children':
        return ctx.childCount.get(cat.id) ?? 0;
    }
  };
  const parts = criteria.map((c) => {
    const v = c.key === 'stat' ? statCritValue(cat, c) : value(c);
    return { crit: c, value: v, points: v * c.weight };
  });
  return {
    total: parts.reduce((sum, p) => sum + p.points, 0),
    parts,
    hits,
    sole,
    abilityHits,
    abilitySole,
  };
}

/** How full a category is; `any` counts the '?' cats, which fill either sex slot. */
export interface QuotaFill {
  total: number;
  /** total slots (a sexed quota summed) */
  quota: number;
  sexes: { F: number; M: number; any: number; slotsF: number; slotsM: number } | null;
  /** how many cats over the quota (0 — within it) */
  over: number;
  /** how many slots still free (0 — full or over) */
  free: number;
}

export function quotaFill(cats: Cat[], policy: CategoryPolicy): QuotaFill {
  const total = cats.length;
  const q = policy.quota;
  const slots = quotaTotal(q);
  return {
    total,
    quota: slots,
    sexes:
      typeof q === 'number'
        ? null
        : {
            F: cats.filter((c) => c.sex === 'F').length,
            M: cats.filter((c) => c.sex === 'M').length,
            any: cats.filter((c) => c.sex === '?').length,
            slotsF: q.F,
            slotsM: q.M,
          },
    over: Math.max(0, total - slots),
    free: Math.max(0, slots - total),
  };
}

const isRoom = (id: unknown): id is RoomId => ROOMS.some((r) => r.id === id);

const num = (v: unknown, fallback: number) => (typeof v === 'number' && isFinite(v) ? v : fallback);

function normCriteria(raw: unknown): Criterion[] {
  if (!Array.isArray(raw)) return [];
  // one shared set: builtin keys and stat-column uuids can never collide
  const seen = new Set<string>();
  const out: Criterion[] = [];
  for (const c of raw) {
    const key = (c as { key?: unknown })?.key;
    if (key === 'stat') {
      const sc = c as StatCriterion;
      if (!STAT_KEYS.includes(sc.stat)) continue;
      const id = typeof sc.id === 'string' ? sc.id : crypto.randomUUID();
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        key: 'stat',
        id,
        stat: sc.stat,
        real: sc.real !== false,
        mode: STAT_CRIT_MODES.includes(sc.mode) ? sc.mode : 'belowFlat',
        threshold: num(sc.threshold, 5),
        weight: num(sc.weight, -10),
      });
      continue;
    }
    if (key === 'rare' || key === 'rareAbility' || key === 'unique' || key === 'uniqueAbility') {
      const rk: RareCriterion['key'] =
        key === 'rare' || key === 'unique' ? 'rare' : 'rareAbility';
      if (seen.has(rk)) continue;
      seen.add(rk);
      const rc = c as Partial<RareCriterion>;
      out.push(
        key === 'rare' || key === 'rareAbility'
          ? {
              key: rk,
              min: Math.max(1, Math.round(num(rc.min, DEFAULT_RARE_MIN))),
              weight: num(rc.weight, DEFAULT_WEIGHT[rk]),
            }
          : // the retired "only carrier"/"only skill" column is rarity with min
            // 2, except its points were per sole entry, not per wishlist-weight
            // unit — with the default wishlist weight of 10 the old weight
            // shrinks tenfold
            { key: rk, min: 2, weight: num(rc.weight, 20) / 10 },
      );
      continue;
    }
    const bk = key as BuiltinCriterion['key'];
    if (!CRITERION_KEYS.includes(bk) || seen.has(bk)) continue;
    seen.add(bk);
    out.push({ key: bk, weight: num((c as BuiltinCriterion).weight, DEFAULT_WEIGHT[bk]) });
  }
  return out;
}

/** number | {F,M}; migrates the old `{quota, sexQuota}` pair (the split wins). */
function normQuota(cp: unknown): Quota {
  const raw = cp as { quota?: unknown; sexQuota?: unknown };
  const sq = raw.sexQuota ?? (typeof raw.quota === 'object' ? raw.quota : null);
  if (sq && typeof sq === 'object') {
    const { F, M } = sq as { F?: unknown; M?: unknown };
    return { F: num(F, 0), M: num(M, 0) };
  }
  return num(raw.quota, 0);
}

function normWishAbilities(raw: unknown): WishAbility[] {
  if (!Array.isArray(raw)) return [];
  const out: WishAbility[] = [];
  const seen = new Set<string>();
  for (const w of raw) {
    const id = (w as WishAbility)?.id;
    if (typeof id !== 'string' || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, weight: num((w as WishAbility).weight, 10) });
  }
  return out;
}

function normWishlist(raw: unknown): WishMutation[] {
  if (!Array.isArray(raw)) return [];
  const out: WishMutation[] = [];
  const seen = new Set<string>();
  for (const w of raw) {
    const slot = (w as WishMutation)?.slot;
    const id = (w as WishMutation)?.id;
    if (!MUTATION_SLOTS.includes(slot) || typeof id !== 'string') continue;
    const key = wishKey({ slot, id });
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ slot, id, weight: num((w as WishMutation).weight, 10) });
  }
  return out;
}

/** Normalize the config from localStorage or an import (bad entries are dropped). */
export function normRoster(raw: unknown): RosterConfig {
  const src = (raw ?? {}) as Partial<RosterConfig>;
  const categories: CategoryDef[] = Array.isArray(src.categories)
    ? src.categories
        .filter(
          (c): c is CategoryDef =>
            !!c && typeof c.id === 'string' && typeof c.name === 'string',
        )
        .map((c, i) => ({
          id: c.id,
          name: c.name,
          color: typeof c.color === 'string' ? c.color : CATEGORY_COLORS[i % CATEGORY_COLORS.length],
        }))
    : [];
  const known = new Set(categories.map((c) => c.id));
  const rooms: Partial<Record<RoomId, RoomPolicy>> = {};
  for (const [id, policy] of Object.entries(src.rooms ?? {})) {
    if (!isRoom(id) || !policy) continue;
    const cats: Record<string, CategoryPolicy> = {};
    for (const [catId, cp] of Object.entries(policy.categories ?? {})) {
      // a policy left over from a deleted category would render a ghost section
      if (!known.has(catId) || !cp) continue;
      cats[catId] = {
        quota: normQuota(cp),
        criteria: normCriteria(cp.criteria),
      };
    }
    // an old save's `capacity` is dropped here: the room's size is the quotas summed
    rooms[id] = {
      wishlist: normWishlist(policy.wishlist),
      wishAbilities: normWishAbilities(policy.wishAbilities),
      categories: cats,
    };
  }
  return { categories, rooms };
}
