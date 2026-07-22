import { Fragment, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  canMate,
  CLASS_COLOR,
  CLASSES,
  MUTATION_SLOTS,
  ORIENTATIONS,
  ROOMS,
  SEX_GLYPH,
  STAT_GROUPS,
  STAT_KEYS,
  STAT_VALUES,
  type Cat,
  type ClassKey,
  type MutationSlot,
  type Orientation,
  type RoomId,
  type Sex,
  type StatKey,
} from './types';
import {
  commonId,
  getCommon,
  getNamed,
  houseMutations,
  mutationLabel,
  NAMED_BY_SLOT,
  normMutations,
  otherStat,
  type HouseMutation,
} from './mutations';
import {
  childrenIndex,
  coiTier,
  descendantIds,
  formatCOI,
  inbreedingCoefficient,
  indexCats,
  mateCOIs,
  pairCOI,
  pedigreeIds,
} from './genealogy';
import { CAT_H, CAT_W, layoutCats, type LaidOutNode } from './layout';
import { CatNode, UnionNode } from './CatNode';
import { I18nProvider, LANGS, useI18n, type Lang } from './i18n';

const STORAGE_KEY = 'mewgenics-genealogy';
const HELP_KEY = 'mewgenics-help';
const ROLLCALL_KEY = 'mewgenics-rollcall';
const nodeTypes = { cat: CatNode, union: UnionNode };

/** Name normalization for duplicate checks: trimmed, case-insensitive. */
const normName = (s: string) => s.trim().toLowerCase();

/** Normalize a possibly-missing/invalid orientation (older saves/imports). */
const normOrientation = (o: unknown): Orientation => (o === 'bi' || o === 'homo' ? o : 'hetero');

/** Total of the recorded base stats (unset stats count as 0). */
const statSum = (c: Cat) => STAT_KEYS.reduce((sum, k) => sum + (c.stats[k] ?? 0), 0);

function makeCat(
  name: string,
  sex: Sex,
  motherId: string | null = null,
  fatherId: string | null = null,
  room: RoomId | null = null,
  cls: ClassKey | null = null,
  orientation: Orientation = 'hetero',
  mutations: Cat['mutations'] = {},
): Cat {
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    sex,
    orientation,
    motherId,
    fatherId,
    room,
    class: cls,
    gone: false,
    notes: '',
    stats: {},
    mutations,
  };
}

