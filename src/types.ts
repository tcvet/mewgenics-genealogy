/** '?' — universal sex: mates with any cat. */
export type Sex = 'F' | 'M' | '?';

export const SEX_GLYPH: Record<Sex, string> = { F: '♀', M: '♂', '?': '?' };

/** Who the cat is willing to mate with (the game's default is straight). */
export type Orientation = 'hetero' | 'bi' | 'homo';

export const ORIENTATIONS: Orientation[] = ['hetero', 'bi', 'homo'];

/** The inputs to the mating rules (a `Cat` is structurally assignable). */
export interface MateTraits {
  sex: Sex;
  orientation: Orientation;
}

/**
 * Can two cats produce a litter (the game's rules):
 * - the universal sex '?' mates with anyone;
 * - a same-sex pair never has a litter;
 * - a homo cat otherwise cannot breed at all ('?' partners only);
 * - the rest breed only within their orientation: hetero×hetero, bi×bi.
 */
export function canMate(a: MateTraits, b: MateTraits): boolean {
  if (a.sex === '?' || b.sex === '?') return true;
  if (a.sex === b.sex) return false;
  if (a.orientation === 'homo' || b.orientation === 'homo') return false;
  return a.orientation === b.orientation;
}

export type RoomId =
  | 'floor1-left'
  | 'floor1-right'
  | 'floor2-left'
  | 'floor2-right'
  | 'attic';

/** Room display names live in the `i18n.tsx` dictionaries (keyed by RoomId); only ids and short glyphs here. */
export const ROOMS: { id: RoomId; short: string }[] = [
  { id: 'floor1-left', short: '1◀' },
  { id: 'floor1-right', short: '1▶' },
  { id: 'floor2-left', short: '2◀' },
  { id: 'floor2-right', short: '2▶' },
  { id: 'attic', short: '▲' },
];

export const ROOM_SHORT: Record<RoomId, string> = Object.fromEntries(
  ROOMS.map((r) => [r.id, r.short]),
) as Record<RoomId, string>;

/** Base stats from the game; full stat names live in the `i18n.tsx` dictionaries. */
export type StatKey = 'str' | 'dex' | 'con' | 'int' | 'spd' | 'cha' | 'lck';

export const STAT_KEYS: StatKey[] = ['str', 'dex', 'con', 'int', 'spd', 'cha', 'lck'];

/** The game groups the stats into two blocks (shown separated in the editor). */
export const STAT_GROUPS: StatKey[][] = [
  ['str', 'dex', 'con'],
  ['int', 'spd', 'cha', 'lck'],
];

/** The only base-stat values the game rolls; anything else means "not set". */
export const STAT_VALUES = [3, 4, 5, 6, 7];

/**
 * The game's 10 body-part groups, each holding at most one mutation (breeding
 * is always symmetric in the game, so left/right pairs count as one slot).
 * Arms and legs are separate slots but draw from one shared "limbs" mutation
 * pool — see the catalog groups in `mutations.ts`. `texture` = fur. Display
 * names live in the `i18n.tsx` dictionaries.
 */
export type MutationSlot =
  | 'head'
  | 'eyes'
  | 'eyebrows'
  | 'ears'
  | 'mouth'
  | 'body'
  | 'arms'
  | 'legs'
  | 'tail'
  | 'texture';

export const MUTATION_SLOTS: MutationSlot[] = [
  'head',
  'eyes',
  'eyebrows',
  'ears',
  'mouth',
  'body',
  'arms',
  'legs',
  'tail',
  'texture',
];

/** Class keys — stable ids for name translations in `i18n.tsx` (cat data stores the key). */
export type ClassKey =
  | 'fighter'
  | 'hunter'
  | 'mage'
  | 'tank'
  | 'cleric'
  | 'thief'
  | 'necromancer'
  | 'tinkerer'
  | 'butcher'
  | 'druid'
  | 'psychic'
  | 'monk';

/** The game's classes with their colors — the class color is the card background. */
export const CLASSES: { id: ClassKey; color: string }[] = [
  { id: 'fighter', color: '#B17373' },
  { id: 'hunter', color: '#425D3D' },
  { id: 'mage', color: '#787899' },
  { id: 'tank', color: '#857348' },
  { id: 'cleric', color: '#FDFDFD' },
  { id: 'thief', color: '#FFFBB5' },
  { id: 'necromancer', color: '#131313' },
  { id: 'tinkerer', color: '#B5EADC' },
  { id: 'butcher', color: '#AC4457' },
  { id: 'druid', color: '#5B4237' },
  { id: 'psychic', color: '#645379' },
  { id: 'monk', color: '#787878' },
];

export const CLASS_COLOR: Record<ClassKey, string> = Object.fromEntries(
  CLASSES.map((c) => [c.id, c.color]),
) as Record<ClassKey, string>;

/** Text color (dark/light) for readability on top of the card background. */
export function textColorOn(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#16161c' : '#e8e8ee';
}

export interface Cat {
  id: string;
  name: string;
  sex: Sex;
  /** affects mating rules only (like sex, never the tree structure) */
  orientation: Orientation;
  /** null — a founder (parents unknown / cat from outside) */
  motherId: string | null;
  fatherId: string | null;
  /** null — no room set (optional attribute) */
  room: RoomId | null;
  /** the cat's class; the card background color derives from it (null — no class set) */
  class: ClassKey | null;
  /** true — the cat no longer lives in the house (died/sold/left); stays in the pedigree */
  gone: boolean;
  notes: string;
  /** base stats; a missing key means "not set" */
  stats: Partial<Record<StatKey, number>>;
  /** mutation per body-part slot (game ids, see `mutations.ts`); a missing key means "no mutation" */
  mutations: Partial<Record<MutationSlot, string>>;
}
