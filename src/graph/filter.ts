/**
 * Scope & Directory Filtering for Context Graph, Visualizer, and Tools.
 *
 * Implements the Tripartite Architecture scopes (code, docs, specs)
 * and path-segment directory exclusions (ADR 0006).
 */
import type { GraphV1, NodeV1, EdgeV1 } from "./types.js";
import { generateTransitiveEdges } from "./transitive.js";

export type TripartiteScope = "all" | "code" | "docs" | "specs";
export type ConcreteScope = "code" | "docs" | "specs";

export interface GraphFilterCriteria {
  scope?: TripartiteScope;
  scopes?: Set<ConcreteScope> | ConcreteScope[];
  excludeDirs?: string[];
  includeDirs?: string[];
  selectedFiles?: Set<string>;
  transitive?: boolean;
}

/** Check if a file path or node path belongs to a given tripartite scope. */
export function scopeOfPath(filePath: string): "code" | "docs" | "specs" {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  // .feature files are specifications
  if (normalized.endsWith(".feature") || normalized.includes(".feature#")) {
    return "specs";
  }
  // Markdown files and docs folders are documentation
  if (
    normalized.endsWith(".md") ||
    normalized.endsWith(".markdown") ||
    normalized.includes("/docs/") ||
    normalized.startsWith("docs/")
  ) {
    return "docs";
  }
  // All other programming language files (including step definitions like _steps.py, .ts, etc.) are code
  return "code";
}

export interface FilterableNode {
  id?: string;
  path?: string;
  type?: string;
  sources?: string[];
}

/** Classify a node into code, docs, or specs. */
export function scopeOfNode(node: FilterableNode): "code" | "docs" | "specs" {
  if (node.path) {
    return scopeOfPath(node.path);
  }
  if (node.sources && node.sources.length > 0) {
    // If any source points to a spec, it's a spec
    for (const src of node.sources) {
      const p = src.split(" · ")[0].trim();
      const s = scopeOfPath(p);
      if (s === "specs") return "specs";
    }
    // If all sources point to docs, it's docs
    const allDocs = node.sources.every((src) => {
      const p = src.split(" · ")[0].trim();
      return scopeOfPath(p) === "docs";
    });
    if (allDocs) return "docs";
    return "code";
  }
  if (node.type === "concept" || node.type === "system" || node.type === "api") {
    return "docs";
  }
  if (node.id) {
    return scopeOfPath(node.id);
  }
  return "code";
}

/** Check if a target scope accepts a node scope. */
export function matchesScope(
  nodeScope: ConcreteScope,
  targetScope?: TripartiteScope | Set<ConcreteScope> | ConcreteScope[],
): boolean {
  if (!targetScope) return true;
  if (typeof targetScope === "string") {
    if (targetScope === "all") return true;
    return nodeScope === targetScope;
  }
  if (targetScope instanceof Set) {
    if (targetScope.size === 0) return false;
    return targetScope.has(nodeScope);
  }
  if (Array.isArray(targetScope)) {
    if (targetScope.length === 0) return false;
    return targetScope.includes(nodeScope);
  }
  return true;
}

/**
 * Normalizes a directory path for prefix / segment matching.
 * Strips leading/trailing slashes.
 */
function normalizeDir(dir: string): string {
  return dir.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").toLowerCase();
}

/** Checks whether a path matches any excluded directory pattern. */
export function isPathExcluded(filePath: string, excludeDirs?: string[]): boolean {
  if (!excludeDirs || excludeDirs.length === 0) return false;
  const p = filePath.replace(/\\/g, "/").toLowerCase();
  const segments = p.split("/");

  for (const raw of excludeDirs) {
    const dir = normalizeDir(raw);
    if (!dir) continue;
    // Multi-segment directory (e.g. docs/checkpoints)
    if (dir.includes("/")) {
      if (p === dir || p.startsWith(`${dir}/`) || p.includes(`/${dir}/`)) {
        return true;
      }
    } else {
      // Single-segment directory (e.g. test, vendor)
      if (segments.includes(dir)) {
        return true;
      }
    }
  }
  return false;
}