function ClassSelect({
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

function RoomToggle({
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

/** A small first-run example so the tree's look is immediately visible. */
function seedCats(): Cat[] {
  const cats: Cat[] = [];
  const add = (
    name: string,
    sex: Sex,
    motherId: string | null = null,
    fatherId: string | null = null,
    cls: ClassKey | null = null,
    mutations: Cat['mutations'] = {},
  ) => {
    const cat: Cat = {
      id: `seed-${cats.length}`,
      name,
      sex,
      orientation: 'hetero',
      motherId,
      fatherId,
      room: null,
      class: cls,
      gone: false,
      notes: '',
      stats: {},
      mutations,
    };
    cats.push(cat);
    return cat.id;
  };
  // example mutations: Luna inherits one from each parent (body.301 Cactus Bod, eyes.301 Demon Eyes)
  const misty = add('Misty', 'F', null, null, 'monk', { body: 'body.301' });
  const shadow = add('Shadow', 'M', null, null, 'necromancer', { eyes: 'eyes.301' });
  const tom = add('Tom', 'M', null, null, 'tank');
  const luna = add('Luna', 'F', misty, shadow, 'mage', { body: 'body.301', eyes: 'eyes.301' });
  add('Ginger', 'M', misty, shadow, 'fighter');
  add('Toffee', 'F', luna, tom, 'thief');
  add('Cosmo', 'M', luna, tom, 'tinkerer');
  return cats;
}

function loadCats(): Cat[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      // normalize data from older versions (e.g. missing the room field)
      return (JSON.parse(raw) as Partial<Cat>[]).map((c) => ({
        id: c.id!,
        name: c.name!,
        sex: c.sex!,
        orientation: normOrientation(c.orientation),
        motherId: c.motherId ?? null,
        fatherId: c.fatherId ?? null,
        room: c.room ?? null,
        class: c.class ?? null,
        gone: c.gone ?? false,
        notes: c.notes ?? '',
        stats: c.stats ?? {},
        mutations: normMutations(c.mutations),
      }));
    }
  } catch {
    // corrupted data — start with the example
  }
  return seedCats();
}

/** An in-progress roll call survives reloads: the key exists ⇔ a session is active. */
function loadRollcall(): Set<string> | null {
  try {
    const raw = localStorage.getItem(ROLLCALL_KEY);
    if (raw !== null) return new Set(JSON.parse(raw) as string[]);
  } catch {
    // corrupted data — no session
  }
  return null;
}

const SEX_OPTIONS: { sex: Sex; cls: string }[] = [
  { sex: 'F', cls: 'female' },
  { sex: 'M', cls: 'male' },
  { sex: '?', cls: 'any' },
];

function SexToggle({ value, onChange }: { value: Sex; onChange: (sex: Sex) => void }) {
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

function OrientationToggle({
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
function OrientationCycle({
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

/**
 * Distributes two cats into the mother/father slots for a litter.
 * null — the pair cannot mate (sexes/orientations incompatible, see `canMate`).
 * Female → mother, male → father, '?' takes a free slot.
 * The slot does not matter for the DAG (kinship is symmetric), display only.
 */
function assignParents(a: Cat, b: Cat): { mother: Cat; father: Cat } | null {
  if (!canMate(a, b)) return null;
  const female = a.sex === 'F' ? a : b.sex === 'F' ? b : null;
  const male = a.sex === 'M' ? a : b.sex === 'M' ? b : null;
  if (female && male) return { mother: female, father: male };
  if (female) return { mother: female, father: female === a ? b : a };
  if (male) return { mother: male === a ? b : a, father: male };
  return { mother: a, father: b }; // both are '?'
}

function AddCatForm({
  onAdd,
  onCancel,
  nameTaken,
}: {
  onAdd: (
    name: string,
    sex: Sex,
    room: RoomId | null,
    cls: ClassKey | null,
    orientation: Orientation,
  ) => void;
  onCancel: () => void;
  nameTaken: (name: string) => boolean;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [sex, setSex] = useState<Sex>('F');
  const [ori, setOri] = useState<Orientation>('hetero');
  const [room, setRoom] = useState<RoomId | null>(null);
  const [cls, setCls] = useState<ClassKey | null>(null);
  const dup = name.trim() !== '' && nameTaken(name);
  const submit = () => {
    if (name.trim() && !dup) onAdd(name, sex, room, cls, ori);
  };
  return (
    <div className="panel">
      <h3>{t.founderTitle}</h3>
      <div className="meta">{t.founderDesc}</div>
      <div className="row">
        <SexToggle value={sex} onChange={setSex} />
        <input
          type="text"
          className={dup ? 'dup' : ''}
          placeholder={t.namePlaceholder}
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </div>
      {dup && <div className="warn">{t.nameExists(name.trim())}</div>}
      <OrientationToggle value={ori} onChange={setOri} />
      <RoomToggle value={room} onChange={setRoom} />
      <ClassSelect value={cls} onChange={setCls} />
      <div className="row">
        <button className="accent" disabled={!name.trim() || dup} onClick={submit}>
          {t.add}
        </button>
        <button onClick={onCancel}>{t.cancel}</button>
      </div>
    </div>
  );
}

/** Sentinel select value for "a common +2/−1 mutation" (the exact id comes from the stat pickers). */
const COMMON_OPT = '__common';

/** One body-part slot: a select over the slot's named mutations + the common
 * "+2/−1" option (expanded into two stat pickers) + inherit-from-parent chips. */
function MutationSlotRow({
  slot,
  value,
  mother,
  father,
  onSet,
}: {
  slot: MutationSlot;
  value: string | null;
  mother: Cat | null;
  father: Cat | null;
  onSet: (id: string | null) => void;
}) {
  const { t } = useI18n();
  const common = value ? getCommon(value) : undefined;
  const named = NAMED_BY_SLOT[slot];
  const inherit = [
    { glyph: '♀', label: t.mutationFromMother, cat: mother },
    { glyph: '♂', label: t.mutationFromFather, cat: father },
  ].filter((p) => p.cat?.mutations[slot] && p.cat.mutations[slot] !== value);
  const setCommonStat = (up: StatKey, down: StatKey) => {
    // the equal option is disabled in the pickers; the swap is just a safety net
    if (up === down) down = otherStat(up);
    onSet(commonId(slot, up, down));
  };
  return (
    <div className="mut-slot">
      <div className="row">
        <span className="mut-slot-name" title={t.mutationSlots[slot]}>
          {t.mutationSlots[slot]}
        </span>
        <select
          className="mut-select"
          value={common ? COMMON_OPT : (value ?? '')}
          title={(value && getNamed(value)?.desc) || undefined}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '') onSet(null);
            else if (v === COMMON_OPT) onSet(commonId(slot, 'str', 'dex'));
            else onSet(v);
          }}
        >
          <option value="">{t.mutationNoneOpt}</option>
          <option value={COMMON_OPT}>{t.mutationCommonOpt}</option>
          <optgroup label={t.mutationNamedGroup}>
            {named.filter((m) => !m.defect).map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </optgroup>
          <optgroup label={t.mutationDefectsGroup}>
            {named.filter((m) => m.defect).map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </optgroup>
        </select>
      </div>
      {common && (
        <div className="row mut-indent">
          <span className="mut-sign">+2</span>
          <select
            className="mut-select"
            value={common.up}
            onChange={(e) => setCommonStat(e.target.value as StatKey, common.down)}
          >
            {STAT_KEYS.map((k) => (
              <option key={k} value={k} disabled={k === common.down}>
                {t.statNames[k]}
              </option>
            ))}
          </select>
          <span className="mut-sign">−1</span>
          <select
            className="mut-select"
            value={common.down}
            onChange={(e) => setCommonStat(common.up, e.target.value as StatKey)}
          >
            {STAT_KEYS.map((k) => (
              <option key={k} value={k} disabled={k === common.up}>
                {t.statNames[k]}
              </option>
            ))}
          </select>
        </div>
      )}
      {inherit.length > 0 && (
        <div className="row mut-indent mut-inherit-row">
          {inherit.map((p) => (
            <button
              key={p.glyph}
              type="button"
              className="mut-inherit"
              title={`${p.label}: ${p.cat!.name}`}
              onClick={() => onSet(p.cat!.mutations[slot]!)}
            >
              {p.glyph} {mutationLabel(p.cat!.mutations[slot]!)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Collapsible per-slot mutation editor for the cat panel. */
function MutationEditor({
  mutations,
  mother,
  father,
  onChange,
}: {
  mutations: Cat['mutations'];
  mother: Cat | null;
  father: Cat | null;
  onChange: (next: Cat['mutations']) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const count = Object.keys(mutations).length;
  return (
    <div className="mut-editor">
      <button type="button" className="mut-head" onClick={() => setOpen((o) => !o)}>
        <span>
          🧬 {t.mutationsTitle}
          {count > 0 && ` (${count})`}
        </span>
        <span>{open ? '▾' : '▸'}</span>
      </button>
      {open &&
        MUTATION_SLOTS.map((slot) => (
          <MutationSlotRow
            key={slot}
            slot={slot}
            value={mutations[slot] ?? null}
            mother={mother}
            father={father}
            onSet={(id) => {
              const next = { ...mutations };
              if (id) next[slot] = id;
              else delete next[slot];
              onChange(next);
            }}
          />
        ))}
    </div>
  );
}

type KittenDraft = { name: string; sex: Sex; orientation: Orientation; mutations: Cat['mutations'] };
const emptyKitten = (): KittenDraft => ({
  name: '',
  sex: 'F',
  orientation: 'hetero',
  mutations: {},
});

function LitterPanel({
  mother,
  father,
  coi,
  nameTaken,
  onCreate,
}: {
  mother: Cat;
  father: Cat;
  coi: number;
  nameTaken: (name: string) => boolean;
  onCreate: (kittens: KittenDraft[]) => void;
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState<KittenDraft[]>([emptyKitten()]);
  const setRow = (i: number, patch: Partial<KittenDraft>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const filled = rows.filter((r) => r.name.trim());
  // duplicate: matches an existing cat OR another kitten of this same litter
  const dupRow = (i: number) => {
    const key = normName(rows[i].name);
    if (!key) return false;
    if (nameTaken(rows[i].name)) return true;
    return rows.some((r, j) => j !== i && normName(r.name) === key);
  };
  const anyDup = rows.some((_, i) => dupRow(i));
  const submit = () => {
    if (!filled.length || anyDup) return;
    onCreate(filled);
    setRows([emptyKitten()]);
  };
  const tier = coiTier(coi);
  // parents' mutations a kitten can inherit; one entry per (slot, id),
  // a mutation both parents share becomes a single ♀♂ chip
  const heritable = MUTATION_SLOTS.flatMap((slot) => {
    const m = mother.mutations[slot];
    const f = father.mutations[slot];
    const chips: { slot: MutationSlot; id: string; glyphs: string }[] = [];
    if (m) chips.push({ slot, id: m, glyphs: f === m ? '♀♂' : '♀' });
    if (f && f !== m) chips.push({ slot, id: f, glyphs: '♂' });
    return chips;
  });
  const toggleMut = (i: number, slot: MutationSlot, id: string) => {
    const next = { ...rows[i].mutations };
    if (next[slot] === id) delete next[slot];
    else next[slot] = id;
    setRow(i, { mutations: next });
  };
  return (
    <div className="panel">
      <h3>{t.litterTitle}</h3>
      <div className="meta">
        {SEX_GLYPH[mother.sex]} {mother.name} × {SEX_GLYPH[father.sex]} {father.name}
      </div>
      <div className={`coi-line ${tier}`}>
        {t.offspringInbreeding} <b>{formatCOI(coi)}</b>
        {t.coiNotes[tier]}
      </div>
      {heritable.length > 0 && <div className="meta">{t.litterMutHint}</div>}
      {rows.map((r, i) => (
        <Fragment key={i}>
          <div className="row">
            <SexToggle value={r.sex} onChange={(sex) => setRow(i, { sex })} />
            <OrientationCycle
              value={r.orientation}
              onChange={(orientation) => setRow(i, { orientation })}
            />
            <input
              type="text"
              className={dupRow(i) ? 'dup' : ''}
              placeholder={t.kittenPlaceholder}
              value={r.name}
              autoFocus={i === rows.length - 1}
              onChange={(e) => setRow(i, { name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && r.name.trim() && !anyDup) {
                  setRows((rs) => [...rs, emptyKitten()]);
                }
              }}
            />
            {rows.length > 1 && (
              <button
                className="small"
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            )}
          </div>
          {heritable.length > 0 && (
            <div className="kitten-muts">
              {heritable.map((h) => (
                <button
                  key={`${h.slot}|${h.id}`}
                  type="button"
                  className={`mut-inherit${r.mutations[h.slot] === h.id ? ' on' : ''}`}
                  title={`${t.mutationSlots[h.slot]}: ${mutationLabel(h.id)}`}
                  onClick={() => toggleMut(i, h.slot, h.id)}
                >
                  {h.glyphs} {mutationLabel(h.id)}
                </button>
              ))}
            </div>
          )}
        </Fragment>
      ))}
      {anyDup && <div className="warn">{t.litterDupWarn}</div>}
      <div className="row">
        <button onClick={() => setRows((rs) => [...rs, emptyKitten()])}>{t.addKitten}</button>
        <button className="accent" disabled={!filled.length || anyDup} onClick={submit}>
          {t.create}
        </button>
      </div>
      <div className="meta">{t.litterEnterHint}</div>
    </div>
  );
}

function CatPanel(props: {
  cat: Cat;
  mother: Cat | null;
  father: Cat | null;
  childrenCount: number;
  inbreeding: number;
  pedigreeActive: boolean;
  mateActive: boolean;
  nameTaken: (name: string) => boolean;
  onUpdate: (patch: Partial<Cat>) => void;
  onDelete: () => void;
  onPedigree: () => void;
  onMates: () => void;
  onAssignParents: () => void;
}) {
  const { t } = useI18n();
  const { cat } = props;
  const dupName = cat.name.trim() !== '' && props.nameTaken(cat.name);
  return (
    <div className="panel">
      <div className="row">
        <SexToggle value={cat.sex} onChange={(sex) => props.onUpdate({ sex })} />
        <input
          type="text"
          className={dupName ? 'dup' : ''}
          value={cat.name}
          onChange={(e) => props.onUpdate({ name: e.target.value })}
        />
      </div>
      {dupName && <div className="warn">{t.nameTakenWarn}</div>}
      <OrientationToggle
        value={cat.orientation}
        onChange={(orientation) => props.onUpdate({ orientation })}
      />
      <RoomToggle value={cat.room} onChange={(room) => props.onUpdate({ room })} />
      <ClassSelect value={cat.class} onChange={(cls) => props.onUpdate({ class: cls })} />
      <div className="meta">
        {t.parents}: {props.mother?.name ?? '—'} × {props.father?.name ?? '—'}
        <br />
        {t.childrenCount}: {props.childrenCount}
        <br />
        {t.inbreedingF}:{' '}
        <span className={`coi-inline ${coiTier(props.inbreeding)}`}>
          {formatCOI(props.inbreeding)}
        </span>
        {cat.gone && (
          <>
            <br />
            <span className="gone-tag">{t.goneTag}</span>
          </>
        )}
      </div>
      <div className="stats-matrix">
        {/* clickable header: a digit fills every stat with that value, "–" clears all */}
        <span />
        <button
          type="button"
          className="stat-cell head"
          title={t.statClearAll}
          onClick={() => props.onUpdate({ stats: {} })}
        >
          –
        </button>
        {STAT_VALUES.map((v) => (
          <button
            key={v}
            type="button"
            className="stat-cell head"
            title={t.statSetAll(v)}
            onClick={() =>
              props.onUpdate({
                stats: Object.fromEntries(STAT_KEYS.map((k) => [k, v])) as Cat['stats'],
              })
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
                  className={`stat-cell ${cat.stats[k] == null ? 'on' : ''}`}
                  onClick={() => {
                    const stats = { ...cat.stats };
                    delete stats[k];
                    props.onUpdate({ stats });
                  }}
                >
                  –
                </button>
                {STAT_VALUES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={`stat-cell ${cat.stats[k] === v ? 'on' : ''}`}
                    onClick={() => props.onUpdate({ stats: { ...cat.stats, [k]: v } })}
                  >
                    {v}
                  </button>
                ))}
              </Fragment>
            ))}
          </Fragment>
        ))}
      </div>
      <MutationEditor
        mutations={cat.mutations}
        mother={props.mother}
        father={props.father}
        onChange={(mutations) => props.onUpdate({ mutations })}
      />
      <textarea
        placeholder={t.notesPlaceholder}
        value={cat.notes ?? ''}
        onChange={(e) => props.onUpdate({ notes: e.target.value })}
      />
      <button onClick={props.onAssignParents}>{t.assignParentsBtn}</button>
      <button onClick={props.onPedigree}>
        {props.pedigreeActive ? t.fullTreeBtn : t.pedigreeBtn}
      </button>
      <button onClick={props.onMates}>{props.mateActive ? t.hideMates : t.showMates}</button>
      <button onClick={() => props.onUpdate({ gone: !cat.gone })}>
        {cat.gone ? t.returnHomeBtn : t.leftHomeBtn}
      </button>
      <button className="danger" onClick={props.onDelete}>
        {t.deleteBtn}
      </button>
    </div>
  );
}

function AssignParentsPanel(props: {
  child: Cat;
  motherName: string | null;
  fatherName: string | null;
  onClearMother: () => void;
  onClearFather: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="panel">
      <h3>{t.assignTitle(props.child.name)}</h3>
      <div className="meta">{t.assignDesc}</div>
      <div className="parent-slot">
        <span>
          {t.motherSlot} <b>{props.motherName ?? '—'}</b>
        </span>
        {props.motherName && (
          <button className="small" onClick={props.onClearMother}>
            ✕
          </button>
        )}
      </div>
      <div className="parent-slot">
        <span>
          {t.fatherSlot} <b>{props.fatherName ?? '—'}</b>
        </span>
        {props.fatherName && (
          <button className="small" onClick={props.onClearFather}>
            ✕
          </button>
        )}
      </div>
      <button className="accent" onClick={props.onDone}>
        {t.done}
      </button>
    </div>
  );
}

function SearchBox({ cats, onPick }: { cats: Cat[]; onPick: (id: string) => void }) {
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

type MateSort = 'coi' | 'name' | 'stats';

/** Floating list of the mate-mode candidates with their offspring COI. */
function MatePanel(props: {
  source: Cat;
  mates: { cat: Cat; coi: number }[];
  pickedIds: string[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [sort, setSort] = useState<MateSort>('coi');
  const sorted = useMemo(() => {
    const byName = (a: { cat: Cat }, b: { cat: Cat }) => a.cat.name.localeCompare(b.cat.name);
    const list = [...props.mates];
    if (sort === 'name') list.sort(byName);
    else if (sort === 'stats')
      list.sort((a, b) => statSum(b.cat) - statSum(a.cat) || a.coi - b.coi || byName(a, b));
    else list.sort((a, b) => a.coi - b.coi || byName(a, b));
    return list;
  }, [props.mates, sort]);
  const sorts: { key: MateSort; label: string }[] = [
    { key: 'coi', label: 'COI' },
    { key: 'name', label: t.mateSortName },
    { key: 'stats', label: t.mateSortStats },
  ];
  return (
    <div className="panel mate-panel">
      <div className="hint-head">
        <b>{t.matePanelTitle(props.source.name)}</b>
        <button className="small" title={t.collapseTitle} onClick={props.onClose}>
          ✕
        </button>
      </div>
      <div className="row">
        {sorts.map((s) => (
          <button
            key={s.key}
            className={`small${sort === s.key ? ' accent' : ''}`}
            onClick={() => setSort(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>
      {sorted.length === 0 ? (
        <div className="meta">{t.mateEmpty}</div>
      ) : (
        <div className="mate-list">
          {sorted.map(({ cat, coi }) => (
            <button
              key={cat.id}
              className={`mate-row${props.pickedIds.includes(cat.id) ? ' picked' : ''}`}
              onClick={() => props.onPick(cat.id)}
            >
              <span className="mate-sex">{SEX_GLYPH[cat.sex]}</span>
              <span className="mate-name">{cat.name}</span>
              {statSum(cat) > 0 && (
                <span className="mate-sum" title={t.mateStatsTitle}>
                  Σ{statSum(cat)}
                </span>
              )}
              <span className={`coi-inline ${coiTier(coi)}`}>{formatCOI(coi)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="meta">{t.mateLegend}</div>
    </div>
  );
}

/** A mutation highlighted via the inventory panel: the id under a specific slot. */
type MutFocus = { slot: MutationSlot; id: string };

/** Floating inventory of the mutations carried by the cats now in the house,
 * grouped by body-part slot; clicking a row highlights its carriers on the map. */
function MutationPanel(props: {
  rows: HouseMutation[];
  focus: MutFocus | null;
  onFocus: (focus: MutFocus | null) => void;
  onPickCat: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  // consecutive rows share the slot (houseMutations returns them in slot order)
  const groups = useMemo(() => {
    const gs: { slot: MutationSlot; rows: HouseMutation[] }[] = [];
    for (const row of props.rows) {
      const last = gs[gs.length - 1];
      if (last && last.slot === row.slot) last.rows.push(row);
      else gs.push({ slot: row.slot, rows: [row] });
    }
    return gs;
  }, [props.rows]);
  return (
    <div className="panel mate-panel">
      <div className="hint-head">
        <b>{t.mutPanelTitle}</b>
        <button className="small" title={t.collapseTitle} onClick={props.onClose}>
          ✕
        </button>
      </div>
      {groups.length === 0 ? (
        <div className="meta">{t.mutPanelEmpty}</div>
      ) : (
        <div className="mate-list">
          {groups.map((g) => (
            <Fragment key={g.slot}>
              <div className="mut-group">{t.mutationSlots[g.slot]}</div>
              {g.rows.map((row) => {
                const active = props.focus?.slot === row.slot && props.focus.id === row.id;
                const named = getNamed(row.id);
                return (
                  <Fragment key={row.id}>
                    <button
                      className={`mate-row${active ? ' picked' : ''}`}
                      title={named?.desc || undefined}
                      onClick={() =>
                        props.onFocus(active ? null : { slot: row.slot, id: row.id })
                      }
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
                            onClick={() => props.onPickCat(c.id)}
                          >
                            {SEX_GLYPH[c.sex]} {c.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </Fragment>
          ))}
        </div>
      )}
      <div className="meta">{t.mutPanelHint}</div>
    </div>
  );
}

/** Floating roll-call checklist: walk the in-game roster and tick every cat
 * found here; "Finish" reviews the unticked ones and marks them as left home. */
function RollCallPanel(props: {
  cats: Cat[]; // cats still at home, alphabetical
  checked: Set<string>;
  onToggle: (id: string) => void;
  onFinish: (goneIds: string[]) => void;
  onCancel: () => void;
  onHide: () => void;
}) {
  const { t } = useI18n();
  const [reviewing, setReviewing] = useState(false);
  // review step: unticked cats the user opts to keep at home anyway
  const [keep, setKeep] = useState<Set<string>>(() => new Set());
  const done = props.cats.filter((c) => props.checked.has(c.id)).length;
  const missing = props.cats.filter((c) => !props.checked.has(c.id));
  const toggleKeep = (id: string) =>
    setKeep((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const hideBtn = (
    <button className="small" title={t.collapseTitle} onClick={props.onHide}>
      ✕
    </button>
  );
  if (reviewing) {
    const goneIds = missing.filter((c) => !keep.has(c.id)).map((c) => c.id);
    return (
      <div className="panel mate-panel">
        <div className="hint-head">
          <b>{t.rollReviewTitle}</b>
          {hideBtn}
        </div>
        {missing.length === 0 ? (
          <>
            <div className="meta">{t.rollAllHome}</div>
            <button className="accent" onClick={() => props.onFinish([])}>
              {t.done}
            </button>
          </>
        ) : (
          <>
            <div className="meta">{t.rollReviewDesc}</div>
            <div className="mate-list">
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
            <div className="row">
              <button className="accent" onClick={() => props.onFinish(goneIds)}>
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
    <div className="panel mate-panel">
      <div className="hint-head">
        <b>{t.rollPanelTitle}</b>
        {hideBtn}
      </div>
      <div className="meta">{t.rollProgress(done, props.cats.length)}</div>
      <div className="mate-list">
        {props.cats.map((c) => {
          const on = props.checked.has(c.id);
          return (
            <button
              key={c.id}
              className={`mate-row${on ? ' roll-done' : ''}`}
              onClick={() => props.onToggle(c.id)}
            >
              <span className={`roll-box${on ? ' on' : ''}`}>{on ? '✓' : ''}</span>
              <span className="mate-sex">{SEX_GLYPH[c.sex]}</span>
              <span className="mate-name">{c.name}</span>
            </button>
          );
        })}
      </div>
      <div className="row">
        <button
          className="accent"
          onClick={() => {
            setKeep(new Set());
            setReviewing(true);
          }}
        >
          {t.rollFinish}
        </button>
        <button onClick={props.onCancel}>{t.cancel}</button>
      </div>
      <div className="meta">{t.rollHint}</div>
    </div>
  );
}

function GenealogyApp() {
  const { t, lang, setLang } = useI18n();
  const [cats, setCats] = useState<Cat[]>(loadCats);
  const [selection, setSelection] = useState<string[]>([]);
  const [viewRootId, setViewRootId] = useState<string | null>(null);
  const [mateModeFor, setMateModeFor] = useState<string | null>(null);
  const [assigningFor, setAssigningFor] = useState<string | null>(null);
  const [mutsOpen, setMutsOpen] = useState(false);
  const [mutFocus, setMutFocus] = useState<MutFocus | null>(null);
  // roll call: the ticked ids (null — no session) + whether its panel is shown.
  // The session survives hiding the panel and page reloads (localStorage).
  const [rollChecked, setRollChecked] = useState<Set<string> | null>(loadRollcall);
  const [rollOpen, setRollOpen] = useState(() => localStorage.getItem(ROLLCALL_KEY) !== null);
  const [addingFounder, setAddingFounder] = useState(false);
  const [helpOpen, setHelpOpen] = useState(() => localStorage.getItem(HELP_KEY) !== 'closed');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const [graph, setGraph] = useState<{ nodes: LaidOutNode[]; edges: Edge[] }>({
    nodes: [],
    edges: [],
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const { fitView, setCenter, getViewport } = useReactFlow();

  useEffect(() => {
    if (!settingsOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!settingsRef.current?.contains(e.target as globalThis.Node)) setSettingsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSettingsOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [settingsOpen]);

  useEffect(() => {
    localStorage.setItem(HELP_KEY, helpOpen ? 'open' : 'closed');
  }, [helpOpen]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cats));
  }, [cats]);

  useEffect(() => {
    if (rollChecked) localStorage.setItem(ROLLCALL_KEY, JSON.stringify([...rollChecked]));
    else localStorage.removeItem(ROLLCALL_KEY);
  }, [rollChecked]);

  const byId = useMemo(() => indexCats(cats), [cats]);
  const children = useMemo(() => childrenIndex(cats), [cats]);

  const visibleCats = useMemo(() => {
    if (!viewRootId || !byId.has(viewRootId)) return cats;
    const ids = pedigreeIds(viewRootId, cats);
    return cats.filter((c) => ids.has(c.id));
  }, [cats, viewRootId, byId]);

  // Re-run the layout only when the structure changes (set of cats and links),
  // not on every keystroke while renaming — otherwise the tree jitters.
  const structureKey = useMemo(
    () =>
      visibleCats
        .map((c) => `${c.id}:${c.motherId ?? ''}:${c.fatherId ?? ''}`)
        .sort()
        .join(';'),
    [visibleCats],
  );
  const visibleRef = useRef(visibleCats);
  visibleRef.current = visibleCats;
  useEffect(() => {
    let cancelled = false;
    layoutCats(visibleRef.current).then((result) => {
      if (!cancelled) setGraph(result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureKey]);

  // Auto-fit the view only when the STRUCTURE changes (set of visible cats),
  // and not while navigating to a cat found via search (that takes priority).
  const lastFitKey = useRef('');
  const focusPendingRef = useRef(false);
  useEffect(() => {
    if (graph.nodes.length === 0) return;
    if (lastFitKey.current === structureKey) return;
    lastFitKey.current = structureKey;
    if (focusPendingRef.current) {
      focusPendingRef.current = false;
      return;
    }
    const t = setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 60);
    return () => clearTimeout(t);
  }, [graph, structureKey, fitView]);

  // Center on the found cat once its node shows up in the layout.
  useEffect(() => {
    if (!pendingFocus) return;
    const node = graph.nodes.find((n) => n.id === pendingFocus);
    if (node) {
      setCenter(node.x + CAT_W / 2, node.y + CAT_H / 2, { zoom: 1.1, duration: 400 });
      setPendingFocus(null);
      focusPendingRef.current = false;
    }
  }, [pendingFocus, graph.nodes, setCenter]);

  const mateCOIMap = useMemo(
    () => (mateModeFor && byId.has(mateModeFor) ? mateCOIs(mateModeFor, cats) : null),
    [mateModeFor, cats, byId],
  );

  const houseMuts = useMemo(() => houseMutations(cats), [cats]);
  // active highlight only while the panel is open and its row still exists
  // (the last living carrier may have been edited away, deleted or marked gone)
  const mutHighlight = useMemo(() => {
    if (!mutsOpen || !mutFocus) return null;
    const exists = houseMuts.some((r) => r.slot === mutFocus.slot && r.id === mutFocus.id);
    return exists ? mutFocus : null;
  }, [mutsOpen, mutFocus, houseMuts]);

  const closeMutPanel = () => {
    setMutsOpen(false);
    setMutFocus(null);
  };

  // roll-call checklist: cats still at home, alphabetical (like the game roster)
  const rollCats = useMemo(
    () => cats.filter((c) => !c.gone).sort((a, b) => a.name.localeCompare(b.name)),
    [cats],
  );

  /** Toolbar button: starts a session, or toggles the panel of the running one. */
  const toggleRollcall = () => {
    if (rollChecked && rollOpen) {
      setRollOpen(false);
      return;
    }
    if (!rollChecked) setRollChecked(new Set());
    setRollOpen(true);
    setMateModeFor(null); // the leftside panels are exclusive
    closeMutPanel();
  };

  const toggleRollCheck = (id: string) => {
    setRollChecked((s) => {
      if (!s) return s;
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** Ends the session, marking the confirmed leavers as gone. */
  const finishRollcall = (goneIds: string[]) => {
    if (goneIds.length > 0) {
      const gone = new Set(goneIds);
      setCats((cs) => cs.map((c) => (gone.has(c.id) ? { ...c, gone: true } : c)));
    }
    setRollChecked(null);
    setRollOpen(false);
  };

  const cancelRollcall = () => {
    if (rollChecked && rollChecked.size > 0 && !confirm(t.rollCancelConfirm)) return;
    setRollChecked(null);
    setRollOpen(false);
  };

  const mateList = useMemo(() => {
    if (!mateCOIMap) return null;
    return [...mateCOIMap]
      .map(([id, coi]) => ({ cat: byId.get(id), coi }))
      .filter((m): m is { cat: Cat; coi: number } => m.cat !== undefined);
  }, [mateCOIMap, byId]);

  const assignChild = assigningFor && byId.has(assigningFor) ? byId.get(assigningFor)! : null;
  // cats that cannot be assigned as a parent: the child itself and all its descendants (cycle otherwise)
  const assignBlockedIds = useMemo(() => {
    if (!assignChild) return null;
    const blocked = descendantIds(assignChild.id, cats);
    blocked.add(assignChild.id);
    return blocked;
  }, [assignChild, cats]);

  const rfNodes = useMemo<Node[]>(
    () =>
      graph.nodes.flatMap((n): Node[] => {
        if (n.type === 'union') {
          return [
            {
              id: n.id,
              type: 'union',
              position: { x: n.x, y: n.y },
              data: {},
              selectable: false,
            },
          ];
        }
        const cat = byId.get(n.id);
        if (!cat) return []; // the layout lags for a moment after a deletion
        return [
          {
            id: n.id,
            type: 'cat',
            position: { x: n.x, y: n.y },
            data: {
              cat,
              picked: selection.includes(n.id),
              isViewRoot: n.id === viewRootId,
              mateMode: mateCOIMap != null,
              mateSource: n.id === mateModeFor,
              coi: mateCOIMap?.get(n.id) ?? null,
              mutMode: mutHighlight != null,
              mutCarrier:
                mutHighlight != null && cat.mutations[mutHighlight.slot] === mutHighlight.id,
              assignMode: assignChild != null,
              isAssignChild: n.id === assignChild?.id,
              isAssignParent:
                assignChild != null &&
                (assignChild.motherId === n.id || assignChild.fatherId === n.id),
              assignInvalid:
                assignChild != null &&
                n.id !== assignChild.id &&
                (assignBlockedIds?.has(n.id) ?? false),
            },
          },
        ];
      }),
    [
      graph.nodes,
      byId,
      selection,
      mateCOIMap,
      mateModeFor,
      mutHighlight,
      viewRootId,
      assignChild,
      assignBlockedIds,
    ],
  );

  // Edges of the selected cats going up (to parents) and down (to children).
  // Via union nodes: up — parent→union→cat, down — cat→union→child.
  const { parentEdges, childEdges } = useMemo(() => {
    const parents = new Set<string>();
    const children = new Set<string>();
    if (selection.length === 0) return { parentEdges: parents, childEdges: children };
    const sel = new Set(selection);
    const parentUnions = new Set<string>();
    const childUnions = new Set<string>();
    for (const e of graph.edges) {
      if (sel.has(e.target)) {
        parents.add(e.id); // edge enters the selected cat → leads to its parent
        if (e.source.startsWith('u|')) parentUnions.add(e.source);
      }
      if (sel.has(e.source)) {
        children.add(e.id); // edge leaves the selected cat → leads to its child
        if (e.target.startsWith('u|')) childUnions.add(e.target);
      }
    }
    for (const e of graph.edges) {
      if (parentUnions.has(e.target)) parents.add(e.id); // parent → union
      if (childUnions.has(e.source)) children.add(e.id); // union → child
    }
    return { parentEdges: parents, childEdges: children };
  }, [selection, graph.edges]);

  const rfEdges = useMemo<Edge[]>(
    () =>
      graph.edges.map((e) => {
        // parent edges win on overlap (a cat and its own child both selected)
        if (parentEdges.has(e.id)) {
          return { ...e, animated: true, zIndex: 10, style: { stroke: '#f5c451', strokeWidth: 2.5 } };
        }
        if (childEdges.has(e.id)) {
          return { ...e, animated: true, zIndex: 10, style: { stroke: '#59c0e8', strokeWidth: 2.5 } };
        }
        // regular edges — lighter and thicker than the default so the structure stays readable
        return { ...e, style: { stroke: '#665b74', strokeWidth: 2 } };
      }),
    [graph.edges, parentEdges, childEdges],
  );

  const updateCat = (id: string, patch: Partial<Cat>) => {
    setCats((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  /** Is the name taken by another cat (case/whitespace-insensitive; the exceptId cat is ignored). */
  const nameTakenBy = (name: string, exceptId?: string) => {
    const key = normName(name);
    if (!key) return false;
    return cats.some((c) => c.id !== exceptId && normName(c.name) === key);
  };

  /** In assignment mode a click on a cat makes it the child's parent. */
  const pickParent = (child: Cat, candidate: Cat) => {
    if (candidate.id === child.id || (assignBlockedIds?.has(candidate.id) ?? false)) return;
    // female → mother, male → father, '?' → a free slot (otherwise replace the mother).
    // When the sex-preferred slot already holds a compatible mate (a '?' cat) and
    // the other slot is free, overflow there instead of replacing — so assigning
    // e.g. '?' then F keeps both parents (slots are cosmetic anyway).
    // An incompatible occupant keeps the old meaning: replace the parent.
    let patch: Partial<Cat>;
    const overflow = (takenId: string | null, otherFree: boolean) => {
      const taken = takenId ? byId.get(takenId) : undefined;
      return otherFree && taken && taken.id !== candidate.id && canMate(taken, candidate);
    };
    if (candidate.sex === 'M')
      patch = overflow(child.fatherId, !child.motherId)
        ? { motherId: candidate.id }
        : { fatherId: candidate.id };
    else if (candidate.sex === 'F')
      patch = overflow(child.motherId, !child.fatherId)
        ? { fatherId: candidate.id }
        : { motherId: candidate.id };
    else if (!child.motherId) patch = { motherId: candidate.id };
    else if (!child.fatherId) patch = { fatherId: candidate.id };
    else patch = { motherId: candidate.id };
    const nextMother = patch.motherId !== undefined ? patch.motherId : child.motherId;
    const nextFather = patch.fatherId !== undefined ? patch.fatherId : child.fatherId;
    if (nextMother && nextMother === nextFather) return; // one cat cannot be both parents
    updateCat(child.id, patch);
  };

  /**
   * Picking a cat in search: works like clicking it on the map (adds to the
   * selection up to two cats — so a litter pair can be assembled entirely via
   * search; in parent-assignment mode assigns the parent), plus centers the
   * camera. Unlike a click, it does not deselect an already selected cat.
   */
  const focusCat = (id: string) => {
    const cat = byId.get(id);
    if (!cat) return;
    setAddingFounder(false);
    setViewRootId(null); // full tree — the cat is guaranteed to be visible
    if (assignChild) {
      pickParent(assignChild, cat);
    } else {
      setSelection((sel) => (sel.includes(id) ? sel : [...sel, id].slice(-2)));
    }
    focusPendingRef.current = true;
    setPendingFocus(id);
  };

  /**
   * Picking a candidate in the mate list: unlike a map click, the source cat
   * always stays in the pair — the click swaps only the partner. Also centers
   * the camera and drops the pedigree view (the candidate may be outside it).
   */
  const pickMate = (id: string) => {
    if (!mateModeFor) return;
    setViewRootId(null);
    setSelection([mateModeFor, id]);
    focusPendingRef.current = true;
    setPendingFocus(id);
  };

  /**
   * Picking a carrier in the mutation panel: select just that cat and center
   * the camera; drops the pedigree view (the carrier may be outside it).
   */
  const pickCarrier = (id: string) => {
    setViewRootId(null);
    setSelection([id]);
    focusPendingRef.current = true;
    setPendingFocus(id);
  };

  const onNodeClick: NodeMouseHandler = (_, node) => {
    if (node.type !== 'cat') return;
    const cat = byId.get(node.id);
    if (!cat) return;
    if (assignChild) {
      pickParent(assignChild, cat);
      return;
    }
    setAddingFounder(false);
    setSelection((sel) =>
      sel.includes(node.id) ? sel.filter((id) => id !== node.id) : [...sel, node.id].slice(-2),
    );
  };

  const onPaneClick = () => {
    if (assigningFor) return; // assignment mode is only exited via the "Done" button
    setSelection([]);
    setMateModeFor(null);
    setAddingFounder(false);
  };

  const startAssignParents = (childId: string) => {
    setAssigningFor(childId);
    setSelection([]);
    setMateModeFor(null);
    closeMutPanel();
    setRollOpen(false);
    setViewRootId(null); // full tree — so all candidates are visible, including new ones
    setAddingFounder(false);
  };

  const finishAssignParents = () => {
    const id = assigningFor;
    setAssigningFor(null);
    if (id && byId.has(id)) setSelection([id]);
  };

  const deleteCat = (id: string) => {
    if ((children.get(id)?.length ?? 0) > 0) {
      alert(t.deleteHasChildren);
      return;
    }
    const cat = byId.get(id);
    if (!cat || !confirm(t.deleteConfirm(cat.name))) return;
    setCats((cs) => cs.filter((c) => c.id !== id));
    setSelection((sel) => sel.filter((s) => s !== id));
    if (viewRootId === id) setViewRootId(null);
    if (mateModeFor === id) setMateModeFor(null);
  };

  const createLitter = (mother: Cat, father: Cat, kittens: KittenDraft[]) => {
    setCats((cs) => [
      ...cs,
      ...kittens.map((k) =>
        makeCat(k.name, k.sex, mother.id, father.id, null, null, k.orientation, k.mutations),
      ),
    ]);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(cats, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mewgenics-genealogy.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    file.text().then((text) => {
      try {
        const data: unknown = JSON.parse(text);
        if (
          !Array.isArray(data) ||
          !data.every(
            (c) =>
              c &&
              typeof c.id === 'string' &&
              typeof c.name === 'string' &&
              (c.sex === 'F' || c.sex === 'M' || c.sex === '?'),
          )
        ) {
          throw new Error('bad format');
        }
        if (!confirm(t.importConfirm(cats.length, data.length))) {
          return;
        }
        setCats(
          (data as Partial<Cat>[]).map((c) => ({
            id: c.id!,
            name: c.name!,
            sex: c.sex!,
            orientation: normOrientation(c.orientation),
            motherId: c.motherId ?? null,
            fatherId: c.fatherId ?? null,
            room: c.room ?? null,
            class: c.class ?? null,
            gone: c.gone ?? false,
            notes: c.notes ?? '',
            stats: c.stats ?? {},
            mutations: normMutations(c.mutations),
          })),
        );
        setSelection([]);
        setViewRootId(null);
        setMateModeFor(null);
        setAssigningFor(null);
        closeMutPanel();
        setRollChecked(null); // the ids in the ticks belong to the replaced cats
        setRollOpen(false);
      } catch {
        alert(t.importError);
      }
    });
  };

  const resetAll = () => {
    if (!confirm(t.resetConfirm)) return;
    setCats([]);
    setSelection([]);
    setViewRootId(null);
    setMateModeFor(null);
    setAssigningFor(null);
    closeMutPanel();
    setRollChecked(null);
    setRollOpen(false);
  };

  const selectedCats = selection
    .map((id) => byId.get(id))
    .filter((c): c is Cat => c !== undefined);
  const single = selectedCats.length === 1 ? selectedCats[0] : null;
  const pair =
    selectedCats.length === 2 ? assignParents(selectedCats[0], selectedCats[1]) : null;

  return (
    <div className="app">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnDoubleClick={false}
        minZoom={0.05}
        colorMode="dark"
        fitView
      >
        <Background gap={26} bgColor="#1e1822" color="#352b41" />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          onClick={(_, position) =>
            // jump to the clicked spot keeping the current zoom (setCenter
            // defaults to maxZoom otherwise); d3-zoom suppresses the click
            // after an actual drag, so this does not misfire on drag-pans
            setCenter(position.x, position.y, { zoom: getViewport().zoom, duration: 300 })
          }
          bgColor="#251e2f"
          maskColor="rgba(16, 12, 21, 0.65)"
          nodeColor={(n) => {
            if (n.type !== 'cat') return '#4d4260';
            const cls = (n.data as { cat?: Cat }).cat?.class;
            return cls ? (CLASS_COLOR[cls] ?? '#4d4260') : '#4d4260';
          }}
        />
      </ReactFlow>

      <div className="leftside">
        <div className="toolbar">
          <span className="title">🐱 Mewgenics Genealogy</span>
          <SearchBox cats={cats} onPick={focusCat} />
          <button
            onClick={() => {
              setAddingFounder(true);
              setSelection([]);
            }}
          >
            {t.addCat}
          </button>
          <button
            className={mutsOpen ? 'accent' : ''}
            onClick={() => {
              if (mutsOpen) closeMutPanel();
              else {
                setMutsOpen(true);
                setMateModeFor(null); // the leftside panels are exclusive
                setRollOpen(false);
              }
            }}
          >
            {t.mutPanelBtn}
          </button>
          <button className={rollChecked ? 'accent' : ''} onClick={toggleRollcall}>
            {t.rollBtn}
          </button>
          {/* stays outside the menu so it survives the menu unmounting while the file dialog is open */}
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={importJson} />
          <span className="count">{t.catCount(cats.length)}</span>
          {viewRootId && byId.has(viewRootId) && (
            <button className="accent" onClick={() => setViewRootId(null)}>
              {t.backToFullTree(byId.get(viewRootId)!.name)}
            </button>
          )}
          {assignChild && (
            <span className="badge assign-badge">{t.assignBadge(assignChild.name)}</span>
          )}
        </div>
        {mateModeFor && byId.has(mateModeFor) && mateList && (
          <MatePanel
            source={byId.get(mateModeFor)!}
            mates={mateList}
            pickedIds={selection}
            onPick={pickMate}
            onClose={() => setMateModeFor(null)}
          />
        )}
        {mutsOpen && (
          <MutationPanel
            rows={houseMuts}
            focus={mutFocus}
            onFocus={setMutFocus}
            onPickCat={pickCarrier}
            onClose={closeMutPanel}
          />
        )}
        {rollChecked && rollOpen && (
          <RollCallPanel
            cats={rollCats}
            checked={rollChecked}
            onToggle={toggleRollCheck}
            onFinish={finishRollcall}
            onCancel={cancelRollcall}
            onHide={() => setRollOpen(false)}
          />
        )}
      </div>

      <div className="side">
        <div className="side-tools">
          {!assignChild && !addingFounder && selectedCats.length === 0 && !helpOpen && (
            <button className="help-fab" onClick={() => setHelpOpen(true)}>
              {t.helpBtn}
            </button>
          )}
          <div className="settings-wrap" ref={settingsRef}>
            <button
              className="settings-btn"
              title={t.settingsTitle}
              aria-label={t.settingsTitle}
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen((o) => !o)}
            >
              ⚙️
            </button>
            {settingsOpen && (
              <div className="settings-menu">
                <button
                  onClick={() => {
                    setSettingsOpen(false);
                    exportJson();
                  }}
                >
                  {t.exportBtn}
                </button>
                <button
                  onClick={() => {
                    setSettingsOpen(false);
                    fileRef.current?.click();
                  }}
                >
                  {t.importBtn}
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    setSettingsOpen(false);
                    resetAll();
                  }}
                >
                  {t.resetBtn}
                </button>
                <label className="settings-lang">
                  {t.langTitle}
                  <select
                    className="lang-select"
                    value={lang}
                    onChange={(e) => setLang(e.target.value as Lang)}
                  >
                    {LANGS.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>
        </div>
        <div className="side-scroll">
          {assignChild ? (
            <AssignParentsPanel
              child={assignChild}
              motherName={assignChild.motherId ? (byId.get(assignChild.motherId)?.name ?? null) : null}
              fatherName={assignChild.fatherId ? (byId.get(assignChild.fatherId)?.name ?? null) : null}
              onClearMother={() => updateCat(assignChild.id, { motherId: null })}
              onClearFather={() => updateCat(assignChild.id, { fatherId: null })}
              onDone={finishAssignParents}
            />
          ) : addingFounder ? (
            <AddCatForm
              nameTaken={(n) => nameTakenBy(n)}
              onAdd={(name, sex, room, cls, orientation) => {
                setCats((cs) => [...cs, makeCat(name, sex, null, null, room, cls, orientation)]);
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
          ) : selectedCats.length === 2 ? (
            <div className="panel hint">{t.samePairHint}</div>
          ) : single ? (
            <CatPanel
              cat={single}
              mother={single.motherId ? (byId.get(single.motherId) ?? null) : null}
              father={single.fatherId ? (byId.get(single.fatherId) ?? null) : null}
              childrenCount={children.get(single.id)?.length ?? 0}
              inbreeding={inbreedingCoefficient(single.id, cats)}
              pedigreeActive={viewRootId === single.id}
              mateActive={mateModeFor === single.id}
              nameTaken={(n) => nameTakenBy(n, single.id)}
              onUpdate={(patch) => updateCat(single.id, patch)}
              onDelete={() => deleteCat(single.id)}
              onPedigree={() => setViewRootId(viewRootId === single.id ? null : single.id)}
              onMates={() => {
                // the leftside panels (mates/mutations/roll call) share the slot
                const next = mateModeFor === single.id ? null : single.id;
                setMateModeFor(next);
                if (next) {
                  closeMutPanel();
                  setRollOpen(false);
                }
              }}
              onAssignParents={() => startAssignParents(single.id)}
            />
          ) : helpOpen ? (
            <div className="panel hint">
              <div className="hint-head">
                <b>{t.helpTitle}</b>
                <button className="small" title={t.collapseTitle} onClick={() => setHelpOpen(false)}>
                  ✕
                </button>
              </div>
              {t.helpLines.map((line, i) => (
                <span key={i}>
                  {i > 0 && <br />}
                  {line}
                </span>
              ))}
              <br />
              {t.edgesLabel} <span className="edge-key parent">{t.edgeYellow}</span> —{' '}
              {t.edgeToParents}, <span className="edge-key child">{t.edgeBlue}</span> —{' '}
              {t.edgeToChildren}.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <ReactFlowProvider>
        <GenealogyApp />
      </ReactFlowProvider>
    </I18nProvider>
  );
}
