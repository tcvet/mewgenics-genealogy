import { useEffect, useMemo, useState } from 'react';
import {
  CLASS_COLOR,
  CLASSES,
  ROOM_SHORT,
  ROOMS,
  SEX_GLYPH,
  textColorOn,
  type Cat,
  type ClassKey,
  type RoomId,
  type Sex,
} from './types';
import { avgMateCOIs, inbreedingCoefficient } from './genealogy';
import { abilityLabel } from './abilities';
import { activeBondPartners, bondPartnersOf, statSum, type CatsStore } from './store';
import { CatPanel } from './CatPanel';
import { useI18n } from './i18n';

const SEX_CLASS: Record<Sex, string> = { F: 'female', M: 'male', '?': 'any' };

type OvSort = 'name' | 'stats' | 'children' | 'mateCOI' | 'recent';

/** Compact list card speaking the map card's visual language:
 * fill = class color, sex chip, room/mutation/stat-total/bond chips. */
function CatCard({
  cat,
  bondNames,
  picked,
  onClick,
}: {
  cat: Cat;
  /** names of the cat's active bond partners (null — not in an active bond) */
  bondNames: string | null;
  picked: boolean;
  onClick: () => void;
}) {
  const { t } = useI18n();
  const fill = cat.class ? CLASS_COLOR[cat.class] : undefined;
  const style = fill ? { background: fill, color: textColorOn(fill) } : undefined;
  const mutCount = Object.keys(cat.mutations).length;
  const sum = statSum(cat);
  return (
    <button
      type="button"
      className={`ov-card${picked ? ' picked' : ''}${cat.gone ? ' gone' : ''}`}
      style={style}
      onClick={onClick}
    >
      <span className={`sex-chip ${SEX_CLASS[cat.sex]}`}>{SEX_GLYPH[cat.sex]}</span>
      <span className="ov-name" title={cat.name}>
        {cat.name}
      </span>
      {cat.orientation !== 'hetero' && (
        <span
          className={`flag-chip flag-${cat.orientation}`}
          title={cat.orientation === 'bi' ? t.oriBi : t.oriHomo}
        />
      )}
      {sum > 0 && (
        <span className="ov-chip" title={t.mateStatsTitle}>
          Σ{sum}
        </span>
      )}
      {mutCount > 0 && <span className="ov-chip">🧬{mutCount}</span>}
      {cat.abilities.length > 0 && (
        <span className="ov-chip" title={cat.abilities.map(abilityLabel).join('\n')}>
          ⚡{cat.abilities.length}
        </span>
      )}
      {bondNames && (
        <span className="ov-chip" title={t.bondWith(bondNames)}>
          💞
        </span>
      )}
      {cat.room && (
        <span className="ov-chip" title={t.rooms[cat.room]}>
          {ROOM_SHORT[cat.room]}
        </span>
      )}
    </button>
  );
}