/** Checks whether a path matches any included directory prefix (whitelist). */
export function isPathIncluded(filePath: string, includeDirs?: string[]): boolean {
  if (!includeDirs || includeDirs.length === 0) return true;
  const p = filePath.replace(/\\/g, "/").toLowerCase();

  for (const raw of includeDirs) {
    const dir = normalizeDir(raw);
    if (!dir) continue;
    if (p === dir || p.startsWith(`${dir}/`) || p.includes(`/${dir}/`)) {
      return true;
    }
  }
  return false;
}

/** Primary predicate: returns true if node passes scope and directory criteria. */
export function matchNodeFilter(node: FilterableNode, criteria?: GraphFilterCriteria): boolean {
  if (!criteria) return true;

  // 1. Scope filter
  if (criteria.scopes !== undefined) {
    const sc = scopeOfNode(node);
    if (!matchesScope(sc, criteria.scopes)) return false;
  } else if (criteria.scope && criteria.scope !== "all") {
    const sc = scopeOfNode(node);
    if (!matchesScope(sc, criteria.scope)) return false;
  }

  // 2. Directory exclusions & inclusions
  const pathsToCheck: string[] = [];
  if (node.path) pathsToCheck.push(node.path);
  if (node.sources) {
    for (const src of node.sources) {
      pathsToCheck.push(src.split(" · ")[0].trim());
    }
  }
  if (pathsToCheck.length === 0 && node.id) {
    pathsToCheck.push(node.id.split("#")[0].trim());
  }

  for (const p of pathsToCheck) {
    if (isPathExcluded(p, criteria.excludeDirs)) return false;
  }

  if (criteria.includeDirs && criteria.includeDirs.length > 0) {
    const anyIncluded = pathsToCheck.some((p) => isPathIncluded(p, criteria.includeDirs));
    if (!anyIncluded) return false;
  }

  // 3. Selected files set (from directory/file tree picker)
  if (criteria.selectedFiles !== undefined) {
    if (criteria.selectedFiles.size === 0) return false;
    if (pathsToCheck.length > 0) {
      const anySelected = pathsToCheck.some((p) => {
        const norm = p.replace(/\\/g, "/");
        return criteria.selectedFiles!.has(norm) || criteria.selectedFiles!.has(norm.toLowerCase());
      });
      if (!anySelected) return false;
    }
  }

  return true;
}

/** Filter a GraphV1 structure (nodes and edges) using criteria. */
export function filterGraphV1(graph: GraphV1, criteria: GraphFilterCriteria): GraphV1 {
  const filteredNodes = graph.nodes.filter((n) => matchNodeFilter(n, criteria));
  const admittedIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = graph.edges.filter((e) => admittedIds.has(e.source) && admittedIds.has(e.target));

  return {
    meta: {
      ...graph.meta,
      nodeCount: filteredNodes.length,
      edgeCount: filteredEdges.length,
    },
    nodes: filteredNodes,
    edges: filteredEdges,
  };
}

export interface FilterableVizGraph {
  meta: any;
  nodes: any[];
  edges: Array<{ source: string; target: string; relation: string; [k: string]: any }>;
}

/** Filter a VizGraph structure (nodes and edges) using criteria. */
export function filterVizGraph<T extends FilterableVizGraph>(graph: T, criteria: GraphFilterCriteria): T {
  const filteredNodes = graph.nodes.filter((n) => matchNodeFilter(n, criteria));
  const admittedIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = graph.edges.filter((e) => admittedIds.has(e.source) && admittedIds.has(e.target));

  if (criteria.transitive) {
    const transitiveEdges = generateTransitiveEdges(graph.edges, (id) => admittedIds.has(id));
    for (const te of transitiveEdges) {
      filteredEdges.push(te);
    }
  }

  return {
    ...graph,
    meta: {
      ...graph.meta,
      nodeCount: filteredNodes.length,
      edgeCount: filteredEdges.length,
    },
    nodes: filteredNodes,
    edges: filteredEdges,
  };
}

