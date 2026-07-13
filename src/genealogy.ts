import { canMate, type Cat } from './types';

export type CatsById = Map<string, Cat>;

export function indexCats(cats: Cat[]): CatsById {
  return new Map(cats.map((c) => [c.id, c]));
}

/** Parent → children index. */
export function childrenIndex(cats: Cat[]): Map<string, Cat[]> {
  const map = new Map<string, Cat[]>();
  for (const cat of cats) {
    for (const parentId of [cat.motherId, cat.fatherId]) {
      if (!parentId) continue;
      const list = map.get(parentId);
      if (list) list.push(cat);
      else map.set(parentId, [cat]);
    }
  }
  return map;
}

/** All ancestors of a cat (the cat itself excluded). */
export function ancestorIds(catId: string, byId: CatsById): Set<string> {
  const result = new Set<string>();
  const stack = [catId];
  while (stack.length > 0) {
    const cat = byId.get(stack.pop()!);
    if (!cat) continue;
    for (const parentId of [cat.motherId, cat.fatherId]) {
      if (parentId && !result.has(parentId)) {
        result.add(parentId);
        stack.push(parentId);
      }
    }
  }
  return result;
}

/** All descendants of a cat (the cat itself excluded). */
export function descendantIds(catId: string, cats: Cat[]): Set<string> {
  const children = childrenIndex(cats);
  const result = new Set<string>();
  const stack = [catId];
  while (stack.length > 0) {
    for (const child of children.get(stack.pop()!) ?? []) {
      if (!result.has(child.id)) {
        result.add(child.id);
        stack.push(child.id);
      }
    }
  }
  return result;
}

/**
 * Subgraph for the "pedigree" mode: the cat itself, its ancestors and
 * descendants, plus the other parents of the descendants — so every litter
 * is shown with both parents.
 */
export function pedigreeIds(catId: string, cats: Cat[]): Set<string> {
  const byId = indexCats(cats);
  const result = new Set<string>([catId]);
  for (const id of ancestorIds(catId, byId)) result.add(id);
  for (const id of descendantIds(catId, cats)) result.add(id);
  for (const id of [...result]) {
    const cat = byId.get(id);
    if (!cat) continue;
    if (cat.motherId) result.add(cat.motherId);
    if (cat.fatherId) result.add(cat.fatherId);
  }
  return result;
}

/**
 * A cat's generation: max(parents' generation) + 1, founders get 0.
 * Needed so the kinship recursion always expands the later-generation cat.
 * Guarded against cycles (malformed import): such a cat gets 0.
 */
export function generations(cats: Cat[], byId: CatsById): Map<string, number> {
  const gen = new Map<string, number>();
  const visiting = new Set<string>();
  const depth = (id: string | null): number => {
    if (!id) return -1;
    const cached = gen.get(id);
    if (cached !== undefined) return cached;
    const cat = byId.get(id);
    if (!cat || visiting.has(id)) return 0; // missing or a cycle
    visiting.add(id);
    const g = Math.max(depth(cat.motherId), depth(cat.fatherId)) + 1;
    visiting.delete(id);
    gen.set(id, g);
    return g;
  };
  for (const cat of cats) depth(cat.id);
  return gen;
}

/**
 * Kinship coefficient f(a,b) — the probability that alleles sampled at random
 * from a and b are identical by descent. Wright's method, recursive.
 * Key identities:
 *   f(A,A) = ½·(1 + f(A's mother, A's father))
 *   f(A,B) = ½·(f(A's mother, B) + f(A's father, B)), A being the later one (descendant).
 */
function kinshipRec(
  aId: string | null,
  bId: string | null,
  byId: CatsById,
  gen: Map<string, number>,
  memo: Map<string, number>,
): number {
  if (!aId || !bId) return 0;
  const key = aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
  const cached = memo.get(key);
  if (cached !== undefined) return cached;

  let val: number;
  if (aId === bId) {
    const a = byId.get(aId);
    val = a ? 0.5 * (1 + kinshipRec(a.motherId, a.fatherId, byId, gen, memo)) : 0;
  } else {
    // expand the later-generation cat (the descendant)
    const ga = gen.get(aId) ?? 0;
    const gb = gen.get(bId) ?? 0;
    const [younger, other] = gb > ga || (gb === ga && bId > aId) ? [bId, aId] : [aId, bId];
    const y = byId.get(younger);
    val = y
      ? 0.5 *
        (kinshipRec(y.motherId, other, byId, gen, memo) +
          kinshipRec(y.fatherId, other, byId, gen, memo))
      : 0;
  }
  memo.set(key, val);
  return val;
}

/** A cat's inbreeding coefficient F = kinship of its mother and father (0 for founders). */
export function inbreedingCoefficient(catId: string, cats: Cat[]): number {
  const byId = indexCats(cats);
  const cat = byId.get(catId);
  if (!cat) return 0;
  const gen = generations(cats, byId);
  return kinshipRec(cat.motherId, cat.fatherId, byId, gen, new Map());
}

/** COI of a pair's future offspring = the parents' kinship coefficient. */
export function pairCOI(aId: string, bId: string, cats: Cat[]): number {
  const byId = indexCats(cats);
  const gen = generations(cats, byId);
  return kinshipRec(aId, bId, byId, gen, new Map());
}

/**
 * For every compatible cat (sex + orientation, see `canMate`) — the COI
 * (inbreeding) of its would-be offspring with the given cat.
 * One shared memo across all pairs — fast.
 */
export function mateCOIs(catId: string, cats: Cat[]): Map<string, number> {
  const byId = indexCats(cats);
  const cat = byId.get(catId);
  const result = new Map<string, number>();
  if (!cat) return result;
  const gen = generations(cats, byId);
  const memo = new Map<string, number>();
  for (const other of cats) {
    // cats that left home are not shown as candidates (but still count as ancestors for COI)
    if (other.id === catId || other.gone || !canMate(cat, other)) continue;
    result.set(other.id, kinshipRec(catId, other.id, byId, gen, memo));
  }
  return result;
}

export type COITier = 'none' | 'slight' | 'moderate' | 'high' | 'extreme';

/**
 * The game's inbreeding tiers: <10% not inbred, 10–25% slightly, 25–50%
 * moderately, 50–80% highly, 80%+ extremely inbred (lower bounds inclusive,
 * so e.g. full siblings' 25% counts as moderately).
 */
export function coiTier(coi: number): COITier {
  if (coi < 0.1) return 'none';
  if (coi < 0.25) return 'slight';
  if (coi < 0.5) return 'moderate';
  if (coi < 0.8) return 'high';
  return 'extreme';
}

/** COI as a percentage: 0% / 6.25% / 25% with a sensible number of digits. */
export function formatCOI(coi: number): string {
  const v = coi * 100;
  if (v <= 0) return '0%';
  if (v >= 10) return `${Math.round(v)}%`;
  if (v >= 1) return `${v.toFixed(1)}%`;
  return `${v.toFixed(2)}%`;
}
