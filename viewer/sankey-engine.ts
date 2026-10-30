/**
 * Pure Sankey & Miller Flow Engine:
 * Classification, Lineage, Circletrace, Directional Blast Attenuation,
 * Hierarchical Tree Compaction, and Barycenter Crossing Minimization.
 */

import { RELATIONS, normalizeRelation } from "./relations.js";

export type ArtifactStage = "adrs" | "features" | "code" | "tests" | "docs";

export const STAGE_ORDER: ArtifactStage[] = ["adrs", "features", "code", "tests", "docs"];

export const STAGE_INDEX: Record<ArtifactStage, number> = {
  adrs: 0,
  features: 1,
  code: 2,
  tests: 3,
  docs: 4,
};

export type TriState = "neutral" | "pinned" | "excluded";

/**
 * Classifies an artifact node into one of the 5 canonical lifecycle stages:
 * ADRs -> Features -> Code -> Tests -> Docs.
 */
export function classifyArtifactStage(node: { id: string; type?: string; sources?: string[] }): ArtifactStage {
  const rawSource = node.sources?.[0]?.split(" · ")[0]?.trim();
  const rawPath = (rawSource || node.id.split("#")[0] || "").replace(/\\/g, "/");

  // 1. ADRs (docs/adr/, /adr/, adr-*, or node.type === "adr")
  if (
    rawPath.startsWith("docs/adr/") ||
    rawPath.includes("/adr/") ||
    /^adr[-_]/i.test(node.id) ||
    node.type === "adr"
  ) {
    return "adrs";
  }

  // 2. Tests (test/, tests/, features/steps/, *.test.*, *.spec.*, or type test/spec)
  if (
    rawPath.startsWith("test/") ||
    rawPath.startsWith("tests/") ||
    rawPath.startsWith("features/steps/") ||
    /\.(test|spec)\.[a-z0-9]+$/i.test(rawPath) ||
    node.type === "test" ||
    node.type === "spec"
  ) {
    return "tests";
  }

  // 3. Features (*.feature, features/, or type feature/scenario)
  if (
    rawPath.endsWith(".feature") ||
    rawPath.startsWith("features/") ||
    node.type === "feature" ||
    node.type === "scenario"
  ) {
    return "features";
  }

  // 4. Docs (docs/, Markdown / AsciiDoc / reST / text, or type doc/concept)
  if (
    rawPath.startsWith("docs/") ||
    /\.(md|adoc|asciidoc|rst|txt)$/i.test(rawPath) ||
    node.type === "concept" ||
    node.type === "doc"
  ) {
    return "docs";
  }

  // 5. Code (src/**, viewer/**, and general implementation symbols)
  return "code";
}

function getNodeStage(
  id: string,
  nodeMap?: Map<string, { id: string; type?: string; sources?: string[] }> | Record<string, { id: string; type?: string; sources?: string[] }>,
): ArtifactStage {
  if (nodeMap) {
    const node = nodeMap instanceof Map ? nodeMap.get(id) : nodeMap[id];
    if (node) return classifyArtifactStage(node);
  }
  return classifyArtifactStage({ id });
}

interface TraversalState {
  id: string;
  intraHops: number;
}

function addAdj(adj: Map<string, Set<string>>, from: string, to: string) {
  let s = adj.get(from);
  if (!s) {
    s = new Set();
    adj.set(from, s);
  }
  s.add(to);
}

/**
 * Performs a canonical bidirectional reachability traversal across the 5 lifecycle stages:
 * Upstream (ancestors flowing into seed) + Downstream (descendants reachable from seed),
 * skipping excludedIds. Intra-stage neighbors are limited to 1 hop to prevent graph-wide bleed.
 */