/** The cat browser: filters + a card grid on the left, the inspector on the right. */
export function OverviewScreen({
  store,
  onShowInTree,
  onOpenBreeding,
  focusId,
  onFocusDone,
}: {
  store: CatsStore;
  onShowInTree: (id: string) => void;
  onOpenBreeding: (id: string) => void;
  /** a cat pushed in from another screen (statistics carriers) */
  focusId: string | null;
  onFocusDone: () => void;
}) {
  const { t } = useI18n();
  const { cats, byId, children, bonds, updateCat, nameTakenBy, removeCat, unbondCat } = store;
  const [q, setQ] = useState('');
  const [atHome, setAtHome] = useState(true);
  const [sex, setSex] = useState<Sex | null>(null);
  const [cls, setCls] = useState<ClassKey | ''>('');
  const [room, setRoom] = useState<RoomId | ''>('');
  const [category, setCategory] = useState<string | ''>('');
  const [sort, setSort] = useState<OvSort>('name');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!focusId) return;
    setSelectedId(focusId);
    onFocusDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  // one pass over the whole house: feeds both the mate-COI sort and the panel
  const mateAvgs = useMemo(() => avgMateCOIs(cats), [cats]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = cats.filter(
      (c) =>
        (!atHome || !c.gone) &&
        (!sex || c.sex === sex) &&
        (!cls || c.class === cls) &&
        (!room || c.room === room) &&
        (!category || c.category === category) &&
        (!query || c.name.toLowerCase().includes(query)),
    );
    const kids = (c: Cat) => children.get(c.id)?.length ?? 0;
    // cats with no compatible partner at all sink to the bottom
    const mateCOI = (c: Cat) => mateAvgs.get(c.id)?.avg ?? Infinity;
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'stats')
      list.sort((a, b) => statSum(b) - statSum(a) || a.name.localeCompare(b.name));
    else if (sort === 'children')
      list.sort((a, b) => kids(b) - kids(a) || a.name.localeCompare(b.name));
    else if (sort === 'mateCOI')
      list.sort((a, b) => mateCOI(a) - mateCOI(b) || a.name.localeCompare(b.name));
    else list.reverse(); // recent: cats are stored in insertion order
    return list;
  }, [cats, children, mateAvgs, q, atHome, sex, cls, room, category, sort]);

  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;

  const deleteCat = (cat: Cat) => {
    if ((children.get(cat.id)?.length ?? 0) > 0) {
      alert(t.deleteHasChildren);
      return;
    }
    if (!confirm(t.deleteConfirm(cat.name))) return;
    removeCat(cat.id);
    setSelectedId(null);
  };

  const sexes: { value: Sex | null; glyph: string; title: string; cls: string }[] = [
    { value: null, glyph: '–', title: t.ovSexAll, cls: '' },
    { value: 'F', glyph: SEX_GLYPH.F, title: t.sexF, cls: 'female' },
    { value: 'M', glyph: SEX_GLYPH.M, title: t.sexM, cls: 'male' },
    { value: '?', glyph: SEX_GLYPH['?'], title: t.sexAny, cls: 'any' },
  ];
  const sorts: { key: OvSort; label: string; title?: string }[] = [
    { key: 'name', label: t.mateSortName },
    { key: 'stats', label: t.mateSortStats },
    { key: 'children', label: t.ovSortChildren, title: t.ovSortChildrenTitle },
    { key: 'mateCOI', label: t.ovSortMateCOI, title: t.ovSortMateCOITitle },
    { key: 'recent', label: t.ovSortRecent },
  ];

  return (
    <div className="ov-screen">
      <div className="ov-main">
        <div className="ov-filters">
          <input
            type="text"
            placeholder={t.searchPlaceholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            type="button"
            className={atHome ? 'accent' : ''}
            onClick={() => setAtHome((v) => !v)}
          >
            🏠 {t.ovAtHome}
          </button>
          <div className="sex-toggle">
            {sexes.map((o) => (
              <button
                key={o.glyph}
                type="button"
                title={o.title}
                className={sex === o.value ? `on ${o.cls}` : ''}
                onClick={() => setSex(o.value)}
              >
                {o.glyph}
              </button>
            ))}
          </div>
          <select
            className="class-select"
            value={cls}
            onChange={(e) => setCls(e.target.value as ClassKey | '')}
          >
            <option value="">{t.ovAnyClass}</option>
            {CLASSES.map((c) => (
              <option key={c.id} value={c.id}>
                {t.classes[c.id]}
              </option>
            ))}
          </select>
          <select
            className="class-select"
            value={room}
            onChange={(e) => setRoom(e.target.value as RoomId | '')}
          >
            <option value="">{t.ovAnyRoom}</option>
            {ROOMS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.short} {t.rooms[r.id]}
              </option>
            ))}
          </select>
          {store.roster.categories.length > 0 && (
            <select
              className="class-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">{t.rsAnyCategory}</option>
              {store.roster.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <div className="row">
            {sorts.map((s) => (
              <button
                key={s.key}
                type="button"
                title={s.title}
                className={`small${sort === s.key ? ' accent' : ''}`}
                onClick={() => setSort(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <span className="ov-count">{t.catCount(filtered.length)}</span>
        </div>
        {filtered.length === 0 ? (
          <div className="ov-empty">{t.ovEmpty}</div>
        ) : (
          <div className="ov-list">
            {filtered.map((c) => {
              const partners = activeBondPartners(c, bonds);
              return (
                <CatCard
                  key={c.id}
                  cat={c}
                  bondNames={
                    partners.length > 0 ? partners.map((p) => p.name).join(', ') : null
                  }
                  picked={c.id === selectedId}
                  onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
                />
              );
            })}
          </div>
        )}
      </div>
      <div className="ov-side">
        {selected ? (
          <CatPanel
            cat={selected}
            mother={selected.motherId ? (byId.get(selected.motherId) ?? null) : null}
            father={selected.fatherId ? (byId.get(selected.fatherId) ?? null) : null}
            childrenCount={children.get(selected.id)?.length ?? 0}
            inbreeding={inbreedingCoefficient(selected.id, cats)}
            mateAvg={mateAvgs.get(selected.id) ?? null}
            bondPartners={bondPartnersOf(selected, bonds)}
            categories={store.roster.categories}
            nameTaken={(n) => nameTakenBy(n, selected.id)}
            onUpdate={(patch) => updateCat(selected.id, patch)}
            onDelete={() => deleteCat(selected)}
            onUnbond={() => unbondCat(selected.id)}
            onMates={() => onOpenBreeding(selected.id)}
            onShowInTree={() => onShowInTree(selected.id)}
            onOpenCat={(id) => setSelectedId(id)}
          />
        ) : (
          <div className="panel hint">{t.ovPickHint}</div>
        )}
      </div>
    </div>
  );
}
