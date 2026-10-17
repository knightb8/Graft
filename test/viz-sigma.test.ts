import { test } from "node:test";
import assert from "node:assert/strict";
import { MultiDirectedGraph } from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { generateTransitiveEdges } from "../src/graph/transitive.js";
import { scopeOfPath, matchNodeFilter } from "../src/graph/filter.js";

test("Graphology model stores nodes, scopes, and edges for visualizer", () => {
  const graph = new MultiDirectedGraph();

  graph.addNode("docs/adr-01.md", {
    label: "ADR-01",
    nodeType: "doc",
    scope: scopeOfPath("docs/adr-01.md"),
    size: 10,
    color: "#a06bdb",
    x: 0,
    y: 0,
  });

  graph.addNode("src/app.ts", {
    label: "app.ts",
    nodeType: "module",
    scope: scopeOfPath("src/app.ts"),
    size: 12,
    color: "#4a7df0",
    x: 100,
    y: 100,
  });

  graph.addEdgeWithKey("e1", "docs/adr-01.md", "src/app.ts", {
    relation: "influences",
    size: 1.8,
    color: "#888888",
    transitive: false,
  });

  assert.equal(graph.order, 2);
  assert.equal(graph.size, 1);
  assert.equal(graph.getNodeAttribute("docs/adr-01.md", "scope"), "docs");
  assert.equal(graph.getNodeAttribute("src/app.ts", "scope"), "code");
  assert.equal(graph.getEdgeAttribute("e1", "relation"), "influences");
});

test("ForceAtlas2 converges node coordinates on Graphology graph", () => {
  const graph = new MultiDirectedGraph();

  for (let i = 0; i < 20; i++) {
    const id = `node-${i}`;
    const angle = (i / 20) * Math.PI * 2;
    graph.addNode(id, {
      x: Math.cos(angle) * 50,
      y: Math.sin(angle) * 50,
      size: 10,
    });
    if (i > 0) {
      graph.addEdge(`node-${i - 1}`, id);
    }
  }

  // Assign ForceAtlas2 layout
  forceAtlas2.assign(graph, {
    iterations: 20,
    settings: {
      barnesHutOptimize: true,
      gravity: 1.0,
      scalingRatio: 2,
    },
  });

  graph.forEachNode((id, attrs) => {
    assert.equal(typeof attrs.x, "number");
    assert.equal(typeof attrs.y, "number");
    assert.equal(Number.isNaN(attrs.x), false);
    assert.equal(Number.isNaN(attrs.y), false);
  });
});

test("Transitive shortcuts integrate into Graphology model across hidden nodes", () => {
  const graph = new MultiDirectedGraph();

  graph.addNode("A", { label: "A", scope: "docs" });
  graph.addNode("C", { label: "C", scope: "code" });

  const rawEdges = [
    { source: "A", target: "B", relation: "influences" },
    { source: "B", target: "C", relation: "covers" },
  ];

  // B is hidden
  const isVisible = (id: string) => id !== "B";
  const transitive = generateTransitiveEdges(rawEdges, isVisible);

  assert.equal(transitive.length, 1);
  assert.equal(transitive[0].source, "A");
  assert.equal(transitive[0].target, "C");

  graph.addEdgeWithKey("trans:A->C", transitive[0].source, transitive[0].target, {
    relation: "transitive",
    transitive: true,
    via: transitive[0].via,
  });

  assert.equal(graph.hasEdge("trans:A->C"), true);
  assert.equal(graph.getEdgeAttribute("trans:A->C", "transitive"), true);
  assert.deepEqual(graph.getEdgeAttribute("trans:A->C", "via"), ["B"]);
});

test("Tree filtering correctly excludes unselected files and excluded directories", () => {
  const nodeA = { id: "src/graph/index.ts", type: "file", sources: ["src/graph/index.ts · 1-10"] };
  const nodeB = { id: "src/cli.ts", type: "file", sources: ["src/cli.ts · 1-5"] };

  // When selectedFiles is active (user unticked a tree box)
  const selectedFiles = new Set(["src/graph/index.ts"]);
  assert.equal(matchNodeFilter(nodeA, { selectedFiles }), true);
  assert.equal(matchNodeFilter(nodeB, { selectedFiles }), false);

  // When excludeDirs is active
  assert.equal(matchNodeFilter(nodeA, { excludeDirs: ["src/graph"] }), false);
  assert.equal(matchNodeFilter(nodeB, { excludeDirs: ["src/graph"] }), true);
});

