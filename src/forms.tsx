import { Fragment, useState } from 'react';
import {
  MUTATION_SLOTS,
  SEX_GLYPH,
  type Cat,
  type ClassKey,
  type MutationSlot,
  type Orientation,
  type RoomId,
  type Sex,
} from './types';
import { mutationLabel } from './mutations';
import { coiTier, formatCOI } from './genealogy';
import { emptyKitten, normName, type KittenDraft } from './store';
import { ClassSelect, OrientationCycle, OrientationToggle, RoomToggle, SexToggle } from './controls';
import { useI18n } from './i18n';

export function AddCatForm({
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

export function LitterPanel({
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
