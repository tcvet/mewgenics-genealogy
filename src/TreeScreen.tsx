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
import { canMate, CLASS_COLOR, SEX_GLYPH, type Cat, type MutationSlot } from './types';
import { getNamed, houseMutations, mutationLabel, type HouseMutation } from './mutations';
import {
  descendantIds,
  inbreedingCoefficient,
  mateCOIs,
  pairCOI,
  pedigreeIds,
} from './genealogy';
import { CAT_H, CAT_W, layoutCats, type LaidOutNode } from './layout';
import { CatNode, UnionNode } from './CatNode';
import { LANGS, useI18n, type Lang } from './i18n';
import { assignParents, type CatsStore } from './store';
import { SearchBox } from './controls';
import { MateList, type MateEntry } from './MateList';
import { CatPanel } from './CatPanel';
import { AddCatForm, LitterPanel } from './forms';

const HELP_KEY = 'mewgenics-help';
const nodeTypes = { cat: CatNode, union: UnionNode };

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

/** Floating list of the mate-mode candidates with their offspring COI. */
function MatePanel(props: {
  source: Cat;
  mates: MateEntry[];
  pickedIds: string[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="panel mate-panel">
      <div className="hint-head">
        <b>{t.matePanelTitle(props.source.name)}</b>
        <button className="small" title={t.collapseTitle} onClick={props.onClose}>
          ✕
        </button>
      </div>
      <MateList mates={props.mates} pickedIds={props.pickedIds} onPick={props.onPick} />
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

function TreeView({
  store,
  focusId,
  onFocusDone,
}: {
  store: CatsStore;
  focusId: string | null;
  onFocusDone: () => void;
}) {
  const { t, lang, setLang } = useI18n();
  const {
    cats,
    byId,
    children,
    updateCat,
    nameTakenBy,
    addFounder,
    createLitter,
    removeCat,
    importCats,
  } = store;
  const [selection, setSelection] = useState<string[]>([]);
  const [viewRootId, setViewRootId] = useState<string | null>(null);
  const [mateModeFor, setMateModeFor] = useState<string | null>(null);
  const [assigningFor, setAssigningFor] = useState<string | null>(null);
  const [mutsOpen, setMutsOpen] = useState(false);
  const [mutFocus, setMutFocus] = useState<MutFocus | null>(null);
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

  // Arriving from another screen ("show in the tree"): select the cat, center
  // on it, and drop any mode that would hijack the next clicks.
  useEffect(() => {
    if (!focusId) return;
    setAssigningFor(null);
    pickCarrier(focusId);
    onFocusDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

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
    removeCat(id);
    setSelection((sel) => sel.filter((s) => s !== id));
    if (viewRootId === id) setViewRootId(null);
    if (mateModeFor === id) setMateModeFor(null);
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
        importCats(data as Partial<Cat>[]);
        setSelection([]);
        setViewRootId(null);
        setMateModeFor(null);
        setAssigningFor(null);
        closeMutPanel();
      } catch {
        alert(t.importError);
      }
    });
  };

  const resetAll = () => {
    if (!confirm(t.resetConfirm)) return;
    store.resetAll();
    setSelection([]);
    setViewRootId(null);
    setMateModeFor(null);
    setAssigningFor(null);
    closeMutPanel();
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
              }
            }}
          >
            {t.mutPanelBtn}
          </button>
          {/* stays outside the menu so it survives the menu unmounting while the file dialog is open */}
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={importJson} />
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
                addFounder(name, sex, room, cls, orientation);
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

/** The genealogy-map screen: the interactive family tree plus its side panels. */
export function TreeScreen({
  store,
  focusId,
  onFocusDone,
}: {
  store: CatsStore;
  focusId: string | null;
  onFocusDone: () => void;
}) {
  return (
    <ReactFlowProvider>
      <TreeView store={store} focusId={focusId} onFocusDone={onFocusDone} />
    </ReactFlowProvider>
  );
}
