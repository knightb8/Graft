/**
 * Cluster Combos & Multi-Link Conduit Rollup Engine
 *
 * Implements interactive directory cluster aggregation, non-linear combo radius
 * scaling, logarithmic conduit width scaling, and in-place cluster drill-down.
 *
 * Architectural Specifications:
 * - Corey L. Lanum, "Visualizing Graph Data" (Manning, 2017)
 *   - Chapter 5: Two-Variable Discipline (Node Radius ~ sqrt(N), Link Width ~ log2(Count + 1))
 *   - Chapter 6: Overview + Detail Navigation (Fig 6.4)
 *   - Chapter 8: Drill-Down and In-Place Expansion (Section 8.2)
 * - ADR 0028: Lanum Graph Visualization Enhancements and Stacked Flow Hierarchy
 * - Feature: features/viz/core/cosmos_cluster_combos_and_conduit_rollup-34.feature
 *
 * @covers features/viz/core/cosmos_cluster_combos_and_conduit_rollup-34.feature
 * @covers viewer/combos.ts
 * @covers test/viz-combos.test.ts
 */

export interface ComboInputNode {
  id: string;
  label: string;
  group: string;
  file?: string;
  x: number;
  y: number;
  degree?: number;
}

export interface ComboInputEdge {
  source: string;
  target: string;
  type: string;
  weight?: number;
}

export interface ComboNode {
  id: string;          // "combo:<clusterKey>" for collapsed combos, or original node.id
  label: string;
  clusterKey: string;
  isCombo: boolean;
  memberCount: number;
  memberIds: string[];
  x: number;
  y: number;
  radius: number;
  totalDegree: number;
}

export interface ConduitEdge {
  id: string;
  source: string;      // combo ID or expanded node ID
  target: string;      // combo ID or expanded node ID
  count: number;
  width: number;
  dominantType: string;
  typeCounts: Record<string, number>;
  memberEdges: ComboInputEdge[];
}

export interface ClusterCombosResult {
  nodes: ComboNode[];
  conduits: ConduitEdge[];
  nodeToRenderedId: Map<string, string>;
}

export interface ClusterCombosOptions {
  enabled?: boolean;
  expandedClusters?: Set<string>;
  clusterKeyFn?: (node: ComboInputNode) => string;
  baseRadius?: number;
  radiusScale?: number;
  baseConduitWidth?: number;
  conduitScale?: number;
}

/**
 * Computes non-linear combo node radius according to Lanum Ch. 5 Two-Variable Discipline.
 * Sizing scales with the square root of member count so visual area is proportional
 * to cluster size while preventing extreme geometric blowout.
 *
 * Formula: baseRadius + scale * sqrt(max(1, memberCount))
 */
export function computeComboRadius(
  memberCount: number,
  baseRadius = 12,
  scale = 4.5,
): number {
  return baseRadius + scale * Math.sqrt(Math.max(1, memberCount));
}

/**
 * Computes logarithmic conduit edge stroke width according to Lanum Ch. 5 & Ch. 8.
 * High-density parallel dependencies roll up into weighted conduits whose stroke
 * width grows logarithmically, preventing visual occlusion.
 *
 * Formula: baseWidth + scale * log2(max(1, edgeCount) + 1)
 */
export function computeConduitWidth(
  edgeCount: number,
  baseWidth = 1.2,
  scale = 1.8,
): number {
  return baseWidth + scale * Math.log2(Math.max(1, edgeCount) + 1);
}

/**
 * Extracts the directory or architectural subsystem cluster key for a node.
 * - If a custom clusterKeyFn is supplied, delegates to it.
 * - If node.file has a slash (or node.id has a slash), extracts the parent directory
 *   or top 2 directory segments (e.g. "src/graph" from "src/graph/index.ts").
 * - Otherwise falls back to node.group or "(root)".
 */
export function getClusterKey(
  node: ComboInputNode,
  clusterKeyFn?: (node: ComboInputNode) => string,
): string {
  if (clusterKeyFn) {
    return clusterKeyFn(node);
  }
  const filePath = node.file ?? (node.id.includes("/") ? node.id : undefined);
  if (filePath && filePath.includes("/")) {
    const normalized = filePath.replace(/\\/g, "/");
    const parts = normalized.split("/").filter(Boolean);
    if (parts.length > 1) {
      const dirParts = parts.slice(0, parts.length > 2 ? 2 : 1);
      return dirParts.join("/");
    }
  }
  return node.group || "(root)";
}

/**
 * Rolls up raw dependency edges into weighted conduit edges:
 * 1. Maps each edge's source and target through nodeToRenderedId.
 * 2. Filters out self-loops where mappedSource === mappedTarget (automatically
 *    hiding intra-cluster edges inside collapsed combos).
 * 3. Groups parallel edges between the same directed (mappedSource, mappedTarget)
 *    pair into a single ConduitEdge with aggregated interaction count, logarithmic
 *    width scaling, type breakdown, and dominant interaction type.
 */
