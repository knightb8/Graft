/**
 * Two-Level Hierarchical Stress-SGD Layout (ADR 0021 / Feature 25).
 *
 * Decomposes complex graph layouts into two decoupled levels:
 * 1. Meta-Graph Level: Clusters (subsystem directories) are meta-nodes positioned
 *    via stress-SGD using degree-normalized cross-cluster attraction.
 * 2. Interior Level: Nodes within each cluster are laid out via stress-SGD and
 *    projected into a disc of radius proportional to sqrt(clusterNodeCount).
 *
 * Applies geometric preset constraints:
 * - Concentric radial rings for "code", "spec", and "doc" modes.
 * - Group containment and minimum gap collision resolution for "directory" mode.
 */

import { solveStressSGD } from "./stress-sgd.js";
import { getIdealLength, getStrength, normalizeEdgeWeight } from "./relations-adapter.js";

export type LayoutPresetMode = "coupled" | "code" | "spec" | "doc" | "directory";

export interface TwoLevelLayoutOptions {
  mode?: LayoutPresetMode;
  minGap?: number;
  iterations?: number;
  seed?: number;
  clusterKeyMap?: Map<string, string>;
  pivots?: number;
}

export interface ClusterMetaInfo {
  x: number;
  y: number;
  radius: number;
  memberCount: number;
}

export interface TwoLevelLayoutResult {
  positions: Map<string, { x: number; y: number }>;
  metaPositions: Map<string, ClusterMetaInfo>;
}

/**
 * Extracts default cluster key from node or file path if not provided.
 */
export function defaultClusterKeyOfNode(node: { id: string; clusterKey?: string }): string {
  if (node.clusterKey) return node.clusterKey;
  const parts = node.id.split("/");
  if (parts.length >= 2) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0] || "root";
}

/**
 * Executes the two-level hierarchical layout.
 */
export function twoLevelLayout<
  T extends { id: string; x?: number; y?: number; clusterKey?: string; scope?: string; [k: string]: any },
