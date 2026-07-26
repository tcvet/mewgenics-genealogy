import { Fragment, useState } from 'react';
import {
  MUTATION_SLOTS,
  STAT_GROUPS,
  STAT_KEYS,
  STAT_VALUES,
  type Cat,
  type MutationSlot,
  type StatKey,
} from './types';
import { commonId, getCommon, getNamed, mutationLabel, NAMED_BY_SLOT, otherStat } from './mutations';
import { coiTier, formatCOI } from './genealogy';
import { ClassSelect, OrientationToggle, RoomToggle, SexToggle } from './controls';
import { useI18n } from './i18n';

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
export function MutationEditor({
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

export function CatPanel(props: {
  cat: Cat;
  mother: Cat | null;
  father: Cat | null;
  childrenCount: number;
  inbreeding: number;
  pedigreeActive?: boolean;
  mateActive?: boolean;
  nameTaken: (name: string) => boolean;
  onUpdate: (patch: Partial<Cat>) => void;
  onDelete: () => void;
  /** tree-screen actions; each button renders only when its handler is given */
  onPedigree?: () => void;
  onMates?: () => void;
  onAssignParents?: () => void;
  /** overview: jump to the tree centered on this cat */
  onShowInTree?: () => void;
  /** overview: parent names become links that open that cat */
  onOpenCat?: (id: string) => void;
}) {
  const { t } = useI18n();
  const { cat } = props;
  const dupName = cat.name.trim() !== '' && props.nameTaken(cat.name);
  const parentName = (p: Cat | null) =>
    p && props.onOpenCat ? (
      <button type="button" className="link-btn" onClick={() => props.onOpenCat!(p.id)}>
        {p.name}
      </button>
    ) : (
      (p?.name ?? '—')
    );
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
        {t.parents}: {parentName(props.mother)} × {parentName(props.father)}
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
      {props.onAssignParents && (
        <button onClick={props.onAssignParents}>{t.assignParentsBtn}</button>
      )}
      {props.onPedigree && (
        <button onClick={props.onPedigree}>
          {props.pedigreeActive ? t.fullTreeBtn : t.pedigreeBtn}
        </button>
      )}
      {props.onMates && (
        <button onClick={props.onMates}>{props.mateActive ? t.hideMates : t.showMates}</button>
      )}
      {props.onShowInTree && <button onClick={props.onShowInTree}>{t.showInTreeBtn}</button>}
      <button onClick={() => props.onUpdate({ gone: !cat.gone })}>
        {cat.gone ? t.returnHomeBtn : t.leftHomeBtn}
      </button>
      <button className="danger" onClick={props.onDelete}>
        {t.deleteBtn}
      </button>
    </div>
  );
}