export function computeLineageSet(
  seedIds: Iterable<string>,
  edges: Array<{ source: string; target: string; relation?: string }>,
  excludedIds?: Set<string>,
  nodeMap?: Map<string, { id: string; type?: string; sources?: string[] }> | Record<string, { id: string; type?: string; sources?: string[] }>,
): Set<string> {
  const stageForwardAdj = new Map<string, Set<string>>();
  const stageBackwardAdj = new Map<string, Set<string>>();

  for (const edge of edges) {
    const u = edge.source;
    const v = edge.target;
    if (!u || !v || u === v) continue;

    const stageU = getNodeStage(u, nodeMap);
    const stageV = getNodeStage(v, nodeMap);
    const idxU = STAGE_INDEX[stageU];
    const idxV = STAGE_INDEX[stageV];

    if (idxU < idxV) {
      addAdj(stageForwardAdj, u, v);
      addAdj(stageBackwardAdj, v, u);
    } else if (idxU > idxV) {
      addAdj(stageForwardAdj, v, u);
      addAdj(stageBackwardAdj, u, v);
    } else {
      addAdj(stageForwardAdj, u, v);
      addAdj(stageForwardAdj, v, u);
      addAdj(stageBackwardAdj, u, v);
      addAdj(stageBackwardAdj, v, u);
    }
  }

  function traverse(
    startIds: Iterable<string>,
    adj: Map<string, Set<string>>,
  ): Set<string> {
    const visited = new Set<string>();
    const minIntraHops = new Map<string, number>();
    const queue: TraversalState[] = [];

    for (const seed of startIds) {
      if (excludedIds?.has(seed)) continue;
      visited.add(seed);
      minIntraHops.set(seed, 0);
      queue.push({ id: seed, intraHops: 0 });
    }

    while (queue.length > 0) {
      const { id: curr, intraHops } = queue.shift()!;
      const currStage = getNodeStage(curr, nodeMap);
      const nbrs = adj.get(curr);
      if (!nbrs) continue;

      for (const nbr of nbrs) {
        if (excludedIds?.has(nbr)) continue;
        const nbrStage = getNodeStage(nbr, nodeMap);
        const isIntra = currStage === nbrStage;

        if (isIntra && intraHops >= 1) {
          continue;
        }

        const nextIntraHops = isIntra ? intraHops + 1 : 0;
        const prevHops = minIntraHops.get(nbr);

        if (prevHops === undefined || nextIntraHops < prevHops) {
          minIntraHops.set(nbr, nextIntraHops);
          visited.add(nbr);
          queue.push({ id: nbr, intraHops: nextIntraHops });
        }
      }
    }

    return visited;
  }

  const downstream = traverse(seedIds, stageForwardAdj);
  const upstream = traverse(seedIds, stageBackwardAdj);

  return new Set([...downstream, ...upstream]);
}

export interface CircletraceResult {
  primaryIds: Set<string>;
  reflectedIds: Set<string>;
  sharedImplIds: Set<string>;
}

/**
 * Circletrace Blast Radius:
 * Step 1: Forward/direct lineage from seedId down to shared code/test implementation anchors.
 * Step 2: Backward reflection from shared code/test anchors to discover co-dependent features,
 * ADRs, and docs that share the same underlying implementations.
 */
export function computeCircletrace(
  seedId: string,
  nodes: Array<{ id: string; type?: string; sources?: string[] }> | Map<string, { id: string; type?: string; sources?: string[] }>,
  edges: Array<{ source: string; target: string; relation?: string }>,
  excludedIds?: Set<string>,
): CircletraceResult {
  const nodeMap = nodes instanceof Map
    ? nodes
    : new Map(nodes.map((n) => [n.id, n]));

  if (excludedIds?.has(seedId)) {
    return {
      primaryIds: new Set(),
      reflectedIds: new Set(),
      sharedImplIds: new Set(),
    };
  }

  const primaryIds = computeLineageSet([seedId], edges, excludedIds, nodeMap);

  const sharedImplIds = new Set<string>();
  for (const id of primaryIds) {
    const st = getNodeStage(id, nodeMap);
    if (st === "code" || st === "tests") {
      sharedImplIds.add(id);
    }
  }

  const reflectedIds = new Set<string>();
  if (sharedImplIds.size > 0) {
    const allFromImpl = computeLineageSet(sharedImplIds, edges, excludedIds, nodeMap);
    for (const id of allFromImpl) {
      if (!primaryIds.has(id)) {
        reflectedIds.add(id);
      }
    }
  }

  return { primaryIds, reflectedIds, sharedImplIds };
}

export interface TriStateFilterInput {
  allNodeIds: string[];
  edges: Array<{ source: string; target: string; relation?: string }>;
  nodeStates: Map<string, TriState> | Record<string, TriState>;
  activeReduceId?: string | null;
  circletraceId?: string | null;
  strictPinOnly?: boolean;
  nodeMap?: Map<string, { id: string; type?: string; sources?: string[] }> | Record<string, { id: string; type?: string; sources?: string[] }>;
}

export interface TriStateFilterResult {
  visibleIds: Set<string>;
  pinnedLineageIds: Set<string>;
  excludedIds: Set<string>;
  activeLineageIds: Set<string>;
  circletracePrimaryIds: Set<string>;
  circletraceReflectedIds: Set<string>;
  reducedOutCount: number;
}

/**
 * Evaluates the set algebra:
 *   Visible = (ActiveLineage ∪ PinnedLineage) - Excluded
 */