export function rollupConduitEdges(
  edges: ComboInputEdge[],
  nodeToRenderedId: Map<string, string>,
  options?: { baseWidth?: number; scale?: number },
): ConduitEdge[] {
  const conduitMap = new Map<
    string,
    {
      source: string;
      target: string;
      memberEdges: ComboInputEdge[];
    }
  >();

  for (const edge of edges) {
    const mappedSource = nodeToRenderedId.get(edge.source) ?? edge.source;
    const mappedTarget = nodeToRenderedId.get(edge.target) ?? edge.target;

    // Filter out self-loops (including intra-cluster links in collapsed combos)
    if (mappedSource === mappedTarget) {
      continue;
    }

    const key = `${mappedSource}->${mappedTarget}`;
    let conduit = conduitMap.get(key);
    if (!conduit) {
      conduit = {
        source: mappedSource,
        target: mappedTarget,
        memberEdges: [],
      };
      conduitMap.set(key, conduit);
    }
    conduit.memberEdges.push(edge);
  }

  const conduits: ConduitEdge[] = [];
  for (const [id, entry] of conduitMap.entries()) {
    const memberEdges = entry.memberEdges;
    const hasWeights = memberEdges.some(
      (e) => typeof e.weight === "number" && Number.isFinite(e.weight),
    );

    const typeCounts: Record<string, number> = {};
    for (const e of memberEdges) {
      const t = e.type || "dependency";
      const w = hasWeights
        ? typeof e.weight === "number" && Number.isFinite(e.weight)
          ? e.weight
          : 1
        : 1;
      typeCounts[t] = (typeCounts[t] ?? 0) + w;
    }

    const count = Object.values(typeCounts).reduce((sum, v) => sum + v, 0);

    const dominantType =
      Object.keys(typeCounts).sort(
        (a, b) => typeCounts[b] - typeCounts[a] || a.localeCompare(b),
      )[0] ?? "dependency";

    const width = computeConduitWidth(
      count,
      options?.baseWidth,
      options?.scale,
    );

    conduits.push({
      id,
      source: entry.source,
      target: entry.target,
      count,
      width,
      dominantType,
      typeCounts,
      memberEdges,
    });
  }

  return conduits;
}

/**
 * Computes cluster combo aggregation and conduit rollup for cosmos graph visualization.
 *
 * Modes:
 * - When enabled === false:
 *   Emits every node individually with radius = computeComboRadius(1).
 *   Duplicate edges between individual nodes are rolled up into conduits.
 * - When enabled === true:
 *   Groups nodes by clusterKey.
 *   - Collapsed clusters emit a single composite ComboNode ("combo:<clusterKey>")
 *     sized by sqrt(memberCount) with centroid coordinates and summed degrees.
 *   - Clusters present in expandedClusters emit their constituent nodes individually.
 *   - Edges are rolled up through nodeToRenderedId, hiding intra-cluster links of
 *     collapsed clusters and routing inter-cluster conduits directly to/from combos.
 */
export function computeClusterCombos(
  nodes: ComboInputNode[],
  edges: ComboInputEdge[],
  options?: ClusterCombosOptions,
): ClusterCombosResult {
  const enabled = options?.enabled ?? true;
  const nodeToRenderedId = new Map<string, string>();
  const resultNodes: ComboNode[] = [];

  if (!enabled) {
    for (const n of nodes) {
      nodeToRenderedId.set(n.id, n.id);
      resultNodes.push({
        id: n.id,
        label: n.label,
        clusterKey: getClusterKey(n, options?.clusterKeyFn),
        isCombo: false,
        memberCount: 1,
        memberIds: [n.id],
        x: n.x,
        y: n.y,
        radius: computeComboRadius(
          1,
          options?.baseRadius,
          options?.radiusScale,
        ),
        totalDegree: n.degree ?? 0,
      });
    }

    const conduits = rollupConduitEdges(edges, nodeToRenderedId, {
      baseWidth: options?.baseConduitWidth,
      scale: options?.conduitScale,
    });

    return {
      nodes: resultNodes,
      conduits,
      nodeToRenderedId,
    };
  }

  // Group nodes by clusterKey
  const clusterOrder: string[] = [];
  const clusterMembers = new Map<string, ComboInputNode[]>();

  for (const n of nodes) {
    const cKey = getClusterKey(n, options?.clusterKeyFn);
    let list = clusterMembers.get(cKey);
    if (!list) {
      list = [];
      clusterMembers.set(cKey, list);
      clusterOrder.push(cKey);
    }
    list.push(n);
  }

  for (const clusterKey of clusterOrder) {
    const members = clusterMembers.get(clusterKey)!;
    const isExpanded = options?.expandedClusters?.has(clusterKey) ?? false;

    if (isExpanded) {
      // In-place expansion: emit each constituent node individually
      for (const m of members) {
        nodeToRenderedId.set(m.id, m.id);
        resultNodes.push({
          id: m.id,
          label: m.label,
          clusterKey,
          isCombo: false,
          memberCount: 1,
          memberIds: [m.id],
          x: m.x,
          y: m.y,
          radius: computeComboRadius(
            1,
            options?.baseRadius,
            options?.radiusScale,
          ),
          totalDegree: m.degree ?? 0,
        });
      }
    } else {
      // Collapsed: emit single composite ComboNode
      const comboId = "combo:" + clusterKey;
      for (const m of members) {
        nodeToRenderedId.set(m.id, comboId);
      }

      const count = members.length;
      const avgX =
        count > 0
          ? members.reduce((sum, m) => sum + m.x, 0) / count
          : 0;
      const avgY =
        count > 0
          ? members.reduce((sum, m) => sum + m.y, 0) / count
          : 0;
      const totalDegree = members.reduce(
        (sum, m) => sum + (m.degree ?? 0),
        0,
      );

      resultNodes.push({
        id: comboId,
        label: clusterKey,
        clusterKey,
        isCombo: true,
        memberCount: count,
        memberIds: members.map((m) => m.id),
        x: avgX,
        y: avgY,
        radius: computeComboRadius(
          count,
          options?.baseRadius,
          options?.radiusScale,
        ),
        totalDegree,
      });
    }
  }

  const conduits = rollupConduitEdges(edges, nodeToRenderedId, {
    baseWidth: options?.baseConduitWidth,
    scale: options?.conduitScale,
  });

  return {
    nodes: resultNodes,
    conduits,
    nodeToRenderedId,
  };
}
