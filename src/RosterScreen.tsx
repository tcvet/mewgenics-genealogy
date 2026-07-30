import { useEffect, useMemo, useState } from 'react';
import {
  MUTATION_SLOTS,
  ROOMS,
  SEX_GLYPH,
  type Cat,
  type MutationSlot,
  type RoomId,
} from './types';
import { avgMateCOIs } from './genealogy';
import { mutationLabel, NAMED_BY_SLOT } from './mutations';
import {
  CRITERION_KEYS,
  DEFAULT_WEIGHT,
  defaultCriteria,
  makeCategory,
  quotaFill,
  roomPolicy,
  scoreCat,
  SEED_PRESETS,
  wishCarriers,
  wishKey,
  type CategoryDef,
  type CategoryPolicy,
  type CatScore,
  type CriterionKey,
  type RoomPolicy,
  type ScoreCtx,
  type WishMutation,
} from './roster';
import { activeBondPartners, normName, type CatsStore } from './store';
import { CategorySelect, SearchBox } from './controls';
import { useI18n } from './i18n';

const fmt = (n: number) => {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n));

/** Number field that tolerates half-typed input ("-", "0.") instead of snapping to 0. */
function NumInput({
  value,
  step,
  title,
  className,
  onChange,
}: {
  value: number;
  step?: number;
  title?: string;
  className?: string;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      type="number"
      step={step}
      title={title}
      className={className}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseFloat(e.target.value);
        if (isFinite(n)) onChange(n);
      }}
    />
  );
}

/** One scored section: the cats of a category, ranked, with the weakest flagged. */
type Section = {
  def: CategoryDef;
  policy: CategoryPolicy;
  rows: Cat[];
};

/**
 * The roster screen: one room at a time, its cats ranked inside their category
 * against a scorecard the user tunes right in the table header. Answers the
 * question the whole thing exists for — a better cat showed up, who leaves?
 *
 * Categories are assigned by hand (`Cat.category`); everything else here is
 * derived from the cats plus the room's rules (`roster.ts`).
 */