export function evaluateTriStateFilter(input: TriStateFilterInput): TriStateFilterResult {
  const {
    allNodeIds,
    edges,
    nodeStates,
    activeReduceId,
    circletraceId,
    strictPinOnly = false,
    nodeMap,
  } = input;

  const nodeMapObj: Map<string, { id: string; type?: string; sources?: string[] }> = nodeMap instanceof Map
    ? nodeMap
    : nodeMap
    ? new Map(Object.entries(nodeMap))
    : new Map(allNodeIds.map(id => [id, { id }]));

  function getFilePath(id: string): string {
    const n = nodeMapObj.get(id);
    const raw = n?.sources?.[0]?.split(" · ")[0]?.trim() || id.split("#")[0] || "";
    return raw.replace(/\\/g, "/");
  }

  function resolveState(id: string): TriState {
    const directState = nodeStates instanceof Map ? nodeStates.get(id) : nodeStates[id];
    if (directState) return directState;

    const fp = getFilePath(id);
    const fpState = nodeStates instanceof Map ? nodeStates.get(fp) : nodeStates[fp];
    if (fpState) return fpState;

    const entries = nodeStates instanceof Map ? nodeStates.entries() : Object.entries(nodeStates);
    for (const [key, st] of entries) {
      if (fp.startsWith(key + "/")) {
        return st;
      }
    }
    return "neutral";
  }

  const pinnedSeeds = new Set<string>();
  const excludedIds = new Set<string>();

  for (const id of allNodeIds) {
    const st = resolveState(id);
    if (st === "pinned") pinnedSeeds.add(id);
    else if (st === "excluded") excludedIds.add(id);
  }

  const stateEntries = nodeStates instanceof Map ? nodeStates.entries() : Object.entries(nodeStates);
  for (const [k, st] of stateEntries) {
    if (st === "excluded") {
      excludedIds.add(k);
    }
  }

  const pinnedLineageIds = pinnedSeeds.size > 0
    ? computeLineageSet(pinnedSeeds, edges, excludedIds, nodeMapObj)
    : new Set<string>();

  let activeLineageIds = new Set<string>();
  let circletracePrimaryIds = new Set<string>();
  let circletraceReflectedIds = new Set<string>();

  const isCircleActive = Boolean(circletraceId && !excludedIds.has(circletraceId));
  const isReduceActive = Boolean(activeReduceId && !excludedIds.has(activeReduceId));

  if (isCircleActive && circletraceId) {
    const ctSeeds = allNodeIds.filter(id => {
      if (id === circletraceId) return true;
      const fp = getFilePath(id);
      return fp === circletraceId || fp.startsWith(circletraceId + "/");
    });
    const effectiveSeed = ctSeeds.length > 0 ? ctSeeds[0] : circletraceId;

    const ct = computeCircletrace(effectiveSeed, nodeMapObj, edges, excludedIds);
    if (ctSeeds.length > 1) {
      for (let i = 1; i < ctSeeds.length; i++) {
        const ctMore = computeCircletrace(ctSeeds[i], nodeMapObj, edges, excludedIds);
        for (const id of ctMore.primaryIds) ct.primaryIds.add(id);
        for (const id of ctMore.reflectedIds) ct.reflectedIds.add(id);
        for (const id of ctMore.sharedImplIds) ct.sharedImplIds.add(id);
      }
    }
    circletracePrimaryIds = ct.primaryIds;
    circletraceReflectedIds = ct.reflectedIds;
    activeLineageIds = new Set([...ct.primaryIds, ...ct.reflectedIds]);
  } else if (isReduceActive && activeReduceId) {
    const redSeeds = allNodeIds.filter(id => {
      if (id === activeReduceId) return true;
      const fp = getFilePath(id);
      return fp === activeReduceId || fp.startsWith(activeReduceId + "/");
    });
    const seeds = redSeeds.length > 0 ? redSeeds : [activeReduceId];
    activeLineageIds = computeLineageSet(seeds, edges, excludedIds, nodeMapObj);
  } else {
    activeLineageIds = new Set(allNodeIds.filter(id => !excludedIds.has(id)));
  }

  let visibleIds: Set<string>;
  if (isCircleActive || isReduceActive) {
    visibleIds = new Set([...activeLineageIds, ...pinnedLineageIds]);
  } else if (pinnedSeeds.size > 0 && strictPinOnly) {
    visibleIds = new Set(pinnedLineageIds);
  } else {
    visibleIds = new Set(allNodeIds.filter(id => !excludedIds.has(id)));
  }

  for (const exc of excludedIds) {
    visibleIds.delete(exc);
  }

  const reducedOutCount = Math.max(0, allNodeIds.length - visibleIds.size);

  return {
    visibleIds,
    pinnedLineageIds,
    excludedIds,
    activeLineageIds,
    circletracePrimaryIds,
    circletraceReflectedIds,
    reducedOutCount,
  };
}

export interface SankeyBar {
  id: string;
  label: string;
  stage: ArtifactStage;
  isGroup: boolean;
  memberCount: number;
  memberIds: string[];
  weight: number;
  hasGap?: boolean;
  rawNode?: any;
  parentDir?: string;
}

export interface SankeyRibbon {
  sourceBarId: string;
  targetBarId: string;
  sourceStage: ArtifactStage;
  targetStage: ArtifactStage;
  weight: number;
}

export interface SankeyColumn {
  stage: ArtifactStage;
  bars: SankeyBar[];
  totalWeight: number;
}

