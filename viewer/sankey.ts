/**
 * Miller-Sankey 5-Stage Classification, Tri-State Cascading Filters,
 * Circletrace Blast Radius, and Folder Roll-Up Engine (ADR 0016 / Feature 19).
 */

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
      // Canonical forward: u -> v
      addAdj(stageForwardAdj, u, v);
      addAdj(stageBackwardAdj, v, u);
    } else if (idxU > idxV) {
      // Canonical forward: v -> u (e.g. Code -> Test, Code -> Doc)
      addAdj(stageForwardAdj, v, u);
      addAdj(stageBackwardAdj, u, v);
    } else {
      // Intra-stage: u <-> v
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

  // Step 1: Outward / Primary Lineage
  const primaryIds = computeLineageSet([seedId], edges, excludedIds, nodeMap);

  // Identify shared implementation anchors (code and tests stages)
  const sharedImplIds = new Set<string>();
  for (const id of primaryIds) {
    const st = getNodeStage(id, nodeMap);
    if (st === "code" || st === "tests") {
      sharedImplIds.add(id);
    }
  }

  // Step 2: Reflection from sharedImplIds
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

/**
 * Hop-Distance & Semantic Relation Effect Attenuation (`computeBlastAttenuation`).
 *
 * Calculates how strongly a selected/focused seed artifact energizes downstream
 * and upstream nodes across multiple hops:
 *
 *   Energy(u -> v) = Energy(u) * γ_decay * w_rel(edge) * fanoutPenalty(u)
 *
 * Where:
 * - Hop 0 (Selected Seed): `energy = 1.00`, `hop = 0`
 * - Hop 1 (Direct Neighbor): `energy = w_rel` (`0.85 .. 1.00`)
 * - Hop 2+ (Transitive / Reflected): decays by `decayPerHop` (default `0.65`)
 *   multiplied by semantic relation strength (`implements`/`covers`/`verifies` = `1.0`,
 *   `defines`/`influences`/`documents` = `0.92`, `uses`/`calls` = `0.78`, `references` = `0.55`)
 *   and a gentle hub fan-out penalty `1 / (1 + 0.06 * Math.max(0, deg - 4))` so utility
 *   hubs don't flood the entire graph at 100% energy.
 */
export interface BlastAttenuationNode {
  id: string;
  hop: number;
  energy: number;
  role: "seed" | "direct" | "transitive" | "reflected";
}

export interface BlastAttenuationResult {
  nodes: Map<string, BlastAttenuationNode>;
  decayPerHop: number;
}

const RELATION_TRANSMISSION: Record<string, number> = {
  implements: 1.0,
  extends: 1.0,
  covers: 1.0,
  verifies: 1.0,
  defines: 0.95,
  influences: 0.92,
  documents: 0.9,
  part_of: 0.88,
  contains: 0.88,
  uses: 0.78,
  calls: 0.78,
  depends_on: 0.78,
  references: 0.55,
};

export function computeBlastAttenuation(
  seedIds: string | Iterable<string>,
  nodes: Array<{ id: string; type?: string; sources?: string[] }>,
  edges: Array<{ source: string; target: string; relation?: string }>,
  decayPerHop = 0.65,
  excludedIds?: Set<string>,
): BlastAttenuationResult {
  const seeds = typeof seedIds === "string" ? [seedIds] : Array.from(seedIds);
  const result = new Map<string, BlastAttenuationNode>();
  if (seeds.length === 0) {
    return { nodes: result, decayPerHop };
  }

  const circle = seeds.length === 1
    ? computeCircletrace(seeds[0], nodes, edges, excludedIds)
    : null;

  // Build undirected adjacency list with relation transmission weights
  const adj = new Map<string, Array<{ neighbor: string; relWeight: number }>>();
  const addEdge = (u: string, v: string, rel?: string) => {
    const rw = RELATION_TRANSMISSION[rel || "uses"] ?? 0.78;
    let list = adj.get(u);
    if (!list) {
      list = [];
      adj.set(u, list);
    }
    list.push({ neighbor: v, relWeight: rw });
  };

  for (const e of edges) {
    if (!e.source || !e.target || e.source === e.target) continue;
    if (excludedIds?.has(e.source) || excludedIds?.has(e.target)) continue;
    addEdge(e.source, e.target, e.relation);
    addEdge(e.target, e.source, e.relation);
  }

  // Dijkstra / BFS over hop distance maximizing attenuated energy
  const queue: Array<{ id: string; hop: number; energy: number }> = [];
  for (const s of seeds) {
    if (excludedIds?.has(s)) continue;
    result.set(s, { id: s, hop: 0, energy: 1.0, role: "seed" });
    queue.push({ id: s, hop: 0, energy: 1.0 });
  }

  const maxHops = 4;
  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr.hop >= maxHops) continue;
    const nbrs = adj.get(curr.id);
    if (!nbrs) continue;

    // Gentle fan-out dampening for high-degree utility hubs on hop >= 1
    const deg = nbrs.length;
    const fanoutPenalty = curr.hop === 0 ? 1.0 : 1.0 / (1.0 + 0.05 * Math.max(0, deg - 5));

    for (const { neighbor, relWeight } of nbrs) {
      const nextHop = curr.hop + 1;
      // Only include nodes that belong to the canonical lineage / Circletrace set when available
      if (circle && !circle.primaryIds.has(neighbor) && !circle.reflectedIds.has(neighbor)) {
        continue;
      }

      const hopDecay = nextHop === 1 ? 1.0 : decayPerHop;
      const rawEnergy = curr.energy * hopDecay * relWeight * fanoutPenalty;
      const nextEnergy = Number(Math.max(0.14, Math.min(1.0, rawEnergy)).toFixed(3));

      const existing = result.get(neighbor);
      if (!existing || nextHop < existing.hop || (nextHop === existing.hop && nextEnergy > existing.energy)) {
        const isReflected = circle ? circle.reflectedIds.has(neighbor) && !circle.primaryIds.has(neighbor) : false;
        const role: BlastAttenuationNode["role"] =
          nextHop === 0
            ? "seed"
            : nextHop === 1
              ? "direct"
              : isReflected
                ? "reflected"
                : "transitive";
        result.set(neighbor, { id: neighbor, hop: nextHop, energy: nextEnergy, role });
        queue.push({ id: neighbor, hop: nextHop, energy: nextEnergy });
      }
    }
  }

  return { nodes: result, decayPerHop };
}

