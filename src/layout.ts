import ELK from 'elkjs/lib/elk.bundled.js';
import type { Edge } from '@xyflow/react';
import type { Cat } from './types';

const elk = new ELK();

export const CAT_W = 170;
export const CAT_H = 54;
const UNION_SIZE = 12;

export interface LaidOutNode {
  id: string;
  type: 'cat' | 'union';
  x: number;
  y: number;
}

/**
 * Pedigree layout. Every parent pair gets a "union node" (the heart):
 * mother → union ← father, union → each kitten of the litter.
 * This keeps edges from turning into a web on large litters, and inbreeding
 * (shared ancestors) is displayed correctly — it is a DAG, not a tree.
 */
export async function layoutCats(
  cats: Cat[],
): Promise<{ nodes: LaidOutNode[]; edges: Edge[] }> {
  const present = new Set(cats.map((c) => c.id));
  const elkNodes: { id: string; width: number; height: number }[] = cats.map(
    (c) => ({ id: c.id, width: CAT_W, height: CAT_H }),
  );
  const elkEdges: { id: string; sources: string[]; targets: string[] }[] = [];
  const unions = new Set<string>();

  for (const cat of cats) {
    const m = cat.motherId && present.has(cat.motherId) ? cat.motherId : null;
    const f = cat.fatherId && present.has(cat.fatherId) ? cat.fatherId : null;
    if (m && f) {
      const unionId = `u|${m}|${f}`;
      if (!unions.has(unionId)) {
        unions.add(unionId);
        elkNodes.push({ id: unionId, width: UNION_SIZE, height: UNION_SIZE });
        elkEdges.push({ id: `e|${m}|${unionId}`, sources: [m], targets: [unionId] });
        elkEdges.push({ id: `e|${f}|${unionId}`, sources: [f], targets: [unionId] });
      }
      elkEdges.push({ id: `e|${unionId}|${cat.id}`, sources: [unionId], targets: [cat.id] });
    } else if (m || f) {
      const p = (m ?? f)!;
      elkEdges.push({ id: `e|${p}|${cat.id}`, sources: [p], targets: [cat.id] });
    }
  }

  const graph = await elk.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.layered.spacing.nodeNodeBetweenLayers': '56',
      'elk.spacing.nodeNode': '28',
      'elk.layered.spacing.edgeNodeBetweenLayers': '20',
    },
    children: elkNodes,
    edges: elkEdges,
  });

  const nodes: LaidOutNode[] = (graph.children ?? []).map((child) => ({
    id: child.id,
    type: child.id.startsWith('u|') ? 'union' : 'cat',
    x: child.x ?? 0,
    y: child.y ?? 0,
  }));

  const edges: Edge[] = elkEdges.map((e) => ({
    id: e.id,
    source: e.sources[0],
    target: e.targets[0],
    type: 'smoothstep',
  }));

  return { nodes, edges };
}