export interface SankeyGraph {
  columns: Record<ArtifactStage, SankeyColumn>;
  ribbons: SankeyRibbon[];
  gaps: SankeyBar[];
}

export type BlastPhase =
  | "SEED"
  | "DOWN_REALIZE"
  | "UP_PROVENANCE"
  | "DEP_PREREQ"
  | "DEP_IMPACT"
  | "LEAF_SINK";

export interface BlastAttenuationNode {
  id: string;
  hop: number;
  energy: number;
  phase: BlastPhase;
  role: "seed" | "direct" | "transitive" | "reflected";
}

export interface BlastAttenuationResult {
  nodes: Map<string, BlastAttenuationNode>;
  decayPerHop: number;
}

export interface BlastTransitionEval {
  weight: number;
  nextPhase: BlastPhase;
}

export function evaluateDirectionalBlastStep(
  relation: string | undefined,
  direction: "forward" | "reverse",
  inPhase: BlastPhase,
  includeReflected = false,
): BlastTransitionEval {
  if (inPhase === "LEAF_SINK") {
    return { weight: 0.0, nextPhase: "LEAF_SINK" };
  }

  const norm = normalizeRelation(relation);
  const def = RELATIONS[norm] ?? RELATIONS.uses;
  const rule = direction === "forward"
    ? def.blast.forward(inPhase, includeReflected)
    : def.blast.reverse(inPhase, includeReflected);

  return { weight: rule.weight, nextPhase: rule.nextPhase };
}

export function computeBlastAttenuation(
  seedIds: string | Iterable<string>,
  nodes: Array<{ id: string; type?: string; sources?: string[] }>,
  edges: Array<{ source: string; target: string; relation?: string }>,
  decayPerHop = 0.65,
  excludedIds?: Set<string>,
  includeReflected = false,
): BlastAttenuationResult {
  const seeds = typeof seedIds === "string" ? [seedIds] : Array.from(seedIds);
  const result = new Map<string, BlastAttenuationNode>();
  if (seeds.length === 0) {
    return { nodes: result, decayPerHop };
  }

  interface DirectedEdgeStep {
    neighbor: string;
    relation: string;
    direction: "forward" | "reverse";
  }

  const adj = new Map<string, DirectedEdgeStep[]>();
  const addStep = (u: string, v: string, relation: string, direction: "forward" | "reverse") => {
    let list = adj.get(u);
    if (!list) {
      list = [];
      adj.set(u, list);
    }
    list.push({ neighbor: v, relation, direction });
  };

  for (const e of edges) {
    if (!e.source || !e.target || e.source === e.target) continue;
    if (excludedIds?.has(e.source) || excludedIds?.has(e.target)) continue;
    const rel = e.relation || "uses";
    addStep(e.source, e.target, rel, "forward");
    addStep(e.target, e.source, rel, "reverse");
  }

  const queue: Array<{ id: string; hop: number; energy: number; phase: BlastPhase }> = [];
  const bestStateEnergy = new Map<string, number>();

  for (const s of seeds) {
    if (excludedIds?.has(s)) continue;
    result.set(s, { id: s, hop: 0, energy: 1.0, phase: "SEED", role: "seed" });
    bestStateEnergy.set(`${s}:SEED`, 1.0);
    queue.push({ id: s, hop: 0, energy: 1.0, phase: "SEED" });
  }

  const maxHops = 4;
  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr.hop >= maxHops || curr.phase === "LEAF_SINK") continue;
    const nbrs = adj.get(curr.id);
    if (!nbrs) continue;

    const deg = nbrs.length;
    const fanoutPenalty = curr.hop === 0 ? 1.0 : 1.0 / (1.0 + 0.05 * Math.max(0, deg - 5));

    for (const step of nbrs) {
      const { weight: relWeight, nextPhase } = evaluateDirectionalBlastStep(
        step.relation,
        step.direction,
        curr.phase,
        includeReflected,
      );

      if (relWeight <= 0) continue;

      const nextHop = curr.hop + 1;
      const hopDecay = nextHop === 1 ? 1.0 : decayPerHop;
      const rawEnergy = curr.energy * hopDecay * relWeight * fanoutPenalty;
      const nextEnergy = Number(Math.max(0.14, Math.min(1.0, rawEnergy)).toFixed(3));

      const stateKey = `${step.neighbor}:${nextPhase}`;
      const prevStateEnergy = bestStateEnergy.get(stateKey) ?? 0;
      if (nextEnergy > prevStateEnergy) {
        bestStateEnergy.set(stateKey, nextEnergy);
        queue.push({ id: step.neighbor, hop: nextHop, energy: nextEnergy, phase: nextPhase });
      }

      const existing = result.get(step.neighbor);
      if (!existing || nextHop < existing.hop || (nextHop === existing.hop && nextEnergy > existing.energy)) {
        const role: BlastAttenuationNode["role"] =
          nextHop === 0
            ? "seed"
            : nextHop === 1
              ? "direct"
              : curr.phase === "DOWN_REALIZE" && nextPhase === "UP_PROVENANCE"
                ? "reflected"
                : "transitive";
        result.set(step.neighbor, {
          id: step.neighbor,
          hop: nextHop,
          energy: nextEnergy,
          phase: nextPhase,
          role,
        });
      }
    }
  }

  return { nodes: result, decayPerHop };
}

