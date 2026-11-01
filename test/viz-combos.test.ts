import test from "node:test";
import assert from "node:assert/strict";
import {
  computeComboRadius,
  computeConduitWidth,
  getClusterKey,
  rollupConduitEdges,
  computeClusterCombos,
  type ComboInputNode,
  type ComboInputEdge,
} from "../viewer/combos.js";

// ============================================================================
// Lanum Mathematical Scaling Tests (Ch. 5 & Ch. 8)
// ============================================================================

test("computeComboRadius scales non-linearly by sqrt(memberCount) (Lanum Ch. 5 Two-Variable Discipline)", () => {
  // Base formula: 12 + 4.5 * sqrt(N)
  const r1 = computeComboRadius(1);
  const r4 = computeComboRadius(4);
  const r9 = computeComboRadius(9);
  const r16 = computeComboRadius(16);

  assert.equal(r1, 16.5);
  assert.equal(r4, 21.0);
  assert.equal(r9, 25.5);
  assert.equal(r16, 30.0);

  // Sub-linear scaling: doubling member count (4 -> 8) adds less radius than (1 -> 4)
  const delta1to4 = r4 - r1; // +4.5
  const delta4to9 = r9 - r4; // +4.5 for 5 extra members (0.9/member vs 1.5/member)
  const delta9to16 = r16 - r9; // +4.5 for 7 extra members (0.64/member)
  assert.ok(delta4to9 / 5 < delta1to4 / 3, "Marginal radius per member decreases as cluster grows");
  assert.ok(delta9to16 / 7 < delta4to9 / 5, "Marginal radius per member continues to decrease");

  // Non-positive clamps to minimum 1 member
  assert.equal(computeComboRadius(0), 16.5);
  assert.equal(computeComboRadius(-10), 16.5);

  // Custom base and scale
  assert.equal(computeComboRadius(4, 10, 2), 14); // 10 + 2 * 2
});

test("computeConduitWidth scales logarithmically by log2(count + 1) (Lanum Ch. 5 & Ch. 8)", () => {
  // Base formula: 1.2 + 1.8 * log2(count + 1)
  const w1 = computeConduitWidth(1);
  const w3 = computeConduitWidth(3);
  const w7 = computeConduitWidth(7);
  const w12 = computeConduitWidth(12);

  // For count = 1: log2(2) = 1 -> 1.2 + 1.8 * 1 = 3.0
  assert.ok(Math.abs(w1 - 3.0) < 1e-9);
  // For count = 3: log2(4) = 2 -> 1.2 + 1.8 * 2 = 4.8
  assert.ok(Math.abs(w3 - 4.8) < 1e-9);
  // For count = 7: log2(8) = 3 -> 1.2 + 1.8 * 3 = 6.6
  assert.ok(Math.abs(w7 - 6.6) < 1e-9);

  // For count = 12: log2(13) = 3.7004397... -> 1.2 + 1.8 * 3.7004397 = 7.86079...
  const expected12 = 1.2 + 1.8 * Math.log2(13);
  assert.ok(Math.abs(w12 - expected12) < 1e-9);

  // Diminishing returns property: w(12) is far smaller than 12 * w(1)
  assert.ok(w12 < 12 * w1, "Logarithmic width prevents high-density edge blowout");
  assert.ok(w12 < 8.0, "12 edges produce a compact ~7.86px stroke width");

  // Non-positive clamps to minimum 1 edge
  assert.equal(computeConduitWidth(0), 3.0);
  assert.equal(computeConduitWidth(-5), 3.0);
});

test("getClusterKey extracts directory and subsystem keys cleanly with fallbacks", () => {
  // Multi-segment file: top 2 directory segments
  const n1: ComboInputNode = { id: "1", label: "A", group: "", file: "src/graph/index.ts", x: 0, y: 0 };
  assert.equal(getClusterKey(n1), "src/graph");

  // Deep multi-segment file
  const n2: ComboInputNode = { id: "2", label: "B", group: "", file: "features/viz/core/cosmos.feature", x: 0, y: 0 };
  assert.equal(getClusterKey(n2), "features/viz");

  // Single-segment file: parent directory
  const n3: ComboInputNode = { id: "3", label: "C", group: "", file: "viewer/combos.ts", x: 0, y: 0 };
  assert.equal(getClusterKey(n3), "viewer");

  // Flat file without slashes: falls back to group
  const n4: ComboInputNode = { id: "4", label: "D", group: "core-group", file: "package.json", x: 0, y: 0 };
  assert.equal(getClusterKey(n4), "core-group");

  // No file: falls back to group
  const n5: ComboInputNode = { id: "5", label: "E", group: "cluster-alpha", x: 0, y: 0 };
  assert.equal(getClusterKey(n5), "cluster-alpha");

  // No file and no group: fallback to (root)
  const n6: ComboInputNode = { id: "6", label: "F", group: "", x: 0, y: 0 };
  assert.equal(getClusterKey(n6), "(root)");

  // Custom clusterKeyFn overrides default logic
  const customFn = (n: ComboInputNode) => `custom:${n.label}`;
  assert.equal(getClusterKey(n1, customFn), "custom:A");
});