>(
  nodes: T[],
  edges: Array<{ source: string; target: string; relation?: string; weight?: number; [k: string]: any }>,
  options: TwoLevelLayoutOptions = {},
): TwoLevelLayoutResult {
  const mode = options.mode ?? "coupled";
  const minGap = options.minGap ?? 24;
  const seed = options.seed ?? 42;
  const iterations = options.iterations ?? 30;

  const positions = new Map<string, { x: number; y: number }>();
  const metaPositions = new Map<string, ClusterMetaInfo>();

  if (nodes.length === 0) {
    return { positions, metaPositions };
  }
  if (nodes.length === 1) {
    positions.set(nodes[0].id, { x: 0, y: 0 });
    const cKey = options.clusterKeyMap?.get(nodes[0].id) ?? defaultClusterKeyOfNode(nodes[0]);
    metaPositions.set(cKey, { x: 0, y: 0, radius: 35, memberCount: 1 });
    return { positions, metaPositions };
  }

  // 1. Group nodes into clusters
  const clusterMembers = new Map<string, T[]>();
  const nodeCluster = new Map<string, string>();

  for (const n of nodes) {
    const cKey = options.clusterKeyMap?.get(n.id) ?? defaultClusterKeyOfNode(n);
    nodeCluster.set(n.id, cKey);
    let members = clusterMembers.get(cKey);
    if (!members) {
      members = [];
      clusterMembers.set(cKey, members);
    }
    members.push(n);
  }

  // 2. Compute disc radii per cluster: radius proportional to sqrt(count)
  for (const [cKey, members] of clusterMembers.entries()) {
    const count = members.length;
    const r = Math.max(35, 26 * Math.sqrt(count) + 14);
    metaPositions.set(cKey, { x: 0, y: 0, radius: r, memberCount: count });
  }

  // 3. Build Cluster Meta-Graph
  const clusterDegree = new Map<string, number>();
  for (const cKey of clusterMembers.keys()) {
    clusterDegree.set(cKey, 0);
  }

  interface InterClusterEdge {
    c1: string;
    c2: string;
    totalWeight: number;
    edgeCount: number;
  }
  const interClusterEdges = new Map<string, InterClusterEdge>();

  for (const edge of edges) {
    const c1 = nodeCluster.get(edge.source);
    const c2 = nodeCluster.get(edge.target);
    if (!c1 || !c2) continue;
    if (c1 === c2) continue;

    clusterDegree.set(c1, (clusterDegree.get(c1) ?? 0) + 1);
    clusterDegree.set(c2, (clusterDegree.get(c2) ?? 0) + 1);

    const low = c1 < c2 ? c1 : c2;
    const high = c1 < c2 ? c2 : c1;
    const edgeKey = `${low}:::${high}`;

    let agg = interClusterEdges.get(edgeKey);
    if (!agg) {
      agg = { c1: low, c2: high, totalWeight: 0, edgeCount: 0 };
      interClusterEdges.set(edgeKey, agg);
    }
    const baseW = typeof edge.weight === "number" ? edge.weight : getStrength(edge.relation, mode, false);
    agg.totalWeight += baseW;
    agg.edgeCount++;
  }

  // Lay out cluster meta-graph using Stress-SGD
  const metaNodes = Array.from(clusterMembers.keys()).map((cKey) => ({
    id: cKey,
    x: 0,
    y: 0,
  }));

  const metaEdges = Array.from(interClusterEdges.values()).map((agg) => {
    const r1 = metaPositions.get(agg.c1)!.radius;
    const r2 = metaPositions.get(agg.c2)!.radius;
    const deg1 = clusterDegree.get(agg.c1) ?? 1;
    const deg2 = clusterDegree.get(agg.c2) ?? 1;
    const normW = normalizeEdgeWeight(agg.totalWeight, deg1, deg2);

    // Coupling reduces distance: strongly coupled clusters are placed tightly adjacent
    const idealDist = r1 + r2 + minGap + 40 / Math.sqrt(Math.max(0.04, normW));
    return {
      source: agg.c1,
      target: agg.c2,
      idealLength: idealDist,
      weight: normW,
    };
  });

  const metaSgdResult = solveStressSGD(metaNodes, metaEdges, {
    iterations: Math.min(iterations, 35),
    seed,
  });

  for (const [cKey, pos] of metaSgdResult.positions.entries()) {
    const info = metaPositions.get(cKey)!;
    info.x = pos.x;
    info.y = pos.y;
  }

  // Resolve any initial meta-cluster disc overlaps
  resolveClusterCollisions(metaPositions, minGap);

  // 4. Per-cluster interior layout with Stress-SGD
  for (const [cKey, members] of clusterMembers.entries()) {
    const meta = metaPositions.get(cKey)!;
    if (members.length === 1) {
      positions.set(members[0].id, { x: meta.x, y: meta.y });
      continue;
    }

    const memberSet = new Set(members.map((m) => m.id));
    const intraEdges = edges.filter((e) => memberSet.has(e.source) && memberSet.has(e.target));

    const interiorNodes = members.map((m) => ({ id: m.id, x: 0, y: 0 }));
    const interiorResult = solveStressSGD(interiorNodes, intraEdges, {
      iterations: Math.min(iterations, 25),
      seed: seed + members.length,
    });

    // Center internal layout at (0, 0)
    let sumX = 0;
    let sumY = 0;
    for (const m of members) {
      const p = interiorResult.positions.get(m.id)!;
      sumX += p.x;
      sumY += p.y;
    }
    const cx = sumX / members.length;
    const cy = sumY / members.length;

    let maxDist = 1;
    for (const m of members) {
      const p = interiorResult.positions.get(m.id)!;
      p.x -= cx;
      p.y -= cy;
      const d = Math.hypot(p.x, p.y);
      if (d > maxDist) maxDist = d;
    }

    // Scale into disc of allocated radius (with interior margin)
    const targetRadius = Math.max(15, meta.radius - 12);
    const scale = maxDist > targetRadius ? targetRadius / maxDist : 1.0;

    for (const m of members) {
      const p = interiorResult.positions.get(m.id)!;
      positions.set(m.id, {
        x: meta.x + p.x * scale,
        y: meta.y + p.y * scale,
      });
    }
  }

  // 5. Apply geometric preset constraints
  if (mode !== "coupled") {
    applyPresetConstraints(nodes, positions, metaPositions, mode, minGap);
  }

  return { positions, metaPositions };
}

/**
 * Resolves disc collisions between cluster centers in the meta-graph.
 */
function resolveClusterCollisions(
  metaPositions: Map<string, ClusterMetaInfo>,
  minGap: number,
): void {
  const clusters = Array.from(metaPositions.values());
  const C = clusters.length;
  if (C <= 1) return;

  for (let step = 0; step < 12; step++) {
    let hadCollision = false;
    for (let i = 0; i < C; i++) {
      for (let j = i + 1; j < C; j++) {
        const c1 = clusters[i];
        const c2 = clusters[j];
        let dx = c2.x - c1.x;
        let dy = c2.y - c1.y;
        let d = Math.hypot(dx, dy);
        const reqDist = c1.radius + c2.radius + minGap;

        if (d < reqDist) {
          hadCollision = true;
          if (d < 1e-3) {
            dx = 1;
            dy = 0;
            d = 1;
          }
          const overlap = (reqDist - d) * 0.55;
          const nx = (dx / d) * overlap;
          const ny = (dy / d) * overlap;

          c1.x -= nx;
          c1.y -= ny;
          c2.x += nx;
          c2.y += ny;
        }
      }
    }
    if (!hadCollision) break;
  }
}

/**
 * Applies geometric preset constraints:
 * - "code": radial concentric constraint with code in center, specs and docs in outer rings.
 * - "spec": specs in center, code and docs in outer rings.
 * - "doc": docs in center, specs in ring 1, code in ring 2.
 * - "directory": strict group containment within cluster discs and bounded gap.
 */