/**
 * Computes the canonical folder group key for a node path:
 * - For standard multi-segment paths, returns the top 2 folder segments (`src/graph`, `features/viz`).
 * - For flat 1-level test directories, extracts the semantic suite prefix (`test/viz`, `test/cli`).
 */
export function folderGroupKeyOfNode(node: { id: string; sources?: string[] }): string | null {
  const raw = node.sources?.[0]?.split(" · ")[0]?.trim() || node.id.split("#")[0] || "";
  const fp = raw.replace(/\\/g, "/");
  const parts = fp.split("/").filter(Boolean);
  if (parts.length >= 3) {
    return `${parts[0]}/${parts[1]}`;
  }
  if (parts.length === 2) {
    const dir = parts[0];
    const file = parts[1];
    if (dir === "test" || dir === "tests") {
      const base = file.replace(/\.(test|spec)\.[a-z0-9]+$/i, "");
      const prefixMatch = base.match(/^([a-z0-9]+)[-_]/i);
      if (prefixMatch) {
        return `${dir}/${prefixMatch[1].toLowerCase()}`;
      }
    }
    return dir;
  }
  return null;
}

export function getNodePathSegments(node: { id: string; sources?: string[] }): {
  dirSegments: string[];
  filename: string;
  fullPath: string;
} {
  const raw = node.sources?.[0]?.split(" · ")[0]?.trim() || node.id.split("#")[0] || "";
  const fp = raw.replace(/\\/g, "/");
  const parts = fp.split("/").filter(Boolean);

  if (parts.length === 0) {
    return { dirSegments: [], filename: node.id, fullPath: node.id };
  }

  // Handle flat test suites sub-foldering
  if (parts.length === 2 && (parts[0] === "test" || parts[0] === "tests")) {
    const dir = parts[0];
    const file = parts[1];
    const base = file.replace(/\.(test|spec)\.[a-z0-9]+$/i, "");
    const prefixMatch = base.match(/^([a-z0-9]+)[-_]/i);
    if (prefixMatch) {
      const domain = prefixMatch[1].toLowerCase();
      return {
        dirSegments: [dir, domain],
        filename: file,
        fullPath: `${dir}/${domain}/${file}`,
      };
    }
    return { dirSegments: [dir], filename: file, fullPath: fp };
  }

  const filename = parts[parts.length - 1];
  const dirSegments = parts.slice(0, parts.length - 1);
  return { dirSegments, filename, fullPath: fp };
}

export interface DirTreeNode {
  segment: string;
  path: string;
  subdirs: Map<string, DirTreeNode>;
  files: Array<{ node: any; path: string; filename: string }>;
  allNodes: any[];
}

function compactTreeNode(node: DirTreeNode): void {
  for (const child of node.subdirs.values()) {
    compactTreeNode(child);
  }

  // Chain compaction: if a child has 0 files and exactly 1 subdir, compact grandchild into child
  for (const [key, child] of Array.from(node.subdirs.entries())) {
    while (child.files.length === 0 && child.subdirs.size === 1) {
      const grandchild = Array.from(child.subdirs.values())[0];
      child.segment = `${child.segment}/${grandchild.segment}`;
      child.path = grandchild.path;
      child.files = grandchild.files;
      child.subdirs = grandchild.subdirs;
    }
  }
}

function buildStageTree(stage: ArtifactStage, nodes: any[]): DirTreeNode {
  const root: DirTreeNode = {
    segment: "",
    path: "",
    subdirs: new Map(),
    files: [],
    allNodes: [],
  };

  for (const n of nodes) {
    root.allNodes.push(n);
    const { dirSegments, filename, fullPath } = getNodePathSegments(n);

    let curr = root;
    let currPath = "";
    for (const seg of dirSegments) {
      currPath = currPath ? `${currPath}/${seg}` : seg;
      let next = curr.subdirs.get(seg);
      if (!next) {
        next = {
          segment: seg,
          path: currPath,
          subdirs: new Map(),
          files: [],
          allNodes: [],
        };
        curr.subdirs.set(seg, next);
      }
      next.allNodes.push(n);
      curr = next;
    }
    curr.files.push({ node: n, path: fullPath, filename });
  }

  compactTreeNode(root);
  return root;
}