// ============================================================================
// BDD Chem Feature Scenarios:
// features/viz/core/cosmos_cluster_combos_and_conduit_rollup-34.feature
// ============================================================================

test("Scenario: Collapsing clusters into combos aggregates member nodes and scales combo radius non-linearly", () => {
  // Given directory clusters with varying member node counts
  // Cluster A: 4 nodes in "src/graph"
  const clusterANodes: ComboInputNode[] = [
    { id: "g1", label: "g1", group: "src/graph", file: "src/graph/index.ts", x: 10, y: 20, degree: 3 },
    { id: "g2", label: "g2", group: "src/graph", file: "src/graph/layout.ts", x: 30, y: 40, degree: 5 },
    { id: "g3", label: "g3", group: "src/graph", file: "src/graph/filter.ts", x: 50, y: 60, degree: 2 },
    { id: "g4", label: "g4", group: "src/graph", file: "src/graph/types.ts", x: 70, y: 80, degree: 1 },
  ];

  // Cluster B: 9 nodes in "src/parser"
  const clusterBNodes: ComboInputNode[] = Array.from({ length: 9 }, (_, i) => ({
    id: `p${i + 1}`,
    label: `p${i + 1}`,
    group: "src/parser",
    file: `src/parser/rule${i + 1}.ts`,
    x: 100 + i * 10,
    y: 100 + i * 10,
    degree: 2,
  }));

  // Intra-cluster edges within Cluster A and Cluster B
  const intraClusterEdges: ComboInputEdge[] = [
    { source: "g1", target: "g2", type: "calls" },
    { source: "g2", target: "g3", type: "imports" },
    { source: "p1", target: "p2", type: "references" },
    { source: "p3", target: "p4", type: "uses" },
  ];

  // Inter-cluster edges connecting Cluster A to Cluster B
  const interClusterEdges: ComboInputEdge[] = [
    { source: "g1", target: "p1", type: "depends_on" },
    { source: "g2", target: "p2", type: "imports" },
  ];

  const allNodes = [...clusterANodes, ...clusterBNodes];
  const allEdges = [...intraClusterEdges, ...interClusterEdges];

  // When cluster combo aggregation is enabled
  const result = computeClusterCombos(allNodes, allEdges, { enabled: true });

  // Then each collapsed directory cluster should be represented by a single composite combo node
  assert.equal(result.nodes.length, 2);

  const comboA = result.nodes.find((n) => n.id === "combo:src/graph");
  const comboB = result.nodes.find((n) => n.id === "combo:src/parser");

  assert.ok(comboA, "Cluster A composite combo node must exist");
  assert.ok(comboB, "Cluster B composite combo node must exist");

  assert.equal(comboA.isCombo, true);
  assert.equal(comboA.label, "src/graph");
  assert.equal(comboA.clusterKey, "src/graph");
  assert.equal(comboA.memberCount, 4);
  assert.deepEqual(comboA.memberIds, ["g1", "g2", "g3", "g4"]);
  // Centroid verification: avg(10, 30, 50, 70) = 40, avg(20, 40, 60, 80) = 50
  assert.equal(comboA.x, 40);
  assert.equal(comboA.y, 50);
  // Total degree verification: 3 + 5 + 2 + 1 = 11
  assert.equal(comboA.totalDegree, 11);

  assert.equal(comboB.isCombo, true);
  assert.equal(comboB.memberCount, 9);
  assert.equal(comboB.memberIds.length, 9);
  assert.equal(comboB.totalDegree, 18);

  // And the combo node radius should scale non-linearly by the square root of its member count
  assert.equal(comboA.radius, computeComboRadius(4)); // 21.0
  assert.equal(comboB.radius, computeComboRadius(9)); // 25.5
  assert.equal(comboA.radius, 21.0);
  assert.equal(comboB.radius, 25.5);

  // And intra-cluster edges within collapsed combos should be hidden
  // The only conduit edge should be the inter-cluster conduit from combo:src/graph to combo:src/parser
  assert.equal(result.conduits.length, 1);
  const conduit = result.conduits[0];
  assert.equal(conduit.source, "combo:src/graph");
  assert.equal(conduit.target, "combo:src/parser");
  assert.equal(conduit.count, 2);
  assert.equal(conduit.memberEdges.length, 2);

  // Verify nodeToRenderedId maps all members to their respective combo IDs
  for (const n of clusterANodes) {
    assert.equal(result.nodeToRenderedId.get(n.id), "combo:src/graph");
  }
  for (const n of clusterBNodes) {
    assert.equal(result.nodeToRenderedId.get(n.id), "combo:src/parser");
  }
});

