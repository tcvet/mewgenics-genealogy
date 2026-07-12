import { Handle, Position, type NodeProps } from '@xyflow/react';
import { coiTier, formatCOI } from './genealogy';
import { useI18n } from './i18n';
import { CLASS_COLOR, ROOM_SHORT, SEX_GLYPH, textColorOn, type Cat } from './types';

const SEX_CLASS: Record<Cat['sex'], string> = { F: 'female', M: 'male', '?': 'any' };

export interface CatNodeData {
  cat: Cat;
  picked: boolean;
  isViewRoot: boolean;
  /** mate-highlighting mode is active */
  mateMode: boolean;
  /** the cat we are finding mates for */
  mateSource: boolean;
  /** COI of future offspring with the selected cat; null — not a candidate (same sex / itself) */
  coi: number | null;
  /** parent-assignment mode is active */
  assignMode: boolean;
  /** the cat whose parents are being assigned */
  isAssignChild: boolean;
  /** already assigned as the child's mother or father */
  isAssignParent: boolean;
  /** cannot be picked as a parent (the cat itself or its descendant — would create a cycle) */
  assignInvalid: boolean;
}

export function CatNode({ data }: NodeProps) {
  const { t } = useI18n();
  const d = data as unknown as CatNodeData;
  const { cat } = d;
  const cls = ['cat-node'];
  if (cat.gone) cls.push('gone');
  if (d.picked) cls.push('picked');
  if (d.isViewRoot) cls.push('view-root');
  if (d.mateSource) cls.push('mate-source');
  if (d.mateMode && !d.mateSource) {
    if (d.coi === null) cls.push('dimmed');
    else cls.push('candidate', coiTier(d.coi));
  }
  if (d.assignMode) {
    if (d.isAssignChild) cls.push('assign-child');
    else if (d.isAssignParent) cls.push('assign-parent');
    else if (d.assignInvalid) cls.push('dimmed');
  }
  // card fill comes from the cat's class color
  const fill = cat.class ? CLASS_COLOR[cat.class] : undefined;
  const style = fill ? { background: fill, color: textColorOn(fill) } : undefined;
  return (
    <div className={cls.join(' ')} style={style}>
      <Handle type="target" position={Position.Top} className="handle" isConnectable={false} />
      <span className={`sex-chip ${SEX_CLASS[cat.sex]}`}>{SEX_GLYPH[cat.sex]}</span>
      <span className="name" title={cat.name}>
        {cat.name}
      </span>
      {cat.room && (
        <span className="room-chip" title={t.rooms[cat.room]}>
          {ROOM_SHORT[cat.room]}
        </span>
      )}
      {d.mateMode && !d.mateSource && d.coi !== null && (
        <span className={`coi-badge ${coiTier(d.coi)}`}>{formatCOI(d.coi)}</span>
      )}
      <Handle type="source" position={Position.Bottom} className="handle" isConnectable={false} />
    </div>
  );
}

export function UnionNode() {
  return (
    <div className="union-node">
      <Handle type="target" position={Position.Top} className="handle" isConnectable={false} />
      ♥
      <Handle type="source" position={Position.Bottom} className="handle" isConnectable={false} />
    </div>
  );
}
