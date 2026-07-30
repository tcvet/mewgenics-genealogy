import { Fragment, useState } from 'react';
import {
  CLASS_COLOR,
  CLASSES,
  ORIENTATIONS,
  ROOMS,
  SEX_GLYPH,
  STAT_GROUPS,
  STAT_KEYS,
  STAT_VALUES,
  type Cat,
  type ClassKey,
  type Orientation,
  type RoomId,
  type Sex,
} from './types';
import type { CategoryDef } from './roster';
import { getAbility, type AbilityClass } from './abilities';
import { useI18n, type Dict } from './i18n';

/** Label of an ability's class: the game classes + the two wiki-only pools. */
export const abilityClassLabel = (t: Dict, c: AbilityClass): string =>
  c === 'collarless' || c === 'jester' ? t.abilityClasses[c] : t.classes[c];

/** Tooltip for an ability chip: class · type · cost, then the description. */
export function abilityTip(t: Dict, id: string): string | undefined {
  const a = getAbility(id);
  if (!a) return undefined;
  const head = [abilityClassLabel(t, a.class), t.abilityTypes[a.type], a.cost]
    .filter(Boolean)
    .join(' · ');
  return a.desc ? `${head}\n${a.desc}` : head;
}

/** Clickable stat grid (a row per stat, columns – and 3–7); shared by the
 * cat editor and the kitten form. */
export function StatsMatrix({
  stats,
  onChange,
}: {
  stats: Cat['stats'];
  onChange: (stats: Cat['stats']) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="stats-matrix">
      {/* clickable header: a digit fills every stat with that value, "–" clears all */}
      <span />
      <button type="button" className="stat-cell head" title={t.statClearAll} onClick={() => onChange({})}>
        –
      </button>
      {STAT_VALUES.map((v) => (
        <button
          key={v}
          type="button"
          className="stat-cell head"
          title={t.statSetAll(v)}
          onClick={() =>
            onChange(Object.fromEntries(STAT_KEYS.map((k) => [k, v])) as Cat['stats'])
          }
        >
          {v}
        </button>
      ))}
      {STAT_GROUPS.map((group, gi) => (
        <Fragment key={gi}>
          {gi > 0 && <span className="stats-divider" />}
          {group.map((k) => (
            <Fragment key={k}>
              <span className="stat-name" title={t.statNames[k]}>
                {k.toUpperCase()}
              </span>
              <button
                type="button"
                className={`stat-cell ${stats[k] == null ? 'on' : ''}`}
                onClick={() => {
                  const next = { ...stats };
                  delete next[k];
                  onChange(next);
                }}
              >
                –
              </button>
              {STAT_VALUES.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`stat-cell ${stats[k] === v ? 'on' : ''}`}
                  onClick={() => onChange({ ...stats, [k]: v })}
                >
                  {v}
                </button>
              ))}
            </Fragment>
          ))}
        </Fragment>
      ))}
    </div>
  );
}