test("Scenario: Parallel inter-cluster edges roll up into weighted conduits with logarithmic width scaling", () => {
  // Given 12 parallel dependency edges connecting nodes in cluster A to nodes in cluster B
  const nodesA: ComboInputNode[] = [
    { id: "a1", label: "a1", group: "clusterA", x: 10, y: 10 },
    { id: "a2", label: "a2", group: "clusterA", x: 20, y: 20 },
    { id: "a3", label: "a3", group: "clusterA", x: 30, y: 30 },
  ];
  const nodesB: ComboInputNode[] = [
    { id: "b1", label: "b1", group: "clusterB", x: 100, y: 100 },
    { id: "b2", label: "b2", group: "clusterB", x: 110, y: 110 },
    { id: "b3", label: "b3", group: "clusterB", x: 120, y: 120 },
    { id: "b4", label: "b4", group: "clusterB", x: 130, y: 130 },
  ];

  // 12 parallel edges connecting cluster A to cluster B with diverse relation types
  // 7 "uses", 3 "imports", 2 "calls"
  const parallelEdges: ComboInputEdge[] = [
    { source: "a1", target: "b1", type: "uses" },
    { source: "a1", target: "b2", type: "uses" },
    { source: "a1", target: "b3", type: "uses" },
    { source: "a2", target: "b1", type: "uses" },
    { source: "a2", target: "b2", type: "uses" },
    { source: "a2", target: "b3", type: "uses" },
    { source: "a3", target: "b4", type: "uses" },
    { source: "a1", target: "b4", type: "imports" },
    { source: "a2", target: "b4", type: "imports" },
    { source: "a3", target: "b1", type: "imports" },
    { source: "a3", target: "b2", type: "calls" },
    { source: "a3", target: "b3", type: "calls" },
  ];
  assert.equal(parallelEdges.length, 12);

  // When cluster combo aggregation or conduit rollup is computed
  const result = computeClusterCombos([...nodesA, ...nodesB], parallelEdges, { enabled: true });

  // Then the parallel edges should merge into a single conduit edge between cluster A and cluster B
  assert.equal(result.conduits.length, 1);
  const conduit = result.conduits[0];
  assert.equal(conduit.source, "combo:clusterA");
  assert.equal(conduit.target, "combo:clusterB");
  assert.equal(conduit.id, "combo:clusterA->combo:clusterB");

  // And the conduit edge should carry the total interaction count of 12
  assert.equal(conduit.count, 12);
  assert.equal(conduit.memberEdges.length, 12);

  // And the conduit stroke width should scale logarithmically by log2(count + 1)
  const expectedWidth = computeConduitWidth(12);
  assert.equal(conduit.width, expectedWidth);
  assert.ok(Math.abs(conduit.width - (1.2 + 1.8 * Math.log2(13))) < 1e-9);

  // Dominant type and type count breakdown metadata
  assert.equal(conduit.dominantType, "uses");
  assert.deepEqual(conduit.typeCounts, {
    uses: 7,
    imports: 3,
    calls: 2,
  });

  // Verify rollupConduitEdges direct calculation also handles weighted inputs
  const weightedEdges: ComboInputEdge[] = [
    { source: "a1", target: "b1", type: "uses", weight: 5 },
    { source: "a2", target: "b2", type: "imports", weight: 4 },
    { source: "a3", target: "b3", type: "calls", weight: 3 },
  ];
  const directConduits = rollupConduitEdges(weightedEdges, result.nodeToRenderedId);
  assert.equal(directConduits.length, 1);
  assert.equal(directConduits[0].count, 12); // 5 + 4 + 3
  assert.equal(directConduits[0].width, expectedWidth);
  assert.equal(directConduits[0].dominantType, "uses");
});

