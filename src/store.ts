import { useEffect, useMemo, useState } from 'react';
import {
  canMate,
  STAT_KEYS,
  type Cat,
  type ClassKey,
  type Orientation,
  type RoomId,
  type Sex,
} from './types';
import { normMutations } from './mutations';
import { childrenIndex, indexCats } from './genealogy';

export const STORAGE_KEY = 'mewgenics-genealogy';
export const ROLLCALL_KEY = 'mewgenics-rollcall';

/** Name normalization for duplicate checks: trimmed, case-insensitive. */
export const normName = (s: string) => s.trim().toLowerCase();

/** Normalize a possibly-missing/invalid orientation (older saves/imports). */
const normOrientation = (o: unknown): Orientation => (o === 'bi' || o === 'homo' ? o : 'hetero');

/** Total of the recorded base stats (unset stats count as 0). */
export const statSum = (c: Cat) => STAT_KEYS.reduce((sum, k) => sum + (c.stats[k] ?? 0), 0);

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
    notes: c.notes ?? '',
    stats: c.stats ?? {},
    mutations: normMutations(c.mutations),
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
    notes: '',
    stats: {},
    mutations,
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
      notes: '',
      stats: {},
      mutations,
    };
    cats.push(cat);
    return cat.id;
  };
  // example mutations: Luna inherits one from each parent (body.301 Cactus Bod, eyes.301 Demon Eyes)
  const misty = add('Misty', 'F', null, null, 'monk', { body: 'body.301' });
  const shadow = add('Shadow', 'M', null, null, 'necromancer', { eyes: 'eyes.301' });
  const tom = add('Tom', 'M', null, null, 'tank');
  const luna = add('Luna', 'F', misty, shadow, 'mage', { body: 'body.301', eyes: 'eyes.301' });
  add('Ginger', 'M', misty, shadow, 'fighter');
  add('Toffee', 'F', luna, tom, 'thief');
  add('Cosmo', 'M', luna, tom, 'tinkerer');
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

export type KittenDraft = {
  name: string;
  sex: Sex;
  orientation: Orientation;
  mutations: Cat['mutations'];
};
export const emptyKitten = (): KittenDraft => ({
  name: '',
  sex: 'F',
  orientation: 'hetero',
  mutations: {},
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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cats));
  }, [cats]);

  useEffect(() => {
    if (rollChecked) localStorage.setItem(ROLLCALL_KEY, JSON.stringify([...rollChecked]));
    else localStorage.removeItem(ROLLCALL_KEY);
  }, [rollChecked]);

  const byId = useMemo(() => indexCats(cats), [cats]);
  const children = useMemo(() => childrenIndex(cats), [cats]);

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
  ) => {
    setCats((cs) => [...cs, makeCat(name, sex, null, null, room, cls, orientation)]);
  };

  const createLitter = (mother: Cat, father: Cat, kittens: KittenDraft[]) => {
    setCats((cs) => [
      ...cs,
      ...kittens.map((k) =>
        makeCat(k.name, k.sex, mother.id, father.id, null, null, k.orientation, k.mutations),
      ),
    ]);
  };

  const removeCat = (id: string) => {
    setCats((cs) => cs.filter((c) => c.id !== id));
  };

  /** Replace everything with imported data (already validated; fields get normalized here).
   * Kills the roll-call session — its ticks reference the replaced cats' ids. */
  const importCats = (data: Partial<Cat>[]) => {
    setCats(data.map(normCat));
    setRollChecked(null);
  };

  /** Wipe all data (the confirmation lives in the UI). */
  const resetAll = () => {
    setCats([]);
    setRollChecked(null);
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
    byId,
    children,
    updateCat,
    nameTakenBy,
    addFounder,
    createLitter,
    removeCat,
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
