import { useMemo, useState } from 'react';
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
import { inbreedingCoefficient } from './genealogy';
import { statSum, type CatsStore } from './store';
import { CatPanel } from './CatPanel';
import { useI18n } from './i18n';

const SEX_CLASS: Record<Sex, string> = { F: 'female', M: 'male', '?': 'any' };

type OvSort = 'name' | 'stats' | 'recent';

/** Compact list card speaking the map card's visual language:
 * fill = class color, sex chip, room/mutation/stat-total chips. */
function CatCard({ cat, picked, onClick }: { cat: Cat; picked: boolean; onClick: () => void }) {
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
}: {
  store: CatsStore;
  onShowInTree: (id: string) => void;
}) {
  const { t } = useI18n();
  const { cats, byId, children, updateCat, nameTakenBy, removeCat } = store;
  const [q, setQ] = useState('');
  const [atHome, setAtHome] = useState(true);
  const [sex, setSex] = useState<Sex | null>(null);
  const [cls, setCls] = useState<ClassKey | ''>('');
  const [room, setRoom] = useState<RoomId | ''>('');
  const [sort, setSort] = useState<OvSort>('name');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = cats.filter(
      (c) =>
        (!atHome || !c.gone) &&
        (!sex || c.sex === sex) &&
        (!cls || c.class === cls) &&
        (!room || c.room === room) &&
        (!query || c.name.toLowerCase().includes(query)),
    );
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'stats')
      list.sort((a, b) => statSum(b) - statSum(a) || a.name.localeCompare(b.name));
    else list.reverse(); // recent: cats are stored in insertion order
    return list;
  }, [cats, q, atHome, sex, cls, room, sort]);

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
  const sorts: { key: OvSort; label: string }[] = [
    { key: 'name', label: t.mateSortName },
    { key: 'stats', label: t.mateSortStats },
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
          <div className="row">
            {sorts.map((s) => (
              <button
                key={s.key}
                type="button"
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
            {filtered.map((c) => (
              <CatCard
                key={c.id}
                cat={c}
                picked={c.id === selectedId}
                onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
              />
            ))}
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
            nameTaken={(n) => nameTakenBy(n, selected.id)}
            onUpdate={(patch) => updateCat(selected.id, patch)}
            onDelete={() => deleteCat(selected)}
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