test("Scenario: In-place expansion of a single combo reveals its constituent nodes while keeping other combos collapsed", () => {
  // Given all directory clusters are collapsed into combo nodes
  const nodesA: ComboInputNode[] = [
    { id: "a1", label: "File A1", group: "clusterA", x: 10, y: 20, degree: 3 },
    { id: "a2", label: "File A2", group: "clusterA", x: 30, y: 40, degree: 2 },
  ];
  const nodesB: ComboInputNode[] = [
    { id: "b1", label: "File B1", group: "clusterB", x: 200, y: 200, degree: 4 },
    { id: "b2", label: "File B2", group: "clusterB", x: 250, y: 250, degree: 1 },
  ];

  const edges: ComboInputEdge[] = [
    // Intra-cluster edges
    { source: "a1", target: "a2", type: "calls" },
    { source: "b1", target: "b2", type: "references" },
    // Inter-cluster edges from A to B
    { source: "a1", target: "b1", type: "uses" },
    { source: "a2", target: "b2", type: "imports" },
    // Inter-cluster edge from B to A
    { source: "b2", target: "a1", type: "defines" },
  ];

  // Baseline check: when both clusters are collapsed
  const collapsedBaseline = computeClusterCombos([...nodesA, ...nodesB], edges, { enabled: true });
  assert.equal(collapsedBaseline.nodes.length, 2);
  assert.ok(collapsedBaseline.nodes.every((n) => n.isCombo));
  // Intra-cluster edges are hidden
  assert.ok(!collapsedBaseline.conduits.some((c) => c.source === "a1" || c.target === "a2"));

  // When the user expands cluster A in-place
  const expandedResult = computeClusterCombos([...nodesA, ...nodesB], edges, {
    enabled: true,
    expandedClusters: new Set(["clusterA"]),
  });

  // Then the constituent member nodes and intra-cluster edges of cluster A should be restored
  const renderedA1 = expandedResult.nodes.find((n) => n.id === "a1");
  const renderedA2 = expandedResult.nodes.find((n) => n.id === "a2");
  assert.ok(renderedA1, "Constituent node a1 must be emitted individually");
  assert.ok(renderedA2, "Constituent node a2 must be emitted individually");
  assert.equal(renderedA1.isCombo, false);
  assert.equal(renderedA1.memberCount, 1);
  assert.deepEqual(renderedA1.memberIds, ["a1"]);
  assert.equal(renderedA1.x, 10);
  assert.equal(renderedA1.y, 20);
  assert.equal(renderedA1.radius, computeComboRadius(1));

  assert.equal(renderedA2.isCombo, false);
  assert.equal(renderedA2.memberCount, 1);
  assert.deepEqual(renderedA2.memberIds, ["a2"]);
  assert.equal(renderedA2.x, 30);
  assert.equal(renderedA2.y, 40);

  // Intra-cluster edge of cluster A (a1 -> a2) must be restored!
  const restoredIntraA = expandedResult.conduits.find((c) => c.source === "a1" && c.target === "a2");
  assert.ok(restoredIntraA, "Intra-cluster edge a1 -> a2 must be restored as an active conduit");
  assert.equal(restoredIntraA.dominantType, "calls");
  assert.equal(restoredIntraA.count, 1);

  // And cluster B should remain collapsed as a single combo node
  const renderedComboB = expandedResult.nodes.find((n) => n.id === "combo:clusterB");
  assert.ok(renderedComboB, "Cluster B must remain collapsed as combo:clusterB");
  assert.equal(renderedComboB.isCombo, true);
  assert.equal(renderedComboB.memberCount, 2);
  assert.deepEqual(renderedComboB.memberIds, ["b1", "b2"]);
  assert.equal(expandedResult.nodes.find((n) => n.id === "b1"), undefined);
  assert.equal(expandedResult.nodes.find((n) => n.id === "b2"), undefined);

  // Intra-cluster edge of cluster B (b1 -> b2) must still be hidden
  const hiddenIntraB = expandedResult.conduits.find((c) => c.source === "b1" || c.target === "b2");
  assert.equal(hiddenIntraB, undefined, "Intra-cluster edges of collapsed cluster B must remain hidden");

  // And edges between cluster A members and cluster B should connect directly to the cluster B combo node
  const a1ToComboB = expandedResult.conduits.find((c) => c.source === "a1" && c.target === "combo:clusterB");
  const a2ToComboB = expandedResult.conduits.find((c) => c.source === "a2" && c.target === "combo:clusterB");
  assert.ok(a1ToComboB, "Edge from a1 must connect directly to combo:clusterB");
  assert.ok(a2ToComboB, "Edge from a2 must connect directly to combo:clusterB");
  assert.equal(a1ToComboB.dominantType, "uses");
  assert.equal(a2ToComboB.dominantType, "imports");

  // Reverse edge from cluster B to cluster A member should connect directly from combo:clusterB to a1
  const comboBToA1 = expandedResult.conduits.find((c) => c.source === "combo:clusterB" && c.target === "a1");
  assert.ok(comboBToA1, "Reverse edge must connect directly from combo:clusterB to a1");
  assert.equal(comboBToA1.dominantType, "defines");

  // Total nodes emitted: 2 expanded nodes from cluster A + 1 composite combo node for cluster B = 3
  assert.equal(expandedResult.nodes.length, 3);
});