export function RosterScreen({
  store,
  onOpenCat,
}: {
  store: CatsStore;
  onOpenCat: (id: string) => void;
}) {
  const { t } = useI18n();
  const { cats, byId, children, bonds, roster, setRoster, updateCat, deleteCategory } = store;
  const [room, setRoom] = useState<RoomId>(ROOMS[0].id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [candidateId, setCandidateId] = useState<string | null>(null);
  // the role the candidate would take (its own by default, changeable before moving in)
  const [candCategory, setCandCategory] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [picking, setPicking] = useState(false);

  const policy = roomPolicy(roster, room);
  const candidate = candidateId ? (byId.get(candidateId) ?? null) : null;

  const residents = useMemo(
    () => cats.filter((c) => c.room === room && !c.gone),
    [cats, room],
  );
  // the candidate is scored as if it already lived here — it changes who is the
  // room's only carrier of a wanted mutation, which is the point of the what-if
  const pool = useMemo(
    () => (candidate ? [...residents, candidate] : residents),
    [residents, candidate],
  );
  /** the candidate answers with its pending role, everyone else with the stored one */
  const roleOf = (c: Cat) => (c.id === candidateId ? candCategory : c.category);

  const roomCOI = useMemo(() => {
    // partners limited to this room (+ the candidate); ancestors still come from
    // the whole tree, or the inbreeding itself would be wrong
    const avgs = avgMateCOIs(cats, { pool: (c) => c.room === room || c.id === candidateId });
    const out = new Map<string, number | null>();
    for (const [id, avg] of avgs) out.set(id, avg ? avg.avg : null);
    return out;
  }, [cats, room, candidateId]);

  const ctx: ScoreCtx = useMemo(
    () => ({
      wishlist: policy.wishlist,
      carriers: wishCarriers(pool, policy.wishlist),
      roomCOI,
      childCount: new Map(cats.map((c) => [c.id, children.get(c.id)?.length ?? 0])),
    }),
    [policy.wishlist, pool, roomCOI, cats, children],
  );

  const sections: Section[] = useMemo(
    () =>
      roster.categories
        .filter((def) => policy.categories[def.id])
        .map((def) => ({
          def,
          policy: policy.categories[def.id]!,
          rows: pool.filter((c) => roleOf(c) === def.id),
        })),
    // roleOf closes over candidateId/candCategory
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roster.categories, policy.categories, pool, candidateId, candCategory],
  );

  const scores = useMemo(() => {
    const map = new Map<string, CatScore>();
    for (const s of sections)
      for (const c of s.rows) map.set(c.id, scoreCat(c, s.policy.criteria, ctx));
    return map;
  }, [sections, ctx]);

  const ranked: Section[] = useMemo(
    () =>
      sections.map((s) => ({
        ...s,
        rows: [...s.rows].sort(
          (a, b) =>
            (scores.get(b.id)?.total ?? 0) - (scores.get(a.id)?.total ?? 0) ||
            a.name.localeCompare(b.name),
        ),
      })),
    [sections, scores],
  );

  const unsorted = pool.filter((c) => !roleOf(c));
  const offPolicy = pool.filter((c) => {
    const role = roleOf(c);
    return role !== null && !policy.categories[role];
  });

  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;
  // the cat the candidate would push out: weakest of the role it is moving into
  const target = ranked.find((s) => s.def.id === candCategory);
  const worstOfTarget =
    target && candidate
      ? [...target.rows].reverse().find((c) => c.id !== candidate.id) ?? null
      : null;

  // ——— rules editing (all of it patches the current room's policy) ———

  const patchRoom = (patch: Partial<RoomPolicy>) =>
    setRoster((r) => ({
      ...r,
      rooms: { ...r.rooms, [room]: { ...roomPolicy(r, room), ...patch } },
    }));

  const patchCategory = (id: string, patch: Partial<CategoryPolicy>) =>
    setRoster((r) => {
      const p = roomPolicy(r, room);
      const cur = p.categories[id] ?? { quota: 0, sexQuota: null, criteria: [] };
      return {
        ...r,
        rooms: {
          ...r.rooms,
          [room]: { ...p, categories: { ...p.categories, [id]: { ...cur, ...patch } } },
        },
      };
    });

  const useHere = (id: string, on: boolean) =>
    setRoster((r) => {
      const p = roomPolicy(r, room);
      const categories = { ...p.categories };
      if (on)
        categories[id] = { quota: 4, sexQuota: null, criteria: defaultCriteria(['statSum']) };
      else delete categories[id];
      return { ...r, rooms: { ...r.rooms, [room]: { ...p, categories } } };
    });

  const addCategory = (name: string) => {
    if (!name.trim()) return;
    setRoster((r) => {
      const def = makeCategory(name, r.categories.length);
      const p = roomPolicy(r, room);
      return {
        categories: [...r.categories, def],
        rooms: {
          ...r.rooms,
          [room]: {
            ...p,
            categories: {
              ...p.categories,
              [def.id]: { quota: 4, sexQuota: null, criteria: defaultCriteria(['statSum']) },
            },
          },
        },
      };
    });
  };

  /** The arrangement this screen was designed around, one click away. */
  const seedRoster = () =>
    setRoster((r) => {
      const defs = [...r.categories];
      const p = roomPolicy(r, room);
      const categories = { ...p.categories };
      for (const preset of SEED_PRESETS) {
        const name = t.rsSeeds[preset.key];
        // reuse a same-named category instead of making a duplicate
        let def = defs.find((d) => normName(d.name) === normName(name));
        if (!def) {
          def = makeCategory(name, defs.length);
          defs.push(def);
        }
        categories[def.id] = {
          quota: preset.quota,
          sexQuota: preset.sexQuota,
          criteria: defaultCriteria(preset.criteria),
        };
      }
      return { categories: defs, rooms: { ...r.rooms, [room]: { ...p, categories } } };
    });

  const copyFrom = (src: RoomId) =>
    setRoster((r) => {
      const from = roomPolicy(r, src);
      return {
        ...r,
        rooms: {
          ...r.rooms,
          [room]: {
            capacity: from.capacity,
            wishlist: from.wishlist.map((w) => ({ ...w })),
            categories: Object.fromEntries(
              Object.entries(from.categories).map(([id, cp]) => [
                id,
                { ...cp, sexQuota: cp.sexQuota ? { ...cp.sexQuota } : null, criteria: cp.criteria.map((c) => ({ ...c })) },
              ]),
            ),
          },
        },
      };
    });

  const setWish = (next: WishMutation[]) => patchRoom({ wishlist: next });

  // ——— the candidate flow ———

  const pickCandidate = (id: string) => {
    const cat = byId.get(id);
    setCandidateId(id);
    setCandCategory(cat?.category ?? null);
    setSelectedId(id);
    setPicking(false);
  };

  const clearCandidate = () => {
    setCandidateId(null);
    setCandCategory(null);
  };

  const moveIn = () => {
    if (!candidate) return;
    updateCat(candidate.id, { room, category: candCategory });
    clearCandidate();
  };

  const replaceWorst = () => {
    if (!candidate || !worstOfTarget) return;
    if (!confirm(t.rsReplaceConfirm(candidate.name, worstOfTarget.name))) return;
    updateCat(candidate.id, { room, category: candCategory });
    updateCat(worstOfTarget.id, { gone: true });
    clearCandidate();
    setSelectedId(null);
  };

  // ——— rendering ———

  const quotaChip = (s: Section) => {
    const fill = quotaFill(s.rows, s.policy);
    return (
      <span
        key={s.def.id}
        className={`rs-quota${fill.over > 0 ? ' over' : ''}${fill.free > 0 ? ' under' : ''}`}
      >
        <span className="rs-dot" style={{ background: s.def.color }} />
        {s.def.name} {fill.total}/{fill.quota}
        {fill.sexes && s.policy.sexQuota && (
          <span className="rs-sexq">
            ♀{fill.sexes.F}/{s.policy.sexQuota.F} ♂{fill.sexes.M}/{s.policy.sexQuota.M}
            {fill.sexes.any > 0 && ` ?${fill.sexes.any}`}
          </span>
        )}
        {fill.over > 0 && <span className="rs-flag">{t.rsOverQuota(fill.over)}</span>}
        {fill.free > 0 && <span className="rs-flag">{t.rsFreeSlots(fill.free)}</span>}
      </span>
    );
  };

  const catCell = (c: Cat) => (
    <span className="rs-cat">
      <span className={`sex-chip ${c.sex === 'F' ? 'female' : c.sex === 'M' ? 'male' : 'any'}`}>
        {SEX_GLYPH[c.sex]}
      </span>
      <span className="rs-name">{c.name}</span>
      {c.id === candidateId && <span className="rs-tag">{t.rsCandidate}</span>}
    </span>
  );

  const section = (s: Section) => {
    const cols = s.policy.criteria;
    const worst = s.rows.length > 1 ? s.rows[s.rows.length - 1] : null;
    const unused = CRITERION_KEYS.filter((k) => !cols.some((c) => c.key === k));
    // the trailing track carries the "add a column" picker; the data rows leave it
    // empty so their grid stays identical to the header's and the numbers line up
    const grid = {
      gridTemplateColumns: `minmax(150px, 1fr) repeat(${cols.length + 1}, 5.2rem) 7rem`,
    };
    return (
      <div className="rs-section" key={s.def.id}>
        <div className="rs-sechead">
          <span className="rs-dot" style={{ background: s.def.color }} />
          <b>{s.def.name}</b>
          <span className="meta">
            {s.rows.length}/{s.policy.quota}
          </span>
        </div>
        <div className="rs-table">
          <div className="rs-hrow" style={grid}>
            <span />
            {cols.map((c) => (
              <span key={c.key} className="rs-col" title={t.rsCritTips[c.key]}>
                <span className="rs-collabel">
                  {t.rsCrits[c.key]}
                  <button
                    type="button"
                    className="rs-drop"
                    title={t.rsRemoveColumn}
                    onClick={() =>
                      patchCategory(s.def.id, { criteria: cols.filter((x) => x.key !== c.key) })
                    }
                  >
                    ✕
                  </button>
                </span>
                <NumInput
                  className="rs-weight"
                  step={0.5}
                  title={t.rsWeightTip}
                  value={c.weight}
                  onChange={(weight) =>
                    patchCategory(s.def.id, {
                      criteria: cols.map((x) => (x.key === c.key ? { ...x, weight } : x)),
                    })
                  }
                />
              </span>
            ))}
            <span className="rs-col rs-total">{t.rsTotal}</span>
            {/* sits with the columns it creates, never disappears: a control that
                vanishes once every criterion is used reads as a glitch */}
            <select
              className="rs-addcol"
              disabled={unused.length === 0}
              title={unused.length === 0 ? t.rsAllColumns : t.rsAddColumn}
              value=""
              onChange={(e) => {
                const key = e.target.value as CriterionKey;
                // the placeholder must never turn into a criterion of its own
                if (!CRITERION_KEYS.includes(key)) return;
                patchCategory(s.def.id, {
                  criteria: [...cols, { key, weight: DEFAULT_WEIGHT[key] }],
                });
              }}
            >
              <option value="">＋ {t.rsColumn}</option>
              {unused.map((k) => (
                <option key={k} value={k}>
                  {t.rsCrits[k]}
                </option>
              ))}
            </select>
          </div>
          {s.rows.map((c, i) => {
            const score = scores.get(c.id);
            return (
              <button
                type="button"
                key={c.id}
                style={grid}
                className={`rs-row${c.id === selectedId ? ' picked' : ''}${
                  c.id === candidateId ? ' cand' : ''
                }${c === worst ? ' worst' : ''}${i >= s.policy.quota ? ' over' : ''}`}
                title={c === worst ? t.rsWorst : undefined}
                onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
              >
                {catCell(c)}
                {score?.parts.map((p) => (
                  <span key={p.key} className={`rs-num${p.points < 0 ? ' neg' : ''}`}>
                    {p.points === 0 ? '·' : signed(p.points)}
                  </span>
                ))}
                <span className="rs-num rs-total">{fmt(score?.total ?? 0)}</span>
                <span />
              </button>
            );
          })}
          {s.rows.length === 0 && <div className="meta rs-pad">—</div>}
        </div>
      </div>
    );
  };

  /** Cats with no role (or a role this room does not use) — nothing to rank, just sort them. */
  const plainList = (title: string, hint: string, list: Cat[], withPicker: boolean) =>
    list.length === 0 ? null : (
      <div className="rs-section" key={title}>
        <div className="rs-sechead">
          <b>{title}</b>
          <span className="meta">{hint}</span>
        </div>
        <div className="rs-plain">
          {list.map((c) => (
            <span key={c.id} className="rs-plainrow">
              <button
                type="button"
                className={`rs-cat rs-catbtn${c.id === selectedId ? ' picked' : ''}`}
                onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
              >
                {catCell(c)}
              </button>
              {withPicker && (
                <CategorySelect
                  value={roleOf(c)}
                  categories={roster.categories}
                  onChange={(category) =>
                    // the candidate's role stays pending until it actually moves in
                    c.id === candidateId
                      ? setCandCategory(category)
                      : updateCat(c.id, { category })
                  }
                />
              )}
            </span>
          ))}
        </div>
      </div>
    );

  const breakdown = () => {
    if (!selected) return <div className="panel hint">{t.rsPickHint}</div>;
    const score = scores.get(selected.id);
    const def = roster.categories.find((c) => c.id === roleOf(selected)) ?? null;
    const widowed = activeBondPartners(selected, bonds).filter((p) => p.id !== selected.id);
    return (
      <div className="panel">
        <div className="row">
          {catCell(selected)}
        </div>
        <CategorySelect
          value={selected.category}
          categories={roster.categories}
          onChange={(category) => updateCat(selected.id, { category })}
        />
        {score && score.parts.length > 0 ? (
          <>
            <div className="meta">{t.rsBreakdown}</div>
            <div className="rs-parts">
              {score.parts.map((p) => (
                <div key={p.key} className="rs-part" title={t.rsCritTips[p.key]}>
                  <span>{t.rsCrits[p.key]}</span>
                  <span className="meta">{fmt(p.value)}</span>
                  <span className={p.points < 0 ? 'neg' : ''}>{signed(p.points)}</span>
                </div>
              ))}
              <div className="rs-part rs-parttotal">
                <span>{t.rsTotal}</span>
                <span />
                <span>{fmt(score.total)}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="meta">{def ? t.rsNoRules : t.rsNoCategoryHint}</div>
        )}
        {score && score.sole.length > 0 && (
          <div className="rs-warn">
            {t.rsSole(score.sole.map((w) => mutationLabel(w.id)).join(', '))}
          </div>
        )}
        {widowed.length > 0 && (
          <div className="rs-warn">{t.rsBondWarn(widowed.map((p) => p.name).join(', '))}</div>
        )}
        <button onClick={() => onOpenCat(selected.id)}>🐈 {t.navCats}</button>
        <button
          className="danger"
          onClick={() => {
            updateCat(selected.id, { gone: true });
            setSelectedId(null);
          }}
        >
          {t.rsMarkGone}
        </button>
      </div>
    );
  };

  const outsiders = cats.filter((c) => !c.gone && c.room !== room);
  const capacityOver = residents.length > policy.capacity;

  return (
    <div className="rs-screen">
      <div className="rs-main">
        <div className="rs-head">
          <b>⚖️ {t.navRoster}</b>
          <div className="room-toggle">
            {ROOMS.map((r) => (
              <button
                key={r.id}
                type="button"
                title={t.rooms[r.id]}
                className={`stat-cell ${room === r.id ? 'on' : ''}`}
                onClick={() => setRoom(r.id)}
              >
                {r.short}
              </button>
            ))}
          </div>
          <span className={`rs-cap${capacityOver ? ' over' : ''}`}>
            {t.rsInRoom(residents.length, policy.capacity)}
          </span>
          <button type="button" className="small" onClick={() => setRulesOpen((o) => !o)}>
            {t.rsRules} {rulesOpen ? '▾' : '▸'}
          </button>
          <span className="meta">{t.rsHint}</span>
        </div>

        {rulesOpen && (
          <div className="rs-rules">
            <div className="rs-rulerow">
              <label>
                {t.rsCapacity}{' '}
                <NumInput
                  className="rs-weight"
                  value={policy.capacity}
                  onChange={(capacity) => patchRoom({ capacity })}
                />
              </label>
              <select
                className="class-select"
                value=""
                onChange={(e) => e.target.value && copyFrom(e.target.value as RoomId)}
              >
                <option value="">{t.rsCopyFrom}…</option>
                {ROOMS.filter((r) => r.id !== room).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.short} {t.rooms[r.id]}
                  </option>
                ))}
              </select>
            </div>

            <div className="rs-rulerow rs-wishlist" title={t.rsWishlistTip}>
              <span>{t.rsWishlist}</span>
              {policy.wishlist.length === 0 && <span className="meta">{t.rsWishEmpty}</span>}
              {policy.wishlist.map((w) => (
                <span key={wishKey(w)} className="rs-wish">
                  <span title={t.mutationSlots[w.slot]}>{mutationLabel(w.id)}</span>
                  <NumInput
                    className="rs-weight"
                    value={w.weight}
                    onChange={(weight) =>
                      setWish(policy.wishlist.map((x) => (x === w ? { ...x, weight } : x)))
                    }
                  />
                  <button
                    type="button"
                    className="rs-drop"
                    onClick={() => setWish(policy.wishlist.filter((x) => x !== w))}
                  >
                    ✕
                  </button>
                </span>
              ))}
              <WishAdder wishlist={policy.wishlist} onAdd={(w) => setWish([...policy.wishlist, w])} />
            </div>

            {roster.categories.map((def) => {
              const cp = policy.categories[def.id];
              return (
                <div className="rs-rulerow" key={def.id}>
                  <span className="rs-dot" style={{ background: def.color }} />
                  <input
                    className="rs-catname"
                    value={def.name}
                    onChange={(e) =>
                      setRoster((r) => ({
                        ...r,
                        categories: r.categories.map((c) =>
                          c.id === def.id ? { ...c, name: e.target.value } : c,
                        ),
                      }))
                    }
                  />
                  <label className="rs-check">
                    <input
                      type="checkbox"
                      checked={!!cp}
                      onChange={(e) => useHere(def.id, e.target.checked)}
                    />
                    {t.rsUseHere}
                  </label>
                  {cp && (
                    <>
                      <label>
                        {t.rsQuota}{' '}
                        <NumInput
                          className="rs-weight"
                          value={cp.quota}
                          onChange={(quota) => patchCategory(def.id, { quota })}
                        />
                      </label>
                      <label className="rs-check" title={t.rsSexQuotaTip}>
                        <input
                          type="checkbox"
                          checked={!!cp.sexQuota}
                          onChange={(e) =>
                            patchCategory(def.id, {
                              sexQuota: e.target.checked
                                ? { F: Math.floor(cp.quota / 2), M: Math.floor(cp.quota / 2) }
                                : null,
                            })
                          }
                        />
                        {t.rsSexQuota}
                      </label>
                      {cp.sexQuota && (
                        <>
                          <label title={t.sexF}>
                            ♀
                            <NumInput
                              className="rs-weight"
                              value={cp.sexQuota.F}
                              onChange={(F) =>
                                patchCategory(def.id, { sexQuota: { ...cp.sexQuota!, F } })
                              }
                            />
                          </label>
                          <label title={t.sexM}>
                            ♂
                            <NumInput
                              className="rs-weight"
                              value={cp.sexQuota.M}
                              onChange={(M) =>
                                patchCategory(def.id, { sexQuota: { ...cp.sexQuota!, M } })
                              }
                            />
                          </label>
                        </>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    className="small danger"
                    title={t.rsDeleteCategory}
                    onClick={() => {
                      if (confirm(t.rsDeleteCategoryConfirm(def.name))) deleteCategory(def.id);
                    }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
            <div className="rs-rulerow">
              <CategoryAdder onAdd={addCategory} />
              <button type="button" className="small" title={t.rsSeedTip} onClick={seedRoster}>
                {t.rsSeed}
              </button>
            </div>
          </div>
        )}

        <div className="rs-quotas">
          {ranked.map(quotaChip)}
          {candidate ? (
            <span className="rs-candbar">
              <span className="rs-tag">{t.rsCandidate}</span>
              {catCell(candidate)}
              <span className="meta">{t.rsCandidateCategory}</span>
              <CategorySelect
                value={candCategory}
                categories={roster.categories}
                onChange={setCandCategory}
              />
              <button type="button" className="accent" onClick={moveIn}>
                {t.rsMoveIn}
              </button>
              {worstOfTarget && (
                <button type="button" onClick={replaceWorst}>
                  {t.rsReplace(worstOfTarget.name)}
                </button>
              )}
              <button type="button" className="small" onClick={clearCandidate}>
                ✕
              </button>
            </span>
          ) : picking ? (
            <span className="rs-candbar">
              <SearchBox cats={outsiders} onPick={pickCandidate} />
              <button type="button" className="small" onClick={() => setPicking(false)}>
                ✕
              </button>
            </span>
          ) : (
            <button type="button" className="small" onClick={() => setPicking(true)}>
              {t.rsPickCandidate}
            </button>
          )}
        </div>

        <div className="rs-list">
          {ranked.length === 0 && residents.length === 0 && (
            <div className="ov-empty">{t.rsEmptyRoom}</div>
          )}
          {ranked.length === 0 && residents.length > 0 && (
            <div className="ov-empty">
              {t.rsNoRules}{' '}
              <button type="button" className="small" title={t.rsSeedTip} onClick={seedRoster}>
                {t.rsSeed}
              </button>
            </div>
          )}
          {ranked.map(section)}
          {plainList(t.rsNoCategory, t.rsNoCategoryHint, unsorted, true)}
          {plainList(t.rsOffPolicy, '', offPolicy, true)}
        </div>
      </div>
      <div className="rs-side">{breakdown()}</div>
    </div>
  );
}

/** Slot picker + the slot's named mutations, appending to the room's wishlist. */
function WishAdder({
  wishlist,
  onAdd,
}: {
  wishlist: WishMutation[];
  onAdd: (w: WishMutation) => void;
}) {
  const { t } = useI18n();
  const [slot, setSlot] = useState<MutationSlot>('head');
  const taken = new Set(wishlist.map(wishKey));
  const options = NAMED_BY_SLOT[slot].filter((m) => !taken.has(`${slot}|${m.id}`));
  return (
    <span className="rs-wishadd">
      <select
        className="class-select"
        value={slot}
        onChange={(e) => setSlot(e.target.value as MutationSlot)}
      >
        {MUTATION_SLOTS.map((s) => (
          <option key={s} value={s}>
            {t.mutationSlots[s]}
          </option>
        ))}
      </select>
      <select
        className="class-select"
        value=""
        onChange={(e) => e.target.value && onAdd({ slot, id: e.target.value, weight: 10 })}
      >
        <option value="">{t.rsWishAdd}</option>
        {options.map((m) => (
          <option key={m.id} value={m.id}>
            {m.title}
          </option>
        ))}
      </select>
    </span>
  );
}

function CategoryAdder({ onAdd }: { onAdd: (name: string) => void }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const submit = () => {
    onAdd(name);
    setName('');
  };
  return (
    <>
      <input
        type="text"
        placeholder={t.rsCategoryPlaceholder}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <button type="button" className="small" disabled={!name.trim()} onClick={submit}>
        {t.rsAddCategory}
      </button>
    </>
  );
}