function isDirExpanded(
  dirPath: string,
  segment: string,
  expandedDirs: Set<string>,
  collapsedDirs: Set<string>,
): boolean {
  if (collapsedDirs.has(dirPath) || collapsedDirs.has(segment)) return false;
  return expandedDirs.has(dirPath) || expandedDirs.has(segment);
}

function resolveDirChildren(
  dir: DirTreeNode,
  stage: ArtifactStage,
  expandedDirs: Set<string>,
  collapsedDirs: Set<string>,
  parentDirPath?: string,
): SankeyBar[] {
  const result: SankeyBar[] = [];

  // 1. Direct files in this directory (preserve contiguous group)
  for (const f of dir.files) {
    result.push({
      id: f.node.id,
      label: f.node.name || f.filename || f.node.id,
      stage,
      isGroup: false,
      memberCount: 1,
      memberIds: [f.node.id],
      weight: 1,
      rawNode: f.node,
      parentDir: dir.path || parentDirPath,
    });
  }

  // 2. Immediate subdirectories (contiguous grouping)
  for (const sub of dir.subdirs.values()) {
    if (isDirExpanded(sub.path, sub.segment, expandedDirs, collapsedDirs)) {
      // Expanded: recursively emit immediate children contiguously at this slot
      const children = resolveDirChildren(sub, stage, expandedDirs, collapsedDirs, sub.path);
      result.push(...children);
    } else {
      // Collapsed: emit folder bar
      result.push({
        id: `dir:${stage}:${sub.path}`,
        label: sub.path,
        stage,
        isGroup: true,
        memberCount: sub.allNodes.length,
        memberIds: sub.allNodes.map((n) => n.id),
        weight: sub.allNodes.length,
        parentDir: dir.path || parentDirPath,
      });
    }
  }

  return result;
}

/**
 * Miller-Sankey Aggregation:
 * Groups visible nodes into the 5 stages, rolls up directories marked in collapsedDirs or expandedDirs,
 * aggregates ribbon flows, and spots dead-end gaps in code nodes (0 tests/docs links).
 */
