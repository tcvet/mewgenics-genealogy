import { useState } from 'react';
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
import { emptyKitten, type KittenDraft } from './store';
import {
  ClassSelect,
  OrientationCycle,
  OrientationToggle,
  RoomToggle,
  SexToggle,
  StatsMatrix,
} from './controls';
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
  onCreate: (kitten: KittenDraft) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<KittenDraft>(emptyKitten());
  const patch = (p: Partial<KittenDraft>) => setDraft((d) => ({ ...d, ...p }));
  const dup = draft.name.trim() !== '' && nameTaken(draft.name);
  const submit = () => {
    if (!draft.name.trim() || dup) return;
    onCreate(draft);
    setDraft(emptyKitten());
  };
  const tier = coiTier(coi);
  // parents' mutations the kitten can inherit; one entry per (slot, id),
  // a mutation both parents share becomes a single ♀♂ chip
  const heritable = MUTATION_SLOTS.flatMap((slot) => {
    const m = mother.mutations[slot];
    const f = father.mutations[slot];
    const chips: { slot: MutationSlot; id: string; glyphs: string }[] = [];
    if (m) chips.push({ slot, id: m, glyphs: f === m ? '♀♂' : '♀' });
    if (f && f !== m) chips.push({ slot, id: f, glyphs: '♂' });
    return chips;
  });
  const toggleMut = (slot: MutationSlot, id: string) => {
    const next = { ...draft.mutations };
    if (next[slot] === id) delete next[slot];
    else next[slot] = id;
    patch({ mutations: next });
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
      <div className="row">
        <SexToggle value={draft.sex} onChange={(sex) => patch({ sex })} />
        <OrientationCycle
          value={draft.orientation}
          onChange={(orientation) => patch({ orientation })}
        />
        <input
          type="text"
          className={dup ? 'dup' : ''}
          placeholder={t.kittenPlaceholder}
          value={draft.name}
          autoFocus
          onChange={(e) => patch({ name: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </div>
      {dup && <div className="warn">{t.nameExists(draft.name.trim())}</div>}
      {heritable.length > 0 && (
        <>
          <div className="meta">{t.litterMutHint}</div>
          <div className="kitten-muts">
            {heritable.map((h) => (
              <button
                key={`${h.slot}|${h.id}`}
                type="button"
                className={`mut-inherit${draft.mutations[h.slot] === h.id ? ' on' : ''}`}
                title={`${t.mutationSlots[h.slot]}: ${mutationLabel(h.id)}`}
                onClick={() => toggleMut(h.slot, h.id)}
              >
                {h.glyphs} {mutationLabel(h.id)}
              </button>
            ))}
          </div>
        </>
      )}
      <StatsMatrix stats={draft.stats} onChange={(stats) => patch({ stats })} />
      <div className="row">
        <button className="accent" disabled={!draft.name.trim() || dup} onClick={submit}>
          {t.create}
        </button>
      </div>
      <div className="meta">{t.litterEnterHint}</div>
    </div>
  );
}