export function ClassSelect({
  value,
  onChange,
}: {
  value: ClassKey | null;
  onChange: (cls: ClassKey | null) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="row">
      <span
        className={`class-dot ${value ? '' : 'none'}`}
        style={value ? { background: CLASS_COLOR[value] } : undefined}
      />
      <select
        className="class-select"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : (e.target.value as ClassKey))}
      >
        <option value="">{t.classNone}</option>
        {CLASSES.map((c) => (
          <option key={c.id} value={c.id}>
            {t.classes[c.id]}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Roster category picker; the empty option means "unsorted" (or a filter's "any"). */
export function CategorySelect({
  value,
  categories,
  onChange,
  emptyLabel,
}: {
  value: string | null;
  categories: CategoryDef[];
  onChange: (id: string | null) => void;
  /** label of the empty option (defaults to "no category") */
  emptyLabel?: string;
}) {
  const { t } = useI18n();
  const current = categories.find((c) => c.id === value) ?? null;
  return (
    <div className="row">
      <span
        className={`class-dot ${current ? '' : 'none'}`}
        style={current ? { background: current.color } : undefined}
      />
      <select
        className="class-select"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      >
        <option value="">{emptyLabel ?? t.rsNoCategory}</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function RoomToggle({
  value,
  onChange,
}: {
  value: RoomId | null;
  onChange: (room: RoomId | null) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="room-toggle">
      <button
        type="button"
        title={t.roomNone}
        className={`stat-cell ${value === null ? 'on' : ''}`}
        onClick={() => onChange(null)}
      >
        –
      </button>
      {ROOMS.map((r) => (
        <button
          key={r.id}
          type="button"
          title={t.rooms[r.id]}
          className={`stat-cell ${value === r.id ? 'on' : ''}`}
          onClick={() => onChange(r.id)}
        >
          {r.short}
        </button>
      ))}
    </div>
  );
}

const SEX_OPTIONS: { sex: Sex; cls: string }[] = [
  { sex: 'F', cls: 'female' },
  { sex: 'M', cls: 'male' },
  { sex: '?', cls: 'any' },
];

export function SexToggle({ value, onChange }: { value: Sex; onChange: (sex: Sex) => void }) {
  const { t } = useI18n();
  const titles: Record<Sex, string> = { F: t.sexF, M: t.sexM, '?': t.sexAny };
  return (
    <div className="sex-toggle">
      {SEX_OPTIONS.map((o) => (
        <button
          key={o.sex}
          type="button"
          title={titles[o.sex]}
          className={value === o.sex ? `on ${o.cls}` : ''}
          onClick={() => onChange(o.sex)}
        >
          {SEX_GLYPH[o.sex]}
        </button>
      ))}
    </div>
  );
}

export function OrientationToggle({
  value,
  onChange,
}: {
  value: Orientation;
  onChange: (o: Orientation) => void;
}) {
  const { t } = useI18n();
  const titles: Record<Orientation, string> = { hetero: t.oriHetero, bi: t.oriBi, homo: t.oriHomo };
  return (
    <div className="sex-toggle ori-toggle">
      {ORIENTATIONS.map((o) => (
        <button
          key={o}
          type="button"
          title={titles[o]}
          className={value === o ? 'on' : ''}
          onClick={() => onChange(o)}
        >
          {/* straight = no flag (as in the game); bi/homo = CSS-drawn pride flags */}
          {o === 'hetero' ? '–' : <span className={`flag-chip flag-${o}`} />}
        </button>
      ))}
    </div>
  );
}

/** Compact one-button orientation cycle (– → bi → homo) for tight rows (litter form). */
export function OrientationCycle({
  value,
  onChange,
}: {
  value: Orientation;
  onChange: (o: Orientation) => void;
}) {
  const { t } = useI18n();
  const titles: Record<Orientation, string> = { hetero: t.oriHetero, bi: t.oriBi, homo: t.oriHomo };
  const next = ORIENTATIONS[(ORIENTATIONS.indexOf(value) + 1) % ORIENTATIONS.length];
  return (
    <button
      type="button"
      className="ori-cycle"
      title={`${titles[value]} ${t.oriCycleHint}`}
      onClick={() => onChange(next)}
    >
      {value === 'hetero' ? '–' : <span className={`flag-chip flag-${value}`} />}
    </button>
  );
}

export function SearchBox({ cats, onPick }: { cats: Cat[]; onPick: (id: string) => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const matches = query
    ? cats.filter((c) => c.name.toLowerCase().includes(query)).slice(0, 8)
    : [];
  const pick = (id: string) => {
    onPick(id);
    setQ('');
  };
  return (
    <div className="search">
      <input
        type="text"
        placeholder={t.searchPlaceholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && matches[0]) pick(matches[0].id);
          else if (e.key === 'Escape') setQ('');
        }}
      />
      {matches.length > 0 && (
        <div className="search-results">
          {matches.map((c) => (
            <button key={c.id} onClick={() => pick(c.id)}>
              {SEX_GLYPH[c.sex]} {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