export function computeSankeyColumns(
  nodes: Array<{ id: string; name?: string; type?: string; sources?: string[]; childCount?: number }>,
  edges: Array<{ source: string; target: string; relation?: string }>,
  collapsedDirs: Set<string> = new Set(),
  minCouplingWeight: number = 1,
  expandedDirs?: Set<string>,
): SankeyGraph {
  function getFilePath(n: { id: string; sources?: string[] }): string {
    const raw = n.sources?.[0]?.split(" · ")[0]?.trim() || n.id.split("#")[0] || "";
    return raw.replace(/\\/g, "/");
  }

  function findCollapsedDir(node: { id: string; sources?: string[] }, filePath: string): string | null {
    let bestMatch: string | null = null;
    const virtualGroup = folderGroupKeyOfNode(node);
    for (const dir of collapsedDirs) {
      if (filePath === dir || filePath.startsWith(dir + "/") || virtualGroup === dir) {
        if (!bestMatch || dir.length > bestMatch.length) {
          bestMatch = dir;
        }
      }
    }
    return bestMatch;
  }

  const nodesByStage = new Map<ArtifactStage, any[]>();
  for (const st of STAGE_ORDER) {
    nodesByStage.set(st, []);
  }
  for (const node of nodes) {
    const stage = classifyArtifactStage(node);
    nodesByStage.get(stage)!.push(node);
  }

  const stageBars = new Map<ArtifactStage, SankeyBar[]>();
  const nodeToBar = new Map<string, SankeyBar>();

  // If expandedDirs is provided, use progressive hierarchical drill-down
  const isHierarchical = expandedDirs !== undefined;

  for (const stage of STAGE_ORDER) {
    const stageNodes = nodesByStage.get(stage)!;
    if (stageNodes.length === 0) {
      stageBars.set(stage, []);
      continue;
    }

    if (isHierarchical) {
      const tree = buildStageTree(stage, stageNodes);
      let bars: SankeyBar[] = [];

      // If root has multiple subdirs or direct files:
      if (tree.files.length > 0 || tree.subdirs.size > 1) {
        bars = resolveDirChildren(tree, stage, expandedDirs, collapsedDirs);
      } else if (tree.subdirs.size === 1) {
        // Single top-level directory (e.g. "features", "src", "docs", "test")
        const singleTop = Array.from(tree.subdirs.values())[0];
        if (isDirExpanded(singleTop.path, singleTop.segment, expandedDirs, collapsedDirs)) {
          bars = resolveDirChildren(singleTop, stage, expandedDirs, collapsedDirs, singleTop.path);
        } else {
          bars = [
            {
              id: `dir:${stage}:${singleTop.path}`,
              label: singleTop.path,
              stage,
              isGroup: true,
              memberCount: singleTop.allNodes.length,
              memberIds: singleTop.allNodes.map((n) => n.id),
              weight: singleTop.allNodes.length,
              parentDir: "",
            },
          ];
        }
      }

      stageBars.set(stage, bars);
      for (const bar of bars) {
        for (const mId of bar.memberIds) {
          nodeToBar.set(mId, bar);
        }
      }
    } else {
      // Traditional flat / 2-level directory collapse
      const barsMap = new Map<string, SankeyBar>();
      for (const node of stageNodes) {
        const fp = getFilePath(node);
        const colDir = findCollapsedDir(node, fp);

        let barId: string;
        let label: string;
        let isGroup: boolean;

        if (colDir) {
          barId = `dir:${stage}:${colDir}`;
          label = colDir;
          isGroup = true;
        } else {
          barId = node.id;
          label = node.name || node.id.split("/").pop() || node.id;
          isGroup = false;
        }

        let bar = barsMap.get(barId);
        if (!bar) {
          bar = {
            id: barId,
            label,
            stage,
            isGroup,
            memberCount: 0,
            memberIds: [],
            weight: 0,
            rawNode: isGroup ? undefined : node,
          };
          barsMap.set(barId, bar);
        }

        bar.memberCount += 1;
        bar.memberIds.push(node.id);
        bar.weight += 1;
        nodeToBar.set(node.id, bar);
      }
      stageBars.set(stage, Array.from(barsMap.values()));
    }
  }

  // Dead-end gap detection
  const codeLinksToTestsOrDocs = new Map<string, number>();
  for (const bar of stageBars.get("code") || []) {
    codeLinksToTestsOrDocs.set(bar.id, 0);
  }

  const ribbonMap = new Map<string, SankeyRibbon>();

  for (const edge of edges) {
    const barU = nodeToBar.get(edge.source);
    const barV = nodeToBar.get(edge.target);
    if (!barU || !barV || barU.id === barV.id) continue;

    const idxU = STAGE_INDEX[barU.stage];
    const idxV = STAGE_INDEX[barV.stage];

    if (barU.stage === "code" && (barV.stage === "tests" || barV.stage === "docs")) {
      codeLinksToTestsOrDocs.set(barU.id, (codeLinksToTestsOrDocs.get(barU.id) || 0) + 1);
    }
    if (barV.stage === "code" && (barU.stage === "tests" || barU.stage === "docs")) {
      codeLinksToTestsOrDocs.set(barV.id, (codeLinksToTestsOrDocs.get(barV.id) || 0) + 1);
    }

    let srcBar: SankeyBar;
    let tgtBar: SankeyBar;
    if (idxU <= idxV) {
      srcBar = barU;
      tgtBar = barV;
    } else {
      srcBar = barV;
      tgtBar = barU;
    }

    const key = `${srcBar.id}->${tgtBar.id}`;
    let ribbon = ribbonMap.get(key);
    if (!ribbon) {
      ribbon = {
        sourceBarId: srcBar.id,
        targetBarId: tgtBar.id,
        sourceStage: srcBar.stage,
        targetStage: tgtBar.stage,
        weight: 0,
      };
      ribbonMap.set(key, ribbon);
    }
    ribbon.weight += 1;
  }

  const gaps: SankeyBar[] = [];
  for (const bar of stageBars.get("code") || []) {
    const linkCount = codeLinksToTestsOrDocs.get(bar.id) || 0;
    bar.hasGap = linkCount === 0;
    if (bar.hasGap) {
      gaps.push(bar);
    }
  }

  const ribbons = [...ribbonMap.values()].filter((r) => r.weight >= minCouplingWeight);

  const columns: Record<ArtifactStage, SankeyColumn> = {} as any;
  for (const st of STAGE_ORDER) {
    const bars = stageBars.get(st) || [];
    const totalWeight = bars.reduce((sum, b) => sum + b.weight, 0);
    columns[st] = {
      stage: st,
      bars,
      totalWeight,
    };
  }

  return {
    columns,
    ribbons,
    gaps,
  };
}

/**
 * Counts ribbon crossings between adjacent stage columns.
 */
export function countCrossings(
  columns: Record<ArtifactStage, SankeyColumn>,
  ribbons: SankeyRibbon[],
): number {
  let crossings = 0;
  for (let i = 0; i < STAGE_ORDER.length - 1; i++) {
    const sA = STAGE_ORDER[i];
    const sB = STAGE_ORDER[i + 1];
    const colA = columns[sA];
    const colB = columns[sB];
    if (!colA || !colB) continue;

    const posA = new Map<string, number>();
    colA.bars.forEach((b, idx) => posA.set(b.id, idx));

    const posB = new Map<string, number>();
    colB.bars.forEach((b, idx) => posB.set(b.id, idx));

    const relRibbons = ribbons.filter(
      (r) =>
        (r.sourceStage === sA && r.targetStage === sB) ||
        (r.sourceStage === sB && r.targetStage === sA),
    );

    for (let j = 0; j < relRibbons.length; j++) {
      for (let k = j + 1; k < relRibbons.length; k++) {
        const r1 = relRibbons[j];
        const r2 = relRibbons[k];

        const r1A = r1.sourceStage === sA ? r1.sourceBarId : r1.targetBarId;
        const r1B = r1.sourceStage === sB ? r1.sourceBarId : r1.targetBarId;
        const r2A = r2.sourceStage === sA ? r2.sourceBarId : r2.targetBarId;
        const r2B = r2.sourceStage === sB ? r2.sourceBarId : r2.targetBarId;

        const y1A = posA.get(r1A);
        const y1B = posB.get(r1B);
        const y2A = posA.get(r2A);
        const y2B = posB.get(r2B);

        if (y1A !== undefined && y1B !== undefined && y2A !== undefined && y2B !== undefined) {
          if ((y1A - y2A) * (y1B - y2B) < 0) {
            crossings++;
          }
        }
      }
    }
  }
  return crossings;
}

