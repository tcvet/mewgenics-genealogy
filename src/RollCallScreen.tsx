import { useMemo, useState } from 'react';
import { SEX_GLYPH } from './types';
import { type CatsStore } from './store';
import { useI18n } from './i18n';

/**
 * The roll-call screen: walk the in-game roster and tick every cat found in
 * the tree; "Finish" reviews the unticked ones (pre-marked as leavers, any of
 * them can be kept) and applies gone:true in bulk. The session itself lives
 * in the store — it survives tab switches and reloads; only Finish/Cancel
 * (or an import/reset) end it.
 */
export function RollCallScreen({ store }: { store: CatsStore }) {
  const { t } = useI18n();
  const { cats, rollChecked, startRollcall, toggleRollCheck, cancelRollcall, finishRollcall } =
    store;
  const [reviewing, setReviewing] = useState(false);
  // review step: unticked cats the user opts to keep at home anyway
  const [keep, setKeep] = useState<Set<string>>(() => new Set());
  // the checklist: cats still at home, alphabetical (like the game roster)
  const rollCats = useMemo(
    () => cats.filter((c) => !c.gone).sort((a, b) => a.name.localeCompare(b.name)),
    [cats],
  );

  if (!rollChecked) {
    return (
      <div className="rc-screen">
        <div className="panel rc-start">
          <h3>📋 {t.navRollcall}</h3>
          <div className="meta">{t.rollHint}</div>
          <button
            className="accent"
            onClick={() => {
              setReviewing(false);
              startRollcall();
            }}
          >
            {t.rollStartBtn}
          </button>
        </div>
      </div>
    );
  }

  const done = rollCats.filter((c) => rollChecked.has(c.id)).length;
  const missing = rollCats.filter((c) => !rollChecked.has(c.id));

  const toggleKeep = (id: string) =>
    setKeep((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const cancel = () => {
    if (rollChecked.size > 0 && !confirm(t.rollCancelConfirm)) return;
    setReviewing(false);
    cancelRollcall();
  };

  const finish = (goneIds: string[]) => {
    setReviewing(false);
    finishRollcall(goneIds);
  };

  if (reviewing) {
    const goneIds = missing.filter((c) => !keep.has(c.id)).map((c) => c.id);
    return (
      <div className="rc-screen">
        {missing.length === 0 ? (
          <div className="panel rc-start">
            <h3>{t.rollReviewTitle}</h3>
            <div className="meta">{t.rollAllHome}</div>
            <button className="accent" onClick={() => finish([])}>
              {t.done}
            </button>
          </div>
        ) : (
          <>
            <div className="rc-head">
              <b>{t.rollReviewTitle}</b>
              <span className="meta rc-hint">{t.rollReviewDesc}</span>
            </div>
            <div className="rc-grid">
              {missing.map((c) => {
                const marked = !keep.has(c.id);
                return (
                  <button key={c.id} className="mate-row" onClick={() => toggleKeep(c.id)}>
                    <span className={`roll-box${marked ? ' on gone' : ''}`}>
                      {marked ? '✕' : ''}
                    </span>
                    <span className="mate-sex">{SEX_GLYPH[c.sex]}</span>
                    <span className="mate-name">{c.name}</span>
                  </button>
                );
              })}
            </div>
            <div className="rc-foot">
              <button className="accent" onClick={() => finish(goneIds)}>
                {t.rollApply(goneIds.length)}
              </button>
              <button onClick={() => setReviewing(false)}>{t.rollBack}</button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="rc-screen">
      <div className="rc-head">
        <b>{t.rollProgress(done, rollCats.length)}</b>
        <button
          className="accent"
          onClick={() => {
            setKeep(new Set());
            setReviewing(true);
          }}
        >
          {t.rollFinish}
        </button>
        <button onClick={cancel}>{t.cancel}</button>
        <span className="meta rc-hint">{t.rollHint}</span>
      </div>
      <div className="rc-grid">
        {rollCats.map((c) => {
          const on = rollChecked.has(c.id);
          return (
            <button
              key={c.id}
              className={`mate-row${on ? ' roll-done' : ''}`}
              onClick={() => toggleRollCheck(c.id)}
            >
              <span className={`roll-box${on ? ' on' : ''}`}>{on ? '✓' : ''}</span>
              <span className="mate-sex">{SEX_GLYPH[c.sex]}</span>
              <span className="mate-name">{c.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
