import { useEffect, useMemo, useState } from 'react';
import { canMate, SEX_GLYPH, type Cat } from './types';
import { mateCOIs, pairCOI } from './genealogy';
import { activeBondPartners, assignParents, statSum, type CatsStore } from './store';
import { decorateBonds, MateList, type MateEntry } from './MateList';
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
  const { cats, byId, bonds, nameTakenBy, addFounder, createKitten, bondCats, dissolveBond } =
    store;
  const [q, setQ] = useState('');
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [addingFounder, setAddingFounder] = useState(false);

  /** A bonded cat's only compatible partner gets preselected — one-click litters. */
  const defaultPartnerId = (cat: Cat | undefined) => {
    if (!cat) return null;
    const partners = activeBondPartners(cat, bonds).filter((p) => canMate(cat, p));
    return partners.length === 1 ? partners[0].id : null;
  };

  useEffect(() => {
    if (!externalSource) return;
    setSourceId(externalSource);
    setPartnerId(defaultPartnerId(byId.get(externalSource)));
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
    const raw = [...mateCOIs(source.id, cats)]
      .map(([id, coi]) => ({ cat: byId.get(id), coi }))
      .filter((m): m is { cat: Cat; coi: number } => m.cat !== undefined);
    return decorateBonds(raw, source, bonds);
  }, [source, cats, byId, bonds]);

  const partner = partnerId ? (byId.get(partnerId) ?? null) : null;
  const pair = source && partner ? assignParents(source, partner) : null;

  const pickSource = (id: string) => {
    const next = id === sourceId ? null : id;
    setSourceId(next);
    setPartnerId(next ? defaultPartnerId(byId.get(next)) : null);
  };

  // bond controls for the selected pair: fix the pair / grow the collective / dissolve
  const sameBond =
    source && partner && source.bondId !== null && source.bondId === partner.bondId;
  const anyBonded =
    source &&
    partner &&
    (activeBondPartners(source, bonds).length > 0 || activeBondPartners(partner, bonds).length > 0);

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
          {listed.map((c) => {
            const partners = activeBondPartners(c, bonds);
            return (
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
                {partners.length > 0 && (
                  <span
                    className="bond-chip"
                    title={t.bondWith(partners.map((p) => p.name).join(', '))}
                  >
                    💞
                  </span>
                )}
                {statSum(c) > 0 && (
                  <span className="mate-sum" title={t.mateStatsTitle}>
                    Σ{statSum(c)}
                  </span>
                )}
              </button>
            );
          })}
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
          <>
            <div className="panel br-bond-bar">
              {sameBond ? (
                <button
                  onClick={() => {
                    if (confirm(t.bondBreakConfirm)) dissolveBond(source!.bondId!);
                  }}
                >
                  {t.bondBreakBtn}
                </button>
              ) : (
                <button onClick={() => bondCats(pair.mother.id, pair.father.id)}>
                  {anyBonded ? t.bondJoinBtn : t.bondPairBtn}
                </button>
              )}
            </div>
            <LitterPanel
              key={pair.mother.id + pair.father.id}
              mother={pair.mother}
              father={pair.father}
              coi={pairCOI(pair.mother.id, pair.father.id, cats)}
              nameTaken={(n) => nameTakenBy(n)}
              onCreate={(kitten) => createKitten(pair.mother, pair.father, kitten)}
            />
          </>
        ) : source ? (
          <div className="panel hint">{t.brPairHint}</div>
        ) : null}
      </div>
    </div>
  );
}
