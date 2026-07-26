import { useMemo, useState } from 'react';
import { SEX_GLYPH, type Cat } from './types';
import { coiTier, formatCOI } from './genealogy';
import { statSum } from './store';
import { useI18n } from './i18n';

export type MateEntry = { cat: Cat; coi: number };

type MateSort = 'coi' | 'name' | 'stats';

/** Sortable list of breeding candidates with their offspring COI; shared by
 * the tree's floating mate panel and the breeding screen's partner column. */
export function MateList({
  mates,
  pickedIds,
  onPick,
}: {
  mates: MateEntry[];
  pickedIds: string[];
  onPick: (id: string) => void;
}) {
  const { t } = useI18n();
  const [sort, setSort] = useState<MateSort>('coi');
  const sorted = useMemo(() => {
    const byName = (a: { cat: Cat }, b: { cat: Cat }) => a.cat.name.localeCompare(b.cat.name);
    const list = [...mates];
    if (sort === 'name') list.sort(byName);
    else if (sort === 'stats')
      list.sort((a, b) => statSum(b.cat) - statSum(a.cat) || a.coi - b.coi || byName(a, b));
    else list.sort((a, b) => a.coi - b.coi || byName(a, b));
    return list;
  }, [mates, sort]);
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
      {sorted.length === 0 ? (
        <div className="meta">{t.mateEmpty}</div>
      ) : (
        <div className="mate-list">
          {sorted.map(({ cat, coi }) => (
            <button
              key={cat.id}
              className={`mate-row${pickedIds.includes(cat.id) ? ' picked' : ''}`}
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
    </>
  );
}