/**
 * Computes the canonical folder group key for a node path:
 * - For standard multi-segment paths (`src/graph/build.ts`, `features/viz/core/x.feature`, `docs/adr/0001.md`),
 *   returns the top 2 folder segments (`src/graph`, `features/viz`, `docs/adr`).
 * - For flat 1-level test directories (`test/viz-sigma.test.ts`, `test/cli-help.test.ts`),
 *   extracts the semantic suite prefix before the first `-` or `.` (`test/viz`, `test/cli`, `test/graph`)
 *   so flat test suites sub-folder cleanly into domain groups!
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
    // Sub-folder flat `test/<domain>-*.test.ts` or `tests/<domain>_*.spec.ts` suites by prefix!
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

/**
 * Miller-Sankey Aggregation:
 * Groups visible nodes into the 5 stages, rolls up directories marked in collapsedDirs,
 * aggregates ribbon flows, and spots dead-end gaps in code nodes (0 tests/docs links).
 */
export function computeSankeyColumns(
  nodes: Array<{ id: string; name?: string; type?: string; sources?: string[]; childCount?: number }>,
  edges: Array<{ source: string; target: string; relation?: string }>,
  collapsedDirs: Set<string> = new Set(),
  minCouplingWeight: number = 1,
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

  const stageBars = new Map<ArtifactStage, Map<string, SankeyBar>>();
  for (const st of STAGE_ORDER) {
    stageBars.set(st, new Map());
  }

  const nodeToBar = new Map<string, SankeyBar>();

  for (const node of nodes) {
    const stage = classifyArtifactStage(node);
    const fp = getFilePath(node);
    const colDir = findCollapsedDir(node, fp);
    const barsInStage = stageBars.get(stage)!;

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

    let bar = barsInStage.get(barId);
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
      barsInStage.set(barId, bar);
    }

    bar.memberCount += 1;
    bar.memberIds.push(node.id);
    bar.weight += 1;
    nodeToBar.set(node.id, bar);
  }

  const codeLinksToTestsOrDocs = new Map<string, number>();
  for (const bar of stageBars.get("code")!.values()) {
    codeLinksToTestsOrDocs.set(bar.id, 0);
  }

  const ribbonMap = new Map<string, SankeyRibbon>();

  for (const edge of edges) {
    const barU = nodeToBar.get(edge.source);
    const barV = nodeToBar.get(edge.target);
    if (!barU || !barV || barU.id === barV.id) continue;

    const idxU = STAGE_INDEX[barU.stage];
    const idxV = STAGE_INDEX[barV.stage];

    // Gap spotting checks: code linked to test or doc
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
  for (const bar of stageBars.get("code")!.values()) {
    const linkCount = codeLinksToTestsOrDocs.get(bar.id) || 0;
    bar.hasGap = linkCount === 0;
    if (bar.hasGap) {
      gaps.push(bar);
    }
  }

  const ribbons = [...ribbonMap.values()].filter(r => r.weight >= minCouplingWeight);

  const columns: Record<ArtifactStage, SankeyColumn> = {} as any;
  for (const st of STAGE_ORDER) {
    const bars = [...stageBars.get(st)!.values()];
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

const STAGE_META: Record<ArtifactStage, { title: string; subtitle: string; color: string }> = {
  adrs: { title: "1. ADRs", subtitle: "Architecture Decisions", color: "#a855f7" },
  features: { title: "2. Specs", subtitle: "BDD Features & Contracts", color: "#10b981" },
  code: { title: "3. Code", subtitle: "Production Modules", color: "#38bdf8" },
  tests: { title: "4. Tests", subtitle: "Verification Suites", color: "#f59e0b" },
  docs: { title: "5. Docs", subtitle: "Guides & References", color: "#ec4899" },
};

/**
 * Interactive 5-Column Stacked Miller-Sankey Flow Chart Canvas Base (`SankeyView`).
 * Renders stacked proportional stage columns, cubic Bézier flow ribbons, folder
 * rollup/drilldown (including test suite sub-foldering), interactive directory filtering,
 * energized hop-attenuated Circletrace blast highlighting, and live bar/column dragging.
 */
export class SankeyView {
  private container: HTMLElement;
  private nodes: Array<{ id: string; name?: string; type?: string; sources?: string[]; childCount?: number }> = [];
  private edges: Array<{ source: string; target: string; relation?: string }> = [];
  public collapsedDirs = new Set<string>();
  public hiddenDirs = new Set<string>();
  public dirFilterQuery = "";
  public minCouplingWeight = 1;
  public hopDecay = 0.65;
  public onlyGaps = false;
  public selectedId: string | null = null;
  public selectedBarIds: string[] | null = null;
  public hoveredBarId: string | null = null;
  public onSelect: (id: string | null) => void = () => {};

  /** Persistent user-dragged coordinate overrides per bar ID (`{ dx, dy }`). */
  public barOffsets = new Map<string, { dx: number; dy: number }>();
  /** Persistent user-dragged coordinate overrides per stage column (`{ dx, dy }`). */
  public colOffsets = new Map<ArtifactStage, { dx: number; dy: number }>();
  /** Viewport pan & zoom state for the Stacked Flow canvas. */
  public panX = 0;
  public panY = 0;
  public zoom = 1.0;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  setData(
    nodes: Array<{ id: string; name?: string; type?: string; sources?: string[]; childCount?: number }>,
    edges: Array<{ source: string; target: string; relation?: string }>,
    autoCollapseTopDirs = false,
  ): void {
    this.nodes = nodes;
    this.edges = edges;
    if (autoCollapseTopDirs && this.collapsedDirs.size === 0 && nodes.length > 45) {
      for (const n of nodes) {
        const key = folderGroupKeyOfNode(n);
        if (key) this.collapsedDirs.add(key);
      }
    }
    this.render();
  }

  select(id: string | null): void {
    this.selectedId = id;
    this.selectedBarIds = id ? [id] : null;
    this.render();
  }

  resetLayout(): void {
    this.barOffsets.clear();
    this.colOffsets.clear();
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1.0;
    this.render();
  }

  collapseAllFolders(): void {
    for (const n of this.nodes) {
      const key = folderGroupKeyOfNode(n);
      if (key) {
        this.collapsedDirs.add(key);
      }
    }
    this.render();
  }

  expandAllFolders(): void {
    this.collapsedDirs.clear();
    this.render();
  }

  /**
   * Programmatically move a bar by `(dx, dy)` and update its position + connected ribbons.
   */
  moveBar(barId: string, dx: number, dy: number, reRender = false): void {
    const prev = this.barOffsets.get(barId) ?? { dx: 0, dy: 0 };
    this.barOffsets.set(barId, { dx: prev.dx + dx, dy: prev.dy + dy });
    if (reRender) this.render();
  }

  /**
   * Programmatically move an entire stage column by `(dx, dy)`.
   */
  moveColumn(stage: ArtifactStage, dx: number, dy: number, reRender = false): void {
    const prev = this.colOffsets.get(stage) ?? { dx: 0, dy: 0 };
    this.colOffsets.set(stage, { dx: prev.dx + dx, dy: prev.dy + dy });
    if (reRender) this.render();
  }

  render(): void {
    if (!this.container) return;

    // 1. Apply Sankey-local directory / text filter (`dirFilterQuery` and `hiddenDirs`)
    const q = this.dirFilterQuery.trim().toLowerCase();
    const filteredNodes = this.nodes.filter((n) => {
      const raw = (n.sources?.[0]?.split(" · ")[0]?.trim() || n.id.split("#")[0] || "").replace(/\\/g, "/");
      const groupKey = folderGroupKeyOfNode(n) || "";
      for (const h of this.hiddenDirs) {
        if (raw === h || raw.startsWith(h + "/") || groupKey === h || n.id === h) {
          return false;
        }
      }
      if (q) {
        const hay = `${raw} ${groupKey} ${n.name || ""} ${n.id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const allowedSet = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = this.edges.filter((e) => allowedSet.has(e.source) && allowedSet.has(e.target));

    const sankey = computeSankeyColumns(filteredNodes, filteredEdges, this.collapsedDirs, this.minCouplingWeight);

    // 2. Compute Hop-Attenuated Circletrace Blast Energy when a node or folder bar is selected
    const focusSeeds =
      this.selectedBarIds && this.selectedBarIds.length > 0
        ? this.selectedBarIds
        : this.selectedId
          ? [this.selectedId]
          : null;
    const blastResult = focusSeeds
      ? computeBlastAttenuation(focusSeeds, filteredNodes, filteredEdges, this.hopDecay)
      : null;

    const W = Math.max(860, this.container.clientWidth || 1100);
    const H = Math.max(580, this.container.clientHeight || 720);

    const headerY = 114;
    const padTop = 170;
    const padBottom = 64;
    const padX = 28;
    const usableW = W - padX * 2;
    const usableH = H - padTop - padBottom;
    const colCount = STAGE_ORDER.length;
    const colWidth = Math.min(185, Math.max(120, Math.floor(usableW * 0.14)));
    const colStep = colCount > 1 ? (usableW - colWidth) / (colCount - 1) : 0;

    interface LayoutBar extends SankeyBar {
      baseX: number;
      baseY: number;
      x: number;
      y: number;
      w: number;
      h: number;
      color: string;
      inLineage: boolean;
      minHop: number;
      maxEnergy: number;
      blastRole: BlastAttenuationNode["role"] | "none";
    }

    const barLayout = new Map<string, LayoutBar>();
    const stageColumns: Array<{
      stage: ArtifactStage;
      baseX: number;
      baseHeaderY: number;
      x: number;
      headerY: number;
      bars: LayoutBar[];
      total: number;
    }> = [];

    STAGE_ORDER.forEach((stage, colIdx) => {
      const col = sankey.columns[stage];
      const meta = STAGE_META[stage];
      const colOff = this.colOffsets.get(stage) ?? { dx: 0, dy: 0 };
      const baseX = Math.round(padX + colIdx * colStep);
      const colX = baseX + colOff.dx;

      let bars = [...col.bars];
      if (this.onlyGaps && stage === "code") {
        bars = bars.filter((b) => b.hasGap);
      }

      // Sort bars: groups and higher weight first
      bars.sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label));

      const gapPx = bars.length > 25 ? 2 : bars.length > 12 ? 4 : 6;
      const totalGap = Math.max(0, (bars.length - 1) * gapPx);
      const availH = Math.max(80, usableH - totalGap);
      const totalW = Math.max(1, bars.reduce((s, b) => s + b.weight, 0));

      let curY = padTop;
      const laidOut: LayoutBar[] = [];

      for (const b of bars) {
        const rawH = (b.weight / totalW) * availH;
        const h = Math.max(18, Math.round(rawH));

        let inLineage = true;
        let minHop = 99;
        let maxEnergy = 0;
        let blastRole: LayoutBar["blastRole"] = "none";

        if (blastResult) {
          inLineage = false;
          for (const id of b.memberIds) {
            const info = blastResult.nodes.get(id);
            if (info) {
              inLineage = true;
              if (info.hop < minHop) {
                minHop = info.hop;
                blastRole = info.role;
              }
              if (info.energy > maxEnergy) {
                maxEnergy = info.energy;
              }
            }
          }
        }

        const lb: LayoutBar = {
          ...b,
          baseX,
          baseY: curY,
          x: colX,
          y: curY + colOff.dy,
          w: colWidth,
          h,
          color: meta.color,
          inLineage,
          minHop,
          maxEnergy,
          blastRole,
        };
        barLayout.set(b.id, lb);
        laidOut.push(lb);
        curY += h + gapPx;
      }

      // If minimum bar heights pushed column past H - padBottom, scale down proportionally
      const actualSpan = curY - gapPx - padTop;
      if (actualSpan > usableH && laidOut.length > 0) {
        const scale = usableH / actualSpan;
        let yCursor = padTop;
        for (const lb of laidOut) {
          lb.baseY = Math.round(yCursor);
          lb.h = Math.max(12, Math.round(lb.h * scale));
          yCursor += lb.h + Math.max(1, Math.floor(gapPx * scale));
        }
      }

      // Apply individual bar drag offsets on top of column offsets
      for (const lb of laidOut) {
        const barOff = this.barOffsets.get(lb.id) ?? { dx: 0, dy: 0 };
        lb.x = lb.baseX + colOff.dx + barOff.dx;
        lb.y = lb.baseY + colOff.dy + barOff.dy;
      }

      stageColumns.push({
        stage,
        baseX,
        baseHeaderY: headerY,
        x: colX,
        headerY: headerY + colOff.dy,
        bars: laidOut,
        total: col.totalWeight,
      });
    });

    // Build top control toolbar + SVG stacked flow diagram
    const gapCount = sankey.gaps.length;
    const collapsedCount = this.collapsedDirs.size;
    const hiddenDirCount = this.hiddenDirs.size;
    const hasCustomLayout = this.barOffsets.size > 0 || this.colOffsets.size > 0 || this.panX !== 0 || this.panY !== 0 || this.zoom !== 1.0;

    /**
     * Dynamically calculates stacked entry/exit port coordinates (`x0, y0, x1, y1, d`)
     * for every ribbon based on the *current* live `(x, y)` coordinates of all bars.
     */
    const computeAllRibbonPaths = (): Map<string, string> => {
      const leftPorts = new Map<string, Array<{ key: string; partnerY: number; weight: number }>>();
      const rightPorts = new Map<string, Array<{ key: string; partnerY: number; weight: number }>>();

      const addPort = (
        map: Map<string, Array<{ key: string; partnerY: number; weight: number }>>,
        barId: string,
        key: string,
        partnerY: number,
        weight: number,
      ) => {
        let list = map.get(barId);
        if (!list) {
          list = [];
          map.set(barId, list);
        }
        list.push({ key, partnerY, weight });
      };

      for (const r of sankey.ribbons) {
        const src = barLayout.get(r.sourceBarId);
        const tgt = barLayout.get(r.targetBarId);
        if (!src || !tgt) continue;
        const rKey = `${r.sourceBarId}->${r.targetBarId}`;
        const srcCx = src.x + src.w / 2;
        const tgtCx = tgt.x + tgt.w / 2;
        const srcCy = src.y + src.h / 2;
        const tgtCy = tgt.y + tgt.h / 2;

        if (srcCx <= tgtCx) {
          addPort(rightPorts, src.id, rKey, tgtCy, r.weight);
          addPort(leftPorts, tgt.id, rKey, srcCy, r.weight);
        } else {
          addPort(leftPorts, src.id, rKey, tgtCy, r.weight);
          addPort(rightPorts, tgt.id, rKey, srcCy, r.weight);
        }
      }

      const portY = new Map<string, number>();
      const assignSideSlotYs = (
        side: "L" | "R",
        map: Map<string, Array<{ key: string; partnerY: number; weight: number }>>,
      ) => {
        for (const [barId, list] of map.entries()) {
          const bar = barLayout.get(barId);
          if (!bar) continue;
          list.sort((a, b) => a.partnerY - b.partnerY || a.key.localeCompare(b.key));
          const n = list.length;
          const pad = Math.min(5, Math.max(2, bar.h * 0.15));
          const avail = Math.max(2, bar.h - pad * 2);

          if (n === 1) {
            const partnerY = list[0].partnerY;
            const rel = Math.max(-1, Math.min(1, (partnerY - (bar.y + bar.h / 2)) / 240));
            const y = bar.y + bar.h / 2 + rel * (avail * 0.38);
            portY.set(`${barId}:${side}:${list[0].key}`, Number(y.toFixed(1)));
          } else {
            const totalW = list.reduce((s, item) => s + Math.sqrt(item.weight), 0) || 1;
            let acc = 0;
            for (let i = 0; i < n; i++) {
              const w = Math.sqrt(list[i].weight);
              const frac = (acc + w / 2) / totalW;
              acc += w;
              const y = bar.y + pad + frac * avail;
              portY.set(`${barId}:${side}:${list[i].key}`, Number(y.toFixed(1)));
            }
          }
        }
      };

      assignSideSlotYs("L", leftPorts);
      assignSideSlotYs("R", rightPorts);

      const pathMap = new Map<string, string>();
      for (const r of sankey.ribbons) {
        const src = barLayout.get(r.sourceBarId);
        const tgt = barLayout.get(r.targetBarId);
        if (!src || !tgt) continue;
        const rKey = `${r.sourceBarId}->${r.targetBarId}`;
        const srcCx = src.x + src.w / 2;
        const tgtCx = tgt.x + tgt.w / 2;

        const normalOrder = srcCx <= tgtCx;
        const x0 = normalOrder ? src.x + src.w : src.x;
        const x1 = normalOrder ? tgt.x : tgt.x + tgt.w;
        const y0 = portY.get(`${src.id}:${normalOrder ? "R" : "L"}:${rKey}`) ?? src.y + src.h / 2;
        const y1 = portY.get(`${tgt.id}:${normalOrder ? "L" : "R"}:${rKey}`) ?? tgt.y + tgt.h / 2;

        const dx = x1 - x0;
        const sign = dx >= 0 ? 1 : -1;
        const tension = Math.max(28, Math.abs(dx) * 0.45);
        const cx0 = Number((x0 + sign * tension).toFixed(1));
        const cx1 = Number((x1 - sign * tension).toFixed(1));

        pathMap.set(rKey, `M${x0},${y0} C${cx0},${y0} ${cx1},${y1} ${x1},${y1}`);
      }
      return pathMap;
    };

    const initialRibbonPaths = computeAllRibbonPaths();

    // SVG Glow filter for energized Circletrace bars & ribbons
    let svgDefs = `<defs>
      <filter id="sankey-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3.5" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>`;
    for (const sA of STAGE_ORDER) {
      for (const sB of STAGE_ORDER) {
        svgDefs += `<linearGradient id="sankey-grad-${sA}-${sB}" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="${STAGE_META[sA].color}"/><stop offset="100%" stop-color="${STAGE_META[sB].color}"/></linearGradient>`;
      }
    }
    svgDefs += "</defs>";

    let svgRibbons = "";
    for (const r of sankey.ribbons) {
      const src = barLayout.get(r.sourceBarId);
      const tgt = barLayout.get(r.targetBarId);
      if (!src || !tgt) continue;
      const rKey = `${r.sourceBarId}->${r.targetBarId}`;
      const d = initialRibbonPaths.get(rKey) || "";

      const isActiveBlast = blastResult !== null && src.inLineage && tgt.inLineage;
      const isDimmed = blastResult !== null && !isActiveBlast;
      const ribbonEnergy = isActiveBlast ? Math.min(src.maxEnergy, tgt.maxEnergy) : 0;

      const baseStrokeW = Math.min(24, Math.max(2, 1.8 + Math.sqrt(r.weight) * 2.4));
      const strokeW = isActiveBlast
        ? baseStrokeW * (0.95 + 0.45 * ribbonEnergy)
        : isDimmed
          ? Math.max(1.2, baseStrokeW * 0.65)
          : baseStrokeW;
      const opacity = isDimmed
        ? 0.035
        : isActiveBlast
          ? Number((0.32 + 0.65 * ribbonEnergy).toFixed(2))
          : 0.28;
      const gradId = `sankey-grad-${src.stage}-${tgt.stage}`;
      const filterAttr = isActiveBlast && ribbonEnergy >= 0.7 ? ` filter="url(#sankey-glow)"` : "";

      svgRibbons += `<path class="sankey-ribbon" data-ribbon-key="${this.esc(rKey)}" data-src="${this.esc(src.id)}" data-tgt="${this.esc(tgt.id)}" d="${d}" fill="none" stroke="url(#${gradId})" stroke-width="${strokeW.toFixed(1)}" stroke-linecap="round" opacity="${opacity}"${filterAttr}><title>${this.esc(src.label)} → ${this.esc(tgt.label)} (${r.weight} links${isActiveBlast ? ` · ${Math.round(ribbonEnergy * 100)}% blast energy` : ""})</title></path>`;
    }

    let svgColumns = "";
    for (const col of stageColumns) {
      const meta = STAGE_META[col.stage];
      svgColumns += `<g class="sankey-col" data-stage="${col.stage}">`;
      // Draggable Column Header
      svgColumns += `<g class="sankey-col-header" data-stage="${col.stage}" transform="translate(${col.x}, ${col.headerY})" style="cursor:grab;">`;
      svgColumns += `<rect x="0" y="0" width="${colWidth}" height="46" rx="7" fill="var(--panel, #15181b)" stroke="${meta.color}66" stroke-width="1.2"/>`;
      svgColumns += `<text x="10" y="19" fill="${meta.color}" font-size="12" font-weight="700">⠿ ${this.esc(meta.title)}</text>`;
      svgColumns += `<text x="${colWidth - 10}" y="19" text-anchor="end" fill="var(--ink, #e7e9ea)" font-size="11" font-weight="600">${col.total}</text>`;
      svgColumns += `<text x="10" y="36" fill="var(--muted, #8b9298)" font-size="10">${this.esc(meta.subtitle)}</text>`;
      svgColumns += `<title>Drag header to reposition the ${this.esc(meta.title)} column</title>`;
      svgColumns += `</g>`;

      if (col.bars.length === 0) {
        svgColumns += `<rect x="${col.x}" y="${padTop}" width="${colWidth}" height="80" rx="6" fill="var(--panel, #15181b)" stroke="var(--panel2, #242b30)" stroke-dasharray="4 4"/>`;
        svgColumns += `<text x="${col.x + colWidth / 2}" y="${padTop + 44}" text-anchor="middle" fill="var(--muted, #8b9298)" font-size="11">No items in stage</text>`;
      }

      for (const b of col.bars) {
        const isSeed = blastResult !== null && b.minHop === 0;
        const isAffected = blastResult !== null && b.inLineage;
        const isDimmed = blastResult !== null && !b.inLineage;

        // Energized styling for affected bars vs toned-down styling for unaffected bars
        const fillOpacity = isDimmed
          ? 0.13
          : isSeed
            ? 1.0
            : isAffected
              ? Number((0.55 + 0.45 * b.maxEnergy).toFixed(2))
              : 0.78;
        const strokeColor = b.hasGap
          ? "#ef4444"
          : isSeed
            ? "#ffffff"
            : isAffected && b.minHop === 1
              ? "#fef08a"
              : meta.color;
        const strokeW = isSeed ? 2.6 : isAffected ? Number((1.2 + 1.2 * b.maxEnergy).toFixed(1)) : b.hasGap ? 2.0 : 1.0;
        const glowAttr = isSeed || (isAffected && b.maxEnergy >= 0.78) ? ` filter="url(#sankey-glow)"` : "";

        const maxChars = Math.max(10, Math.floor((colWidth - 46) / 6.2));
        const rawLabel = b.isGroup ? `📁 ${b.label}` : b.label;
        const shortLabel = rawLabel.length > maxChars ? rawLabel.slice(0, maxChars - 1) + "…" : rawLabel;

        // Badge shows hop & blast energy % when a node is selected, otherwise member count or gap alert
        let badgeText = "";
        let badgeColor = meta.color;
        if (isSeed) {
          badgeText = "⚡ SEED";
          badgeColor = "#fde047";
        } else if (isAffected) {
          badgeText = `${b.minHop}h · ${Math.round(b.maxEnergy * 100)}%`;
          badgeColor = b.minHop === 1 ? "#fde047" : meta.color;
        } else if (b.isGroup) {
          badgeText = `${b.memberCount}`;
        } else if (b.hasGap) {
          badgeText = "⚠ 0 tests";
          badgeColor = "#f87171";
        }

        const dirOrNodeKey = b.isGroup && b.id.startsWith("dir:") ? b.id.split(":").slice(2).join(":") : b.id;

        svgColumns += `<g class="sankey-bar" data-bar-id="${this.esc(b.id)}" data-dir-key="${this.esc(dirOrNodeKey)}" data-stage="${col.stage}" data-is-group="${b.isGroup ? "1" : "0"}" data-first-node="${this.esc(b.memberIds[0] || "")}" transform="translate(${b.x}, ${b.y})" style="cursor:grab;" opacity="${fillOpacity}">`;
        svgColumns += `<rect x="0" y="0" width="${b.w}" height="${b.h}" rx="5" fill="${isSeed ? `${meta.color}33` : "var(--panel, #181c20)"}" stroke="${strokeColor}" stroke-width="${strokeW}"${glowAttr}/>`;
        svgColumns += `<rect x="0" y="0" width="${isSeed ? 7 : 5}" height="${b.h}" rx="2" fill="${isSeed ? "#fde047" : meta.color}"/>`;
        svgColumns += `<text x="11" y="${Math.min(b.h / 2 + 4, 18)}" fill="${isSeed ? "#ffffff" : "var(--ink, #e7e9ea)"}" font-size="11" font-weight="${isSeed || b.isGroup ? "700" : isAffected ? "600" : "400"}">${this.esc(shortLabel)}</text>`;
        if (badgeText) {
          svgColumns += `<text x="${b.w - 8}" y="${Math.min(b.h / 2 + 4, 18)}" text-anchor="end" fill="${badgeColor}" font-size="9.5" font-weight="700">${this.esc(badgeText)}</text>`;
        }
        svgColumns += `<title>${this.esc(b.label)} (${b.memberCount} node${b.memberCount === 1 ? "" : "s"}${isAffected ? ` · Hop ${b.minHop} · Blast Energy ${Math.round(b.maxEnergy * 100)}%` : ""}${b.hasGap ? " — GAP: 0 linked tests/docs" : ""})\n• Click: Energize affected lineage\n• ${b.isGroup ? "Double-click: Expand/collapse folder\n• " : ""}Right-click: Hide folder/bar\n• Drag: Move bar</title>`;
        svgColumns += `</g>`;
      }
      svgColumns += `</g>`;
    }

    this.container.innerHTML = `
      <div class="sankey-toolbar" style="position:absolute; top:76px; left:14px; right:14px; z-index:4; display:flex; flex-wrap:wrap; align-items:center; gap:8px; background:var(--panel, #15181b); border:1px solid var(--border, #242b30); border-radius:7px; padding:4px 10px; font-size:11px; color:var(--ink, #e7e9ea);">
        <span style="font-weight:600; color:var(--accent, #38bdf8);">Stacked Lifecycle Flow</span>
        <button type="button" class="ptool-btn" id="sankeyGroupFolders" title="Roll up files & test suites into directory/domain bars">${collapsedCount > 0 ? `📁 Folders Grouped (${collapsedCount})` : "📁 Group by Folder"}</button>
        <button type="button" class="ptool-btn" id="sankeyExpandFiles" title="Expand all folders into individual files">📄 Expand All Files</button>
        <input type="search" id="sankeyDirFilter" value="${this.esc(this.dirFilterQuery)}" placeholder="Filter folders/files (e.g. test/viz, src/graph)…" style="width:190px; background:var(--bg, #0b0e11); color:var(--ink, #e7e9ea); border:1px solid var(--border, #242b30); border-radius:5px; padding:2px 7px; font-size:11px;" title="Filter columns by directory or file substring (or use the left Files tree panel)">
        ${hiddenDirCount > 0 ? `<button type="button" class="ptool-btn" id="sankeyRestoreHidden" style="color:#38bdf8;" title="Restore right-clicked hidden folders/bars">👁 Restore Hidden (${hiddenDirCount})</button>` : ""}
        <label style="display:flex; align-items:center; gap:4px; cursor:pointer; margin-left:2px;" title="Highlight code modules with 0 linked tests or docs">
          <input type="checkbox" id="sankeyOnlyGaps" ${this.onlyGaps ? "checked" : ""}>
          <span style="color:${gapCount > 0 ? "#f87171" : "var(--muted)"}; font-weight:600;">⚠ Gaps (${gapCount})</span>
        </label>
        <label style="display:flex; align-items:center; gap:4px; margin-left:4px;" title="Minimum link count to draw a ribbon">
          <span style="color:var(--muted);">Min Flow: <b>${this.minCouplingWeight}</b></span>
          <input type="range" id="sankeyMinWeight" min="1" max="10" step="1" value="${this.minCouplingWeight}" style="width:55px; cursor:pointer;">
        </label>
        <label style="display:flex; align-items:center; gap:4px; margin-left:4px;" title="Effect attenuation per hop (γ): controls how quickly blast energy decays across 2+ hops">
          <span style="color:var(--muted);">Hop Decay: <b>${Math.round(this.hopDecay * 100)}%</b></span>
          <input type="range" id="sankeyHopDecay" min="0.3" max="1.0" step="0.05" value="${this.hopDecay}" style="width:55px; cursor:pointer;">
        </label>
        ${hasCustomLayout ? `<button type="button" class="ptool-btn" id="sankeyResetLayout" title="Reset dragged bars, columns, and pan/zoom">↺ Reset Layout</button>` : ""}
        ${focusSeeds ? `<button type="button" class="ptool-btn" id="sankeyClearTrace" style="color:#fde047; font-weight:600;">✕ Clear Blast Trace</button>` : ""}
        <span style="color:var(--muted, #8b9298); font-size:10px; margin-left:auto;">💡 Click bar: Blast Trace · Dbl-click folder: Expand · Right-click: Hide · Drag: Move</span>
      </div>
      <svg class="sankey-svg" width="${W}" height="${Math.max(H, 680)}" viewBox="0 0 ${W} ${Math.max(H, 680)}" style="width:100%; height:100%; overflow:hidden; display:block; user-select:none; cursor:grab;">
        ${svgDefs}
        <g class="sankey-viewport" transform="translate(${this.panX}, ${this.panY}) scale(${this.zoom})">
          <g class="sankey-ribbons">${svgRibbons}</g>
          <g class="sankey-columns">${svgColumns}</g>
        </g>
      </svg>
    `;

    // Wire interactive toolbar events
    this.container.querySelector("#sankeyGroupFolders")?.addEventListener("click", () => {
      this.collapseAllFolders();
    });
    this.container.querySelector("#sankeyExpandFiles")?.addEventListener("click", () => {
      this.expandAllFolders();
    });
    const filterInput = this.container.querySelector<HTMLInputElement>("#sankeyDirFilter");
    filterInput?.addEventListener("input", () => {
      const selStart = filterInput.selectionStart;
      this.dirFilterQuery = filterInput.value;
      this.render();
      const nextInput = this.container.querySelector<HTMLInputElement>("#sankeyDirFilter");
      if (nextInput) {
        nextInput.focus();
        if (selStart !== null) nextInput.setSelectionRange(selStart, selStart);
      }
    });
    this.container.querySelector("#sankeyRestoreHidden")?.addEventListener("click", () => {
      this.hiddenDirs.clear();
      this.render();
    });
    this.container.querySelector("#sankeyOnlyGaps")?.addEventListener("change", (ev) => {
      this.onlyGaps = (ev.target as HTMLInputElement).checked;
      this.render();
    });
    this.container.querySelector("#sankeyMinWeight")?.addEventListener("input", (ev) => {
      this.minCouplingWeight = parseInt((ev.target as HTMLInputElement).value, 10) || 1;
      this.render();
    });
    this.container.querySelector("#sankeyHopDecay")?.addEventListener("input", (ev) => {
      this.hopDecay = parseFloat((ev.target as HTMLInputElement).value) || 0.65;
      this.render();
    });
    this.container.querySelector("#sankeyResetLayout")?.addEventListener("click", () => {
      this.resetLayout();
    });
    this.container.querySelector("#sankeyClearTrace")?.addEventListener("click", () => {
      this.selectedId = null;
      this.selectedBarIds = null;
      this.onSelect(null);
      this.render();
    });

    // Helper to dynamically update SVG ribbons (including dynamic entry/exit port sorting) during live drag
    const ribbonEls = Array.from(this.container.querySelectorAll<SVGPathElement>(".sankey-ribbon"));
    const refreshLiveRibbons = () => {
      const updatedPaths = computeAllRibbonPaths();
      for (const pathEl of ribbonEls) {
        const rKey = pathEl.getAttribute("data-ribbon-key") || "";
        const d = updatedPaths.get(rKey);
        if (d) {
          pathEl.setAttribute("d", d);
        }
      }
    };

    const svgEl = this.container.querySelector<SVGSVGElement>(".sankey-svg");
    const viewportEl = this.container.querySelector<SVGGElement>(".sankey-viewport");

    // 1. Interactive Bar Dragging + Click to Energize Lineage + DblClick to Expand Folder + Right-Click to Hide
    this.container.querySelectorAll<SVGGElement>(".sankey-bar").forEach((el) => {
      const barId = el.getAttribute("data-bar-id") || "";
      const dirKey = el.getAttribute("data-dir-key") || "";
      const isGroup = el.getAttribute("data-is-group") === "1";
      const firstNode = el.getAttribute("data-first-node") || "";
      const lb = barLayout.get(barId);
      if (!lb) return;

      let dragging = false;
      let moved = false;
      let startClientX = 0;
      let startClientY = 0;
      let startOffX = 0;
      let startOffY = 0;

      // Right-click hides a noisy directory or file bar immediately
      el.addEventListener("contextmenu", (ev: MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (dirKey) {
          this.hiddenDirs.add(dirKey);
          this.render();
        }
      });

      // Double-click expands/collapses a folder group bar
      el.addEventListener("dblclick", (ev: MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (isGroup && barId.startsWith("dir:")) {
          const folderPath = barId.split(":").slice(2).join(":");
          if (this.collapsedDirs.has(folderPath)) {
            this.collapsedDirs.delete(folderPath);
          } else {
            this.collapsedDirs.add(folderPath);
          }
          this.render();
        }
      });

      el.addEventListener("pointerdown", (ev: PointerEvent) => {
        if (ev.button !== 0) return;
        ev.stopPropagation();
        dragging = true;
        moved = false;
        startClientX = ev.clientX;
        startClientY = ev.clientY;
        const curOff = this.barOffsets.get(barId) ?? { dx: 0, dy: 0 };
        startOffX = curOff.dx;
        startOffY = curOff.dy;
        el.style.cursor = "grabbing";
        el.parentElement?.appendChild(el);
        try {
          el.setPointerCapture(ev.pointerId);
        } catch {
          // ignore in headless mock environments
        }
      });

      el.addEventListener("pointermove", (ev: PointerEvent) => {
        if (!dragging) return;
        ev.stopPropagation();
        const rawDx = ev.clientX - startClientX;
        const rawDy = ev.clientY - startClientY;
        if (Math.hypot(rawDx, rawDy) > 3) {
          moved = true;
        }
        const dx = rawDx / this.zoom;
        const dy = rawDy / this.zoom;
        const nextOff = { dx: Math.round(startOffX + dx), dy: Math.round(startOffY + dy) };
        this.barOffsets.set(barId, nextOff);

        const colOff = this.colOffsets.get(lb.stage) ?? { dx: 0, dy: 0 };
        lb.x = lb.baseX + colOff.dx + nextOff.dx;
        lb.y = lb.baseY + colOff.dy + nextOff.dy;
        el.setAttribute("transform", `translate(${lb.x}, ${lb.y})`);
        refreshLiveRibbons();
      });

      const endBarDrag = (ev: PointerEvent) => {
        if (!dragging) return;
        ev.stopPropagation();
        dragging = false;
        el.style.cursor = "grab";
        try {
          el.releasePointerCapture(ev.pointerId);
        } catch {
          // ignore
        }
        if (!moved) {
          // Single-click energizes the blast trace for this bar (whether file or folder group!)
          const alreadySelected =
            this.selectedId === firstNode &&
            this.selectedBarIds?.length === lb.memberIds.length;
          if (alreadySelected) {
            this.selectedId = null;
            this.selectedBarIds = null;
            this.onSelect(null);
          } else {
            this.selectedId = firstNode || null;
            this.selectedBarIds = [...lb.memberIds];
            this.onSelect(this.selectedId);
          }
          this.render();
        } else {
          this.render();
        }
      };

      el.addEventListener("pointerup", endBarDrag);
      el.addEventListener("pointercancel", endBarDrag);
    });

    // 2. Interactive Column Header Dragging (move entire stage column)
    this.container.querySelectorAll<SVGGElement>(".sankey-col-header").forEach((headerEl) => {
      const stage = (headerEl.getAttribute("data-stage") || "") as ArtifactStage;
      const colObj = stageColumns.find((c) => c.stage === stage);
      if (!colObj) return;

      let draggingCol = false;
      let startClientX = 0;
      let startClientY = 0;
      let startColX = 0;
      let startColY = 0;

      headerEl.addEventListener("pointerdown", (ev: PointerEvent) => {
        if (ev.button !== 0) return;
        ev.stopPropagation();
        draggingCol = true;
        startClientX = ev.clientX;
        startClientY = ev.clientY;
        const curOff = this.colOffsets.get(stage) ?? { dx: 0, dy: 0 };
        startColX = curOff.dx;
        startColY = curOff.dy;
        headerEl.style.cursor = "grabbing";
        try {
          headerEl.setPointerCapture(ev.pointerId);
        } catch {
          // ignore
        }
      });

      headerEl.addEventListener("pointermove", (ev: PointerEvent) => {
        if (!draggingCol) return;
        ev.stopPropagation();
        const dx = (ev.clientX - startClientX) / this.zoom;
        const dy = (ev.clientY - startClientY) / this.zoom;
        const nextOff = { dx: Math.round(startColX + dx), dy: Math.round(startColY + dy) };
        this.colOffsets.set(stage, nextOff);

        colObj.x = colObj.baseX + nextOff.dx;
        colObj.headerY = colObj.baseHeaderY + nextOff.dy;
        headerEl.setAttribute("transform", `translate(${colObj.x}, ${colObj.headerY})`);

        for (const lb of colObj.bars) {
          const barOff = this.barOffsets.get(lb.id) ?? { dx: 0, dy: 0 };
          lb.x = lb.baseX + nextOff.dx + barOff.dx;
          lb.y = lb.baseY + nextOff.dy + barOff.dy;
        }
        const colGroup = headerEl.parentElement;
        colGroup?.querySelectorAll<SVGGElement>(".sankey-bar").forEach((barEl) => {
          const bid = barEl.getAttribute("data-bar-id") || "";
          const lb = barLayout.get(bid);
          if (lb) {
            barEl.setAttribute("transform", `translate(${lb.x}, ${lb.y})`);
          }
        });
        refreshLiveRibbons();
      });

      const endColDrag = (ev: PointerEvent) => {
        if (!draggingCol) return;
        ev.stopPropagation();
        draggingCol = false;
        headerEl.style.cursor = "grab";
        try {
          headerEl.releasePointerCapture(ev.pointerId);
        } catch {
          // ignore
        }
        this.render();
      };

      headerEl.addEventListener("pointerup", endColDrag);
      headerEl.addEventListener("pointercancel", endColDrag);
    });

    // 3. SVG Background Pan & Wheel Zoom + Click Empty Background to Clear Selection
    if (svgEl && viewportEl) {
      let panning = false;
      let panMoved = false;
      let panStartX = 0;
      let panStartY = 0;
      let initialPanX = 0;
      let initialPanY = 0;

      svgEl.addEventListener("pointerdown", (ev: PointerEvent) => {
        if (ev.button !== 0) return;
        const target = ev.target as Element | null;
        if (target?.closest(".sankey-bar") || target?.closest(".sankey-col-header")) return;
        panning = true;
        panMoved = false;
        panStartX = ev.clientX;
        panStartY = ev.clientY;
        initialPanX = this.panX;
        initialPanY = this.panY;
        svgEl.style.cursor = "grabbing";
        try {
          svgEl.setPointerCapture(ev.pointerId);
        } catch {
          // ignore
        }
      });

      svgEl.addEventListener("pointermove", (ev: PointerEvent) => {
        if (!panning) return;
        const dx = ev.clientX - panStartX;
        const dy = ev.clientY - panStartY;
        if (Math.hypot(dx, dy) > 3) panMoved = true;
        this.panX = Math.round(initialPanX + dx);
        this.panY = Math.round(initialPanY + dy);
        viewportEl.setAttribute("transform", `translate(${this.panX}, ${this.panY}) scale(${this.zoom})`);
      });

      const endPan = (ev: PointerEvent) => {
        if (!panning) return;
        panning = false;
        svgEl.style.cursor = "grab";
        try {
          svgEl.releasePointerCapture(ev.pointerId);
        } catch {
          // ignore
        }
        if (!panMoved && (this.selectedId || this.selectedBarIds)) {
          this.selectedId = null;
          this.selectedBarIds = null;
          this.onSelect(null);
          this.render();
        }
      };

      svgEl.addEventListener("pointerup", endPan);
      svgEl.addEventListener("pointercancel", endPan);

      svgEl.addEventListener(
        "wheel",
        (ev: WheelEvent) => {
          ev.preventDefault();
          const factor = ev.deltaY < 0 ? 1.1 : 0.9;
          const nextZoom = Math.min(3.5, Math.max(0.35, Number((this.zoom * factor).toFixed(3))));
          const rect = svgEl.getBoundingClientRect();
          const mx = ev.clientX - rect.left;
          const my = ev.clientY - rect.top;
          this.panX = Math.round(mx - ((mx - this.panX) / this.zoom) * nextZoom);
          this.panY = Math.round(my - ((my - this.panY) / this.zoom) * nextZoom);
          this.zoom = nextZoom;
          viewportEl.setAttribute("transform", `translate(${this.panX}, ${this.panY}) scale(${this.zoom})`);
        },
        { passive: false },
      );
    }
  }

  private esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
}

