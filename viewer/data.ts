/**
 * Data layer: fetches both graphs from the graft viz server and carries the
 * edge semantics (verb → family → form) defined in the design spec.
 */
import { scopeOfNode } from "../src/graph/filter.js";
export {
  type TripartiteScope,
  type ConcreteScope,
  type GraphFilterCriteria,
  scopeOfPath,
  scopeOfNode,
  matchesScope,
  isPathExcluded,
  matchNodeFilter,
} from "../src/graph/filter.js";
export { generateTransitiveEdges, type TransitiveEdge } from "../src/graph/transitive.js";
export {
  type ArtifactStage,
  STAGE_ORDER,
  STAGE_INDEX,
  type TriState,
  type TriStateFilterInput,
  type TriStateFilterResult,
  type CircletraceResult,
  type SankeyBar,
  type SankeyRibbon,
  type SankeyColumn,
  type SankeyGraph,
  classifyArtifactStage,
  computeLineageSet,
  computeCircletrace,
  evaluateTriStateFilter,
  computeSankeyColumns,
  SankeyView,
} from "./sankey.js";

export interface VizNode {
  id: string;
  name: string;
  type: string;
  summary: string;
  sources: string[];
  evidence?: Evidence[];
  owners?: NodeOwner[];
  childCount?: number;
}

/** A contributor on a node — see `NodeOwner` in src/viz/assemble.ts. */
export interface NodeOwner {
  name: string;
  handle?: string;
  commits: number;
  /** `YYYY-MM-DD`; the viewer turns it into "9d ago" when it renders. */
  last: string;
}

export interface VizEdge {
  source: string;
  target: string;
  relation: string;
  description?: string;
  confidence?: "extracted" | "inferred";
}

export interface EvidenceLine {
  n: number | null;
  sign: "+" | "-" | " ";
  text: string;
}

/** A code snippet shown under a node — see `Evidence` in src/viz/assemble.ts. */
export interface Evidence {
  label: string;
  note?: string;
  lines: EvidenceLine[];
  more?: number;
}

export interface VizGraph {
  meta: {
    repoName?: string; subtitle?: string;
    /** Set by `graft viz --export`: the tab whose graph actually has content. */
    defaultTab?: "context" | "code";
    /** Tabs this page offers. A blast export ships Context alone. */
    tabs?: Array<"context" | "code" | "outline">;
    nodeCount: number; edgeCount: number; skippedFiles?: number; droppedEdges?: number;
    /** Why the graph is empty, when it is — set by `blast --export-viz`. */
    emptyNote?: string;
  };
  nodes: VizNode[];
  edges: VizEdge[];
}

/** Every relation verb belongs to one family; form follows family. */
export type Family = "structure" | "dependency" | "contract" | "association";

const FAMILY: Record<string, Family> = {
  part_of: "structure", contains: "structure",
  uses: "dependency", depends_on: "dependency", calls: "dependency", imports: "dependency",
  produces: "dependency", configures: "dependency", validates: "dependency",
  extends: "contract", implements: "contract", influences: "contract", covers: "contract", verifies: "contract", binds: "contract", transitive: "contract", defines: "contract",
  references: "association", documents: "association",
};

export function famOf(rel: string): Family {
  return FAMILY[rel] ?? "association";
}

/** Force-spring rest length per family: hierarchy pulls tight. */
export const REST: Record<Family, number> = { structure: 85, dependency: 145, contract: 150, association: 185 };

/** Chip grouping: "part of" and "uses" are clear as groups; other verbs stand alone. */
export function chipKey(rel: string): string {
  if (famOf(rel) === "structure") return "part of";
  if (rel === "calls" || rel === "uses" || rel === "depends_on" || rel === "imports") return "uses";
  return rel.replace(/_/g, " ");
}

/** Hover hint: the question the verb answers for someone building or reviewing code. */
export const CHIP_HINT: Record<string, string> = {
  "part of": "where does this live? (contains, part of)",
  "uses": "what breaks if the target changes? (calls, uses, depends on, imports)",
  "produces": "where does this output come from?",
  "configures": "what changes its behavior without a code change?",
  "validates": "what checks or judges this? (tests, drift checks, scoring)",
  "extends": "what contract must this honor? (inheritance)",
  "implements": "what contract must this honor? (interface)",
  "influences": "which architectural decision governs this?",
  "covers": "what code or test does this specification cover?",
  "documents": "what does this document or explain?",
  "verifies": "what implementation does this test verify?",
  "binds": "which step definition binds this step?",
  "defines": "what contract, type, or capability does this specify?",
  "transitive": "indirect dependency across filtered intermediate nodes",
  "references": "mentioned but never called — possible dead coupling",
};

/** Canonical rainbow color palette per relation type/verb. */
export const RELATION_COLORS: Record<string, string> = {
  // Structure (contains, part of): Electric Sky Blue
  "part of": "#38bdf8",
  part_of: "#38bdf8",
  contains: "#38bdf8",

  // Dependency & calls: Golden Amber
  uses: "#fbbf24",
  calls: "#fbbf24",
  depends_on: "#fbbf24",
  imports: "#f59e0b",
  produces: "#f97316",
  configures: "#fb923c",
  validates: "#34d399",

  // Contracts & test coverage: Emerald Green & Vivid Purple
  covers: "#10b981",
  verifies: "#10b981",
  binds: "#059669",
  defines: "#c084fc",

  // Documentation: Royal Violet / Purple
  documents: "#a855f7",

  // Architecture influence: Hot Rose / Magenta
  influences: "#ec4899",

  // Inheritance & interfaces: Coral Red & Royal Indigo
  extends: "#f43f5e",
  implements: "#8b5cf6",

  // Inferred shortcuts: Bright Tangerine
  transitive: "#f97316",

  // References: Soft Slate Blue
  references: "#64748b",
};

export function relationColor(rel: string): string {
  const key = chipKey(rel);
  return RELATION_COLORS[key] ?? RELATION_COLORS[rel] ?? "#71828a";
}

/** Node-type → CSS custom property, per tab. */
// `changed` / `affected` come from `graft blast --export-viz`, where the graph is a
// PR's blast radius rather than the concept map: amber for what the diff touched,
// blue for what depends on it. The legend labels itself from these type names.
const CONTEXT_COLORS: Record<string, string> = {
  system: "--sys", concept: "--con", file: "--fil", api: "--api",
  changed: "--fil", affected: "--sys",
};
const CODE_COLORS: Record<string, string> = {
  file: "--k-file", class: "--k-class", function: "--k-fn", method: "--k-method",
  interface: "--k-iface", type: "--k-type", enum: "--k-enum",
};

export function colorToken(
  tab: "context" | "code",
  type: string,
  scope?: "code" | "docs" | "specs",
): string {
  if (scope === "specs") return "--scope-specs";
  if (scope === "docs") {
    if (tab === "context" && type !== "file" && CONTEXT_COLORS[type]) {
      return CONTEXT_COLORS[type];
    }
    return "--scope-docs";
  }
  if (scope === "code") {
    return (tab === "code" ? CODE_COLORS[type] : CONTEXT_COLORS[type]) ?? "--scope-code";
  }
  const m = tab === "code" ? CODE_COLORS : CONTEXT_COLORS;
  return m[type] ?? "--edge";
}

