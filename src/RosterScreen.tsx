import { useEffect, useMemo, useState } from 'react';
import {
  MUTATION_SLOTS,
  ROOMS,
  SEX_GLYPH,
  STAT_KEYS,
  type Cat,
  type RoomId,
  type StatKey,
} from './types';
import { avgMateCOIs } from './genealogy';
import { houseMutations, mutationLabel, type HouseMutation } from './mutations';
import { abilityLabel, getAbility, houseAbilities, type HouseAbility } from './abilities';
import {
  CRITERION_KEYS,
  critId,
  defaultCriteria,
  isCOICriterion,
  isRareCriterion,
  makeCategory,
  makeStatCriterion,
  quotaFill,
  quotaTotal,
  roomPolicy,
  roomSlots,
  scoreCat,
  SEED_PRESETS,
  STAT_CRIT_MODES,
  wishAbilityCarriers,
  wishCarriers,
  wishKey,
  type CategoryDef,
  type CategoryPolicy,
  type CatScore,
  type CriterionKey,
  type RoomPolicy,
  type ScoreCtx,
  type StatCriterion,
  type StatCritMode,
  type WishAbility,
  type WishMutation,
} from './roster';
import { activeBondPartners, normName, realStatSum, statSum, type CatsStore } from './store';
import { abilityClassLabel, abilityTip, CategorySelect, RoomToggle, SearchBox } from './controls';
import { useI18n } from './i18n';

const fmt = (n: number) => {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n));

const statModeGlyph = (m: StatCritMode) =>
  m === 'value' ? '' : m.startsWith('below') ? '<' : '>';

/** Compact column label: "±SPD" (± — the real value, base + event mods). */
const statColLabel = (c: StatCriterion) => `${c.real ? '±' : ''}${c.stat.toUpperCase()}`;

/** The label with the threshold spelled out — for the breakdown panel. */
const statColFull = (c: StatCriterion) =>
  c.mode === 'value'
    ? statColLabel(c)
    : `${statColLabel(c)} ${statModeGlyph(c.mode)}${c.threshold}`;

/** What a fresh stat column starts as: the flat penalty the feature exists for. */
const draftDefaults = {
  stat: 'spd' as StatKey,
  real: true,
  mode: 'belowFlat' as StatCritMode,
  threshold: 5,
  weight: -10,
};