/**
 * Barycenter crossing minimization:
 * Sorts bars within stage columns using iterative barycenter sweeps.
 * Sibling child groups are preserved contiguously.
 */
export function orderBarsByBarycenter(
  columns: Record<ArtifactStage, SankeyColumn>,
  ribbons: SankeyRibbon[],
  passes = 4,
): Record<ArtifactStage, SankeyColumn> {
  const result: Record<ArtifactStage, SankeyColumn> = {} as any;
  for (const st of STAGE_ORDER) {
    result[st] = {
      stage: st,
      bars: [...(columns[st]?.bars || [])],
      totalWeight: columns[st]?.totalWeight || 0,
    };
  }

  const ribbonAdj = new Map<string, Array<{ neighborId: string; weight: number }>>();
  for (const r of ribbons) {
    let listS = ribbonAdj.get(r.sourceBarId);
    if (!listS) {
      listS = [];
      ribbonAdj.set(r.sourceBarId, listS);
    }
    listS.push({ neighborId: r.targetBarId, weight: r.weight });

    let listT = ribbonAdj.get(r.targetBarId);
    if (!listT) {
      listT = [];
      ribbonAdj.set(r.targetBarId, listT);
    }
    listT.push({ neighborId: r.sourceBarId, weight: r.weight });
  }

  const getPosMap = (stage: ArtifactStage) => {
    const map = new Map<string, number>();
    result[stage].bars.forEach((b, i) => map.set(b.id, i));
    return map;
  };

  const sortStage = (stage: ArtifactStage, posMap: Map<string, number>) => {
    const bars = result[stage].bars;
    if (bars.length <= 1) return;

    // Calculate barycenter for each bar
    const barBc = new Map<string, number>();
    bars.forEach((b, idx) => {
      const nbrs = ribbonAdj.get(b.id) || [];
      let sumW = 0;
      let sumWPos = 0;
      for (const n of nbrs) {
        const p = posMap.get(n.neighborId);
        if (p !== undefined) {
          sumW += n.weight;
          sumWPos += n.weight * p;
        }
      }
      barBc.set(b.id, sumW > 0 ? sumWPos / sumW : idx);
    });

    // Partition into contiguous blocks by parent directory
    interface BarBlock {
      parentDir?: string;
      bars: SankeyBar[];
      bc: number;
    }

    const blocks: BarBlock[] = [];
    let curBlock: BarBlock | null = null;

    for (const b of bars) {
      if (!curBlock || (b.parentDir && curBlock.parentDir !== b.parentDir)) {
        curBlock = { parentDir: b.parentDir, bars: [b], bc: barBc.get(b.id) ?? 0 };
        blocks.push(curBlock);
      } else {
        curBlock.bars.push(b);
      }
    }

    // Sort bars within each block by barycenter, then update block barycenter
    for (const blk of blocks) {
      blk.bars.sort((a, b) => {
        const bcA = barBc.get(a.id) ?? 0;
        const bcB = barBc.get(b.id) ?? 0;
        return bcA - bcB || a.label.localeCompare(b.label);
      });
      const sum = blk.bars.reduce((s, b) => s + (barBc.get(b.id) ?? 0), 0);
      blk.bc = sum / blk.bars.length;
    }

    // Sort blocks by block barycenter
    blocks.sort((a, b) => a.bc - b.bc);

    // Flatten back into column
    result[stage].bars = blocks.flatMap((blk) => blk.bars);
  };

  for (let pass = 0; pass < passes; pass++) {
    // Forward sweep
    for (let c = 1; c < STAGE_ORDER.length; c++) {
      const stage = STAGE_ORDER[c];
      const prevStage = STAGE_ORDER[c - 1];
      sortStage(stage, getPosMap(prevStage));
    }
    // Backward sweep
    for (let c = STAGE_ORDER.length - 2; c >= 0; c--) {
      const stage = STAGE_ORDER[c];
      const nextStage = STAGE_ORDER[c + 1];
      sortStage(stage, getPosMap(nextStage));
    }
  }

  return result;
}
