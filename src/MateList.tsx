import { useMemo, useState } from 'react';
import { SEX_GLYPH, type Cat } from './types';
import { coiTier, formatCOI } from './genealogy';
import { activeBondPartners, statSum } from './store';
import { useI18n } from './i18n';

export type MateEntry = {
  cat: Cat;
  coi: number;
  /** set when the candidate is in an active bond; own — bonded with the source cat */
  bond?: { own: boolean; names: string };
};

/** Attach bond info to raw candidate entries (shared by both MateList call sites). */
export function decorateBonds(
  entries: { cat: Cat; coi: number }[],
  source: Cat,
  bonds: Map<string, Cat[]>,
): MateEntry[] {
  return entries.map((e) => {
    const partners = activeBondPartners(e.cat, bonds);
    if (partners.length === 0) return e;
    return {
      ...e,
      bond: {
        own: e.cat.bondId !== null && e.cat.bondId === source.bondId,
        names: partners.map((p) => p.name).join(', '),
      },
    };
  });
}

type MateSort = 'coi' | 'name' | 'stats';

/** Sortable list of breeding candidates with their offspring COI; shared by
 * the tree's floating mate panel and the breeding screen's partner column
 * (which prefers the name order — its list is the whole living house).
 * The source's own bond partners are pinned on top; cats bonded elsewhere
 * are hidden behind the "show bonded" toggle. */
export function MateList({
  mates,
  pickedIds,
  onPick,
  defaultSort = 'coi',
}: {
  mates: MateEntry[];
  pickedIds: string[];
  onPick: (id: string) => void;
  defaultSort?: MateSort;
}) {
  const { t } = useI18n();
  const [sort, setSort] = useState<MateSort>(defaultSort);
  const [showTaken, setShowTaken] = useState(false);
  const sorted = useMemo(() => {
    const byName = (a: { cat: Cat }, b: { cat: Cat }) => a.cat.name.localeCompare(b.cat.name);
    const list = [...mates];
    if (sort === 'name') list.sort(byName);
    else if (sort === 'stats')
      list.sort((a, b) => statSum(b.cat) - statSum(a.cat) || a.coi - b.coi || byName(a, b));
    else list.sort((a, b) => a.coi - b.coi || byName(a, b));
    return list;
  }, [mates, sort]);
  const { shown, takenCount } = useMemo(() => {
    const own = sorted.filter((m) => m.bond?.own);
    const free = sorted.filter((m) => !m.bond);
    const taken = sorted.filter((m) => m.bond && !m.bond.own);
    return {
      shown: showTaken ? [...own, ...free, ...taken] : [...own, ...free],
      takenCount: taken.length,
    };
  }, [sorted, showTaken]);
  const sorts: { key: MateSort; label: string }[] = [
    { key: 'coi', label: 'COI' },
    { key: 'name', label: t.mateSortName },
    { key: 'stats', label: t.mateSortStats },
  ];
  return (
    <>
      <div className="row">
        {sorts.map((s) => (
          <button
            key={s.key}
            className={`small${sort === s.key ? ' accent' : ''}`}
            onClick={() => setSort(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>
      {mates.length === 0 ? (
        <div className="meta">{t.mateEmpty}</div>
      ) : (
        <div className="mate-list">
          {shown.map(({ cat, coi, bond }) => (
            <button
              key={cat.id}
              className={`mate-row${pickedIds.includes(cat.id) ? ' picked' : ''}${
                bond && !bond.own ? ' engaged' : ''
              }${cat.gone ? ' gone' : ''}`}
              onClick={() => onPick(cat.id)}
            >
              <span className="mate-sex">{SEX_GLYPH[cat.sex]}</span>
              <span className="mate-name">{cat.name}</span>
              {cat.orientation !== 'hetero' && (
                <span
                  className={`flag-chip flag-${cat.orientation}`}
                  title={cat.orientation === 'bi' ? t.oriBi : t.oriHomo}
                />
              )}
              {bond && (
                <span className="bond-chip" title={t.bondWith(bond.names)}>
                  💞
                </span>
              )}
              {statSum(cat) > 0 && (
                <span className="mate-sum" title={t.mateStatsTitle}>
                  Σ{statSum(cat)}
                </span>
              )}
              <span className={`coi-inline ${coiTier(coi)}`}>{formatCOI(coi)}</span>
            </button>
          ))}
        </div>
      )}
      {takenCount > 0 && (
        <button type="button" className="small bond-toggle" onClick={() => setShowTaken((v) => !v)}>
          {showTaken ? t.bondHideTaken : t.bondShowTaken(takenCount)}
        </button>
      )}
    </>
  );
}