export function applyPresetConstraints<T extends { id: string; scope?: string; clusterKey?: string; [k: string]: any }>(
  nodes: T[],
  positions: Map<string, { x: number; y: number }>,
  metaPositions: Map<string, ClusterMetaInfo>,
  mode: LayoutPresetMode,
  minGap: number,
): void {
  if (mode === "directory") {
    // Group containment: enforce that all nodes lie strictly within their cluster disc
    for (const n of nodes) {
      const cKey = n.clusterKey ?? defaultClusterKeyOfNode(n);
      const meta = metaPositions.get(cKey);
      const pos = positions.get(n.id);
      if (!meta || !pos) continue;

      const dx = pos.x - meta.x;
      const dy = pos.y - meta.y;
      const d = Math.hypot(dx, dy);
      const maxAllowed = meta.radius;

      if (d > maxAllowed && d > 0) {
        const factor = maxAllowed / d;
        pos.x = meta.x + dx * factor;
        pos.y = meta.y + dy * factor;
      }
    }
    return;
  }

  // Radial presets: "code", "spec", "doc"
  type ScopeGroup = "core" | "ring1" | "ring2";
  const nodeScopeGroup = new Map<string, ScopeGroup>();

  for (const n of nodes) {
    const sc = n.scope ?? (n.id.startsWith("features") ? "specs" : n.id.startsWith("docs") ? "docs" : "code");
    if (mode === "code") {
      if (sc === "code") nodeScopeGroup.set(n.id, "core");
      else if (sc === "specs") nodeScopeGroup.set(n.id, "ring1");
      else nodeScopeGroup.set(n.id, "ring2");
    } else if (mode === "spec") {
      if (sc === "specs") nodeScopeGroup.set(n.id, "core");
      else if (sc === "code") nodeScopeGroup.set(n.id, "ring1");
      else nodeScopeGroup.set(n.id, "ring2");
    } else if (mode === "doc") {
      if (sc === "docs") nodeScopeGroup.set(n.id, "core");
      else if (sc === "specs") nodeScopeGroup.set(n.id, "ring1");
      else nodeScopeGroup.set(n.id, "ring2");
    }
  }

  // Calculate centroid of the core nodes
  let coreSumX = 0;
  let coreSumY = 0;
  let coreCount = 0;

  for (const n of nodes) {
    if (nodeScopeGroup.get(n.id) === "core") {
      const p = positions.get(n.id);
      if (p) {
        coreSumX += p.x;
        coreSumY += p.y;
        coreCount++;
      }
    }
  }

  const cx = coreCount > 0 ? coreSumX / coreCount : 0;
  const cy = coreCount > 0 ? coreSumY / coreCount : 0;

  // Recenter everything on core centroid
  for (const n of nodes) {
    const p = positions.get(n.id);
    if (p) {
      p.x -= cx;
      p.y -= cy;
    }
  }
  for (const meta of metaPositions.values()) {
    meta.x -= cx;
    meta.y -= cy;
  }

  // Radial bands
  const coreRadius = Math.max(50, 30 * Math.sqrt(Math.max(1, coreCount)));
  const ring1Min = coreRadius + 60;
  const ring1Max = ring1Min + 120;
  const ring2Min = ring1Max + 70;
  const ring2Max = ring2Min + 140;

  for (const n of nodes) {
    const p = positions.get(n.id);
    if (!p) continue;
    const group = nodeScopeGroup.get(n.id) ?? "core";
    let r = Math.hypot(p.x, p.y);
    let angle = Math.atan2(p.y, p.x);
    if (r < 1e-3) {
      angle = (positions.size * 0.618) * 2 * Math.PI;
      r = 10;
    }

    if (group === "core") {
      if (r > coreRadius) {
        const factor = coreRadius / r;
        p.x *= factor;
        p.y *= factor;
      }
    } else if (group === "ring1") {
      if (r < ring1Min || r > ring1Max) {
        const targetR = ring1Min + (Math.abs(r - ring1Min) % (ring1Max - ring1Min));
        p.x = targetR * Math.cos(angle);
        p.y = targetR * Math.sin(angle);
      }
    } else {
      if (r < ring2Min) {
        const targetR = ring2Min + (r % (ring2Max - ring2Min));
        p.x = targetR * Math.cos(angle);
        p.y = targetR * Math.sin(angle);
      }
    }
  }

  // Update meta-positions to cluster centroids
  const cSums = new Map<string, { sumX: number; sumY: number; count: number }>();
  for (const n of nodes) {
    const cKey = n.clusterKey ?? defaultClusterKeyOfNode(n);
    const p = positions.get(n.id);
    if (!p) continue;
    let s = cSums.get(cKey);
    if (!s) {
      s = { sumX: 0, sumY: 0, count: 0 };
      cSums.set(cKey, s);
    }
    s.sumX += p.x;
    s.sumY += p.y;
    s.count++;
  }

  for (const [cKey, s] of cSums.entries()) {
    const meta = metaPositions.get(cKey);
    if (meta && s.count > 0) {
      meta.x = s.sumX / s.count;
      meta.y = s.sumY / s.count;
    }
  }
}
