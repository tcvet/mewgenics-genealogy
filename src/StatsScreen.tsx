import { Fragment, useMemo, useState } from 'react';
import { SEX_GLYPH, STAT_KEYS, type MutationSlot } from './types';
import { getNamed, houseMutations, mutationLabel, type HouseMutation } from './mutations';
import { type CatsStore } from './store';
import { useI18n } from './i18n';

/** A mutation expanded to show its carriers: the id under a specific slot. */
type MutFocus = { slot: MutationSlot; id: string };

/**
 * The statistics screen: house statistics on the left, the mutation
 * inventory (grouped by body-part slot) on the right. Clicking a mutation
 * unfolds its carriers; clicking a carrier opens that cat in the browser.
 */
export function StatsScreen({
  store,
  onOpenCat,
}: {
  store: CatsStore;
  onOpenCat: (id: string) => void;
}) {
  const { t } = useI18n();
  const { cats } = store;
  const [focus, setFocus] = useState<MutFocus | null>(null);

  const s = useMemo(() => {
    const acc = { f: 0, m: 0, any: 0, home: 0, perfect: 0 };
    for (const c of cats) {
      if (c.gone) continue; // only cats currently in the house are of interest
      acc.home++;
      if (c.sex === 'F') acc.f++;
      else if (c.sex === 'M') acc.m++;
      else acc.any++;
      if (STAT_KEYS.every((k) => c.stats[k] === 7)) acc.perfect++;
    }
    return acc;
  }, [cats]);
  const rows: { label: string; n: number; sub?: boolean; sep?: boolean }[] = [
    { label: t.statsAtHome, n: s.home },
    { label: t.statsFemales, n: s.f, sub: true },
    { label: t.statsMales, n: s.m, sub: true },
    { label: t.statsAnySex, n: s.any, sub: true },
    { label: t.statsPerfect, n: s.perfect },
    { label: t.statsTotal, n: cats.length, sep: true },
  ];

  const houseMuts = useMemo(() => houseMutations(cats), [cats]);
  // consecutive rows share the slot (houseMutations returns them in slot order)
  const groups = useMemo(() => {
    const gs: { slot: MutationSlot; rows: HouseMutation[] }[] = [];
    for (const row of houseMuts) {
      const last = gs[gs.length - 1];
      if (last && last.slot === row.slot) last.rows.push(row);
      else gs.push({ slot: row.slot, rows: [row] });
    }
    return gs;
  }, [houseMuts]);

  return (
    <div className="st-screen">
      <div className="st-col">
        <div className="panel">
          <h3>📊 {t.statsPanelTitle}</h3>
          <div className="stats-list">
            {rows.map((row) => (
              <div
                key={row.label}
                className={`stats-row${row.sub ? ' sub' : ''}${row.sep ? ' sep' : ''}`}
              >
                <span>{row.label}</span>
                <span className="stats-val">{row.n}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="st-main">
        <div className="st-head">
          <b>🧬 {t.mutPanelTitle}</b>
          <span className="meta">{t.stHint}</span>
        </div>
        {groups.length === 0 ? (
          <div className="ov-empty">{t.mutPanelEmpty}</div>
        ) : (
          <div className="st-groups">
            {groups.map((g) => (
              <div className="st-group" key={g.slot}>
                <div className="mut-group">{t.mutationSlots[g.slot]}</div>
                {g.rows.map((row) => {
                  const active = focus?.slot === row.slot && focus.id === row.id;
                  const named = getNamed(row.id);
                  return (
                    <Fragment key={row.id}>
                      <button
                        className={`mate-row${active ? ' picked' : ''}`}
                        title={named?.desc || undefined}
                        onClick={() => setFocus(active ? null : { slot: row.slot, id: row.id })}
                      >
                        <span className="mate-name">
                          {named?.defect && (
                            <span className="mut-defect" title={t.mutationDefectsGroup}>
                              ⚠{' '}
                            </span>
                          )}
                          {mutationLabel(row.id)}
                        </span>
                        <span className="mut-count">×{row.living}</span>
                      </button>
                      {active && (
                        <div className="mut-carriers">
                          {row.carriers.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className={`mut-inherit${c.gone ? ' gone' : ''}`}
                              onClick={() => onOpenCat(c.id)}
                            >
                              {SEX_GLYPH[c.sex]} {c.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </Fragment>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
