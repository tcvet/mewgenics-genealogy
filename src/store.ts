import { useEffect, useMemo, useState } from 'react';
import {
  canMate,
  ROOMS,
  STAT_KEYS,
  type Cat,
  type ClassKey,
  type Orientation,
  type RoomId,
  type Sex,
} from './types';
import { normMutations } from './mutations';
import { normAbilities } from './abilities';
import { childrenIndex, indexCats } from './genealogy';
import { defaultRoster, normRoster, type RosterConfig } from './roster';

export const STORAGE_KEY = 'mewgenics-genealogy';
export const ROLLCALL_KEY = 'mewgenics-rollcall';
export const ROSTER_KEY = 'mewgenics-roster';

/** Name normalization for duplicate checks: trimmed, case-insensitive. */
export const normName = (s: string) => s.trim().toLowerCase();

/** Normalize a possibly-missing/invalid orientation (older saves/imports). */
const normOrientation = (o: unknown): Orientation => (o === 'bi' || o === 'homo' ? o : 'hetero');

/** Total of the recorded base stats (unset stats count as 0). */
export const statSum = (c: Cat) => STAT_KEYS.reduce((sum, k) => sum + (c.stats[k] ?? 0), 0);

/** Total of the real stats: base + event modifiers (unset stats count as 0). */
export const realStatSum = (c: Cat) =>
  STAT_KEYS.reduce((sum, k) => sum + (c.stats[k] ?? 0) + (c.statMods[k] ?? 0), 0);

/** Normalize the event-modifier dict: known stats, whole numbers, zeros dropped. */
function normStatMods(mods: unknown): Cat['statMods'] {
  const out: Cat['statMods'] = {};
  if (typeof mods !== 'object' || mods === null) return out;
  for (const k of STAT_KEYS) {
    const v = (mods as Record<string, unknown>)[k];
    if (typeof v === 'number' && Number.isFinite(v) && Math.round(v) !== 0) out[k] = Math.round(v);
  }
  return out;
}

/** Normalize a cat from an older save or an import (missing fields get defaults). */
function normCat(c: Partial<Cat>): Cat {
  return {
    id: c.id!,
    name: c.name!,
    sex: c.sex!,
    orientation: normOrientation(c.orientation),
    motherId: c.motherId ?? null,
    fatherId: c.fatherId ?? null,
    room: c.room ?? null,
    class: c.class ?? null,
    gone: c.gone ?? false,
    bondId: typeof c.bondId === 'string' ? c.bondId : null,
    category: typeof c.category === 'string' ? c.category : null,
    notes: c.notes ?? '',
    stats: c.stats ?? {},
    statMods: normStatMods(c.statMods),
    mutations: normMutations(c.mutations),
    abilities: normAbilities(c.abilities),
  };
}

export function makeCat(
  name: string,
  sex: Sex,
  motherId: string | null = null,
  fatherId: string | null = null,
  room: RoomId | null = null,
  cls: ClassKey | null = null,
  orientation: Orientation = 'hetero',
  mutations: Cat['mutations'] = {},
  stats: Cat['stats'] = {},
  category: string | null = null,
  abilities: string[] = [],
): Cat {
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    sex,
    orientation,
    motherId,
    fatherId,
    room,
    class: cls,
    gone: false,
    bondId: null,
    category,
    notes: '',
    stats,
    statMods: {},
    mutations,
    abilities,
  };
}

/** A small first-run example so the tree's look is immediately visible. */
function seedCats(): Cat[] {
  const cats: Cat[] = [];
  const add = (
    name: string,
    sex: Sex,
    motherId: string | null = null,
    fatherId: string | null = null,
    cls: ClassKey | null = null,
    mutations: Cat['mutations'] = {},
    abilities: string[] = [],
  ) => {
    const cat: Cat = {
      id: `seed-${cats.length}`,
      name,
      sex,
      orientation: 'hetero',
      motherId,
      fatherId,
      room: null,
      class: cls,
      gone: false,
      bondId: null,
      category: null,
      notes: '',
      stats: {},
      statMods: {},
      mutations,
      abilities,
    };
    cats.push(cat);
    return cat.id;
  };
  // example mutations: Luna inherits one from each parent (body.301 Cactus Bod, eyes.301 Demon Eyes)
  // and Misty's Purr skill along the way
  const misty = add('Misty', 'F', null, null, 'monk', { body: 'body.301' }, ['purr']);
  const shadow = add('Shadow', 'M', null, null, 'necromancer', { eyes: 'eyes.301' });
  const tom = add('Tom', 'M', null, null, 'tank');
  const luna = add('Luna', 'F', misty, shadow, 'mage', { body: 'body.301', eyes: 'eyes.301' }, ['purr']);
  add('Ginger', 'M', misty, shadow, 'fighter');
  add('Toffee', 'F', luna, tom, 'thief');
  add('Cosmo', 'M', luna, tom, 'tinkerer');
  // Misty and Shadow are an established pair — shows off the bond feature
  for (const c of cats) if (c.id === misty || c.id === shadow) c.bondId = 'seed-bond';
  return cats;
}