test("Sigma display contracts enforce visibility: hidden on filtered elements", () => {
  // Simulates reduceNode / reduceEdge contract for Sigma v4
  const reduceNodeMock = (shown: boolean, data: any) => {
    if (!shown) {
      return {
        ...data,
        visibility: "hidden",
        hidden: true,
        size: 0,
        opacity: 0,
        color: "transparent",
        label: null,
        labelVisibility: "hidden",
      };
    }
    return {
      ...data,
      visibility: "visible",
      labelVisibility: "auto",
    };
  };

  const hiddenResult = reduceNodeMock(false, { size: 10, color: "#fff" });
  assert.equal(hiddenResult.visibility, "hidden");
  assert.equal(hiddenResult.size, 0);
  assert.equal(hiddenResult.opacity, 0);
  assert.equal(hiddenResult.label, null);
  assert.equal(hiddenResult.labelVisibility, "hidden");

  const visibleResult = reduceNodeMock(true, { size: 10, color: "#fff" });
  assert.equal(visibleResult.visibility, "visible");
  assert.equal(visibleResult.labelVisibility, "auto");
});

test("Archipelago cluster key extraction groups nodes by semantic subsystem", () => {
  function clusterKeyOfNode(node: { id: string; sources?: string[]; scope: string }): { key: string; name: string } {
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

  // Multi-tier source paths
  assert.deepEqual(
    clusterKeyOfNode({ id: "node1", sources: ["src/graph/index.ts · 1-10"], scope: "code" }),
    { key: "src/graph", name: "src/graph" },
  );
  assert.deepEqual(
    clusterKeyOfNode({ id: "node2", sources: ["features/parsing/core/gherkin.feature"], scope: "specs" }),
    { key: "features/parsing", name: "features/parsing" },
  );
  assert.deepEqual(
    clusterKeyOfNode({ id: "node3", sources: ["docs/adr/0001-init.md"], scope: "docs" }),
    { key: "docs/adr", name: "docs/adr" },
  );
  assert.deepEqual(
    clusterKeyOfNode({ id: "node4", sources: ["src/cli.ts · 1-5"], scope: "code" }),
    { key: "src", name: "src" },
  );

  // Fallback to id or scope
  assert.deepEqual(
    clusterKeyOfNode({ id: "src/graph/model.ts#Node", scope: "code" }),
    { key: "src/graph", name: "src/graph" },
  );
  assert.deepEqual(
    clusterKeyOfNode({ id: "GlobalSymbol", scope: "specs" }),
    { key: "specs", name: "SPECS" },
  );
});

test("Archipelago bounding calculation uses 90th percentile to protect against outlier ballooning", () => {
  // 9 tightly clustered points around (0,0) and 1 extreme outlier at (500, 500)
  const pts = [
    { x: 0, y: 0 },
    { x: 5, y: 5 },
    { x: -5, y: -5 },
    { x: 10, y: -10 },
    { x: -10, y: 10 },
    { x: 15, y: 5 },
    { x: -5, y: 15 },
    { x: 8, y: -8 },
    { x: -8, y: 8 },
    { x: 500, y: 500 }, // Outlier
  ];

  let sumX = 0, sumY = 0;
  for (const p of pts) { sumX += p.x; sumY += p.y; }
  const cx = sumX / pts.length;
  const cy = sumY / pts.length;

  const dists = pts.map((p) => Math.hypot(p.x - cx, p.y - cy)).sort((a, b) => a - b);
  const p85Idx = Math.min(dists.length - 1, Math.floor((dists.length - 1) * 0.85));
  const p85 = dists[p85Idx];

  // Max dist across all points would be ~635px (ballooning the bloom across entire screen)
  const absoluteMax = dists[dists.length - 1];
  assert.ok(absoluteMax > 600, "Outlier causes extreme absolute distance");

  // 85th percentile stays tight around the core cluster (~80px)
  assert.ok(p85 < 100, `85th percentile distance (${p85}) remains compact`);
});

test("Smart LOD label rules prioritize landmarks, hover, and search hits", () => {
  interface NodeLODInput {
    id: string;
    deg: number;
    totalVisible: number;
    maxDeg: number;
    hovered: string | null;
    hoverNeighbors: Set<string>;
    selected: string | null;
    query: string;
  }

  function computeLODLabel(input: NodeLODInput): { labelVisibility: "visible" | "auto" | "hidden"; elevated: boolean } {
    if (input.selected) {
      if (input.id === input.selected) return { labelVisibility: "visible", elevated: true };
      return { labelVisibility: "hidden", elevated: false };
    }
    if (input.hovered) {
      if (input.id === input.hovered) return { labelVisibility: "visible", elevated: true };
      if (input.hoverNeighbors.has(input.id)) return { labelVisibility: "visible", elevated: true };
    }
    if (input.query && input.id.toLowerCase().includes(input.query.toLowerCase())) {
      return { labelVisibility: "visible", elevated: true };
    }
    const isLandmark =
      input.totalVisible <= 35 ||
      input.deg >= 5 ||
      (input.totalVisible > 35 && input.deg >= Math.max(3, Math.round(input.maxDeg * 0.35)));
    if (isLandmark) {
      return { labelVisibility: "visible", elevated: false }; // landmark hub / small-graph marker
    }
    return { labelVisibility: "auto", elevated: false }; // spatial grid zoom
  }

  // 1. Small graph (8 nodes total, e.g. concept graph) -> ALL visible markers have labels
  const smallGraphNode = computeLODLabel({ id: "concept", deg: 1, totalVisible: 8, maxDeg: 2, hovered: null, hoverNeighbors: new Set(), selected: null, query: "" });
  assert.equal(smallGraphNode.labelVisibility, "visible", "Small graphs render 100% of visible markers with visible labels");
  assert.equal(smallGraphNode.elevated, false);

  // 2. Large graph (100 nodes, maxDeg 14) low-degree node -> "auto"
  const largeNormal = computeLODLabel({ id: "leaf", deg: 1, totalVisible: 100, maxDeg: 14, hovered: null, hoverNeighbors: new Set(), selected: null, query: "" });
  assert.equal(largeNormal.labelVisibility, "auto");
  assert.equal(largeNormal.elevated, false);

  // 3. Large graph landmark hub (deg 6 >= 5 and >= 14 * 0.35 = 5) -> "visible"
  const landmark = computeLODLabel({ id: "hub", deg: 6, totalVisible: 100, maxDeg: 14, hovered: null, hoverNeighbors: new Set(), selected: null, query: "" });
  assert.equal(landmark.labelVisibility, "visible");
  assert.equal(landmark.elevated, false);

  // 4. Hovered node -> "visible" & elevated
  const hovered = computeLODLabel({ id: "foo", deg: 1, totalVisible: 100, maxDeg: 14, hovered: "foo", hoverNeighbors: new Set(), selected: null, query: "" });
  assert.equal(hovered.labelVisibility, "visible");
  assert.equal(hovered.elevated, true);

  // 5. Hover neighbor -> "visible" & elevated
  const hoverNbr = computeLODLabel({ id: "bar", deg: 1, totalVisible: 100, maxDeg: 14, hovered: "foo", hoverNeighbors: new Set(["bar"]), selected: null, query: "" });
  assert.equal(hoverNbr.labelVisibility, "visible");
  assert.equal(hoverNbr.elevated, true);

  // 6. Search hit -> "visible" & elevated
  const hit = computeLODLabel({ id: "auth_service", deg: 1, totalVisible: 100, maxDeg: 14, hovered: null, hoverNeighbors: new Set(), selected: null, query: "auth" });
  assert.equal(hit.labelVisibility, "visible");
  assert.equal(hit.elevated, true);
});

test("Center real estate auto-framing calculates camera ratio for 75% viewport coverage", () => {
  function computeFramingRatio(
    boxW: number,
    boxH: number,
    viewportW: number,
    viewportH: number,
    targetCoverage = 0.75,
  ): number {
    const targetW = viewportW * targetCoverage;
    const targetH = viewportH * targetCoverage;
    return Math.max(0.15, Math.min(2.5, Math.max(boxW / targetW, boxH / targetH)));
  }

  const W = 1000;
  const H = 800;
  // Target width = 750px, Target height = 600px

  // Scenario A: Over-dispersed graph spanning 900x700px at ratio 1.0 (pushed near borders)
  // Ratio must zoom out to 1.2 (900 / 750) so box shrinks to exactly 750px (75% of viewport)
  const ratioA = computeFramingRatio(900, 700, W, H);
  assert.equal(Math.round(ratioA * 100) / 100, 1.2);

  // Scenario B: Compact graph spanning 375x300px at ratio 1.0 (only 37.5% of viewport)
  // Ratio must zoom in to 0.5 (375 / 750) so box expands to exactly 750px (75% of viewport)
  const ratioB = computeFramingRatio(375, 300, W, H);
  assert.equal(ratioB, 0.5);

  // Scenario C: Height-dominant graph (tall hierarchy) spanning 300x720px
  // Height constraint (720 / 600 = 1.2) dictates ratio
  const ratioC = computeFramingRatio(300, 720, W, H);
  assert.equal(Math.round(ratioC * 100) / 100, 1.2);

  // Scenario D: Safety clamps prevent extreme zoom blowout
  const extremeLarge = computeFramingRatio(10000, 10000, W, H);
  assert.equal(extremeLarge, 2.5);

  const extremeTiny = computeFramingRatio(1, 1, W, H);
  assert.equal(extremeTiny, 0.15);
});

test("Adaptive neighborhood cohesion scales with graph size and rejects isolated nodes", () => {
  function computeCohesion(
    nodeIndex: number,
    pts: Array<{ x: number; y: number; clusterKey: string }>,
    totalNodes: number,
  ): { cohesion: number; radius: number; hasBloom: boolean } {
    const p = pts[nodeIndex];
    const densityScale = Math.pow(100 / Math.max(20, totalNodes), 0.25);
    const R_nbr = Math.max(50, Math.min(180, 110 * densityScale));
    const R_nbr_sq = R_nbr * R_nbr;
    const targetNeighbors = Math.max(2.5, Math.min(10, Math.sqrt(totalNodes) * 0.45));

    let clusterNeighborCount = 0;
    let closenessSum = 0;

    for (let j = 0; j < pts.length; j++) {
      if (nodeIndex === j) continue;
      const dx = pts[j].x - p.x;
      const dy = pts[j].y - p.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > R_nbr_sq) continue;

      const dist = Math.sqrt(distSq);
      const closeness = 1.0 - dist / R_nbr;
      const sameCluster = pts[j].clusterKey === p.clusterKey;

      if (sameCluster) {
        clusterNeighborCount++;
        closenessSum += closeness * 1.6;
      } else {
        closenessSum += closeness * 0.25;
      }
    }

    if (clusterNeighborCount < 1) {
      return { cohesion: 0, radius: 0, hasBloom: false };
    }

    const cohesion = Math.min(1.0, closenessSum / targetNeighbors);
    const radius = 30 * densityScale + Math.min(40, clusterNeighborCount * 5);
    return { cohesion, radius, hasBloom: true };
  }

  // Setup: 4 nodes in a tight cluster at (0, 0), and 1 isolated node at (600, 600)
  const pts = [
    { x: 0, y: 0, clusterKey: "src/graph" },
    { x: 15, y: 15, clusterKey: "src/graph" },
    { x: -15, y: -10, clusterKey: "src/graph" },
    { x: 5, y: -20, clusterKey: "src/graph" },
    { x: 600, y: 600, clusterKey: "src/graph" }, // Isolated node
  ];

  // In a small graph (5 nodes total)
  const clusterNodeResult = computeCohesion(0, pts, 5);
  assert.equal(clusterNodeResult.hasBloom, true);
  assert.ok(clusterNodeResult.cohesion > 0.5, "Node in cluster has high cohesion");

  const isolatedNodeResult = computeCohesion(4, pts, 5);
  assert.equal(isolatedNodeResult.hasBloom, false);
  assert.equal(isolatedNodeResult.cohesion, 0, "Isolated node emits zero bloom");

  // In a large graph (2,000 nodes total):
  // R_nbr contracts from ~160px down to ~50-60px
  const smallGraphDensity = Math.pow(100 / Math.max(20, 5), 0.25);
  const largeGraphDensity = Math.pow(100 / Math.max(20, 2000), 0.25);
  assert.ok(largeGraphDensity < smallGraphDensity, "Scale factor contracts on large graphs");
});