export function cvar(name: string): string {
  if (typeof getComputedStyle === "undefined" || typeof document === "undefined") {
    const defaults: Record<string, string> = {
      "--ink": "#E7E9EA",
      "--panel": "#15181B",
      "--panel2": "#1c2125",
      "--chip": "#1C2125",
      "--muted": "#8B9298",
      "--edge": "#3b4d54",
      "--amber": "#fbbf24",
      "--accent": "#38bdf8",
      "--adrs": "#ec4899",
      "--features": "#10b981",
      "--code": "#38bdf8",
      "--tests": "#10b981",
      "--docs": "#a855f7",
    };
    return defaults[name] ?? "#888888";
  }
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Graphs inlined by `graft viz --export`, when the page was exported rather than
 * served. The static file has no server behind it, so a fetch would 404 — but the
 * viewer must not care which way it was opened, so this is the only place that
 * knows the difference.
 */
interface InlinedData {
  contextGraph?: VizGraph;
  codeGraph?: unknown;
}
const inlined = (globalThis as { __GRAFT_DATA__?: InlinedData }).__GRAFT_DATA__;

export async function loadContextGraph(): Promise<VizGraph> {
  if (inlined?.contextGraph) return inlined.contextGraph;
  const res = await fetch("/api/context-graph");
  return (await res.json()) as VizGraph;
}

interface CodeGraphV1 {
  meta: { version: number; nodeCount: number; edgeCount: number };
  nodes: Array<{
    id: string; name: string; kind: string; path: string; span: string;
    signature: string | null; summary: string | null; crux: { code: string; span: string } | null;
  }>;
  edges: Array<{ source: string; target: string; relation: string; confidence: "extracted" | "inferred" }>;
}

/** Fetch graph.json and reshape it into the viewer's graph form (null if absent). */
export async function loadCodeGraph(): Promise<VizGraph | null> {
  let raw: CodeGraphV1;
  if (inlined) {
    if (!inlined.codeGraph) return null;
    raw = inlined.codeGraph as CodeGraphV1;
  } else {
    const res = await fetch("/api/code-graph");
    if (!res.ok) return null;
    raw = (await res.json()) as CodeGraphV1;
  }
  const nodes: VizNode[] = raw.nodes.map((n) => ({
    id: n.id,
    name: n.name,
    type: n.kind,
    summary: n.summary ?? n.signature ?? "",
    sources: [`${n.path} · ${n.span}`],
  }));
  const known = new Set(nodes.map((n) => n.id));
  // imports edges may point at unresolved module strings — drop those for rendering
  const edges: VizEdge[] = raw.edges
    .filter((e) => known.has(e.source) && known.has(e.target))
    .map((e) => ({ source: e.source, target: e.target, relation: e.relation, confidence: e.confidence }));
  return { meta: { nodeCount: nodes.length, edgeCount: edges.length }, nodes, edges };
}

/** Subscribe to the server's live-reload channel, when there is a server at all. */
export function onServerChange(handler: () => void): void {
  // An exported page has no /events endpoint, and EventSource retries a failed
  // connection forever — a console error every few seconds on a static file.
  if (inlined) return;
  const source = new EventSource("/events");
  source.onmessage = (ev) => {
    if (ev.data === "change") handler();
  };
}

/**
 * Resolves the parent container ID for a node.
 * For a file or high-level architecture concept/system/api, the parent is itself.
 * For granular symbols (function, method, type, class, section, etc.),
 * resolves to the parent file path via `node.sources` or `node.id.split("#")[0]`.
 */
export function parentIdOfNode(n: { id: string; type?: string; sources?: string[] }): string {
  if (n.type === "file" || n.type === "concept" || n.type === "system" || n.type === "api") {
    return n.id;
  }
  if (n.sources && n.sources.length > 0) {
    const rawPath = n.sources[0].split(" · ")[0].trim();
    if (rawPath) return rawPath;
  }
  if (n.id.includes("#")) {
    return n.id.split("#")[0];
  }
  return n.id;
}

/**
 * Aggregates granular symbol nodes (functions, methods, types, markdown sections)
 * into their parent container (file or concept) and lifts cross-container edges.
 */
export function aggregateGraphToParents(graph: VizGraph): VizGraph {
  if (!graph || graph.nodes.length === 0) return graph;

  const parentMap = new Map<string, string>();
  const parentNodes = new Map<string, VizNode>();
  const childCounts = new Map<string, number>();
  const childTypes = new Map<string, Map<string, number>>();
  const childOwners = new Map<string, Map<string, NodeOwner>>();

  // First pass: index existing file/container nodes and identify parents
  for (const n of graph.nodes) {
    const pid = parentIdOfNode(n);
    parentMap.set(n.id, pid);

    if (n.id === pid) {
      parentNodes.set(pid, { ...n });
    } else {
      childCounts.set(pid, (childCounts.get(pid) ?? 0) + 1);

      if (!childTypes.has(pid)) childTypes.set(pid, new Map());
      const typeMap = childTypes.get(pid)!;
      typeMap.set(n.type, (typeMap.get(n.type) ?? 0) + 1);

      if (n.owners && n.owners.length > 0) {
        if (!childOwners.has(pid)) childOwners.set(pid, new Map());
        const ownersMap = childOwners.get(pid)!;
        for (const o of n.owners) {
          const key = o.name || o.handle || "";
          const prev = ownersMap.get(key);
          if (prev) {
            prev.commits += o.commits;
            if (o.last > prev.last) prev.last = o.last;
          } else {
            ownersMap.set(key, { ...o });
          }
        }
      }
    }
  }

  // Second pass: synthesize container nodes if any children lacked an explicit file node
  for (const [pid, count] of childCounts.entries()) {
    if (!parentNodes.has(pid)) {
      const baseName = pid.replace(/\\/g, "/").split("/").pop() || pid;
      parentNodes.set(pid, {
        id: pid,
        name: baseName,
        type: "file",
        summary: "",
        sources: [pid],
      });
    }
  }

  // Third pass: decorate parent nodes with child counts and summary
  const aggregatedNodes: VizNode[] = [];
  for (const [pid, node] of parentNodes.entries()) {
    const count = childCounts.get(pid) ?? 0;
    const decorated: VizNode = { ...node, childCount: count };

    if ((!decorated.owners || decorated.owners.length === 0) && childOwners.has(pid)) {
      decorated.owners = Array.from(childOwners.get(pid)!.values())
        .sort((a, b) => b.commits - a.commits);
    }

    if (count > 0) {
      const typeMap = childTypes.get(pid);
      const typeParts = typeMap
        ? Array.from(typeMap.entries())
            .map(([t, c]) => `${c} ${t}${c > 1 ? "s" : ""}`)
            .join(", ")
        : "";
      const countSummary = `${count} symbols (${typeParts})`;
      if (!decorated.summary) {
        decorated.summary = countSummary;
      } else if (!decorated.summary.includes("symbols")) {
        decorated.summary = `${decorated.summary} · ${countSummary}`;
      }
    }

    aggregatedNodes.push(decorated);
  }

  // Fourth pass: lift edges between parent containers
  const liftedEdgesMap = new Map<string, VizEdge>();
  for (const e of graph.edges) {
    const srcParent = parentMap.get(e.source) ?? e.source;
    const tgtParent = parentMap.get(e.target) ?? e.target;

    // Intra-container edge: absorbed into parent
    if (srcParent === tgtParent) continue;

    // Ensure both endpoints exist in aggregated nodes
    if (!parentNodes.has(srcParent) || !parentNodes.has(tgtParent)) continue;

    const edgeKey = `${srcParent}->${tgtParent}:${e.relation}`;
    if (!liftedEdgesMap.has(edgeKey)) {
      liftedEdgesMap.set(edgeKey, {
        source: srcParent,
        target: tgtParent,
        relation: e.relation,
        description: e.description,
        confidence: e.confidence,
      });
    }
  }

  const aggregatedEdges = Array.from(liftedEdgesMap.values());

  return {
    meta: {
      ...graph.meta,
      nodeCount: aggregatedNodes.length,
      edgeCount: aggregatedEdges.length,
    },
    nodes: aggregatedNodes,
    edges: aggregatedEdges,
  };
}

/**
 * Extracts the architectural subsystem cluster key and display label for a node
 * based on its source path or node identifier (up to 2 directory levels, e.g., `src/graph`).
 */
export function clusterKeyOfNode(node: { id: string; sources?: string[]; scope: string }): { key: string; name: string } {
  if (node.sources && node.sources.length > 0) {
    const rawPath = node.sources[0].split(" · ")[0].trim();
    const parts = rawPath.replace(/\\/g, "/").split("/");
    if (parts.length > 1) {
      const dir = parts.slice(0, parts.length > 2 ? 2 : 1).join("/");
      return { key: dir, name: dir };
    }
  }
  if (node.id.includes("/")) {
    const parts = node.id.split("#")[0].replace(/\\/g, "/").split("/");
    if (parts.length > 1) {
      const dir = parts.slice(0, parts.length > 2 ? 2 : 1).join("/");
      return { key: dir, name: dir };
    }
  }
  return { key: node.scope, name: node.scope.toUpperCase() };
}

/**
 * Consolidates single-node orphan micro-clusters (`count < 2`) into their top-level parent
 * subsystem directory (`src`, `docs`, `features`, `scripts`, or `root`) so isolated 1-file
 * directories do not float as lonely dots in deep void space (ADR 0015 / Feature 18).
 */
export function consolidateOrphanClusters(
  nodes: Array<{ id: string; sources?: string[]; scope: string }>,
): Map<string, string> {
  const rawKeys = new Map<string, string>();
  const counts = new Map<string, number>();

  for (const n of nodes) {
    const k = clusterKeyOfNode(n).key;
    rawKeys.set(n.id, k);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const consolidated = new Map<string, string>();
  for (const n of nodes) {
    const k = rawKeys.get(n.id) ?? "root";
    if ((counts.get(k) ?? 0) < 2) {
      const topDir = k.includes("/") ? k.split("/")[0] : (k !== "code" && k !== "docs" && k !== "specs" ? k : n.scope);
      consolidated.set(n.id, topDir);
    } else {
      consolidated.set(n.id, k);
    }
  }
  return consolidated;
}

/**
 * Synthesizes lightweight subsystem `module` container nodes and structural `part_of` edges
 * for multi-file directory galaxies when parent aggregation is active on the Code tab (ADR 0015).
 * Restores the explicit 2-tier tree hierarchy (`module -> file`) and `part of` edge filter chip.
 */
export function synthesizeDirectoryTree(graph: VizGraph): VizGraph {
  if (!graph || graph.nodes.length === 0) return graph;

  const nodesWithScope = graph.nodes.map((n) => ({ ...n, scope: scopeOfNode(n) }));
  const clusterMap = consolidateOrphanClusters(nodesWithScope);
  const clusterMembers = new Map<string, VizNode[]>();

  for (const n of graph.nodes) {
    const cKey = clusterMap.get(n.id) ?? "root";
    let list = clusterMembers.get(cKey);
    if (!list) {
      list = [];
      clusterMembers.set(cKey, list);
    }
    list.push(n);
  }

  const existingIds = new Set(graph.nodes.map((n) => n.id));
  const nextNodes = [...graph.nodes];
  const nextEdges = [...graph.edges];

  for (const [cKey, members] of clusterMembers.entries()) {
    if (members.length < 2) continue;
    const modId = `module:${cKey}`;
    if (!existingIds.has(modId)) {
      nextNodes.push({
        id: modId,
        name: cKey,
        type: "module",
        summary: `Subsystem module container (${members.length} files)`,
        sources: [`${cKey}/`],
        childCount: members.length,
      });
      existingIds.add(modId);
    }
    for (const m of members) {
      if (m.id === modId) continue;
      nextEdges.push({
        source: m.id,
        target: modId,
        relation: "part_of",
        description: `${m.name} is part of subsystem ${cKey}`,
        confidence: "extracted",
      });
    }
  }

  return {
    meta: {
      ...graph.meta,
      nodeCount: nextNodes.length,
      edgeCount: nextEdges.length,
    },
    nodes: nextNodes,
    edges: nextEdges,
  };
}

/** High-contrast subsystem galaxy palette for aggregated file containers. */
export const GALAXY_PALETTE = [
  "#38bdf8", // Sky Blue
  "#fb923c", // Tangerine
  "#818cf8", // Indigo
  "#f472b6", // Pink
  "#2dd4bf", // Teal
  "#facc15", // Sunny Gold
  "#c084fc", // Lavender
  "#fb7185", // Rose Coral
  "#60a5fa", // Cobalt
  "#a3e635", // Lime
];

/**
 * Deterministically maps a subsystem cluster key to a distinct galaxy color,
 * while preserving canonical tripartite colors for specs (emerald) and docs (violet).
 */
export function galaxyColorOfCluster(clusterKey: string, scope: string): string {
  if (scope === "specs" || clusterKey.startsWith("features")) return "#10b981";
  if (scope === "docs" || clusterKey.startsWith("docs")) return "#a855f7";
  let hash = 0;
  for (let i = 0; i < clusterKey.length; i++) {
    hash = (hash * 31 + clusterKey.charCodeAt(i)) >>> 0;
  }
  return GALAXY_PALETTE[hash % GALAXY_PALETTE.length];
}

export type EdgeContractionMode = "coupled" | "code" | "spec" | "doc" | "directory";

export interface CosmosWeightTuning {
  structure: number;     // part_of, contains (0.0 - 4.0)
  dependency: number;    // uses, calls, implements, extends (0.0 - 4.0)
  contract: number;      // covers, verifies, defines (0.0 - 4.0)
  association: number;   // documents, influences, references (0.0 - 4.0)
  supportWeight: number; // incoming pull to detected support/utility sinks (0.0 - 1.5, default 0.15)
  clusterGap: number;    // minVoidGap between clusters in px (10 - 120, default 38)
  useHeuristics?: boolean; // toggle support / utility sink auto-detection (default true)
}

export const COSMOS_PRESETS: Record<EdgeContractionMode, CosmosWeightTuning> = {
  coupled: { structure: 1.2, dependency: 1.8, contract: 2.5, association: 2.0, supportWeight: 0.15, clusterGap: 38, useHeuristics: true },
  code: { structure: 1.8, dependency: 3.0, contract: 0.85, association: 0.65, supportWeight: 0.12, clusterGap: 35, useHeuristics: true },
  spec: { structure: 1.1, dependency: 0.8, contract: 3.5, association: 2.2, supportWeight: 0.08, clusterGap: 42, useHeuristics: true },
  doc: { structure: 1.0, dependency: 0.65, contract: 1.85, association: 3.5, supportWeight: 0.08, clusterGap: 44, useHeuristics: true },
  directory: { structure: 2.8, dependency: 1.0, contract: 1.1, association: 1.0, supportWeight: 0.15, clusterGap: 55, useHeuristics: true },
};

export const SEMANTIC_RELATION_WEIGHTS: Record<string, { intra: number; inter: number }> = {
  implements: { intra: 3.0, inter: 2.6 },
  extends: { intra: 3.0, inter: 2.6 },
  defines: { intra: 2.8, inter: 2.2 },
  covers: { intra: 2.5, inter: 2.2 },
  verifies: { intra: 2.5, inter: 2.2 },
  documents: { intra: 2.0, inter: 1.8 },
  influences: { intra: 2.0, inter: 1.8 },
  part_of: { intra: 1.4, inter: 0.5 },
  contains: { intra: 1.4, inter: 0.5 },
  uses: { intra: 1.8, inter: 0.6 },
  calls: { intra: 1.8, inter: 0.6 },
  depends_on: { intra: 1.8, inter: 0.6 },
  references: { intra: 0.45, inter: 0.25 },
};
export const SUPPORT_CLASS_EDGE_WEIGHT = 0.15;

export const COSMOS_RELATION_WEIGHTS: Partial<Record<EdgeContractionMode, Record<string, { intra: number; inter: number }>>> = {
  code: {
    implements: { intra: 3.4, inter: 2.8 },
    extends: { intra: 3.4, inter: 2.8 },
    uses: { intra: 2.6, inter: 1.4 },
    calls: { intra: 2.6, inter: 1.4 },
    depends_on: { intra: 2.6, inter: 1.4 },
    defines: { intra: 2.6, inter: 2.0 },
    part_of: { intra: 1.8, inter: 0.7 },
    contains: { intra: 1.8, inter: 0.7 },
    covers: { intra: 0.9, inter: 0.75 },
    verifies: { intra: 0.9, inter: 0.75 },
    documents: { intra: 0.7, inter: 0.55 },
    influences: { intra: 0.7, inter: 0.55 },
    references: { intra: 0.3, inter: 0.15 },
  },
  spec: {
    covers: { intra: 3.6, inter: 3.2 },
    verifies: { intra: 3.6, inter: 3.2 },
    defines: { intra: 3.2, inter: 2.8 },
    implements: { intra: 2.4, inter: 2.0 },
    extends: { intra: 2.4, inter: 2.0 },
    influences: { intra: 2.4, inter: 2.1 },
    documents: { intra: 2.4, inter: 2.1 },
    part_of: { intra: 1.1, inter: 0.4 },
    contains: { intra: 1.1, inter: 0.4 },
    uses: { intra: 0.9, inter: 0.35 },
    calls: { intra: 0.9, inter: 0.35 },
    depends_on: { intra: 0.9, inter: 0.35 },
    references: { intra: 0.45, inter: 0.3 },
  },
  doc: {
    documents: { intra: 3.6, inter: 3.3 },
    influences: { intra: 3.6, inter: 3.3 },
    defines: { intra: 3.0, inter: 2.6 },
    references: { intra: 1.8, inter: 1.4 },
    covers: { intra: 2.0, inter: 1.7 },
    verifies: { intra: 2.0, inter: 1.7 },
    implements: { intra: 1.5, inter: 1.1 },
    extends: { intra: 1.5, inter: 1.1 },
    part_of: { intra: 1.0, inter: 0.4 },
    contains: { intra: 1.0, inter: 0.4 },
    uses: { intra: 0.75, inter: 0.25 },
    calls: { intra: 0.75, inter: 0.25 },
    depends_on: { intra: 0.75, inter: 0.25 },
  },
};

export interface EdgeContractionProfile {
  structure: number;
  dependency: number;
  contract: number;
  association: number;
  intraClusterMultiplier: number;
  interClusterMultiplier: number;
  transitiveScale: number;
}

export const EDGE_CONTRACTION_WEIGHTS: Record<EdgeContractionMode, EdgeContractionProfile> = {
  coupled: {
    structure: 0.9,
    dependency: 1.6,
    contract: 2.4,
    association: 2.1,
    intraClusterMultiplier: 1.8,
    interClusterMultiplier: 0.85,
    transitiveScale: 0.45,
  },
  code: {
    structure: 1.8,
    dependency: 3.0,
    contract: 0.85,
    association: 0.65,
    intraClusterMultiplier: 1.8,
    interClusterMultiplier: 0.85,
    transitiveScale: 0.45,
  },
  spec: {
    structure: 1.1,
    dependency: 0.8,
    contract: 3.5,
    association: 2.2,
    intraClusterMultiplier: 1.8,
    interClusterMultiplier: 0.85,
    transitiveScale: 0.45,
  },
  doc: {
    structure: 1.0,
    dependency: 0.65,
    contract: 1.85,
    association: 3.5,
    intraClusterMultiplier: 1.8,
    interClusterMultiplier: 0.85,
    transitiveScale: 0.45,
  },
  directory: {
    structure: 2.8,
    dependency: 1.0,
    contract: 1.1,
    association: 1.0,
    intraClusterMultiplier: 3.5,
    interClusterMultiplier: 0.25,
    transitiveScale: 0.35,
  },
};

/**
 * Computes ForceAtlas2 layout attraction weight for an edge based on relation family,
 * cluster locality (intra vs inter-cluster), transitive state, and edge contraction mode.
 */
export function computeEdgeLayoutWeight(
  relationOrSrc: string,
  isIntraOrTgt: boolean | string,
  transitiveOrRel?: boolean | string,
  mode: EdgeContractionMode = "coupled",
  isSupportTarget = false,
  customTuning?: Partial<CosmosWeightTuning>,
): number {
  let relation: string;
  let isIntraCluster: boolean;
  let transitive = false;
  let activeMode = mode;

  if (typeof isIntraOrTgt === "boolean") {
    relation = relationOrSrc;
    isIntraCluster = isIntraOrTgt;
    transitive = typeof transitiveOrRel === "boolean" ? transitiveOrRel : false;
    activeMode = mode ?? "coupled";
  } else {
    // Legacy support: (sourceCluster, targetCluster, relation)
    const src = relationOrSrc;
    const tgt = isIntraOrTgt;
    relation = typeof transitiveOrRel === "string" ? transitiveOrRel : "uses";
    isIntraCluster = src === tgt;
    activeMode = "directory";
  }

  // Support / utility class edge dampening
  const heuristicsActive = customTuning?.useHeuristics !== false;
  if (heuristicsActive && isSupportTarget && (relation === "uses" || relation === "references" || relation === "calls" || relation === "depends_on")) {
    const sWeight = customTuning?.supportWeight ?? COSMOS_PRESETS[activeMode]?.supportWeight ?? SUPPORT_CLASS_EDGE_WEIGHT;
    return transitive ? Math.round(sWeight * 0.45 * 10000) / 10000 : sWeight;
  }

  const profile = EDGE_CONTRACTION_WEIGHTS[activeMode] ?? EDGE_CONTRACTION_WEIGHTS.coupled;
  const fam = famOf(relation);

  if (activeMode === "directory") {
    let w = profile[fam] * (isIntraCluster ? profile.intraClusterMultiplier : profile.interClusterMultiplier);
    if (customTuning && typeof customTuning[fam] === "number") {
      const presetBase = COSMOS_PRESETS.directory[fam];
      if (presetBase > 0) {
        w *= (customTuning[fam]! / presetBase);
      }
    }
    if (transitive) {
      w *= profile.transitiveScale;
    }
    return Math.round(w * 10000) / 10000;
  }

  // Coupled, code, spec, doc modes
  const modeWeights = COSMOS_RELATION_WEIGHTS[activeMode];
  const entry = modeWeights?.[relation] ?? SEMANTIC_RELATION_WEIGHTS[relation];
  let w: number;
  if (entry) {
    w = isIntraCluster ? entry.intra : entry.inter;
  } else {
    w = profile[fam] * (isIntraCluster ? profile.intraClusterMultiplier : profile.interClusterMultiplier);
  }

  if (customTuning && typeof customTuning[fam] === "number") {
    const presetBase = COSMOS_PRESETS[activeMode]?.[fam] ?? COSMOS_PRESETS.coupled[fam];
    if (presetBase > 0) {
      w *= (customTuning[fam]! / presetBase);
    }
  }

  if (transitive) {
    w *= profile.transitiveScale;
  }

  return Math.round(w * 10000) / 10000;
}

/**
 * Post-convergence galaxy separation pass.
 * Compacts each subsystem cluster tightly around its own local centroid (keeping hubs at the
 * galactic core) and expands inter-galaxy centroid distances with bounding-circle collision
 * resolution so each subsystem forms a distinct island separated by clean negative space.
 */
export function separateGalaxies<T extends { id: string; x: number; y: number; r?: number }>(
  nodes: T[],
  clusterKeyMap: Map<string, string>,
  options?: { intraCompactFactor?: number; interExpandFactor?: number; minVoidGap?: number },
): void {
  if (nodes.length <= 2) return;

  const intraCompact = options?.intraCompactFactor ?? 0.92;
  const interExpand = options?.interExpandFactor ?? 1.05;
  const minVoidGap = options?.minVoidGap ?? 38;

  interface GalaxyCluster {
    key: string;
    members: T[];
    cx: number;
    cy: number;
    radius: number;
  }

  const clusterGroups = new Map<string, T[]>();
  for (const n of nodes) {
    const cKey = clusterKeyMap.get(n.id) ?? "root";
    let list = clusterGroups.get(cKey);
    if (!list) {
      list = [];
      clusterGroups.set(cKey, list);
    }
    list.push(n);
  }

  if (clusterGroups.size <= 1) return;

  const galaxies: GalaxyCluster[] = [];
  let globalSumX = 0;
  let globalSumY = 0;

  for (const [key, members] of clusterGroups.entries()) {
    let sx = 0;
    let sy = 0;
    for (const m of members) {
      sx += m.x;
      sy += m.y;
    }
    const cx = sx / members.length;
    const cy = sy / members.length;
    globalSumX += cx;
    globalSumY += cy;

    // 1. Compact members toward their local galaxy centroid and clamp extreme outliers
    const dists = members.map((m) => Math.hypot(m.x - cx, m.y - cy)).sort((a, b) => a - b);
    const p85 = dists[Math.min(dists.length - 1, Math.floor((dists.length - 1) * 0.85))] || 20;
    const maxAllowedLocalR = Math.max(30, p85 * 1.35);

    let maxCompactR = 18;
    for (const m of members) {
      const dx = m.x - cx;
      const dy = m.y - cy;
      const d = Math.hypot(dx, dy);
      let effectiveD = d;
      if (d > maxAllowedLocalR && d > 0) {
        effectiveD = maxAllowedLocalR + Math.sqrt(d - maxAllowedLocalR) * 2;
      }
      const scale = d > 0 ? (effectiveD * intraCompact) / d : 0;
      const localX = dx * scale;
      const localY = dy * scale;
      m.x = cx + localX;
      m.y = cy + localY;
      const memberOuter = Math.hypot(localX, localY) + (m.r ?? 6);
      if (memberOuter > maxCompactR) maxCompactR = memberOuter;
    }

    galaxies.push({ key, members, cx, cy, radius: maxCompactR });
  }

  // Sort deterministically by descending member count so core galaxies anchor centrally
  galaxies.sort((a, b) => b.members.length - a.members.length || a.key.localeCompare(b.key));

  const globalCx = globalSumX / galaxies.length;
  const globalCy = globalSumY / galaxies.length;

  // 2. Expand galaxy centroids outward from the global center
  const origCentroids = new Map<string, { cx: number; cy: number }>();
  for (const g of galaxies) {
    origCentroids.set(g.key, { cx: g.cx, cy: g.cy });
    g.cx = globalCx + (g.cx - globalCx) * interExpand;
    g.cy = globalCy + (g.cy - globalCy) * interExpand;
  }

  // 3. Iterative mass-weighted bounding-circle collision resolution to enforce clear inter-galaxy void space
  for (let iter = 0; iter < 36; iter++) {
    let moved = false;
    for (let i = 0; i < galaxies.length; i++) {
      for (let j = i + 1; j < galaxies.length; j++) {
        const gA = galaxies[i];
        const gB = galaxies[j];
        let dx = gB.cx - gA.cx;
        let dy = gB.cy - gA.cy;
        let dist = Math.hypot(dx, dy);
        const minDist = gA.radius + gB.radius + minVoidGap;

        if (dist < minDist) {
          if (dist < 1e-3) {
            const angle = (i * 2.39996) + j;
            dx = Math.cos(angle);
            dy = Math.sin(angle);
            dist = 1;
          }
          const overlap = (minDist - dist) * 0.6;
          const ux = dx / dist;
          const uy = dy / dist;
          const massA = gA.members.length;
          const massB = gB.members.length;
          const totalMass = massA + massB;
          const shareA = massB / totalMass;
          const shareB = massA / totalMass;
          gA.cx -= ux * overlap * shareA;
          gA.cy -= uy * overlap * shareA;
          gB.cx += ux * overlap * shareB;
          gB.cy += uy * overlap * shareB;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  // 4. Translate each galaxy's members by their centroid shift
  for (const g of galaxies) {
    const orig = origCentroids.get(g.key)!;
    const shiftX = g.cx - orig.cx;
    const shiftY = g.cy - orig.cy;
    for (const m of g.members) {
      m.x += shiftX;
      m.y += shiftY;
    }

    // Intra-cluster pairwise node spacing loop so nodes inside a galaxy maintain >= 28px breathing room
    for (let p = 0; p < 4; p++) {
      for (let i = 0; i < g.members.length; i++) {
        for (let j = i + 1; j < g.members.length; j++) {
          const a = g.members[i];
          const b = g.members[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let dist = Math.hypot(dx, dy);
          const spacingGap = (options?.intraCompactFactor !== undefined && options.intraCompactFactor < 0.8) ? 6 : 26;
          const minDist = (a.r ?? 6) + (b.r ?? 6) + spacingGap;
          if (dist < minDist) {
            if (dist < 1e-3) {
              const ang = (i * 2.39996) + j;
              dx = Math.cos(ang);
              dy = Math.sin(ang);
              dist = 1;
            }
            const push = ((minDist - dist) / dist) * 0.5;
            a.x -= dx * push;
            a.y -= dy * push;
            b.x += dx * push;
            b.y += dy * push;
          }
        }
      }
    }
  }
}

/**
 * Seeds initial cluster and intra-cluster node coordinates using organic Golden-Angle spiral spacing.
 */
export function seedClusteredPositions<T extends { id: string; x?: number; y?: number; clusterKey?: string }>(
  nodes: T[],
  clusterKeyMap?: Map<string, string>,
): void {
  if (nodes.length === 0) return;
  const clusterGroups = new Map<string, T[]>();
  for (const n of nodes) {
    const cKey = clusterKeyMap?.get(n.id) ?? n.clusterKey ?? "root";
    let list = clusterGroups.get(cKey);
    if (!list) {
      list = [];
      clusterGroups.set(cKey, list);
    }
    list.push(n);
  }

  const uniqueClusters = Array.from(clusterGroups.keys()).sort(
    (a, b) => (clusterGroups.get(b)?.length ?? 0) - (clusterGroups.get(a)?.length ?? 0) || a.localeCompare(b),
  );
  const numClusters = uniqueClusters.length;
  const ringRadius = 160 + Math.sqrt(numClusters) * 75;

  uniqueClusters.forEach((cKey, ci) => {
    const members = clusterGroups.get(cKey) ?? [];
    let cx = 0;
    let cy = 0;
    if (numClusters > 1) {
      const cAngle = ci * 2.399963229728653;
      const cRadius = Math.sqrt(ci + 1) * (ringRadius / Math.sqrt(numClusters));
      cx = Math.cos(cAngle) * cRadius;
      cy = Math.sin(cAngle) * cRadius;
    }
    members.forEach((m, i) => {
      if (i === 0) {
        m.x = cx;
        m.y = cy;
      } else {
        const r = 34 * Math.sqrt(i + 1);
        const th = i * 2.399963229728653;
        m.x = cx + Math.cos(th) * r;
        m.y = cy + Math.sin(th) * r;
      }
    });
  });
}

const UTILITY_NAME_RE = /(?:^|[\/_.-])(helpers?|utils?|utilities|types?|common|shared|constants?|schemas?|config|errors?)(?:[\/_.-]|\.[a-z0-9]+$|$)/i;

/**
 * Detects support / utility sink nodes (helpers, types, utils, cross-cluster sinks)
 * using topological fan-in and lexical utility indicators.
 */
export function detectSupportNodes(
  nodes: Array<{ id: string; name?: string; type?: string; sources?: string[]; clusterKey?: string }>,
  edges: Array<{ source: string; target: string; relation: string }>,
  clusterKeyMap?: Map<string, string>,
): Set<string> {
  const supportSet = new Set<string>();
  const nodeMap = new Map<string, { id: string; name?: string; type?: string; sources?: string[]; clusterKey?: string }>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  function getCluster(id: string): string {
    if (clusterKeyMap?.has(id)) return clusterKeyMap.get(id)!;
    const n = nodeMap.get(id);
    if (n?.clusterKey) return n.clusterKey;
    return "root";
  }

  const inDegMap = new Map<string, number>();
  const outDegMap = new Map<string, number>();
  const sourceClustersMap = new Map<string, Set<string>>();

  for (const e of edges) {
    const cSrc = getCluster(e.source);
    const cTgt = getCluster(e.target);

    // inDeg: count of incoming dependency/association edges (uses, calls, depends_on, references)
    if (e.relation === "uses" || e.relation === "calls" || e.relation === "depends_on" || e.relation === "references") {
      inDegMap.set(e.target, (inDegMap.get(e.target) ?? 0) + 1);
      if (cSrc !== cTgt) {
        let sc = sourceClustersMap.get(e.target);
        if (!sc) {
          sc = new Set<string>();
          sourceClustersMap.set(e.target, sc);
        }
        sc.add(cSrc);
      }
    }

    // outDeg: count of outgoing dependency edges (uses, calls, depends_on, implements, extends)
    if (e.relation === "uses" || e.relation === "calls" || e.relation === "depends_on" || e.relation === "implements" || e.relation === "extends") {
      outDegMap.set(e.source, (outDegMap.get(e.source) ?? 0) + 1);
    }
  }

  for (const n of nodes) {
    const inDeg = inDegMap.get(n.id) ?? 0;
    const outDeg = outDegMap.get(n.id) ?? 0;
    const sourceClusters = sourceClustersMap.get(n.id) ?? new Set<string>();

    const isLexicalUtility =
      UTILITY_NAME_RE.test(n.name || "") ||
      UTILITY_NAME_RE.test(n.id) ||
      (n.sources ?? []).some((s) => UTILITY_NAME_RE.test(s) || s.endsWith(".d.ts")) ||
      n.type === "type" ||
      n.type === "interface";

    // 1. Topological Sink: sourceClusters.size >= 3 && inDeg / (outDeg + 1) >= 2.0
    const isTopological = sourceClusters.size >= 3 && inDeg / (outDeg + 1) >= 2.0;

    // 2. Lexical/Structural Utility Sink: isLexicalUtility && inDeg >= 2 && inDeg / (outDeg + 1) >= 1.5
    const isLexicalSink = isLexicalUtility && inDeg >= 2 && inDeg / (outDeg + 1) >= 1.5;

    if (isTopological || isLexicalSink) {
      supportSet.add(n.id);
    }
  }

  return supportSet;
}

export interface EdgeBundleMeta {
  corridorKey: string;
  bundleSize: number;
  strandIndex: number;
  curvature: number;
  restOpacity: number;
  restSize: number;
}

/**
 * Computes hierarchical control-point edge bundles between galaxy corridors.
 */
export function computeHierarchicalEdgeBundles(
  nodes: Array<{ id: string; x: number; y: number; clusterKey?: string }>,
  edges: Array<{ key?: string; source: string; target: string; relation: string; intraCluster?: boolean; isBackbone?: boolean }>,
  clusterKeyMap?: Map<string, string>,
): Map<string, EdgeBundleMeta> {
  const bundleMap = new Map<string, EdgeBundleMeta>();
  const nodeMap = new Map<string, { id: string; x: number; y: number; clusterKey?: string }>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  function getCluster(id: string): string {
    if (clusterKeyMap?.has(id)) return clusterKeyMap.get(id)!;
    const n = nodeMap.get(id);
    if (n?.clusterKey) return n.clusterKey;
    return "root";
  }

  interface EdgeRef {
    key: string;
    source: string;
    target: string;
    relation: string;
    cSrc: string;
    cTgt: string;
    isIntra: boolean;
  }
  const corridorGroups = new Map<string, EdgeRef[]>();

  for (let idx = 0; idx < edges.length; idx++) {
    const e = edges[idx];
    const key = e.key ?? `${e.source}->${e.target}:${e.relation}:${idx}`;
    const cSrc = getCluster(e.source);
    const cTgt = getCluster(e.target);
    const isIntra = e.intraCluster ?? (cSrc === cTgt);

    const corridorKey = isIntra ? `intra:${cSrc}:${famOf(e.relation)}` : `${cSrc}-->${cTgt}`;
    let group = corridorGroups.get(corridorKey);
    if (!group) {
      group = [];
      corridorGroups.set(corridorKey, group);
    }
    group.push({ key, source: e.source, target: e.target, relation: e.relation, cSrc, cTgt, isIntra });
  }

  for (const [corridorKey, group] of corridorGroups) {
    const bundleSize = group.length;
    for (let i = 0; i < bundleSize; i++) {
      const e = group[i];
      if (e.isIntra) {
        bundleMap.set(e.key, {
          corridorKey,
          bundleSize,
          strandIndex: i,
          curvature: 0.16,
          restOpacity: 0.68,
          restSize: 1.6,
        });
      } else {
        const baseCurvature = 0.22;
        const centered = bundleSize > 1 ? (i / (bundleSize - 1) - 0.5) : 0;
        const curvature = Number((baseCurvature + centered * Math.min(0.06, bundleSize * 0.012)).toFixed(4));
        const sqrtN = Math.sqrt(bundleSize);
        const restOpacity = Number(Math.min(0.78, 0.36 + 0.12 * sqrtN).toFixed(3));
        const restSize = Number(Math.min(3.2, 1.3 + 0.42 * sqrtN).toFixed(2));
        bundleMap.set(e.key, {
          corridorKey,
          bundleSize,
          strandIndex: i,
          curvature,
          restOpacity,
          restSize,
        });
      }
    }
  }

  return bundleMap;
}

/**
 * Selects landmark node IDs for resting-state label visibility.
 * Guarantees that every major subsystem galaxy (`count >= 3` or hub `deg >= 2`) has its
 * galactic nucleus (highest-degree hub) labeled at rest, then fills remaining slots
 * with global high-degree hubs.
 */
export function computeGalaxyLandmarks(
  visibleNodes: Array<{ id: string; deg: number; clusterKey?: string }>,
  maxLandmarks = 18,
): Set<string> {
  const landmarks = new Set<string>();
  if (visibleNodes.length <= 25) {
    for (const n of visibleNodes) landmarks.add(n.id);
    return landmarks;
  }

  let maxD = 0;
  const clusterGroups = new Map<string, Array<{ id: string; deg: number; clusterKey?: string }>>();
  for (const n of visibleNodes) {
    if (n.deg > maxD) maxD = n.deg;
    const cKey = n.clusterKey ?? "root";
    let list = clusterGroups.get(cKey);
    if (!list) {
      list = [];
      clusterGroups.set(cKey, list);
    }
    list.push(n);
  }

  // 1. Pick the galactic nucleus (top hub) of each qualifying subsystem galaxy
  if (clusterGroups.size > 1) {
    const sortedClusters = Array.from(clusterGroups.entries()).sort(
      (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
    );
    for (const [, members] of sortedClusters) {
      if (landmarks.size >= maxLandmarks) break;
      let best = members[0];
      for (let i = 1; i < members.length; i++) {
        if (members[i].deg > best.deg) best = members[i];
      }
      if (best && (best.deg >= 2 || (members.length >= 3 && best.deg >= 1))) {
        landmarks.add(best.id);
      }
    }
  }

  // 2. Fill remaining landmark budget with global highest-degree hubs
  const effectiveCap = clusterGroups.size > 1 ? maxLandmarks : Math.min(12, maxLandmarks);
  const minHubDeg = Math.max(3, Math.min(6, Math.round(maxD * 0.4)));
  const sortedByDeg = [...visibleNodes]
    .filter((n) => n.deg >= minHubDeg)
    .sort((a, b) => b.deg - a.deg);

  for (const n of sortedByDeg) {
    if (landmarks.size >= effectiveCap) break;
    landmarks.add(n.id);
  }

  return landmarks;
}

/**
 * Performs lightweight local overlap relaxation strictly on the dragged node's
 * immediate neighborhood upon drag release, leaving all other galaxies 100% stationary.
 */
export function relaxLocalNeighborhood<T extends { id: string; x: number; y: number; r?: number }>(
  nodes: T[],
  draggedId: string,
  neighborIds: Set<string>,
  minGap = 8,
): void {
  if (neighborIds.size === 0) return;
  const localNodes = nodes.filter((n) => n.id === draggedId || neighborIds.has(n.id));
  if (localNodes.length <= 1) return;

  for (let iter = 0; iter < 6; iter++) {
    let moved = false;
    for (let i = 0; i < localNodes.length; i++) {
      for (let j = i + 1; j < localNodes.length; j++) {
        const a = localNodes[i];
        const b = localNodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        const minDist = (a.r ?? 6) + (b.r ?? 6) + minGap;
        if (dist < minDist) {
          if (dist < 1e-3) {
            dx = 1;
            dy = 0;
            dist = 1;
          }
          const overlap = (minDist - dist) * 0.5;
          const ux = dx / dist;
          const uy = dy / dist;
          if (a.id === draggedId) {
            b.x += ux * overlap * 2;
            b.y += uy * overlap * 2;
          } else if (b.id === draggedId) {
            a.x -= ux * overlap * 2;
            a.y -= uy * overlap * 2;
          } else {
            a.x -= ux * overlap;
            a.y -= uy * overlap;
            b.x += ux * overlap;
            b.y += uy * overlap;
          }
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
}

/**
 * Extracts the Tree Backbone edge set (ADR 0015 / Feature 18).
 * Preserves structural containment and intra-galaxy spanning skeletons,
 * while suppressing cross-galaxy dependency spiderwebs at rest.
 */
export function extractTreeBackbone(
  nodes: Array<{ id: string; name?: string; type?: string; sources?: string[]; deg?: number; clusterKey?: string }>,
  edges: Array<{ key?: string; source: string; target: string; relation: string }>,
  clusterKeyMap?: Map<string, string>,
  supportNodes?: Set<string>,
): Set<string> {
  const backboneSet = new Set<string>();

  const nodeMap = new Map<string, { id: string; name?: string; type?: string; sources?: string[]; deg?: number; clusterKey?: string }>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  function getCluster(id: string): string {
    if (clusterKeyMap?.has(id)) return clusterKeyMap.get(id)!;
    const n = nodeMap.get(id);
    if (n?.clusterKey) return n.clusterKey;
    return "root";
  }

  const degMap = new Map<string, number>();
  for (const n of nodes) {
    if (typeof n.deg === "number" && n.deg > 0) {
      degMap.set(n.id, n.deg);
    }
  }
  for (const e of edges) {
    if (!degMap.has(e.source)) degMap.set(e.source, 0);
    if (!degMap.has(e.target)) degMap.set(e.target, 0);
    degMap.set(e.source, degMap.get(e.source)! + 1);
    degMap.set(e.target, degMap.get(e.target)! + 1);
  }

  const supportSet = supportNodes ?? detectSupportNodes(nodes as any, edges, clusterKeyMap);

  interface EdgeEntry {
    key: string;
    source: string;
    target: string;
    relation: string;
    fam: Family;
    isIntra: boolean;
    cSource: string;
    cTarget: string;
  }

  const nodeIntraEdges = new Map<string, EdgeEntry[]>();
  const crossDepEdges: EdgeEntry[] = [];
  const clusterBridgeCount = new Map<string, number>();
  const clusterPairEdges = new Map<string, EdgeEntry[]>();
  const clusterAllCrossEdges = new Map<string, EdgeEntry[]>();

  for (let idx = 0; idx < edges.length; idx++) {
    const e = edges[idx];
    const key = e.key ?? `${e.source}->${e.target}:${e.relation}:${idx}`;
    const fam = famOf(e.relation);
    const cSource = getCluster(e.source);
    const cTarget = getCluster(e.target);
    const isIntra = cSource === cTarget;

    const entry: EdgeEntry = {
      key,
      source: e.source,
      target: e.target,
      relation: e.relation,
      fam,
      isIntra,
      cSource,
      cTarget,
    };

    // 1. All structural containment edges are in the backbone
    if (fam === "structure") {
      backboneSet.add(key);
    }

    if (isIntra) {
      if (!nodeIntraEdges.has(e.source)) nodeIntraEdges.set(e.source, []);
      if (!nodeIntraEdges.has(e.target)) nodeIntraEdges.set(e.target, []);
      nodeIntraEdges.get(e.source)!.push(entry);
      nodeIntraEdges.get(e.target)!.push(entry);
    } else {
      if (!clusterAllCrossEdges.has(cSource)) clusterAllCrossEdges.set(cSource, []);
      if (!clusterAllCrossEdges.has(cTarget)) clusterAllCrossEdges.set(cTarget, []);
      clusterAllCrossEdges.get(cSource)!.push(entry);
      clusterAllCrossEdges.get(cTarget)!.push(entry);

      // Restore Curated Cross-Galaxy Bridges:
      // Mark cross-galaxy contract and documents (association other than references) edges as backbone
      if (fam === "contract" || (fam === "association" && e.relation !== "references")) {
        backboneSet.add(key);
        clusterBridgeCount.set(cSource, (clusterBridgeCount.get(cSource) ?? 0) + 1);
        clusterBridgeCount.set(cTarget, (clusterBridgeCount.get(cTarget) ?? 0) + 1);
      } else if (fam === "dependency" || e.relation === "references") {
        crossDepEdges.push(entry);
      }
    }
  }

  // 2. Intra-galaxy spanning skeleton: up to 2 strongest incident edges per node
  for (const [u, incident] of nodeIntraEdges) {
    const degU = degMap.get(u) ?? 0;
    const sorted = [...incident].sort((a, b) => {
      const otherA = a.source === u ? a.target : a.source;
      const otherB = b.source === u ? b.target : b.source;
      const degA = degMap.get(otherA) ?? 0;
      const degB = degMap.get(otherB) ?? 0;

      const isAHub = degA > degU ? 1 : 0;
      const isBHub = degB > degU ? 1 : 0;
      if (isAHub !== isBHub) return isBHub - isAHub;
      if (degA !== degB) return degB - degA;

      const famRank = (f: Family) => (f === "structure" ? 3 : f === "contract" ? 2 : f === "dependency" ? 1 : 0);
      return famRank(b.fam) - famRank(a.fam);
    });

    const top2 = sorted.slice(0, 2);
    for (const e of top2) {
      backboneSet.add(e.key);
    }
  }

  // 3. Curated cross-galaxy dependency edges:
  // Exclude noisy test -> src fan-out and support target sinks (unless cluster has zero other bridges)
  for (const e of crossDepEdges) {
    const isTestSrc = e.cSource === "test" || e.cSource.startsWith("test/") || e.source.startsWith("test/") || e.source.startsWith("tests/") || e.source.includes(".test.");
    const isTestTgt = e.cTarget === "test" || e.cTarget.startsWith("test/") || e.target.startsWith("test/") || e.target.startsWith("tests/") || e.target.includes(".test.");
    const isTestFanout = isTestSrc || isTestTgt;
    const isSupportTarget = supportSet.has(e.target) || e.relation === "references";

    if (isTestFanout || isSupportTarget) {
      const bridgesSrc = clusterBridgeCount.get(e.cSource) ?? 0;
      const bridgesTgt = clusterBridgeCount.get(e.cTarget) ?? 0;
      if (bridgesSrc > 0 || bridgesTgt > 0) {
        continue;
      }
    }

    const pairKey = e.cSource < e.cTarget ? `${e.cSource}:::${e.cTarget}` : `${e.cTarget}:::${e.cSource}`;
    let pairList = clusterPairEdges.get(pairKey);
    if (!pairList) {
      pairList = [];
      clusterPairEdges.set(pairKey, pairList);
    }
    pairList.push(e);
  }

  // Mark top 2 strongest dependency edges per cluster pair
  for (const [, pairList] of clusterPairEdges) {
    pairList.sort((a, b) => {
      const wA = (degMap.get(a.source) ?? 0) + (degMap.get(a.target) ?? 0);
      const wB = (degMap.get(b.source) ?? 0) + (degMap.get(b.target) ?? 0);
      return wB - wA;
    });
    for (const e of pairList.slice(0, 2)) {
      backboneSet.add(e.key);
      clusterBridgeCount.set(e.cSource, (clusterBridgeCount.get(e.cSource) ?? 0) + 1);
      clusterBridgeCount.set(e.cTarget, (clusterBridgeCount.get(e.cTarget) ?? 0) + 1);
    }
  }

  // Plus at least the #1 strongest cross-galaxy edge for every cluster that has any cross-galaxy edges
  for (const [cKey, crossList] of clusterAllCrossEdges) {
    if ((clusterBridgeCount.get(cKey) ?? 0) === 0 && crossList.length > 0) {
      crossList.sort((a, b) => {
        const wA = (degMap.get(a.source) ?? 0) + (degMap.get(a.target) ?? 0);
        const wB = (degMap.get(b.source) ?? 0) + (degMap.get(b.target) ?? 0);
        return wB - wA;
      });
      const top1 = crossList[0];
      backboneSet.add(top1.key);
      clusterBridgeCount.set(top1.cSource, (clusterBridgeCount.get(top1.cSource) ?? 0) + 1);
      clusterBridgeCount.set(top1.cTarget, (clusterBridgeCount.get(top1.cTarget) ?? 0) + 1);
    }
  }

  return backboneSet;
}

export interface CosmosSeedResult {
  positions: Map<string, { x: number; y: number }>;
  effectiveClusters: Map<string, string>;
  relaxOptions: {
    iterations: number;
    intraCompactFactor: number;
    interExpandFactor: number;
    minVoidGap: number;
  };
}

/**
 * Computes concentric Focus-Core + Surrounding-Orbit seed coordinates and effective cluster
 * groupings for the active Cosmos preset (`code`, `spec`, `doc`, `directory`, `coupled`)
 * and slider weight tuning (`CosmosWeightTuning`).
 *
 * - `"code"`: Core `code` modules sit in the center (`r = 0..170px`), support sinks on an inner belt
 *   (`r = 240..300px`), and `specs` + `docs` surround the code core on an outer ring (`r = 360..480px`)
 *   angularly aligned with the code modules they cover/document.
 * - `"spec"`: BDD `specs` (`.feature`) sit in the center (`r = 0..150px`), covered `code` and `docs`
 *   orbit their governing spec in the middle ring (`r = 240..350px`), and uncovered nodes form the outer ring.
 * - `"doc"`: `docs` (ADRs/architecture docs) sit in the center (`r = 0..140px`), governed `specs` form the
 *   middle ring (`r = 230..330px`), and `code` modules form the outer ring (`r = 380..500px`).
 * - `"directory"`: Strict filesystem folder islands with tight intra-folder compaction (`0.68`) and wide
 *   inter-folder void gaps (`>= 80px`).
 * - `"coupled"`: Dynamic semantic coupling where cross-scope clusters pull close together based on slider weights.
 */
export function computeCosmosConcentricSeed(
  nodes: Array<{
    id: string;
    name?: string;
    type?: string;
    scope?: string;
    clusterKey?: string;
    deg?: number;
    isSupportNode?: boolean;
    sources?: string[];
  }>,
  edges: Array<{ source: string; target: string; relation?: string; weight?: number }>,
  mode: EdgeContractionMode = "coupled",
  tuning?: CosmosWeightTuning,
): CosmosSeedResult {
  const positions = new Map<string, { x: number; y: number }>();
  const effectiveClusters = new Map<string, string>();
  const N = nodes.length;
  if (N === 0) {
    return {
      positions,
      effectiveClusters,
      relaxOptions: { iterations: 12, intraCompactFactor: 0.92, interExpandFactor: 1.0, minVoidGap: 38 },
    };
  }

  const activeTuning = tuning ?? COSMOS_PRESETS[mode] ?? COSMOS_PRESETS.coupled;
  const GOLDEN_ANGLE = 2.399963229728653;

  // Determine effective focus mode when sliders are dragged away from preset defaults
  let effectiveMode = mode;
  if (mode === "coupled" && tuning) {
    const { dependency, contract, association, structure } = tuning;
    if (structure >= 2.5 && structure > dependency + 0.8 && structure > contract + 0.8) {
      effectiveMode = "directory";
    } else if (contract > dependency + 0.6 && contract >= association) {
      effectiveMode = "spec";
    } else if (association > dependency + 0.6 && association > contract) {
      effectiveMode = "doc";
    } else if (dependency > contract + 0.6 && dependency > association + 0.6) {
      effectiveMode = "code";
    }
  }

  // Strict folder helper for directory mode
  const strictFolderOf = (n: (typeof nodes)[number]): string => {
    const rawPath = (n.sources && n.sources[0]) || n.id || "";
    const norm = rawPath.replace(/\\/g, "/").replace(/^\.\//, "");
    const parts = norm.split("/").filter(Boolean);
    if (parts.length >= 3) return `${parts[0]}/${parts[1]}`;
    if (parts.length === 2) return parts[0];
    return n.clusterKey || "root";
  };

  if (effectiveMode === "directory") {
    const folderCounts = new Map<string, number>();
    for (const n of nodes) {
      const fKey = `dir:${strictFolderOf(n)}`;
      effectiveClusters.set(n.id, fKey);
      folderCounts.set(fKey, (folderCounts.get(fKey) ?? 0) + 1);
    }
    const sortedFolders = Array.from(folderCounts.keys()).sort(
      (a, b) => (folderCounts.get(b) ?? 0) - (folderCounts.get(a) ?? 0) || a.localeCompare(b),
    );
    const numF = sortedFolders.length;
    const folderCenters = new Map<string, { x: number; y: number }>();
    const gridSpacing = N <= 25 ? 120 : 260 + Math.sqrt(numF) * 110;

    sortedFolders.forEach((fKey, ci) => {
      if (ci === 0 && numF === 1) {
        folderCenters.set(fKey, { x: 0, y: 0 });
      } else {
        const r = Math.sqrt(ci + 1) * (gridSpacing / Math.max(1, Math.sqrt(numF)));
        const th = ci * GOLDEN_ANGLE;
        folderCenters.set(fKey, { x: Math.cos(th) * r, y: Math.sin(th) * r });
      }
    });

    const memberIdx = new Map<string, number>();
    for (const n of nodes) {
      const fKey = effectiveClusters.get(n.id)!;
      const cc = folderCenters.get(fKey) || { x: 0, y: 0 };
      const idx = memberIdx.get(fKey) ?? 0;
      memberIdx.set(fKey, idx + 1);
      const r = idx === 0 ? 0 : 28 * Math.sqrt(idx + 1);
      const th = idx * GOLDEN_ANGLE;
      positions.set(n.id, { x: cc.x + Math.cos(th) * r, y: cc.y + Math.sin(th) * r });
    }

    return {
      positions,
      effectiveClusters,
      relaxOptions: {
        iterations: 16,
        intraCompactFactor: 0.68,
        interExpandFactor: 1.38,
        minVoidGap: Math.max(75, activeTuning.clusterGap || 75),
      },
    };
  }

  // Build adjacency list with weights for angular alignment
  const adj = new Map<string, Array<{ other: string; weight: number; relation: string }>>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    if (!adj.has(e.source) || !adj.has(e.target) || e.source === e.target) continue;
    const w = e.weight ?? 1.0;
    const rel = e.relation ?? "uses";
    adj.get(e.source)!.push({ other: e.target, weight: w, relation: rel });
    adj.get(e.target)!.push({ other: e.source, weight: w, relation: rel });
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const getScope = (n: (typeof nodes)[number]): "code" | "specs" | "docs" => {
    if (n.scope === "specs" || n.scope === "docs" || n.scope === "code") return n.scope;
    return scopeOfNode({ id: n.id, type: n.type, sources: n.sources ?? [] });
  };

  // Assign each node to a Concentric Tier:
  // Tier 0 = Center Focus Core
  // Tier 1 = Middle Connected Orbit
  // Tier 2 = Outer Surround Ring
  const nodeTier = new Map<string, 0 | 1 | 2>();

  if (effectiveMode === "code") {
    for (const n of nodes) {
      const sc = getScope(n);
      if (sc === "code" && !n.isSupportNode) {
        nodeTier.set(n.id, 0);
      } else if (sc === "code" && n.isSupportNode) {
        nodeTier.set(n.id, 1);
      } else {
        nodeTier.set(n.id, 2);
      }
    }
  } else if (effectiveMode === "spec") {
    const specIds = new Set<string>();
    for (const n of nodes) {
      if (getScope(n) === "specs") {
        specIds.add(n.id);
        nodeTier.set(n.id, 0);
      }
    }
    for (const n of nodes) {
      if (specIds.has(n.id)) continue;
      const neighbors = adj.get(n.id) ?? [];
      const touchesSpec = neighbors.some((nb) => specIds.has(nb.other));
      if (touchesSpec && !n.isSupportNode) {
        nodeTier.set(n.id, 1);
      } else {
        nodeTier.set(n.id, 2);
      }
    }
  } else if (effectiveMode === "doc") {
    const docIds = new Set<string>();
    for (const n of nodes) {
      if (getScope(n) === "docs") {
        docIds.add(n.id);
        nodeTier.set(n.id, 0);
      }
    }
    for (const n of nodes) {
      if (docIds.has(n.id)) continue;
      const sc = getScope(n);
      const neighbors = adj.get(n.id) ?? [];
      const touchesDoc = neighbors.some((nb) => docIds.has(nb.other));
      if (sc === "specs" || (touchesDoc && !n.isSupportNode)) {
        nodeTier.set(n.id, 1);
      } else {
        nodeTier.set(n.id, 2);
      }
    }
  } else {
    // Balanced "coupled" mode: weight radial tier by slider pull * semantic degree
    const scores = nodes.map((n) => {
      const sc = getScope(n);
      const scopePull =
        sc === "code"
          ? activeTuning.dependency
          : sc === "specs"
            ? activeTuning.contract
            : activeTuning.association;
      const degScore = Math.sqrt((n.deg ?? 1) + 1);
      const supportPenalty = n.isSupportNode ? 0.25 : 1.0;
      return { id: n.id, score: scopePull * degScore * supportPenalty };
    });
    scores.sort((a, b) => b.score - a.score);
    const coreCut = Math.max(1, Math.floor(N * 0.42));
    const midCut = Math.max(coreCut + 1, Math.floor(N * 0.78));
    scores.forEach((item, idx) => {
      nodeTier.set(item.id, idx < coreCut ? 0 : idx < midCut ? 1 : 2);
    });
  }

  // Group Tier 0 (Center Focus Core) by subsystem cluster and place inside [0 .. coreMaxR]
  const tier0Nodes = nodes.filter((n) => nodeTier.get(n.id) === 0);
  const tier1Nodes = nodes.filter((n) => nodeTier.get(n.id) === 1);
  const tier2Nodes = nodes.filter((n) => nodeTier.get(n.id) === 2);

  // If Tier 0 is empty (e.g. scope filtered out), promote Tier 1/2
  if (tier0Nodes.length === 0 && tier1Nodes.length > 0) {
    for (const n of tier1Nodes) nodeTier.set(n.id, 0);
    tier0Nodes.push(...tier1Nodes.splice(0, tier1Nodes.length));
  } else if (tier0Nodes.length === 0 && tier2Nodes.length > 0) {
    for (const n of tier2Nodes) nodeTier.set(n.id, 0);
    tier0Nodes.push(...tier2Nodes.splice(0, tier2Nodes.length));
  }

  const coreGroups = new Map<string, typeof nodes>();
  for (const n of tier0Nodes) {
    const cKey = `core:${n.clusterKey || strictFolderOf(n)}`;
    effectiveClusters.set(n.id, cKey);
    let list = coreGroups.get(cKey);
    if (!list) {
      list = [];
      coreGroups.set(cKey, list);
    }
    list.push(n);
  }

  const sortedCoreKeys = Array.from(coreGroups.keys()).sort(
    (a, b) => (coreGroups.get(b)?.length ?? 0) - (coreGroups.get(a)?.length ?? 0) || a.localeCompare(b),
  );
  const numCoreGroups = Math.max(1, sortedCoreKeys.length);
  const coreRadiusScale = Math.max(55, Math.min(180, 42 * Math.sqrt(tier0Nodes.length)));

  const coreAngles = new Map<string, number>();

  sortedCoreKeys.forEach((cKey, gIdx) => {
    const members = coreGroups.get(cKey)!;
    const gAngle = gIdx * GOLDEN_ANGLE;
    const gRadius = numCoreGroups === 1 ? 0 : Math.sqrt(gIdx + 0.5) * (coreRadiusScale / Math.sqrt(numCoreGroups));
    const gCx = Math.cos(gAngle) * gRadius;
    const gCy = Math.sin(gAngle) * gRadius;

    members.forEach((m, mIdx) => {
      const localR = mIdx === 0 ? 0 : 32 * Math.sqrt(mIdx + 1);
      const localTh = gAngle + mIdx * GOLDEN_ANGLE;
      const x = gCx + Math.cos(localTh) * localR;
      const y = gCy + Math.sin(localTh) * localR;
      positions.set(m.id, { x, y });
      coreAngles.set(m.id, Math.atan2(y, x));
    });
  });

  // Helper to place an orbital ring (Tier 1 or Tier 2) surrounding the Core,
  // angularly aligned with the Core nodes each orbital node connects to!
  const placeOrbitalRing = (
    ringNodes: typeof nodes,
    ringPrefix: string,
    innerR: number,
    outerR: number,
  ) => {
    if (ringNodes.length === 0) return;

    // Compute preferred angle for each node based on connected nodes already placed in inner tiers
    const scored = ringNodes.map((n, idx) => {
      const neighbors = adj.get(n.id) ?? [];
      let sumSin = 0;
      let sumCos = 0;
      let bestAnchorCluster = "";
      let bestWeight = -1;

      for (const nb of neighbors) {
        const pos = positions.get(nb.other);
        if (pos) {
          const ang = Math.atan2(pos.y, pos.x);
          const w = nb.weight;
          sumCos += Math.cos(ang) * w;
          sumSin += Math.sin(ang) * w;
          if (w > bestWeight) {
            bestWeight = w;
            bestAnchorCluster = effectiveClusters.get(nb.other) || "";
          }
        }
      }

      const hasAnchor = Math.hypot(sumCos, sumSin) > 1e-3;
      const preferredAngle = hasAnchor
        ? Math.atan2(sumSin, sumCos)
        : -Math.PI + (2 * Math.PI * idx) / Math.max(1, ringNodes.length);

      // Always include angular sector in orbital cluster key so nodes on opposite sides of the ring
      // never share a cluster centroid that averages across (0,0)!
      const sector = Math.round(((preferredAngle + Math.PI) / (2 * Math.PI)) * 12) % 12;
      const cKey = `${ringPrefix}:s${sector}:${bestAnchorCluster || n.clusterKey || "root"}`;
      effectiveClusters.set(n.id, cKey);

      return { node: n, preferredAngle, hasAnchor };
    });

    // Sort by preferredAngle so neighbors along the ring never cross unnecessarily
    scored.sort((a, b) => a.preferredAngle - b.preferredAngle || a.node.id.localeCompare(b.node.id));

    const M = scored.length;
    scored.forEach((item, i) => {
      // Blend preferred angle with uniform angular slot so nodes spread evenly around the 360° surround ring
      const uniformAngle = -Math.PI + (2 * Math.PI * i) / M;
      const angle = item.hasAnchor
        ? Math.atan2(
            0.68 * Math.sin(item.preferredAngle) + 0.32 * Math.sin(uniformAngle),
            0.68 * Math.cos(item.preferredAngle) + 0.32 * Math.cos(uniformAngle),
          )
        : uniformAngle;
      // Stagger radial depth across 3 sub-bands within [innerR, outerR] for organic D3 depth
      const band = (i % 3) / 2;
      const r = innerR + band * (outerR - innerR);
      positions.set(item.node.id, {
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
      });
    });
  };

  const midInnerR = Math.max(200, coreRadiusScale + 100);
  const midOuterR = midInnerR + Math.max(75, 22 * Math.sqrt(tier1Nodes.length));
  placeOrbitalRing(tier1Nodes, "orbit1", midInnerR, midOuterR);

  const outerInnerR = (tier1Nodes.length > 0 ? midOuterR : coreRadiusScale) + 100;
  const outerOuterR = outerInnerR + Math.max(90, 24 * Math.sqrt(tier2Nodes.length));
  placeOrbitalRing(tier2Nodes, "orbit2", outerInnerR, outerOuterR);

  return {
    positions,
    effectiveClusters,
    relaxOptions: {
      iterations: 14,
      intraCompactFactor: effectiveMode === "coupled" ? 0.94 : 0.88,
      interExpandFactor: 1.0,
      minVoidGap: activeTuning.clusterGap ?? 38,
    },
  };
}

/**
 * Full Cosmos Layout pipeline: seeds nodes according to the active Cosmos preset/sliders,
 * runs vectorized spring + collision relaxation, and enforces concentric Focus-Core vs
 * Surrounding-Orbit radial zones so the active focus scope always anchors the center
 * while non-focus scopes cleanly surround it.
 */
export function applyCosmosConcentricLayout<
  T extends {
    id: string;
    name?: string;
    type?: string;
    scope?: string;
    clusterKey?: string;
    deg?: number;
    r?: number;
    isSupportNode?: boolean;
    sources?: string[];
    x: number;
    y: number;
  },
>(
  nodes: T[],
  edges: Array<{ source: string; target: string; relation?: string; weight?: number }>,
  mode: EdgeContractionMode = "coupled",
  tuning?: CosmosWeightTuning,
): void {
  if (nodes.length <= 1) return;

  const seed = computeCosmosConcentricSeed(nodes, edges, mode, tuning);
  for (const n of nodes) {
    const pos = seed.positions.get(n.id);
    if (pos) {
      n.x = pos.x;
      n.y = pos.y;
    }
  }

  relaxAndSeparateGalaxiesVectorized(nodes, edges, seed.effectiveClusters, seed.relaxOptions);

  // Determine effective mode for radial ring enforcement
  let effectiveMode = mode;
  if (mode === "coupled" && tuning) {
    const { dependency, contract, association, structure } = tuning;
    if (structure >= 2.5 && structure > dependency + 0.8 && structure > contract + 0.8) {
      effectiveMode = "directory";
    } else if (contract > dependency + 0.6 && contract >= association) {
      effectiveMode = "spec";
    } else if (association > dependency + 0.6 && association > contract) {
      effectiveMode = "doc";
    } else if (dependency > contract + 0.6 && dependency > association + 0.6) {
      effectiveMode = "code";
    }
  }

  if (effectiveMode === "directory") return;

  // Enforce concentric Focus-Core (inner) vs Surrounding-Orbit (outer) radial boundaries
  // around the core centroid so the focus scope stays centered and other scopes surround it.
  const coreNodes: T[] = [];
  const orbit1Nodes: T[] = [];
  const orbit2Nodes: T[] = [];

  for (const n of nodes) {
    const cKey = seed.effectiveClusters.get(n.id) ?? "";
    if (cKey.startsWith("core:")) coreNodes.push(n);
    else if (cKey.startsWith("orbit1:")) orbit1Nodes.push(n);
    else orbit2Nodes.push(n);
  }

  if (coreNodes.length === 0) return;

  // Recenter coordinate system on the Focus Core centroid
  let cx = 0;
  let cy = 0;
  for (const n of coreNodes) {
    cx += n.x;
    cy += n.y;
  }
  cx /= coreNodes.length;
  cy /= coreNodes.length;

  let maxCoreR = 40;
  for (const n of nodes) {
    n.x -= cx;
    n.y -= cy;
  }

  const coreMaxAllowed = Math.max(85, Math.min(220, 46 * Math.sqrt(coreNodes.length)));
  for (const n of coreNodes) {
    const d = Math.hypot(n.x, n.y);
    if (d > coreMaxAllowed && d > 0) {
      const scale = coreMaxAllowed / d;
      n.x *= scale;
      n.y *= scale;
    }
    const rAfter = Math.hypot(n.x, n.y);
    if (rAfter > maxCoreR) maxCoreR = rAfter;
  }

  const ring1MinR = maxCoreR + 75;
  const ring1MaxR = ring1MinR + Math.max(70, 22 * Math.sqrt(orbit1Nodes.length));
  let maxRing1R = maxCoreR;

  for (const n of orbit1Nodes) {
    let d = Math.hypot(n.x, n.y);
    let ang = Math.atan2(n.y, n.x);
    if (d < 1e-3) {
      ang = 0;
      d = ring1MinR;
    }
    const clampedR = Math.max(ring1MinR, Math.min(ring1MaxR, d));
    n.x = Math.cos(ang) * clampedR;
    n.y = Math.sin(ang) * clampedR;
    if (clampedR > maxRing1R) maxRing1R = clampedR;
  }

  const ring2MinR = (orbit1Nodes.length > 0 ? maxRing1R : maxCoreR) + 80;
  const ring2MaxR = ring2MinR + Math.max(95, 25 * Math.sqrt(orbit2Nodes.length));

  for (const n of orbit2Nodes) {
    let d = Math.hypot(n.x, n.y);
    let ang = Math.atan2(n.y, n.x);
    if (d < 1e-3) {
      ang = 0;
      d = ring2MinR;
    }
    const clampedR = Math.max(ring2MinR, Math.min(ring2MaxR, d));
    n.x = Math.cos(ang) * clampedR;
    n.y = Math.sin(ang) * clampedR;
  }

  // Final 4-pass pairwise node spacing pass so no two nodes overlap after radial clamping
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      const ra = a.r ?? 6;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const minDist = ra + (b.r ?? 6) + 28.0;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const dSq = dx * dx + dy * dy;
        if (dSq < minDist * minDist) {
          let d = Math.sqrt(dSq);
          if (d < 1e-3) {
            const ang = i * 2.39996 + j;
            dx = Math.cos(ang);
            dy = Math.sin(ang);
            d = 1.0;
          }
          const push = ((minDist - d) / d) * 0.5;
          a.x -= dx * push;
          a.y -= dy * push;
          b.x += dx * push;
          b.y += dy * push;
        }
      }
    }
  }
}

import {
  isWasmPhysicsActive,
  relaxAndSeparateGalaxiesVectorized,
  lerpNodePositions,
  FlatSpatialGrid,
  type VectorRelaxOptions,
} from "./wasm-physics.js";

export {
  isWasmPhysicsActive,
  relaxAndSeparateGalaxiesVectorized,
  lerpNodePositions,
  FlatSpatialGrid,
  type VectorRelaxOptions,
};

export {
  computeBlastAttenuation,
  evaluateDirectionalBlastStep,
  folderGroupKeyOfNode,
  type BlastPhase,
  type BlastTransitionEval,
  type BlastAttenuationNode,
  type BlastAttenuationResult,
} from "./sankey.js";




