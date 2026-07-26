import { useMemo, useState } from 'react';
import { SEX_GLYPH, type Cat } from './types';
import {
  getNamed,
  legacyBondRows,
  legacyReport,
  mutationLabel,
  type LegacyBondRow,
  type LegacyRow,
  type LegacyStatus,
} from './mutations';
import { type CatsStore } from './store';
import { useI18n } from './i18n';

/**
 * The legacy screen: which established bonds keep each named mutation in the
 * house. Everything is derived from cats' `mutations` + `bondId` — nothing to
 * maintain by hand. The by-mutation list ranks problems first; the by-bond
 * pivot shows every bond's load and where it is irreplaceable. Cat names jump
 * to the browser, "find a partner" jumps to the breeding screen.
 */
export function LegacyScreen({
  store,
  onOpenCat,
  onOpenBreeding,
}: {
  store: CatsStore;
  onOpenCat: (id: string) => void;
  onOpenBreeding: (id: string) => void;
}) {
  const { t } = useI18n();
  const { cats, bonds } = store;
  const [view, setView] = useState<'mut' | 'bond'>('mut');

  const rows = useMemo(() => legacyReport(cats, bonds), [cats, bonds]);
  const bondRows = useMemo(() => legacyBondRows(rows, bonds), [rows, bonds]);
  const live = rows.filter((r) => r.status !== 'lost');
  const lost = rows.filter((r) => r.status === 'lost');

  const statusLabel: Record<LegacyStatus, string> = {
    secured: t.lgSecured,
    loose: t.lgLoose,
    last: t.lgLast,
    lost: t.lgLostTitle,
  };
  const statusTip: Record<LegacyStatus, string> = {
    secured: t.lgSecuredTip,
    loose: t.lgLooseTip,
    last: t.lgLastTip,
    lost: t.lgLostTip,
  };

  const catBtn = (c: Cat, dim = false) => (
    <button
      key={c.id}
      type="button"
      className={`mut-inherit${c.gone ? ' gone' : ''}${dim ? ' dim' : ''}`}
      onClick={() => onOpenCat(c.id)}
    >
      {SEX_GLYPH[c.sex]} {c.name}
    </button>
  );

  const mutRow = (row: LegacyRow) => {
    const named = getNamed(row.id);
    return (
      <div className="lg-row" key={`${row.slot}|${row.id}`}>
        <div className="lg-line">
          <span className={`lg-status ${row.status}`} title={statusTip[row.status]}>
            {statusLabel[row.status]}
          </span>
          <span className="lg-mut" title={named?.desc || undefined}>
            {named?.defect && (
              <span className="mut-defect" title={t.mutationDefectsGroup}>
                ⚠{' '}
              </span>
            )}
            {mutationLabel(row.id)}
          </span>
          <span className="lg-slot">{t.mutationSlots[row.slot]}</span>
        </div>
        <div className="lg-keepers">
          {row.bonds.map((b) => (
            <span
              key={b.bondId}
              className="lg-bond"
              title={b.others.length === 0 ? t.lgFullBondTip : undefined}
            >
              💞 {b.carriers.map((c) => catBtn(c))}
              {b.others.map((c) => catBtn(c, true))}
              {b.others.length === 0 && <span className="lg-full">✓✓</span>}
            </span>
          ))}
          {row.loose.length > 0 && (
            <span className="lg-loose">
              <span className="lg-label">
                {row.bonds.length > 0 ? t.lgOutside : t.lgCarriers}
              </span>
              {row.loose.map((c) => catBtn(c))}
            </span>
          )}
          {(row.status === 'loose' || row.status === 'last') && (
            <button
              type="button"
              className="lg-pairup"
              title={t.lgPairUpTip(row.loose[0].name)}
              onClick={() => onOpenBreeding(row.loose[0].id)}
            >
              {t.lgPairUp}
            </button>
          )}
          {row.status === 'lost' && row.gone.map((c) => catBtn(c))}
        </div>
      </div>
    );
  };

  const bondRow = (b: LegacyBondRow) => (
    <div className="lg-row" key={b.bondId}>
      <div className="lg-line">
        <span className="lg-bondhead">💞 {b.members.map((c) => catBtn(c))}</span>
      </div>
      <div className="lg-keepers">
        {b.holds.length === 0 ? (
          <span className="lg-label">{t.lgKeepsNothing}</span>
        ) : (
          <>
            <span className="lg-label">{t.lgKeeps}</span>
            {b.holds.map((r) => (
              <span
                key={`${r.slot}|${r.id}`}
                className="lg-mutchip"
                title={getNamed(r.id)?.desc || undefined}
              >
                {mutationLabel(r.id)} <span className="lg-slot">{t.mutationSlots[r.slot]}</span>
              </span>
            ))}
          </>
        )}
      </div>
      {b.sole.length > 0 && (
        <div className="lg-warn">
          {t.lgSoleKeeper(b.sole.map((r) => mutationLabel(r.id)).join(', '))}
        </div>
      )}
    </div>
  );

  return (
    <div className="lg-screen">
      <div className="st-head">
        <b>🧬 {t.navLegacy}</b>
        <div className="lg-toggle">
          <button
            type="button"
            className={view === 'mut' ? 'on' : ''}
            onClick={() => setView('mut')}
          >
            {t.lgByMut}
          </button>
          <button
            type="button"
            className={view === 'bond' ? 'on' : ''}
            onClick={() => setView('bond')}
          >
            {t.lgByBond}
          </button>
        </div>
        <span className="meta">{t.lgHint}</span>
      </div>
      <div className="lg-list">
        {view === 'mut' ? (
          <>
            {live.length === 0 && <div className="ov-empty">{t.lgEmpty}</div>}
            {live.map(mutRow)}
            {lost.length > 0 && (
              <>
                <div className="lg-sep">{t.lgLostTitle}</div>
                {lost.map(mutRow)}
              </>
            )}
          </>
        ) : bondRows.length === 0 ? (
          <div className="ov-empty">{t.lgNoBonds}</div>
        ) : (
          bondRows.map(bondRow)
        )}
      </div>
    </div>
  );
}