type StatDraft = typeof draftDefaults & { categoryId: string };

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
  // the "new stat column" inline form — one at a time, in that category's header
  const [statDraft, setStatDraft] = useState<StatDraft | null>(null);

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

  // the room COI narrowed further, to the partners of the cat's own role — a
  // fresh-blood block growing or shrinking no longer moves a carrier's number
  const categoryCOI = useMemo(() => {
    const out = new Map<string, number | null>();
    for (const s of sections) {
      if (s.rows.length === 0) continue;
      const members = new Set(s.rows.map((c) => c.id));
      const avgs = avgMateCOIs(cats, { pool: (c) => members.has(c.id) });
      for (const id of members) {
        const avg = avgs.get(id);
        out.set(id, avg ? avg.avg : null);
      }
    }
    return out;
  }, [sections, cats]);

  const ctx: ScoreCtx = useMemo(
    () => ({
      wishlist: policy.wishlist,
      carriers: wishCarriers(pool, policy.wishlist),
      wishAbilities: policy.wishAbilities,
      abilityCarriers: wishAbilityCarriers(pool, policy.wishAbilities),
      roomCOI,
      categoryCOI,
      childCount: new Map(cats.map((c) => [c.id, children.get(c.id)?.length ?? 0])),
    }),
    [policy.wishlist, policy.wishAbilities, pool, roomCOI, categoryCOI, cats, children],
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
      const cur = p.categories[id] ?? { quota: 0, criteria: [] };
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
      if (on) categories[id] = { quota: 4, criteria: defaultCriteria(['statSum']) };
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
              [def.id]: { quota: 4, criteria: defaultCriteria(['statSum']) },
            },
          },
        },
      };
    });
  };

  // reordering the house-wide list reorders the sections in every room at once
  const moveCategory = (id: string, delta: number) =>
    setRoster((r) => {
      const i = r.categories.findIndex((c) => c.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= r.categories.length) return r;
      const categories = [...r.categories];
      [categories[i], categories[j]] = [categories[j], categories[i]];
      return { ...r, categories };
    });

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
          criteria: defaultCriteria(preset.criteria),
        };
      }
      return { categories: defs, rooms: { ...r.rooms, [room]: { ...p, categories } } };
    });

  const setWish = (next: WishMutation[]) => patchRoom({ wishlist: next });
  const setWishAbilities = (next: WishAbility[]) => patchRoom({ wishAbilities: next });

  // what the wishlist picker offers: mutations the house actually carries
  // (named and common alike — a common is wishable once some cat has it)
  const wishOptions = useMemo(() => {
    const taken = new Set(policy.wishlist.map(wishKey));
    return houseMutations(cats).filter((r) => !taken.has(wishKey(r)));
  }, [cats, policy.wishlist]);

  // same for skills: only what is recorded on the cats of the house
  const wishAbilityOptions = useMemo(() => {
    const taken = new Set(policy.wishAbilities.map((w) => w.id));
    return houseAbilities(cats).filter((r) => !taken.has(r.id));
  }, [cats, policy.wishAbilities]);

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
        {fill.sexes && (
          <span className="rs-sexq">
            <span className={fill.sexes.F > fill.sexes.slotsF ? 'over' : undefined}>
              ♀{fill.sexes.F}/{fill.sexes.slotsF}
            </span>{' '}
            <span className={fill.sexes.M > fill.sexes.slotsM ? 'over' : undefined}>
              ♂{fill.sexes.M}/{fill.sexes.slotsM}
            </span>
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

  /** Full description of a stat column — the header/breakdown tooltip. */
  const statColTip = (c: StatCriterion) =>
    `${t.statNames[c.stat]} — ${t.rsStatModes[c.mode]}${
      c.mode !== 'value' ? ` ${c.threshold}` : ''
    }${c.real ? ` · ${t.statRealTip}` : ''}`;

  const section = (s: Section) => {
    const cols = s.policy.criteria;
    const worst = s.rows.length > 1 ? s.rows[s.rows.length - 1] : null;
    const unused = CRITERION_KEYS.filter((k) => !cols.some((c) => c.key === k));
    // a scaled COI column reads as opaque points; show the raw percent alongside
    const rawCOI = new Set(
      cols.filter((c) => isCOICriterion(c) && Math.abs(c.weight) !== 1).map(critId),
    );
    const grid = {
      // stat and rarity columns are wider: their header holds a threshold next
      // to the weight
      gridTemplateColumns: [
        'minmax(150px, 1fr)',
        ...cols.map((c) => (c.key === 'stat' || isRareCriterion(c) ? '7rem' : '5.2rem')),
        '5.2rem',
      ].join(' '),
    };
    return (
      <div className="rs-section" key={s.def.id}>
        <div className="rs-sechead">
          <span className="rs-dot" style={{ background: s.def.color }} />
          <b>{s.def.name}</b>
          <span className="meta">
            {s.rows.length}/{quotaTotal(s.policy.quota)}
          </span>
          {statDraft?.categoryId === s.def.id ? (
            <span className="rs-statform">
              <select
                className="class-select"
                value={statDraft.stat}
                onChange={(e) => setStatDraft({ ...statDraft, stat: e.target.value as StatKey })}
              >
                {STAT_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k.toUpperCase()} · {t.statNames[k]}
                  </option>
                ))}
              </select>
              <label className="rs-check" title={t.statRealTip}>
                <input
                  type="checkbox"
                  checked={statDraft.real}
                  onChange={(e) => setStatDraft({ ...statDraft, real: e.target.checked })}
                />
                {t.rsStatReal}
              </label>
              <select
                className="class-select"
                value={statDraft.mode}
                onChange={(e) =>
                  setStatDraft({ ...statDraft, mode: e.target.value as StatCritMode })
                }
              >
                {STAT_CRIT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {t.rsStatModes[m]}
                  </option>
                ))}
              </select>
              {statDraft.mode !== 'value' && (
                <NumInput
                  className="rs-weight"
                  title={t.rsStatThreshold}
                  value={statDraft.threshold}
                  onChange={(threshold) => setStatDraft({ ...statDraft, threshold })}
                />
              )}
              <NumInput
                className="rs-weight"
                step={0.5}
                title={t.rsWeightTip}
                value={statDraft.weight}
                onChange={(weight) => setStatDraft({ ...statDraft, weight })}
              />
              <button
                type="button"
                className="small accent"
                title={t.rsAddColumn}
                onClick={() => {
                  const { categoryId, ...init } = statDraft;
                  patchCategory(categoryId, { criteria: [...cols, makeStatCriterion(init)] });
                  setStatDraft(null);
                }}
              >
                ✓
              </button>
              <button type="button" className="small" onClick={() => setStatDraft(null)}>
                ✕
              </button>
            </span>
          ) : (
            // never disabled, never gone: stat columns can always be added — a
            // control that vanishes reads as a glitch
            <select
              className="rs-addcol"
              title={t.rsAddColumn}
              value=""
              onChange={(e) => {
                if (e.target.value === '__stat') {
                  setStatDraft({ ...draftDefaults, categoryId: s.def.id });
                  return;
                }
                const key = e.target.value as CriterionKey;
                // the placeholder must never turn into a criterion of its own
                if (!CRITERION_KEYS.includes(key)) return;
                patchCategory(s.def.id, {
                  criteria: [...cols, ...defaultCriteria([key])],
                });
              }}
            >
              <option value="">＋ {t.rsColumn}</option>
              {unused.map((k) => (
                <option key={k} value={k}>
                  {t.rsCrits[k]}
                </option>
              ))}
              <option value="__stat">{t.rsStatColumn}</option>
            </select>
          )}
        </div>
        <div className="rs-table">
          <div className="rs-hrow" style={grid}>
            <span />
            {cols.map((c) => (
              <span
                key={critId(c)}
                className="rs-col"
                title={c.key === 'stat' ? statColTip(c) : t.rsCritTips[c.key]}
              >
                <span className="rs-collabel">
                  {c.key === 'stat' ? statColLabel(c) : t.rsCrits[c.key]}
                  <button
                    type="button"
                    className="rs-drop"
                    title={t.rsRemoveColumn}
                    onClick={() =>
                      patchCategory(s.def.id, { criteria: cols.filter((x) => x !== c) })
                    }
                  >
                    ✕
                  </button>
                </span>
                <span className="rs-statctl">
                  {c.key === 'stat' && c.mode !== 'value' && (
                    <>
                      <span className="rs-modeglyph">{statModeGlyph(c.mode)}</span>
                      <NumInput
                        className="rs-weight rs-mini"
                        title={t.rsStatThreshold}
                        value={c.threshold}
                        onChange={(threshold) =>
                          patchCategory(s.def.id, {
                            criteria: cols.map((x) => (x === c ? { ...c, threshold } : x)),
                          })
                        }
                      />
                      {(c.mode === 'belowFlat' || c.mode === 'aboveFlat') && (
                        <span className="rs-modeglyph" title={t.rsStatModes[c.mode]}>
                          =
                        </span>
                      )}
                    </>
                  )}
                  {isRareCriterion(c) && (
                    <>
                      <span className="rs-modeglyph" title={t.rsRareMin}>
                        {'<'}
                      </span>
                      <NumInput
                        className="rs-weight rs-mini"
                        title={t.rsRareMin}
                        value={c.min}
                        onChange={(min) =>
                          patchCategory(s.def.id, {
                            criteria: cols.map((x) => (x === c ? { ...c, min } : x)),
                          })
                        }
                      />
                    </>
                  )}
                  <NumInput
                    className={`rs-weight${
                      (c.key === 'stat' && c.mode !== 'value') || isRareCriterion(c)
                        ? ' rs-mini'
                        : ''
                    }`}
                    step={0.5}
                    title={t.rsWeightTip}
                    value={c.weight}
                    onChange={(weight) =>
                      patchCategory(s.def.id, {
                        criteria: cols.map((x) => (x === c ? { ...x, weight } : x)),
                      })
                    }
                  />
                </span>
              </span>
            ))}
            <span className="rs-col rs-total">{t.rsTotal}</span>
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
                }${c === worst ? ' worst' : ''}${i >= quotaTotal(s.policy.quota) ? ' over' : ''}`}
                title={c === worst ? t.rsWorst : undefined}
                onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
              >
                {catCell(c)}
                {score?.parts.map((p) => (
                  <span key={critId(p.crit)} className={`rs-num${p.points < 0 ? ' neg' : ''}`}>
                    {p.points === 0 ? '·' : signed(p.points)}
                    {rawCOI.has(critId(p.crit)) && p.points !== 0 && (
                      <span className="rs-raw" title={t.rsCOIRawTip}>
                        {fmt(p.value)}%
                      </span>
                    )}
                  </span>
                ))}
                <span className="rs-num rs-total">{fmt(score?.total ?? 0)}</span>
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
    const mutSlots = MUTATION_SLOTS.filter((s) => selected.mutations[s]);
    return (
      <div className="panel">
        <div className="row">
          {catCell(selected)}
        </div>
        <RoomToggle
          value={selected.room}
          onChange={(next) => {
            if (next === selected.room) return;
            if (selected.id === candidateId) {
              // into this room = the same as "move in" (keeps the pending role);
              // anywhere else ends the what-if — the cat really moved
              if (next === room) {
                moveIn();
                return;
              }
              clearCandidate();
            }
            updateCat(selected.id, { room: next });
            // a cat that left this room is gone from the tables — drop the selection
            if (next !== room) setSelectedId(null);
          }}
        />
        <CategorySelect
          value={selected.category}
          categories={roster.categories}
          onChange={(category) => updateCat(selected.id, { category })}
        />
        <div className="meta">
          📊 {t.statsTitle}
          {statSum(selected) > 0 &&
            ` (Σ ${statSum(selected)}${
              realStatSum(selected) !== statSum(selected) ? ` → ${realStatSum(selected)}` : ''
            })`}
        </div>
        <div className="rs-stats">
          {STAT_KEYS.map((k) => {
            const mod = selected.statMods[k] ?? 0;
            return (
              <span key={k} className="rs-stat" title={t.statNames[k]}>
                <span className="rs-statname">{k.toUpperCase()}</span>
                <span className={selected.stats[k] == null ? 'meta' : ''}>
                  {selected.stats[k] ?? '–'}
                </span>
                {mod !== 0 && (
                  <span
                    className={`rs-statreal ${mod > 0 ? 'up' : 'down'}`}
                    title={t.statRealTip}
                  >
                    →{(selected.stats[k] ?? 0) + mod}
                  </span>
                )}
              </span>
            );
          })}
        </div>
        {score && score.parts.length > 0 ? (
          <>
            <div className="meta">{t.rsBreakdown}</div>
            <div className="rs-parts">
              {score.parts.map((p) => (
                <div
                  key={critId(p.crit)}
                  className="rs-part"
                  title={p.crit.key === 'stat' ? statColTip(p.crit) : t.rsCritTips[p.crit.key]}
                >
                  <span>
                    {p.crit.key === 'stat'
                      ? statColFull(p.crit)
                      : isRareCriterion(p.crit)
                        ? `${t.rsCrits[p.crit.key]} <${p.crit.min}`
                        : t.rsCrits[p.crit.key]}
                  </span>
                  <span className="meta">
                    {fmt(p.value)}
                    {isCOICriterion(p.crit) && '%'}
                  </span>
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
        {score && (score.sole.length > 0 || score.abilitySole.length > 0) && (
          <div className="rs-warn">
            {t.rsSole(
              [
                ...score.sole.map((w) => mutationLabel(w.id)),
                ...score.abilitySole.map((w) => getAbility(w.id)?.name ?? w.id),
              ].join(', '),
            )}
          </div>
        )}
        {widowed.length > 0 && (
          <div className="rs-warn">{t.rsBondWarn(widowed.map((p) => p.name).join(', '))}</div>
        )}
        {mutSlots.length > 0 && (
          <>
            <div className="meta">
              🧬 {t.mutationsTitle} ({mutSlots.length})
            </div>
            <div className="rs-parts">
              {mutSlots.map((slot) => (
                <div key={slot} className="rs-part">
                  <span>{mutationLabel(selected.mutations[slot]!)}</span>
                  <span className="meta">{t.mutationSlots[slot]}</span>
                  <span />
                </div>
              ))}
            </div>
          </>
        )}
        {selected.abilities.length > 0 && (
          <>
            <div className="meta">
              ⚡ {t.abilitiesTitle} ({selected.abilities.length})
            </div>
            <div className="rs-parts">
              {selected.abilities.map((id) => (
                <div key={id} className="rs-part">
                  <span title={abilityTip(t, id)}>{abilityLabel(id)}</span>
                  <span className="meta">
                    {getAbility(id) ? abilityClassLabel(t, getAbility(id)!.class) : ''}
                  </span>
                  <span />
                </div>
              ))}
            </div>
          </>
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
  // the room's size is not stored anywhere — it is every role's slots summed
  const slots = roomSlots(policy);

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
          {slots > 0 && (
            <span
              className={`rs-cap${residents.length > slots ? ' over' : ''}`}
              title={t.rsInRoomTip}
            >
              {t.rsInRoom(residents.length, slots)}
            </span>
          )}
          <button type="button" className="small" onClick={() => setRulesOpen((o) => !o)}>
            {t.rsRules} {rulesOpen ? '▾' : '▸'}
          </button>
          <span className="meta">{t.rsHint}</span>
        </div>

        {rulesOpen && (
          <div className="rs-rules">
            <div className="rs-wishlist" title={t.rsWishlistTip}>
              <div className="rs-rulerow">
                <span>{t.rsWishlist}</span>
                {policy.wishlist.length === 0 && <span className="meta">{t.rsWishEmpty}</span>}
              </div>
              {policy.wishlist.map((w) => {
                const inRoom = ctx.carriers.get(wishKey(w))?.length ?? 0;
                return (
                  <div key={wishKey(w)} className="rs-wishrow">
                    <span className="rs-wishname">{mutationLabel(w.id)}</span>
                    <span className="meta">{t.mutationSlots[w.slot]}</span>
                    <span className={`rs-wishcount${inRoom === 0 ? ' none' : ''}`}>
                      {t.rsWishInRoom(inRoom)}
                    </span>
                    <NumInput
                      className="rs-weight"
                      title={t.rsWeightTip}
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
                  </div>
                );
              })}
              <WishAdder options={wishOptions} onAdd={(w) => setWish([...policy.wishlist, w])} />
            </div>

            <div className="rs-wishlist" title={t.rsWishAbilitiesTip}>
              <div className="rs-rulerow">
                <span>{t.rsWishAbilities}</span>
                {policy.wishAbilities.length === 0 && (
                  <span className="meta">{t.rsWishAbilitiesEmpty}</span>
                )}
              </div>
              {policy.wishAbilities.map((w) => {
                const inRoom = ctx.abilityCarriers.get(w.id)?.length ?? 0;
                return (
                  <div key={w.id} className="rs-wishrow">
                    <span className="rs-wishname" title={abilityTip(t, w.id)}>
                      {getAbility(w.id)?.name ?? w.id}
                    </span>
                    <span className="meta">
                      {getAbility(w.id) ? abilityClassLabel(t, getAbility(w.id)!.class) : ''}
                    </span>
                    <span className={`rs-wishcount${inRoom === 0 ? ' none' : ''}`}>
                      {t.rsWishInRoom(inRoom)}
                    </span>
                    <NumInput
                      className="rs-weight"
                      title={t.rsWeightTip}
                      value={w.weight}
                      onChange={(weight) =>
                        setWishAbilities(
                          policy.wishAbilities.map((x) => (x === w ? { ...x, weight } : x)),
                        )
                      }
                    />
                    <button
                      type="button"
                      className="rs-drop"
                      onClick={() =>
                        setWishAbilities(policy.wishAbilities.filter((x) => x !== w))
                      }
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
              <AbilityWishAdder
                options={wishAbilityOptions}
                onAdd={(w) => setWishAbilities([...policy.wishAbilities, w])}
              />
            </div>

            {roster.categories.map((def, i) => {
              const cp = policy.categories[def.id];
              return (
                <div className="rs-rulerow" key={def.id}>
                  <span className="rs-movepair">
                    <button
                      type="button"
                      className="rs-move"
                      title={t.rsMoveUp}
                      disabled={i === 0}
                      onClick={() => moveCategory(def.id, -1)}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="rs-move"
                      title={t.rsMoveDown}
                      disabled={i === roster.categories.length - 1}
                      onClick={() => moveCategory(def.id, 1)}
                    >
                      ▼
                    </button>
                  </span>
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
                  {cp &&
                    (typeof cp.quota === 'number' ? (
                      <label>
                        {t.rsQuota}{' '}
                        <NumInput
                          className="rs-weight"
                          value={cp.quota}
                          onChange={(quota) => patchCategory(def.id, { quota })}
                        />
                      </label>
                    ) : (
                      <>
                        <label title={t.sexF}>
                          {t.rsQuota} ♀
                          <NumInput
                            className="rs-weight"
                            value={cp.quota.F}
                            onChange={(F) =>
                              patchCategory(def.id, {
                                quota: { ...(cp.quota as { F: number; M: number }), F },
                              })
                            }
                          />
                        </label>
                        <label title={t.sexM}>
                          ♂
                          <NumInput
                            className="rs-weight"
                            value={cp.quota.M}
                            onChange={(M) =>
                              patchCategory(def.id, {
                                quota: { ...(cp.quota as { F: number; M: number }), M },
                              })
                            }
                          />
                        </label>
                      </>
                    ))}
                  {cp && (
                    <label className="rs-check" title={t.rsSexQuotaTip}>
                      <input
                        type="checkbox"
                        checked={typeof cp.quota !== 'number'}
                        onChange={(e) => {
                          // the total survives the toggle both ways
                          const total = quotaTotal(cp.quota);
                          patchCategory(def.id, {
                            quota: e.target.checked
                              ? { F: Math.floor(total / 2), M: Math.ceil(total / 2) }
                              : total,
                          });
                        }}
                      />
                      {t.rsSexQuota}
                    </label>
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

/**
 * One picker over the mutations the house actually carries, named and common
 * (grouped by slot, with the house-wide carrier count) — not the whole catalog.
 */
function WishAdder({
  options,
  onAdd,
}: {
  options: HouseMutation[];
  onAdd: (w: WishMutation) => void;
}) {
  const { t } = useI18n();
  const bySlot = new Map<HouseMutation['slot'], HouseMutation[]>();
  for (const o of options) {
    const list = bySlot.get(o.slot);
    if (list) list.push(o);
    else bySlot.set(o.slot, [o]);
  }
  return (
    <div className="rs-rulerow">
      <select
        className="class-select"
        disabled={options.length === 0}
        title={options.length === 0 ? t.rsWishNoOptions : undefined}
        value=""
        onChange={(e) => {
          const picked = options.find((o) => wishKey(o) === e.target.value);
          if (picked) onAdd({ slot: picked.slot, id: picked.id, weight: 10 });
        }}
      >
        <option value="">{t.rsWishAdd}</option>
        {[...bySlot.entries()].map(([slot, list]) => (
          <optgroup key={slot} label={t.mutationSlots[slot]}>
            {list.map((o) => (
              <option key={wishKey(o)} value={wishKey(o)}>
                {mutationLabel(o.id)} · {o.living}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

/**
 * One picker over the skills recorded on the cats of the house (grouped by
 * ability class, with the house-wide carrier count) — not the whole catalog.
 */
function AbilityWishAdder({
  options,
  onAdd,
}: {
  options: HouseAbility[];
  onAdd: (w: WishAbility) => void;
}) {
  const { t } = useI18n();
  const byClass = new Map<string, HouseAbility[]>();
  for (const o of options) {
    const cls = getAbility(o.id)!.class;
    const list = byClass.get(cls);
    if (list) list.push(o);
    else byClass.set(cls, [o]);
  }
  return (
    <div className="rs-rulerow">
      <select
        className="class-select"
        disabled={options.length === 0}
        title={options.length === 0 ? t.rsWishAbilityNoOptions : undefined}
        value=""
        onChange={(e) => {
          const picked = options.find((o) => o.id === e.target.value);
          if (picked) onAdd({ id: picked.id, weight: 10 });
        }}
      >
        <option value="">{t.rsWishAbilityAdd}</option>
        {[...byClass.entries()].map(([cls, list]) => (
          <optgroup
            key={cls}
            label={abilityClassLabel(t, getAbility(list[0].id)!.class)}
          >
            {list.map((o) => (
              <option key={o.id} value={o.id}>
                {getAbility(o.id)!.name} · {o.living}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
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