function loadCats(): Cat[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      return (JSON.parse(raw) as Partial<Cat>[]).map(normCat);
    }
  } catch {
    // corrupted data — start with the example
  }
  return seedCats();
}

/** An in-progress roll call survives reloads: the key exists ⇔ a session is active. */
function loadRollcall(): Set<string> | null {
  try {
    const raw = localStorage.getItem(ROLLCALL_KEY);
    if (raw !== null) return new Set(JSON.parse(raw) as string[]);
  } catch {
    // corrupted data — no session
  }
  return null;
}

/** Roster rules (rooms, quotas, scoring) — settings, kept apart from the cat data. */
function loadRoster(): RosterConfig {
  try {
    const raw = localStorage.getItem(ROSTER_KEY);
    if (raw !== null) return normRoster(JSON.parse(raw));
  } catch {
    // corrupted data — start unconfigured
  }
  return defaultRoster();
}

/**
 * Distributes two cats into the mother/father slots for a litter.
 * null — the pair cannot mate (sexes/orientations incompatible, see `canMate`).
 * Female → mother, male → father, '?' takes a free slot.
 * The slot does not matter for the DAG (kinship is symmetric), display only.
 */
export function assignParents(a: Cat, b: Cat): { mother: Cat; father: Cat } | null {
  if (!canMate(a, b)) return null;
  const female = a.sex === 'F' ? a : b.sex === 'F' ? b : null;
  const male = a.sex === 'M' ? a : b.sex === 'M' ? b : null;
  if (female && male) return { mother: female, father: male };
  if (female) return { mother: female, father: female === a ? b : a };
  if (male) return { mother: male === a ? b : a, father: male };
  return { mother: a, father: b }; // both are '?'
}

/** bondId → members index; one-member bonds are kept (harmless, count as inactive). */
export function bondsIndex(cats: Cat[]): Map<string, Cat[]> {
  const map = new Map<string, Cat[]>();
  for (const cat of cats) {
    if (!cat.bondId) continue;
    const list = map.get(cat.bondId);
    if (list) list.push(cat);
    else map.set(cat.bondId, [cat]);
  }
  return map;
}

/** All other members of the cat's bond, gone ones included (for management UI). */
export function bondPartnersOf(cat: Cat, bonds: Map<string, Cat[]>): Cat[] {
  if (!cat.bondId) return [];
  return (bonds.get(cat.bondId) ?? []).filter((c) => c.id !== cat.id);
}

/** The bond partners still in the house; a cat with none is free to mate again. */
export function activeBondPartners(cat: Cat, bonds: Map<string, Cat[]>): Cat[] {
  return bondPartnersOf(cat, bonds).filter((c) => !c.gone);
}

/** Tie two cats into one bond, merging the existing bonds of both sides (pure). */
export function mergeBonds(cats: Cat[], aId: string, bId: string, newId: string): Cat[] {
  const a = cats.find((c) => c.id === aId);
  const b = cats.find((c) => c.id === bId);
  if (!a || !b || aId === bId) return cats;
  const target = a.bondId ?? b.bondId ?? newId;
  const merged = new Set([a.bondId, b.bondId].filter((id): id is string => id !== null));
  return cats.map((c) =>
    c.id === aId || c.id === bId || (c.bondId !== null && merged.has(c.bondId))
      ? { ...c, bondId: target }
      : c,
  );
}

/** Remove one cat from its bond; a bond left with a single member dissolves (pure). */
export function withoutBondMember(cats: Cat[], id: string): Cat[] {
  const bondId = cats.find((c) => c.id === id)?.bondId;
  if (!bondId) return cats;
  const rest = cats.filter((c) => c.bondId === bondId && c.id !== id);
  const dissolve = rest.length < 2;
  return cats.map((c) =>
    c.id === id || (dissolve && c.bondId === bondId) ? { ...c, bondId: null } : c,
  );
}

export type KittenDraft = {
  name: string;
  sex: Sex;
  orientation: Orientation;
  mutations: Cat['mutations'];
  abilities: string[];
  stats: Cat['stats'];
  /** roster category, pickable right in the litter form (null — unsorted) */
  category: string | null;
  /** the room the kitten goes to (null — not set) */
  room: RoomId | null;
};
export const emptyKitten = (): KittenDraft => ({
  name: '',
  sex: 'F',
  orientation: 'hetero',
  mutations: {},
  abilities: [],
  stats: {},
  category: null,
  room: null,
});

/**
 * The single source of truth for the cat list: state + localStorage persistence +
 * derived indexes + data operations. Instantiated once at the app root and passed
 * to every screen. UI-level state (selection, modes) stays in the screens;
 * confirmations (confirm/alert) stay in the UI too — the operations here are silent.
 */
