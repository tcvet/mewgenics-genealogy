import {
  MUTATION_SLOTS,
  ROOMS,
  STAT_KEYS,
  type Cat,
  type MutationSlot,
  type RoomId,
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
export type CriterionKey = 'wish' | 'unique' | 'sevens' | 'statSum' | 'roomCOI' | 'children';

export const CRITERION_KEYS: CriterionKey[] = [
  'wish',
  'unique',
  'sevens',
  'statSum',
  'roomCOI',
  'children',
];

/** A sane starting scorecard; every weight is meant to be tuned in the table header. */
export const DEFAULT_WEIGHT: Record<CriterionKey, number> = {
  wish: 1,
  unique: 20,
  sevens: 5,
  statSum: 0.5,
  roomCOI: -0.5,
  children: -2,
};

export interface Criterion {
  key: CriterionKey;
  /** points per unit of the criterion's value (negative — a penalty) */
  weight: number;
}

/** A mutation the room exists to keep, and what carrying it is worth. */
export interface WishMutation {
  slot: MutationSlot;
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
  categories: {},
});

/** The room's rules, falling back to the defaults for a room never configured. */
export const roomPolicy = (config: RosterConfig, room: RoomId): RoomPolicy =>
  config.rooms[room] ?? defaultRoomPolicy();

export const defaultCriteria = (keys: CriterionKey[]): Criterion[] =>
  keys.map((key) => ({ key, weight: DEFAULT_WEIGHT[key] }));

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
    criteria: ['wish', 'unique', 'sevens', 'statSum', 'roomCOI'],
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

/** Everything a score needs beyond the cat itself; built once per room render. */
export interface ScoreCtx {
  wishlist: WishMutation[];
  /** wanted mutation key → its carriers in the room (see `wishCarriers`) */
  carriers: Map<string, Cat[]>;
  /** cat id → average COI with the room's compatible partners (0..1); null — no partners */
  roomCOI: Map<string, number | null>;
  /** cat id → how many children it has (house-wide, gone ones included) */
  childCount: Map<string, number>;
}

export interface ScorePart {
  key: CriterionKey;
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
  const value = (key: CriterionKey): number => {
    switch (key) {
      case 'wish':
        return hits.reduce((sum, w) => sum + w.weight, 0);
      case 'unique':
        return sole.length;
      case 'sevens':
        return sevens(cat);
      case 'statSum':
        return statTotal(cat);
      // as a percentage, so the weight reads like "points per COI percent"
      case 'roomCOI':
        return (ctx.roomCOI.get(cat.id) ?? 0) * 100;
      case 'children':
        return ctx.childCount.get(cat.id) ?? 0;
    }
  };
  const parts = criteria.map((c) => {
    const v = value(c.key);
    return { key: c.key, value: v, points: v * c.weight };
  });
  return {
    total: parts.reduce((sum, p) => sum + p.points, 0),
    parts,
    hits,
    sole,
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
  const seen = new Set<CriterionKey>();
  const out: Criterion[] = [];
  for (const c of raw) {
    const key = (c as Criterion)?.key;
    if (!CRITERION_KEYS.includes(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, weight: num((c as Criterion).weight, DEFAULT_WEIGHT[key]) });
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
      categories: cats,
    };
  }
  return { categories, rooms };
}
