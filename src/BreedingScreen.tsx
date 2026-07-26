import { useEffect, useMemo, useState } from 'react';
import { SEX_GLYPH } from './types';
import { mateCOIs, pairCOI } from './genealogy';
import { assignParents, statSum, type CatsStore } from './store';
import { MateList, type MateEntry } from './MateList';
import { AddCatForm, LitterPanel } from './forms';
import { useI18n } from './i18n';

/**
 * The breeding screen: pick the first parent on the left, pick a partner in
 * the COI-ranked middle column, fill the litter form on the right. Founders
 * (stray cats) are added here too — they usually enter the tree together
 * with their first litter.
 */
export function BreedingScreen({
  store,
  sourceId: externalSource,
  onSourceConsumed,
}: {
  store: CatsStore;
  /** a cat pushed in from another screen (the browser's mates button) */
  sourceId: string | null;
  onSourceConsumed: () => void;
}) {
  const { t } = useI18n();
  const { cats, byId, nameTakenBy, addFounder, createLitter } = store;
  const [q, setQ] = useState('');
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [addingFounder, setAddingFounder] = useState(false);

  useEffect(() => {
    if (!externalSource) return;
    setSourceId(externalSource);
    setPartnerId(null);
    setAddingFounder(false);
    onSourceConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalSource]);

  // breeding concerns the cats in the house, alphabetical
  const living = useMemo(
    () => cats.filter((c) => !c.gone).sort((a, b) => a.name.localeCompare(b.name)),
    [cats],
  );
  const query = q.trim().toLowerCase();
  const listed = query ? living.filter((c) => c.name.toLowerCase().includes(query)) : living;

  const source = sourceId ? (byId.get(sourceId) ?? null) : null;
  const mates = useMemo<MateEntry[]>(() => {
    if (!source) return [];
    return [...mateCOIs(source.id, cats)]
      .map(([id, coi]) => ({ cat: byId.get(id), coi }))
      .filter((m): m is MateEntry => m.cat !== undefined);
  }, [source, cats, byId]);

  const partner = partnerId ? (byId.get(partnerId) ?? null) : null;
  const pair = source && partner ? assignParents(source, partner) : null;

  const pickSource = (id: string) => {
    setSourceId(id === sourceId ? null : id);
    setPartnerId(null);
  };

  return (
    <div className="br-screen">
      <div className="br-col br-list-col">
        <div className="br-head">
          <input
            type="text"
            placeholder={t.searchPlaceholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            type="button"
            className={addingFounder ? 'accent' : ''}
            onClick={() => setAddingFounder((v) => !v)}
          >
            {t.brFounderBtn}
          </button>
        </div>
        <div className="br-rows">
          {listed.map((c) => (
            <button
              key={c.id}
              className={`mate-row${c.id === sourceId ? ' picked' : ''}`}
              onClick={() => pickSource(c.id)}
            >
              <span className="mate-sex">{SEX_GLYPH[c.sex]}</span>
              <span className="mate-name">{c.name}</span>
              {c.orientation !== 'hetero' && (
                <span
                  className={`flag-chip flag-${c.orientation}`}
                  title={c.orientation === 'bi' ? t.oriBi : t.oriHomo}
                />
              )}
              {statSum(c) > 0 && (
                <span className="mate-sum" title={t.mateStatsTitle}>
                  Σ{statSum(c)}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="br-col br-mates-col">
        {source ? (
          <>
            <div className="br-head">
              <b>{t.matePanelTitle(source.name)}</b>
            </div>
            <div className="br-mates-body">
              <MateList
                mates={mates}
                pickedIds={partnerId ? [partnerId] : []}
                onPick={(id) => setPartnerId(id === partnerId ? null : id)}
              />
            </div>
            <div className="meta br-legend">{t.mateLegend}</div>
          </>
        ) : (
          <div className="meta br-legend">{t.brPickHint}</div>
        )}
      </div>
      <div className="br-form-col">
        {addingFounder ? (
          <AddCatForm
            nameTaken={(n) => nameTakenBy(n)}
            onAdd={(name, sex, room, cls, orientation) => {
              addFounder(name, sex, room, cls, orientation);
              setAddingFounder(false);
            }}
            onCancel={() => setAddingFounder(false)}
          />
        ) : pair ? (
          <LitterPanel
            key={pair.mother.id + pair.father.id}
            mother={pair.mother}
            father={pair.father}
            coi={pairCOI(pair.mother.id, pair.father.id, cats)}
            nameTaken={(n) => nameTakenBy(n)}
            onCreate={(kittens) => createLitter(pair.mother, pair.father, kittens)}
          />
        ) : source ? (
          <div className="panel hint">{t.brPairHint}</div>
        ) : null}
      </div>
    </div>
  );
}