export function useCatsStore() {
  const [cats, setCats] = useState<Cat[]>(loadCats);
  // roll-call session: the ticked ids (null — no session); survives reloads
  const [rollChecked, setRollChecked] = useState<Set<string> | null>(loadRollcall);
  // roster rules (categories + per-room quotas and scoring); settings, not cat data
  const [roster, setRoster] = useState<RosterConfig>(loadRoster);
  // bumped when the whole dataset is replaced (import/reset); the shell keys
  // the screens on it, so every screen's local state (selections, modes,
  // filters) is dropped instead of pointing at dead cat ids
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cats));
  }, [cats]);

  useEffect(() => {
    if (rollChecked) localStorage.setItem(ROLLCALL_KEY, JSON.stringify([...rollChecked]));
    else localStorage.removeItem(ROLLCALL_KEY);
  }, [rollChecked]);

  useEffect(() => {
    localStorage.setItem(ROSTER_KEY, JSON.stringify(roster));
  }, [roster]);

  const byId = useMemo(() => indexCats(cats), [cats]);
  const children = useMemo(() => childrenIndex(cats), [cats]);
  const bonds = useMemo(() => bondsIndex(cats), [cats]);

  const updateCat = (id: string, patch: Partial<Cat>) => {
    setCats((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  /** Is the name taken by another cat (case/whitespace-insensitive; the exceptId cat is ignored). */
  const nameTakenBy = (name: string, exceptId?: string) => {
    const key = normName(name);
    if (!key) return false;
    return cats.some((c) => c.id !== exceptId && normName(c.name) === key);
  };

  const addFounder = (
    name: string,
    sex: Sex,
    room: RoomId | null,
    cls: ClassKey | null,
    orientation: Orientation,
    category: string | null = null,
  ) => {
    setCats((cs) => [...cs, makeCat(name, sex, null, null, room, cls, orientation, {}, {}, category)]);
  };

  const createKitten = (mother: Cat, father: Cat, k: KittenDraft) => {
    setCats((cs) => [
      ...cs,
      makeCat(
        k.name,
        k.sex,
        mother.id,
        father.id,
        k.room,
        null,
        k.orientation,
        k.mutations,
        k.stats,
        k.category,
        k.abilities,
      ),
    ]);
  };

  const removeCat = (id: string) => {
    setCats((cs) => cs.filter((c) => c.id !== id));
  };

  /** Tie two cats into one bond (existing bonds of either side merge in). */
  const bondCats = (aId: string, bId: string) => {
    setCats((cs) => mergeBonds(cs, aId, bId, crypto.randomUUID()));
  };

  /** Remove one cat from its bond (a bond left with one member dissolves). */
  const unbondCat = (id: string) => {
    setCats((cs) => withoutBondMember(cs, id));
  };

  /** Dissolve a bond entirely — every member becomes free again. */
  const dissolveBond = (bondId: string) => {
    setCats((cs) => cs.map((c) => (c.bondId === bondId ? { ...c, bondId: null } : c)));
  };

  /**
   * Delete a roster category: drop it from every room's rules and unassign the
   * cats holding it, so no cat is left pointing at a category that is gone.
   */
  const deleteCategory = (id: string) => {
    setRoster((r) => {
      const rooms: RosterConfig['rooms'] = {};
      for (const room of ROOMS) {
        const policy = r.rooms[room.id];
        if (!policy) continue;
        const { [id]: _dropped, ...rest } = policy.categories;
        rooms[room.id] = { ...policy, categories: rest };
      }
      return { categories: r.categories.filter((c) => c.id !== id), rooms };
    });
    setCats((cs) => cs.map((c) => (c.category === id ? { ...c, category: null } : c)));
  };

  /** Replace everything with imported data (already validated; fields get normalized here).
   * Kills the roll-call session — its ticks reference the replaced cats' ids.
   * A file without roster rules (an export from before this screen) leaves the
   * current rules alone rather than wiping a carefully tuned scorecard. */
  const importCats = (data: Partial<Cat>[], rosterData?: unknown) => {
    setCats(data.map(normCat));
    if (rosterData !== undefined) setRoster(normRoster(rosterData));
    setRollChecked(null);
    setEpoch((e) => e + 1);
  };

  /** Wipe all data (the confirmation lives in the UI). */
  const resetAll = () => {
    setCats([]);
    setRoster(defaultRoster());
    setRollChecked(null);
    setEpoch((e) => e + 1);
  };

  const startRollcall = () => setRollChecked(new Set());

  const toggleRollCheck = (id: string) => {
    setRollChecked((s) => {
      if (!s) return s;
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const cancelRollcall = () => setRollChecked(null);

  /** Ends the session, marking the confirmed leavers as gone. */
  const finishRollcall = (goneIds: string[]) => {
    if (goneIds.length > 0) {
      const gone = new Set(goneIds);
      setCats((cs) => cs.map((c) => (gone.has(c.id) ? { ...c, gone: true } : c)));
    }
    setRollChecked(null);
  };

  return {
    cats,
    setCats,
    epoch,
    byId,
    children,
    bonds,
    updateCat,
    nameTakenBy,
    addFounder,
    createKitten,
    removeCat,
    bondCats,
    unbondCat,
    dissolveBond,
    roster,
    setRoster,
    deleteCategory,
    importCats,
    resetAll,
    rollChecked,
    startRollcall,
    toggleRollCheck,
    cancelRollcall,
    finishRollcall,
  };
}

export type CatsStore = ReturnType<typeof useCatsStore>;