// ============================================================================
// Disabled State and Edge Case Tests
// ============================================================================

test("computeClusterCombos with enabled: false renders all nodes individually and rolls up parallel edges", () => {
  const nodes: ComboInputNode[] = [
    { id: "n1", label: "N1", group: "grp", x: 10, y: 15, degree: 2 },
    { id: "n2", label: "N2", group: "grp", x: 25, y: 35, degree: 4 },
  ];
  const edges: ComboInputEdge[] = [
    { source: "n1", target: "n2", type: "calls" },
    { source: "n1", target: "n2", type: "references" },
    { source: "n1", target: "n1", type: "self" }, // self-loop
  ];

  const result = computeClusterCombos(nodes, edges, { enabled: false });

  // Both nodes returned individually with isCombo: false
  assert.equal(result.nodes.length, 2);
  assert.equal(result.nodes[0].id, "n1");
  assert.equal(result.nodes[0].isCombo, false);
  assert.equal(result.nodes[0].memberCount, 1);
  assert.equal(result.nodes[1].id, "n2");
  assert.equal(result.nodes[1].isCombo, false);

  // Self-loop filtered out, 2 parallel edges between n1 and n2 rolled up into 1 conduit
  assert.equal(result.conduits.length, 1);
  assert.equal(result.conduits[0].source, "n1");
  assert.equal(result.conduits[0].target, "n2");
  assert.equal(result.conduits[0].count, 2);

  // Node mappings
  assert.equal(result.nodeToRenderedId.get("n1"), "n1");
  assert.equal(result.nodeToRenderedId.get("n2"), "n2");
});

test("computeClusterCombos handles empty input gracefully", () => {
  const result = computeClusterCombos([], [], { enabled: true });
  assert.deepEqual(result.nodes, []);
  assert.deepEqual(result.conduits, []);
  assert.equal(result.nodeToRenderedId.size, 0);
});

test("expanding all clusters restores all constituent nodes and all non-self edges", () => {
  const nodes: ComboInputNode[] = [
    { id: "x1", label: "X1", group: "clusterX", x: 0, y: 0 },
    { id: "x2", label: "X2", group: "clusterX", x: 10, y: 10 },
    { id: "y1", label: "Y1", group: "clusterY", x: 50, y: 50 },
    { id: "y2", label: "Y2", group: "clusterY", x: 60, y: 60 },
  ];
  const edges: ComboInputEdge[] = [
    { source: "x1", target: "x2", type: "calls" },
    { source: "y1", target: "y2", type: "uses" },
    { source: "x1", target: "y1", type: "imports" },
  ];

  const result = computeClusterCombos(nodes, edges, {
    enabled: true,
    expandedClusters: new Set(["clusterX", "clusterY"]),
  });

  assert.equal(result.nodes.length, 4);
  assert.ok(result.nodes.every((n) => !n.isCombo));
  assert.equal(result.conduits.length, 3);
});
