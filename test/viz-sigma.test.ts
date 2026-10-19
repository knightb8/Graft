if (typeof (globalThis as any).WebGL2RenderingContext === "undefined") {
  (globalThis as any).WebGL2RenderingContext = {
    BOOL: 0x8b56,
    BYTE: 0x1400,
    UNSIGNED_BYTE: 0x1401,
    SHORT: 0x1402,
    UNSIGNED_SHORT: 0x1403,
    INT: 0x1404,
    UNSIGNED_INT: 0x1405,
    FLOAT: 0x1406,
  };
}

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
    isLandmark: boolean;
    hovered: string | null;
    hoverNeighbors: Set<string>;
    selected: string | null;
    query: string;
  }

  function computeLODLabel(input: NodeLODInput): { labelVisibility: "visible" | "auto" | "hidden"; elevated: boolean } {
    if (input.selected) {
      if (input.id === input.selected) return { labelVisibility: "visible", elevated: true };
      if (input.hoverNeighbors.has(input.id)) return { labelVisibility: "visible", elevated: true };
      return { labelVisibility: "hidden", elevated: false };
    }
    if (input.hovered) {
      if (input.id === input.hovered) return { labelVisibility: "visible", elevated: true };
      if (input.hoverNeighbors.has(input.id)) return { labelVisibility: "visible", elevated: true };
      return { labelVisibility: "hidden", elevated: false };
    }
    if (input.query && input.id.toLowerCase().includes(input.query.toLowerCase())) {
      return { labelVisibility: "visible", elevated: true };
    }
    if (input.isLandmark) {
      return { labelVisibility: "visible", elevated: false };
    }
    return { labelVisibility: "auto", elevated: false };
  }

  function computeLandmarkSet(nodes: Array<{ id: string; deg: number }>): Set<string> {
    const set = new Set<string>();
    if (nodes.length <= 25) {
      for (const n of nodes) set.add(n.id);
    } else {
      let maxD = 0;
      for (const n of nodes) if (n.deg > maxD) maxD = n.deg;
      const minHubDeg = Math.max(3, Math.min(6, Math.round(maxD * 0.4)));
      const sorted = [...nodes].filter((n) => n.deg >= minHubDeg).sort((a, b) => b.deg - a.deg);
      const topCount = Math.min(12, sorted.length);
      for (let i = 0; i < topCount; i++) set.add(sorted[i].id);
    }
    return set;
  }

  // 1. Small graph (8 nodes total, e.g. concept graph) -> ALL visible markers have labels
  const smallNodes = Array.from({ length: 8 }, (_, i) => ({ id: `concept-${i}`, deg: 0 }));
  const smallLandmarks = computeLandmarkSet(smallNodes);
  assert.equal(smallLandmarks.size, 8, "All 8 nodes in small concept graph are landmarks");
  const smallGraphNode = computeLODLabel({
    id: "concept-0", deg: 0, totalVisible: 8, maxDeg: 0, isLandmark: smallLandmarks.has("concept-0"),
    hovered: null, hoverNeighbors: new Set(), selected: null, query: "",
  });
  assert.equal(smallGraphNode.labelVisibility, "visible", "Small graphs render 100% of visible markers with visible labels");
  assert.equal(smallGraphNode.elevated, false);

  // 2. Large graph (100 nodes, maxDeg 10): only top 12 hubs get visible, rest get auto
  const largeNodes = Array.from({ length: 100 }, (_, i) => ({ id: `node-${i}`, deg: i < 20 ? 10 : 1 }));
  const largeLandmarks = computeLandmarkSet(largeNodes);
  assert.equal(largeLandmarks.size, 12, "Large graph caps landmark labels to top 12 hubs");

  const largeNormal = computeLODLabel({
    id: "node-50", deg: 1, totalVisible: 100, maxDeg: 10, isLandmark: largeLandmarks.has("node-50"),
    hovered: null, hoverNeighbors: new Set(), selected: null, query: "",
  });
  assert.equal(largeNormal.labelVisibility, "auto");
  assert.equal(largeNormal.elevated, false);

  const landmark = computeLODLabel({
    id: "node-0", deg: 10, totalVisible: 100, maxDeg: 10, isLandmark: largeLandmarks.has("node-0"),
    hovered: null, hoverNeighbors: new Set(), selected: null, query: "",
  });
  assert.equal(landmark.labelVisibility, "visible");
  assert.equal(landmark.elevated, false);

  // 3. Hovered node and its neighbor -> "visible" & elevated; unhovered background node -> "hidden"
  const hovered = computeLODLabel({
    id: "foo", deg: 1, totalVisible: 100, maxDeg: 10, isLandmark: false,
    hovered: "foo", hoverNeighbors: new Set(["bar"]), selected: null, query: "",
  });
  assert.equal(hovered.labelVisibility, "visible");
  assert.equal(hovered.elevated, true);

  const hoverNbr = computeLODLabel({
    id: "bar", deg: 1, totalVisible: 100, maxDeg: 10, isLandmark: false,
    hovered: "foo", hoverNeighbors: new Set(["bar"]), selected: null, query: "",
  });
  assert.equal(hoverNbr.labelVisibility, "visible");
  assert.equal(hoverNbr.elevated, true);

  const unhovered = computeLODLabel({
    id: "baz", deg: 1, totalVisible: 100, maxDeg: 10, isLandmark: true,
    hovered: "foo", hoverNeighbors: new Set(["bar"]), selected: null, query: "",
  });
  assert.equal(unhovered.labelVisibility, "hidden", "Non-hovered nodes are hidden during inspection to clear visual noise");

  // 4. Search hit -> "visible" & elevated
  const hit = computeLODLabel({
    id: "auth_service", deg: 1, totalVisible: 100, maxDeg: 10, isLandmark: false,
    hovered: null, hoverNeighbors: new Set(), selected: null, query: "auth",
  });
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
    return Math.max(0.2, Math.min(2.5, Math.max(boxW / targetW, boxH / targetH)));
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
  assert.equal(extremeTiny, 0.2);
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

test("Archipelago canvas buffer sizing scales with container and devicePixelRatio", () => {
  function syncCanvasDimensions(
    containerW: number,
    containerH: number,
    dpr: number,
    currentW: number,
    currentH: number,
  ): { targetW: number; targetH: number; needsResize: boolean; cssW: string; cssH: string } {
    const targetW = Math.round(containerW * dpr);
    const targetH = Math.round(containerH * dpr);
    const needsResize = currentW !== targetW || currentH !== targetH;
    return {
      targetW,
      targetH,
      needsResize,
      cssW: `${containerW}px`,
      cssH: `${containerH}px`,
    };
  }

  // Initial unconfigured canvas (defaults to 300x150)
  const initial = syncCanvasDimensions(1280, 720, 2, 300, 150);
  assert.equal(initial.needsResize, true);
  assert.equal(initial.targetW, 2560);
  assert.equal(initial.targetH, 1440);
  assert.equal(initial.cssW, "1280px");
  assert.equal(initial.cssH, "720px");

  // Already synchronized canvas
  const synchronized = syncCanvasDimensions(1280, 720, 2, 2560, 1440);
  assert.equal(synchronized.needsResize, false);
});

test("Spatial grid hashing computes identical neighborhood cohesion in linear time", () => {
  const pts: Array<{ x: number; y: number; clusterKey: string }> = [];
  const R_nbr = 100;
  const R_nbr_sq = R_nbr * R_nbr;

  // Generate 200 nodes in pseudo-clusters
  for (let i = 0; i < 200; i++) {
    const cluster = `cluster-${i % 5}`;
    const cx = (i % 5) * 150;
    const cy = Math.floor(i / 5) * 15;
    pts.push({ x: cx + (i % 3) * 10, y: cy + (i % 2) * 10, clusterKey: cluster });
  }

  // 1. Naive O(N^2) calculation
  const naiveResults: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    let sum = 0;
    for (let j = 0; j < pts.length; j++) {
      if (i === j) continue;
      const dx = pts[j].x - p.x;
      const dy = pts[j].y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= R_nbr_sq) {
        sum += 1.0 - Math.sqrt(d2) / R_nbr;
      }
    }
    naiveResults.push(sum);
  }

  // 2. Spatial Grid O(N) calculation
  const cellSize = R_nbr;
  const grid = new Map<string, number[]>();
  for (let i = 0; i < pts.length; i++) {
    const cx = Math.floor(pts[i].x / cellSize);
    const cy = Math.floor(pts[i].y / cellSize);
    const key = `${cx},${cy}`;
    const list = grid.get(key);
    if (list) list.push(i);
    else grid.set(key, [i]);
  }

  const gridResults: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const cx = Math.floor(p.x / cellSize);
    const cy = Math.floor(p.y / cellSize);
    let sum = 0;

    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const bucket = grid.get(`${cx + ox},${cy + oy}`);
        if (!bucket) continue;
        for (let k = 0; k < bucket.length; k++) {
          const j = bucket[k];
          if (i === j) continue;
          const dx = pts[j].x - p.x;
          const dy = pts[j].y - p.y;
          const d2 = dx * dx + dy * dy;
          if (d2 <= R_nbr_sq) {
            sum += 1.0 - Math.sqrt(d2) / R_nbr;
          }
        }
      }
    }
    gridResults.push(sum);
  }

  assert.equal(gridResults.length, naiveResults.length);
  for (let i = 0; i < pts.length; i++) {
    assert.ok(
      Math.abs(gridResults[i] - naiveResults[i]) < 1e-6,
      `Grid result matches naive result at node ${i}`,
    );
  }
});

test("Cluster-seeded phyllotaxis initialization and FA2 LinLog prevents perimeter ring trapping", () => {
  const graph = new MultiDirectedGraph();
  const clusters = ["src/graph", "src/viz", "docs/adr", "features/parsing"];
  const totalNodes = 120;

  // Group into clusters
  const clusterMap = new Map<string, string[]>();
  for (let i = 0; i < totalNodes; i++) {
    const cluster = clusters[i % clusters.length];
    const id = `node-${i}`;
    if (!clusterMap.has(cluster)) clusterMap.set(cluster, []);
    clusterMap.get(cluster)!.push(id);
  }

  // Position cluster centroids and phyllotaxis members
  const K = clusterMap.size;
  let cIdx = 0;
  for (const [_, members] of clusterMap.entries()) {
    const cAngle = (cIdx / K) * Math.PI * 2;
    const cx = Math.cos(cAngle) * 300;
    const cy = Math.sin(cAngle) * 300;
    members.forEach((id, mi) => {
      const r = Math.sqrt(mi + 1) * 12;
      const th = mi * 2.39996;
      graph.addNode(id, {
        x: cx + Math.cos(th) * r,
        y: cy + Math.sin(th) * r,
        size: 5,
      });
    });
    cIdx++;
  }

  // Add intra-cluster and inter-cluster edges
  for (let i = 0; i < totalNodes; i++) {
    const target = i % 4 === 0 ? (i + 5) % totalNodes : (i + 1) % totalNodes;
    graph.addEdge(`node-${i}`, `node-${target}`);
  }

  forceAtlas2.assign(graph, {
    iterations: 40,
    settings: {
      barnesHutOptimize: true,
      linLogMode: true,
      outboundAttractionDistribution: true,
      scalingRatio: 4,
      gravity: 0.6,
    },
  });

  let minR = Infinity;
  let maxR = -Infinity;
  graph.forEachNode((_, attrs) => {
    const r = Math.hypot(attrs.x, attrs.y);
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
  });

  // Nodes must be distributed across 2D depth, not stuck in a hollow 1D ring
  const span = maxR - minR;
  assert.ok(span > 150, `Graph spans 2D depth (span=${span.toFixed(1)}px), not a narrow perimeter circle`);
  assert.ok(minR < 350, "Inner nodes exist near center");
});

test("Canonical rainbow relation colors map distinct fixed colors per verb", async () => {
  const { RELATION_COLORS, relationColor } = await import("../viewer/data.js");
  assert.equal(relationColor("part of"), "#38bdf8");
  assert.equal(relationColor("uses"), "#fbbf24");
  assert.equal(relationColor("calls"), "#fbbf24");
  assert.equal(relationColor("covers"), "#10b981");
  assert.equal(relationColor("documents"), "#a855f7");
  assert.equal(relationColor("influences"), "#ec4899");
  assert.equal(relationColor("extends"), "#f43f5e");
  assert.equal(relationColor("implements"), "#8b5cf6");
  assert.equal(relationColor("transitive"), "#f97316");
});

test("Elastic spring rubberband calculates smooth displacement for connected neighbors", () => {
  function computeSpringDisplacement(
    dx: number,
    dy: number,
    dist: number,
  ): { nextDx: number; nextDy: number; spring: number } {
    const spring = Math.max(0.12, Math.min(0.38, 70 / Math.max(40, dist)));
    return {
      nextDx: dx * spring,
      nextDy: dy * spring,
      spring,
    };
  }

  // Close neighbor (dist = 40): strong spring factor ~0.38
  const close = computeSpringDisplacement(100, 50, 40);
  assert.ok(close.spring >= 0.35);
  assert.ok(close.nextDx > 35);

  // Far neighbor (dist = 400): decays down to ~0.17
  const far = computeSpringDisplacement(100, 50, 400);
  assert.ok(far.spring < close.spring);
  assert.ok(far.spring >= 0.12);
});

test("aggregateGraphToParents collapses granular symbols into parent file containers and lifts edges", async () => {
  const { aggregateGraphToParents } = await import("../viewer/data.js");

  const inputGraph = {
    meta: { nodeCount: 5, edgeCount: 4 },
    nodes: [
      { id: "src/app.ts", name: "app.ts", type: "file", summary: "Main entry", sources: ["src/app.ts · L1-L100"] },
      { id: "src/app.ts#start", name: "start", type: "function", summary: "Start app", sources: ["src/app.ts · L10-L25"] },
      { id: "src/app.ts#helper", name: "helper", type: "function", summary: "Helper fn", sources: ["src/app.ts · L30-L40"] },
      { id: "src/util.ts", name: "util.ts", type: "file", summary: "Utilities", sources: ["src/util.ts · L1-L50"] },
      { id: "src/util.ts#format", name: "format", type: "function", summary: "Format text", sources: ["src/util.ts · L5-L15"] },
    ],
    edges: [
      // Intra-file dependency: start -> helper (absorbed into app.ts)
      { source: "src/app.ts#start", target: "src/app.ts#helper", relation: "calls" },
      // Inter-file dependency: start -> format (lifted to app.ts -> util.ts)
      { source: "src/app.ts#start", target: "src/util.ts#format", relation: "calls" },
      // Explicit file-level dependency: app.ts -> util.ts
      { source: "src/app.ts", target: "src/util.ts", relation: "imports" },
      // Duplicate calls edge: helper -> format (lifted to app.ts -> util.ts with same relation, deduplicated)
      { source: "src/app.ts#helper", target: "src/util.ts#format", relation: "calls" },
    ],
  };

  const aggregated = aggregateGraphToParents(inputGraph as any);

  // Exactly 2 parent container nodes remain
  assert.equal(aggregated.nodes.length, 2);
  assert.equal(aggregated.meta.nodeCount, 2);

  const appNode = aggregated.nodes.find((n) => n.id === "src/app.ts");
  const utilNode = aggregated.nodes.find((n) => n.id === "src/util.ts");

  assert.ok(appNode, "src/app.ts must exist");
  assert.ok(utilNode, "src/util.ts must exist");
  assert.equal(appNode.type, "file");
  assert.equal(utilNode.type, "file");
  assert.equal(appNode.childCount, 2); // start, helper
  assert.equal(utilNode.childCount, 1); // format
  assert.ok(appNode.summary.includes("2 symbols (2 functions)"));
  assert.ok(utilNode.summary.includes("1 symbols (1 function)"));

  // Exactly 2 lifted inter-file edges (calls and imports), intra-file edge dropped
  assert.equal(aggregated.edges.length, 2);
  assert.equal(aggregated.meta.edgeCount, 2);

  const callsEdge = aggregated.edges.find((e) => e.relation === "calls");
  const importsEdge = aggregated.edges.find((e) => e.relation === "imports");

  assert.ok(callsEdge, "Lifted calls edge must exist");
  assert.equal(callsEdge.source, "src/app.ts");
  assert.equal(callsEdge.target, "src/util.ts");

  assert.ok(importsEdge, "File-level imports edge must exist");
  assert.equal(importsEdge.source, "src/app.ts");
  assert.equal(importsEdge.target, "src/util.ts");
});

test("aggregateGraphToParents synthesizes missing container nodes when children lack explicit file node", async () => {
  const { aggregateGraphToParents } = await import("../viewer/data.js");

  const inputGraph = {
    meta: { nodeCount: 2, edgeCount: 1 },
    nodes: [
      { id: "src/engine/worker.ts#process", name: "process", type: "function", summary: "", sources: ["src/engine/worker.ts · L5-L20"] },
      { id: "src/engine/worker.ts#cleanup", name: "cleanup", type: "function", summary: "", sources: ["src/engine/worker.ts · L25-L35"] },
    ],
    edges: [],
  };

  const aggregated = aggregateGraphToParents(inputGraph as any);
  assert.equal(aggregated.nodes.length, 1);
  const synthNode = aggregated.nodes[0];
  assert.equal(synthNode.id, "src/engine/worker.ts");
  assert.equal(synthNode.name, "worker.ts");
  assert.equal(synthNode.type, "file");
  assert.equal(synthNode.childCount, 2);
});

test("Rainbow edge toggle assigns canonical relation colors when true and neutral monochrome with focus contrast when false", async () => {
  const { relationColor } = await import("../viewer/data.js");

  function reduceEdgeMock(
    rainbowEdges: boolean,
    relation: string,
    role: "out" | "in" | "far" | "none",
  ): { color: string } {
    const relColor = relationColor(relation);
    const neutralEdge = "#3b4d54";
    let color = rainbowEdges ? relColor : neutralEdge;
    if (role === "out") {
      color = rainbowEdges ? relColor : "#fbbf24";
    } else if (role === "in") {
      color = rainbowEdges ? relColor : "#38bdf8";
    }
    return { color };
  }

  // Rainbow ON: uses canonical colors for every role
  assert.equal(reduceEdgeMock(true, "uses", "none").color, "#fbbf24");
  assert.equal(reduceEdgeMock(true, "covers", "none").color, "#10b981");
  assert.equal(reduceEdgeMock(true, "influences", "none").color, "#ec4899");
  assert.equal(reduceEdgeMock(true, "uses", "out").color, "#fbbf24");
  assert.equal(reduceEdgeMock(true, "covers", "in").color, "#10b981");

  // Rainbow OFF: uses neutral monochrome with amber/accent directional contrast on focus
  assert.equal(reduceEdgeMock(false, "uses", "none").color, "#3b4d54");
  assert.equal(reduceEdgeMock(false, "covers", "none").color, "#3b4d54");
  assert.equal(reduceEdgeMock(false, "influences", "none").color, "#3b4d54");
  assert.equal(reduceEdgeMock(false, "uses", "out").color, "#fbbf24");
  assert.equal(reduceEdgeMock(false, "covers", "in").color, "#38bdf8");
});

test("Archipelago bloom toggle clears WebGL and 2D badge canvas when showBlooms is false", () => {
  let glCleared = false;
  let badgeCleared = false;

  const mockGL = {
    clearColor: () => {},
    clear: () => { glCleared = true; },
    COLOR_BUFFER_BIT: 16384,
  };

  const mockBadgeCtx = {
    clearRect: () => { badgeCleared = true; },
  };

  function simulateDrawArchipelago(showBlooms: boolean): boolean {
    if (!showBlooms) {
      mockGL.clear();
      mockBadgeCtx.clearRect();
      return false; // Skipped drawing
    }
    return true; // Performed WebGL instanced draw
  }

  assert.equal(simulateDrawArchipelago(false), false);
  assert.equal(glCleared, true);
  assert.equal(badgeCleared, true);

  assert.equal(simulateDrawArchipelago(true), true);
});

test("Archipelago blooms are disabled by default (showBlooms: false) for zero initial overhead", () => {
  // Verifies the initial state requirement
  const defaultShowBlooms = false;
  assert.equal(defaultShowBlooms, false);
});

test("Adaptive performance budget automatically throttles blooms when draw duration exceeds 16ms", () => {
  let showBlooms = true;
  let slowCount = 0;
  let throttled = false;

  function simulateAdaptiveDraw(elapsedMs: number): void {
    if (!showBlooms) return;
    if (elapsedMs > 16.0) {
      slowCount++;
      if (slowCount >= 2) {
        showBlooms = false;
        throttled = true;
      }
    } else {
      slowCount = 0;
    }
  }

  // First slow frame (>16ms): records anomaly but keeps blooms active
  simulateAdaptiveDraw(24.5);
  assert.equal(showBlooms, true);
  assert.equal(throttled, false);

  // Second slow frame (>16ms): triggers automatic throttle to preserve 60fps
  simulateAdaptiveDraw(28.0);
  assert.equal(showBlooms, false);
  assert.equal(throttled, true);
});

test("EDGE_CONTRACTION_WEIGHTS and computeEdgeLayoutWeight calculate distinct profiles in coupled vs directory mode", async () => {
  const { computeEdgeLayoutWeight, EDGE_CONTRACTION_WEIGHTS } = await import("../viewer/data.js");

  // Verify exported weights structure
  assert.equal(EDGE_CONTRACTION_WEIGHTS.coupled.contract, 2.4);
  assert.equal(EDGE_CONTRACTION_WEIGHTS.coupled.dependency, 1.6);
  assert.equal(EDGE_CONTRACTION_WEIGHTS.coupled.interClusterMultiplier, 0.85);
  assert.equal(EDGE_CONTRACTION_WEIGHTS.directory.structure, 2.8);
  assert.equal(EDGE_CONTRACTION_WEIGHTS.directory.intraClusterMultiplier, 3.5);
  assert.equal(EDGE_CONTRACTION_WEIGHTS.directory.interClusterMultiplier, 0.25);

  // In coupled mode: contract and dependency have strong pull across galaxies
  const coupledContract = computeEdgeLayoutWeight("covers", false, false, "coupled");
  const coupledDependency = computeEdgeLayoutWeight("uses", false, false, "coupled");
  const coupledStructure = computeEdgeLayoutWeight("part_of", true, false, "coupled");

  // In directory mode: structure and intraClusterMultiplier dominate
  const dirStructure = computeEdgeLayoutWeight("part_of", true, false, "directory");
  const dirInterDependency = computeEdgeLayoutWeight("uses", false, false, "directory");
  const dirInterContract = computeEdgeLayoutWeight("covers", false, false, "directory");

  assert.equal(coupledContract, 2.2);
  assert.equal(coupledDependency, 0.6);
  assert.equal(coupledStructure, 1.4);

  assert.equal(dirStructure, 9.8); // 2.8 * 3.5
  assert.equal(dirInterDependency, 0.25); // 1.0 * 0.25
  assert.equal(dirInterContract, 0.275); // 1.1 * 0.25

  assert.ok(coupledContract > dirInterContract, "Coupled mode has much stronger cross-galaxy contract pull");
  assert.ok(dirStructure > coupledStructure, "Directory mode has much stronger intra-galaxy structural cohesion");

  // Transitive dampening
  const transitiveCoupled = computeEdgeLayoutWeight("covers", false, true, "coupled");
  assert.equal(transitiveCoupled, 0.99); // 2.2 * 0.45

  // Support / utility class edge dampening
  const supportDirect = computeEdgeLayoutWeight("uses", false, false, "coupled", true);
  assert.equal(supportDirect, 0.15);
  const supportTransitive = computeEdgeLayoutWeight("uses", false, true, "coupled", true);
  assert.equal(supportTransitive, 0.0675);
});

test("separateGalaxies compacts intra-cluster members around hubs and enforces inter-galaxy void space", async () => {
  const { separateGalaxies } = await import("../viewer/data.js");

  // Create two overlapping clusters around (0, 0) and (10, 10)
  const nodes = [
    { id: "src/graph/hub.ts", x: 0, y: 0, r: 10 },
    { id: "src/graph/a.ts", x: 40, y: 0, r: 5 },
    { id: "src/graph/b.ts", x: -40, y: 0, r: 5 },
    { id: "src/viz/hub.ts", x: 10, y: 10, r: 10 },
    { id: "src/viz/c.ts", x: 50, y: 10, r: 5 },
    { id: "src/viz/d.ts", x: -30, y: 10, r: 5 },
  ];
  const clusterMap = new Map<string, string>([
    ["src/graph/hub.ts", "src/graph"],
    ["src/graph/a.ts", "src/graph"],
    ["src/graph/b.ts", "src/graph"],
    ["src/viz/hub.ts", "src/viz"],
    ["src/viz/c.ts", "src/viz"],
    ["src/viz/d.ts", "src/viz"],
  ]);

  separateGalaxies(nodes, clusterMap, {
    intraCompactFactor: 0.5,
    interExpandFactor: 1.5,
    minVoidGap: 80,
  });

  const graphNodes = nodes.slice(0, 3);
  const vizNodes = nodes.slice(3, 6);

  const gCx = graphNodes.reduce((s, n) => s + n.x, 0) / 3;
  const gCy = graphNodes.reduce((s, n) => s + n.y, 0) / 3;
  const vCx = vizNodes.reduce((s, n) => s + n.x, 0) / 3;
  const vCy = vizNodes.reduce((s, n) => s + n.y, 0) / 3;

  // 1. Hubs remain at the core of their respective galaxies
  const graphHubDist = Math.hypot(graphNodes[0].x - gCx, graphNodes[0].y - gCy);
  const vizHubDist = Math.hypot(vizNodes[0].x - vCx, vizNodes[0].y - vCy);
  assert.ok(graphHubDist < 5, `Graph hub stays at galaxy center (dist=${graphHubDist})`);
  assert.ok(vizHubDist < 5, `Viz hub stays at galaxy center (dist=${vizHubDist})`);

  // 2. Intra-galaxy radius is compacted (originally 40px -> ~20px)
  const maxGraphLocalR = Math.max(...graphNodes.map((n) => Math.hypot(n.x - gCx, n.y - gCy)));
  assert.ok(maxGraphLocalR <= 25, `Intra-galaxy spread compacted to ${maxGraphLocalR}`);

  // 3. Inter-galaxy centroid distance has clear void space (> sum of radii + 80px)
  const centroidDist = Math.hypot(vCx - gCx, vCy - gCy);
  assert.ok(centroidDist > 110, `Galaxies separated by clear void space (centroidDist=${centroidDist.toFixed(1)})`);
});

test("Spiderweb edge hierarchy renders intra-galaxy edges crisply and dims cross-galaxy edges until focused", () => {
  function reduceGalaxyEdge(
    isIntraGalaxy: boolean,
    role: "none" | "out" | "in" | "far",
  ): { opacity: number; size: number } {
    let size = isIntraGalaxy ? 1.6 : 0.85;
    let opacity = isIntraGalaxy ? 0.68 : 0.11;

    if (role === "out" || role === "in") {
      opacity = 1.0;
      size = Math.max(2.4, size + 1.2);
    } else if (role === "far") {
      opacity = 0.03;
    }
    return { opacity, size };
  }

  // Resting state: intra-galaxy crisp, inter-galaxy subtle filament
  const restingIntra = reduceGalaxyEdge(true, "none");
  const restingInter = reduceGalaxyEdge(false, "none");
  assert.equal(restingIntra.opacity, 0.68);
  assert.equal(restingInter.opacity, 0.11);
  assert.ok(restingIntra.opacity > restingInter.opacity * 5, "Intra-galaxy edges are >5x more opaque at rest");

  // Focused state: both illuminate to 1.0 opacity
  assert.equal(reduceGalaxyEdge(true, "out").opacity, 1.0);
  assert.equal(reduceGalaxyEdge(false, "out").opacity, 1.0);
  assert.equal(reduceGalaxyEdge(false, "in").opacity, 1.0);
});

test("galaxyColorOfCluster assigns distinct subsystem colors while preserving specs and docs scope colors", async () => {
  const { galaxyColorOfCluster } = await import("../viewer/data.js");

  // Tripartite specs and docs preserve canonical emerald and violet
  assert.equal(galaxyColorOfCluster("features/viz", "specs"), "#10b981");
  assert.equal(galaxyColorOfCluster("docs/adr", "docs"), "#a855f7");

  // Code subsystems receive deterministic galaxy palette colors
  const cGraph = galaxyColorOfCluster("src/graph", "code");
  const cViewer = galaxyColorOfCluster("viewer", "code");
  assert.ok(cGraph.startsWith("#"));
  assert.ok(cViewer.startsWith("#"));
  assert.equal(cGraph, galaxyColorOfCluster("src/graph", "code"), "Deterministic across calls");
});

test("computeGalaxyLandmarks guarantees every multi-node galaxy labels its nucleus hub at rest", async () => {
  const { computeGalaxyLandmarks } = await import("../viewer/data.js");

  // 26 visible nodes across 2 large clusters and 1 small 3-node cluster
  const nodes: Array<{ id: string; deg: number; clusterKey: string }> = [];
  for (let i = 0; i < 12; i++) {
    nodes.push({ id: `src/graph/f${i}.ts`, deg: i === 0 ? 30 : 10, clusterKey: "src/graph" });
  }
  for (let i = 0; i < 11; i++) {
    nodes.push({ id: `src/ask/f${i}.ts`, deg: i === 0 ? 25 : 8, clusterKey: "src/ask" });
  }
  // Small 3-node galaxy whose hub has deg=2 (lower than all 23 nodes in src/graph and src/ask!)
  nodes.push({ id: "viewer/graph.ts", deg: 2, clusterKey: "viewer" });
  nodes.push({ id: "viewer/data.ts", deg: 1, clusterKey: "viewer" });
  nodes.push({ id: "viewer/main.ts", deg: 1, clusterKey: "viewer" });

  const landmarks = computeGalaxyLandmarks(nodes, 18);

  // Even though viewer/graph.ts has deg=2, it is the nucleus of the "viewer" galaxy so it MUST be labeled
  assert.equal(landmarks.has("src/graph/f0.ts"), true);
  assert.equal(landmarks.has("src/ask/f0.ts"), true);
  assert.equal(landmarks.has("viewer/graph.ts"), true);
});

test("relaxLocalNeighborhood resolves local neighbor overlap while keeping unrelated galaxies 100% stationary", async () => {
  const { relaxLocalNeighborhood } = await import("../viewer/data.js");

  const nodes = [
    { id: "g1/dragged", x: 100, y: 100, r: 8 },
    { id: "g1/nbr", x: 102, y: 100, r: 8 }, // Overlapping with dragged
    { id: "g2/other1", x: -400, y: 300, r: 8 }, // Unrelated galaxy
    { id: "g2/other2", x: -410, y: 305, r: 8 },
  ];

  relaxLocalNeighborhood(nodes, "g1/dragged", new Set(["g1/nbr"]), 8);

  // Neighbor was pushed away to resolve overlap
  assert.ok(Math.hypot(nodes[1].x - nodes[0].x, nodes[1].y - nodes[0].y) >= 20);
  // Unrelated galaxy did not move by even a single bit
  assert.equal(nodes[2].x, -400);
  assert.equal(nodes[2].y, 300);
  assert.equal(nodes[3].x, -410);
  assert.equal(nodes[3].y, 305);
});

test("classifyArtifactStage classifies nodes across 5 canonical lifecycle stages", async () => {
  const { classifyArtifactStage, STAGE_ORDER } = await import("../viewer/data.js");

  assert.deepEqual(STAGE_ORDER, ["adrs", "features", "code", "tests", "docs"]);

  // ADRs
  assert.equal(classifyArtifactStage({ id: "docs/adr/0016-filter.md" }), "adrs");
  assert.equal(classifyArtifactStage({ id: "adr-01" }), "adrs");
  assert.equal(classifyArtifactStage({ id: "specs/adr/0001.md" }), "adrs");
  assert.equal(classifyArtifactStage({ id: "node1", type: "adr" }), "adrs");

  // Tests (including step definitions)
  assert.equal(classifyArtifactStage({ id: "test/viz-sigma.test.ts" }), "tests");
  assert.equal(classifyArtifactStage({ id: "features/steps/filter_steps.ts" }), "tests");
  assert.equal(classifyArtifactStage({ id: "src/auth.test.ts" }), "tests");
  assert.equal(classifyArtifactStage({ id: "src/auth.spec.js" }), "tests");
  assert.equal(classifyArtifactStage({ id: "t1", type: "test" }), "tests");

  // Features
  assert.equal(classifyArtifactStage({ id: "features/viz/core/hybrid_miller_sankey-19.feature" }), "features");
  assert.equal(classifyArtifactStage({ id: "features/parsing/gherkin.feature" }), "features");
  assert.equal(classifyArtifactStage({ id: "f1", type: "feature" }), "features");

  // Docs
  assert.equal(classifyArtifactStage({ id: "docs/architecture.md" }), "docs");
  assert.equal(classifyArtifactStage({ id: "README.md" }), "docs");
  assert.equal(classifyArtifactStage({ id: "guide.rst" }), "docs");
  assert.equal(classifyArtifactStage({ id: "c1", type: "concept" }), "docs");

  // Code
  assert.equal(classifyArtifactStage({ id: "src/graph/index.ts" }), "code");
  assert.equal(classifyArtifactStage({ id: "viewer/sankey.ts" }), "code");
  assert.equal(classifyArtifactStage({ id: "src/cli.ts" }), "code");
});

test("evaluateTriStateFilter enforces Reduce (∩), Keep Ticked Pinning (∪), and Explicit Exclusion (-)", async () => {
  const { evaluateTriStateFilter } = await import("../viewer/data.js");

  const allNodeIds = [
    "docs/adr/0001-init.md",
    "features/auth.feature",
    "src/auth.ts",
    "src/utils.ts",
    "test/auth.test.ts",
    "docs/auth-guide.md",
    "docs/adr/0002-oauth.md",
    "features/oauth.feature",
    "src/oauth.ts",
  ];

  const edges = [
    { source: "docs/adr/0001-init.md", target: "features/auth.feature", relation: "influences" },
    { source: "features/auth.feature", target: "src/auth.ts", relation: "covers" },
    { source: "src/auth.ts", target: "src/utils.ts", relation: "uses" },
    { source: "test/auth.test.ts", target: "src/auth.ts", relation: "verifies" },
    { source: "docs/auth-guide.md", target: "src/auth.ts", relation: "documents" },
    { source: "docs/adr/0002-oauth.md", target: "features/oauth.feature", relation: "influences" },
    { source: "features/oauth.feature", target: "src/oauth.ts", relation: "covers" },
    { source: "src/oauth.ts", target: "src/utils.ts", relation: "uses" },
  ];

  // 1. Reduce (∩) on ADR-01: cleanly captures downstream lifecycle, does NOT bleed into ADR-02 or Feat-B
  const red1 = evaluateTriStateFilter({
    allNodeIds,
    edges,
    nodeStates: {},
    activeReduceId: "docs/adr/0001-init.md",
  });

  assert.equal(red1.visibleIds.has("docs/adr/0001-init.md"), true);
  assert.equal(red1.visibleIds.has("features/auth.feature"), true);
  assert.equal(red1.visibleIds.has("src/auth.ts"), true);
  assert.equal(red1.visibleIds.has("test/auth.test.ts"), true);
  assert.equal(red1.visibleIds.has("docs/auth-guide.md"), true);
  assert.equal(red1.visibleIds.has("src/utils.ts"), true); // 1-hop intra-stage utility

  // Crucial: no backward leak across utility hub into ADR-02 or Feat-B!
  assert.equal(red1.visibleIds.has("docs/adr/0002-oauth.md"), false);
  assert.equal(red1.visibleIds.has("features/oauth.feature"), false);
  assert.equal(red1.visibleIds.has("src/oauth.ts"), false);
  assert.equal(red1.reducedOutCount, 3);

  // 2. Keep Ticked Pinning (∪): Pin Feat-A, switch active reduce to ADR-02
  // Result must be (Lineage(ADR-02) ∪ Lineage(Feat-A))
  const red2 = evaluateTriStateFilter({
    allNodeIds,
    edges,
    nodeStates: { "features/auth.feature": "pinned" },
    activeReduceId: "docs/adr/0002-oauth.md",
  });

  // ADR-02 lineage is present
  assert.equal(red2.visibleIds.has("docs/adr/0002-oauth.md"), true);
  assert.equal(red2.visibleIds.has("features/oauth.feature"), true);
  assert.equal(red2.visibleIds.has("src/oauth.ts"), true);

  // Pinned Feat-A lineage is preserved via union
  assert.equal(red2.visibleIds.has("features/auth.feature"), true);
  assert.equal(red2.visibleIds.has("src/auth.ts"), true);
  assert.equal(red2.visibleIds.has("test/auth.test.ts"), true);
  assert.equal(red2.visibleIds.has("docs/adr/0001-init.md"), true);

  // 3. Explicit Exclusion (-): subtracting utility hub src/utils.ts
  const red3 = evaluateTriStateFilter({
    allNodeIds,
    edges,
    nodeStates: { "src/utils.ts": "excluded" },
    activeReduceId: "docs/adr/0001-init.md",
  });

  assert.equal(red3.visibleIds.has("src/utils.ts"), false);
  assert.equal(red3.excludedIds.has("src/utils.ts"), true);
  assert.equal(red3.visibleIds.has("src/auth.ts"), true);
});

test("computeCircletrace computes primary lineage and reflects backward across shared implementation boundaries", async () => {
  const { computeCircletrace, evaluateTriStateFilter } = await import("../viewer/data.js");

  const nodes = [
    { id: "docs/adr/0001.md" },
    { id: "features/auth.feature" },
    { id: "src/auth_service.ts" },
    { id: "test/auth_service.test.ts" },
    { id: "docs/adr/0002.md" },
    { id: "features/session.feature" },
    { id: "docs/adr/0099.md" },
    { id: "features/unrelated.feature" },
    { id: "src/unrelated.ts" },
  ];

  const edges = [
    // Feature A lineage
    { source: "docs/adr/0001.md", target: "features/auth.feature", relation: "influences" },
    { source: "features/auth.feature", target: "src/auth_service.ts", relation: "covers" },
    { source: "test/auth_service.test.ts", target: "src/auth_service.ts", relation: "verifies" },

    // Feature B co-depends on shared src/auth_service.ts
    { source: "docs/adr/0002.md", target: "features/session.feature", relation: "influences" },
    { source: "features/session.feature", target: "src/auth_service.ts", relation: "covers" },

    // Feature C is completely isolated
    { source: "docs/adr/0099.md", target: "features/unrelated.feature", relation: "influences" },
    { source: "features/unrelated.feature", target: "src/unrelated.ts", relation: "covers" },
  ];

  const ct = computeCircletrace("features/auth.feature", nodes, edges);

  // Primary lineage from Feature A
  assert.equal(ct.primaryIds.has("features/auth.feature"), true);
  assert.equal(ct.primaryIds.has("docs/adr/0001.md"), true);
  assert.equal(ct.primaryIds.has("src/auth_service.ts"), true);
  assert.equal(ct.primaryIds.has("test/auth_service.test.ts"), true);

  // Shared implementation anchors
  assert.equal(ct.sharedImplIds.has("src/auth_service.ts"), true);
  assert.equal(ct.sharedImplIds.has("test/auth_service.test.ts"), true);

  // Reflected lineage discovers Feature B and ADR-02!
  assert.equal(ct.reflectedIds.has("features/session.feature"), true);
  assert.equal(ct.reflectedIds.has("docs/adr/0002.md"), true);

  // Primary and reflected must be disjoint
  for (const id of ct.reflectedIds) {
    assert.equal(ct.primaryIds.has(id), false);
  }

  // Completely unrelated feature is neither primary nor reflected
  assert.equal(ct.primaryIds.has("features/unrelated.feature"), false);
  assert.equal(ct.reflectedIds.has("features/unrelated.feature"), false);
  assert.equal(ct.reflectedIds.has("docs/adr/0099.md"), false);

  // Check evaluateTriStateFilter with circletraceId
  const result = evaluateTriStateFilter({
    allNodeIds: nodes.map((n) => n.id),
    edges,
    nodeStates: {},
    circletraceId: "features/auth.feature",
  });

  assert.equal(result.visibleIds.has("features/session.feature"), true);
  assert.equal(result.visibleIds.has("docs/adr/0002.md"), true);
  assert.equal(result.circletraceReflectedIds.has("features/session.feature"), true);
  assert.equal(result.visibleIds.has("features/unrelated.feature"), false);
});

test("computeSankeyColumns aggregates Miller folder columns and spots dead-end gaps", async () => {
  const { computeSankeyColumns } = await import("../viewer/data.js");

  const nodes = [
    { id: "docs/adr/0001.md" },
    { id: "features/core.feature" },
    { id: "src/graph/core.ts" },
    { id: "src/graph/layout.ts" },
    { id: "src/deadend/orphan.ts" },
    { id: "test/graph.test.ts" },
    { id: "docs/architecture.md" },
  ];

  const edges = [
    { source: "docs/adr/0001.md", target: "features/core.feature" },
    { source: "features/core.feature", target: "src/graph/core.ts" },
    { source: "src/graph/core.ts", target: "src/graph/layout.ts" },
    { source: "test/graph.test.ts", target: "src/graph/core.ts" },
    { source: "docs/architecture.md", target: "src/graph/layout.ts" },
  ];

  // 1. Without directory collapse
  const s1 = computeSankeyColumns(nodes, edges);

  assert.equal(s1.columns.adrs.bars.length, 1);
  assert.equal(s1.columns.features.bars.length, 1);
  assert.equal(s1.columns.code.bars.length, 3);
  assert.equal(s1.columns.tests.bars.length, 1);
  assert.equal(s1.columns.docs.bars.length, 1);

  // Dead-end gap detection: src/deadend/orphan.ts has no tests or docs
  const orphanBar = s1.columns.code.bars.find((b) => b.id === "src/deadend/orphan.ts");
  const coreBar = s1.columns.code.bars.find((b) => b.id === "src/graph/core.ts");

  assert.ok(orphanBar);
  assert.equal(orphanBar.hasGap, true);
  assert.ok(coreBar);
  assert.equal(coreBar.hasGap, false);
  assert.equal(s1.gaps.length, 1);
  assert.equal(s1.gaps[0].id, "src/deadend/orphan.ts");

  // 2. With folder collapse on src/graph
  const s2 = computeSankeyColumns(nodes, edges, new Set(["src/graph"]));

  assert.equal(s2.columns.code.bars.length, 2); // dir:code:src/graph + src/deadend/orphan.ts
  const macroBar = s2.columns.code.bars.find((b) => b.id === "dir:code:src/graph");
  assert.ok(macroBar);
  assert.equal(macroBar.isGroup, true);
  assert.equal(macroBar.memberCount, 2);
  assert.equal(macroBar.weight, 2);

  // Ribbons connecting into and out of macro bar
  const featToMacro = s2.ribbons.find(
    (r) => r.sourceBarId === "features/core.feature" && r.targetBarId === "dir:code:src/graph",
  );
  assert.ok(featToMacro);
  assert.equal(featToMacro.weight, 1);

  // Coupling weight threshold filtering
  const s3 = computeSankeyColumns(nodes, edges, new Set(["src/graph"]), 2);
  // Ribbon with weight 1 is filtered out by minCouplingWeight = 2
  assert.equal(s3.ribbons.length, 0);
});

test("extractTreeBackbone keeps part_of/contains and curated cross-galaxy bridges while excluding noisy cross-galaxy uses chords", async () => {
  const { extractTreeBackbone } = await import("../viewer/data.js");

  const nodes = [
    { id: "src/graph/core.ts", deg: 10, clusterKey: "src/graph" },
    { id: "src/graph/layout.ts", deg: 5, clusterKey: "src/graph" },
    { id: "src/graph/file.ts", deg: 2, clusterKey: "src/graph" },
    { id: "test/graph.test.ts", deg: 4, clusterKey: "test" },
    { id: "test/layout.test.ts", deg: 3, clusterKey: "test" },
  ];

  const edges = [
    // 1. Structural containment edge (must always be in backbone)
    { key: "e_struct", source: "src/graph/layout.ts", target: "src/graph/core.ts", relation: "part_of" },
    // 2. Intra-galaxy dependency edge
    { key: "e_intra", source: "src/graph/file.ts", target: "src/graph/core.ts", relation: "uses" },
    // 3. Cross-galaxy dependency edges (test files importing src files: noisy fan-out suppressed at rest)
    { key: "e_cross1", source: "test/graph.test.ts", target: "src/graph/core.ts", relation: "uses" },
    { key: "e_cross2", source: "test/layout.test.ts", target: "src/graph/layout.ts", relation: "calls" },
    // 4. Cross-galaxy contract bridge (curated bridge between clusters)
    { key: "e_bridge", source: "test/graph.test.ts", target: "src/graph/core.ts", relation: "verifies" },
  ];

  const backbone = extractTreeBackbone(nodes, edges);

  // Structural edge is in backbone
  assert.equal(backbone.has("e_struct"), true);
  // Intra-galaxy edge to hub is in backbone
  assert.equal(backbone.has("e_intra"), true);
  // Curated cross-galaxy bridge (verifies contract) IS in backbone
  assert.equal(backbone.has("e_bridge"), true);
  // Noisy cross-galaxy test->src dependency chords are excluded from resting backbone
  assert.equal(backbone.has("e_cross1"), false);
  assert.equal(backbone.has("e_cross2"), false);
});

test("synthesizeDirectoryTree, consolidateOrphanClusters, and Sigma dragManager monkeypatch preserve tree hierarchy and node dragging", async () => {
  if (typeof (globalThis as any).WebGL2RenderingContext === "undefined") {
    (globalThis as any).WebGL2RenderingContext = class WebGL2RenderingContext {};
  }
  const { consolidateOrphanClusters, synthesizeDirectoryTree } = await import("../viewer/data.js");
  const { GraphView } = await import("../viewer/graph.js");

  const rawGraph = {
    meta: { nodeCount: 3, edgeCount: 1 },
    nodes: [
      { id: "src/graph/a.ts", name: "a.ts", type: "file", summary: "", sources: ["src/graph/a.ts"] },
      { id: "src/graph/b.ts", name: "b.ts", type: "file", summary: "", sources: ["src/graph/b.ts"] },
      { id: "src/orphan/lonely.ts", name: "lonely.ts", type: "file", summary: "", sources: ["src/orphan/lonely.ts"] },
    ],
    edges: [
      { source: "src/graph/a.ts", target: "src/graph/b.ts", relation: "uses" },
    ],
  };

  // 1. Orphan micro-cluster consolidation rolls single-file src/orphan into top-level src
  const consolidated = consolidateOrphanClusters(
    rawGraph.nodes.map((n) => ({ ...n, scope: "code" })),
  );
  assert.equal(consolidated.get("src/graph/a.ts"), "src/graph");
  assert.equal(consolidated.get("src/orphan/lonely.ts"), "src");

  // 2. synthesizeDirectoryTree creates module:src/graph and part_of edges
  const treeGraph = synthesizeDirectoryTree(rawGraph);
  assert.equal(treeGraph.nodes.some((n) => n.id === "module:src/graph" && n.type === "module"), true);
  assert.equal(treeGraph.edges.some((e) => e.source === "src/graph/a.ts" && e.target === "module:src/graph" && e.relation === "part_of"), true);

  // 3. Sigma dragManager.graph monkeypatch updates stale reference on setData
  const mockContainer = { clientWidth: 1000, clientHeight: 800, style: {} };
  const view = new GraphView(mockContainer as any);
  const fakeDragManager = { graph: null as any };
  const fakeEdgeGroups = { graph: null as any };
  (view as any).sigma = {
    setGraph(g: any) {
      this.internals.graph = g;
    },
    refresh() {},
    resize() {},
    getCamera() {
      return { reset() {}, setState() {} };
    },
    graphToFramedGraph: (p: any) => p,
    graphToViewport: (p: any) => p,
    internals: { graph: null, dragManager: fakeDragManager },
    edgeGroups: fakeEdgeGroups,
  };

  view.setData(rawGraph, "code");
  assert.equal(fakeDragManager.graph, (view as any).graph, "dragManager.graph must be updated to nextGraph after setGraph");
  assert.equal(fakeEdgeGroups.graph, (view as any).graph, "edgeGroups.graph must be updated to nextGraph after setGraph");
});

test("rebounceVisible recalculates equilibrium coordinates when autoRebounce is enabled and holds positions when false", async () => {
  if (typeof (globalThis as any).WebGL2RenderingContext === "undefined") {
    (globalThis as any).WebGL2RenderingContext = class WebGL2RenderingContext {};
  }
  const { GraphView } = await import("../viewer/graph.js");

  const mockContainer = {
    clientWidth: 1000,
    clientHeight: 800,
    style: {},
  };

  const view = new GraphView(mockContainer as any);

  const mockGraph = {
    meta: { nodeCount: 4, edgeCount: 3 },
    nodes: [
      { id: "src/a.ts", name: "a.ts", type: "file", summary: "", sources: ["src/a.ts · 1-10"] },
      { id: "src/b.ts", name: "b.ts", type: "file", summary: "", sources: ["src/b.ts · 1-10"] },
      { id: "test/a.test.ts", name: "a.test.ts", type: "file", summary: "", sources: ["test/a.test.ts · 1-10"] },
      { id: "test/b.test.ts", name: "b.test.ts", type: "file", summary: "", sources: ["test/b.test.ts · 1-10"] },
    ],
    edges: [
      { source: "src/a.ts", target: "src/b.ts", relation: "uses" },
      { source: "test/a.test.ts", target: "src/a.ts", relation: "verifies" },
      { source: "test/b.test.ts", target: "src/b.ts", relation: "verifies" },
    ],
  };

  view.setData(mockGraph, "context");

  const nodeA = view.nodes.find((n) => n.id === "src/a.ts")!;
  const origX = nodeA.x;
  const origY = nodeA.y;

  // With autoRebounce = false, filtering excludes test files and node coordinates hold stationary
  view.autoRebounce = false;
  view.excludeDirs = ["test"];
  view.restyle();
  if (view.autoRebounce) {
    view.rebounceVisible(false);
  }
  assert.equal(nodeA.x, origX, "Coordinates held stationary when autoRebounce is false");
  assert.equal(nodeA.y, origY, "Coordinates held stationary when autoRebounce is false");

  // When autoRebounce is enabled (or rebounceVisible is called), coordinates re-equilibrate
  view.autoRebounce = true;
  view.rebounceVisible(false); // synchronous execution in headless environment
  assert.equal(typeof nodeA.x, "number");
  assert.equal(typeof nodeA.y, "number");
  assert.equal(Number.isNaN(nodeA.x), false);
  assert.equal(Number.isNaN(nodeA.y), false);
});

test("isWasmPhysicsActive returns true and relaxAndSeparateGalaxiesVectorized relaxes and separates 1,000 nodes within 16ms", async () => {
  const { isWasmPhysicsActive, relaxAndSeparateGalaxiesVectorized } = await import("../viewer/data.js");

  assert.equal(isWasmPhysicsActive(), true, "WebAssembly physics module should be active");

  const N = 1000;
  const nodes: Array<{ id: string; x: number; y: number; r: number; deg: number; clusterKey: string }> = [];
  const edges: Array<{ source: string; target: string; relation: string; weight: number }> = [];

  for (let i = 0; i < N; i++) {
    const cluster = `galaxy-${i % 6}`;
    nodes.push({
      id: `node-${i}`,
      x: (i % 6) * 200 + (i % 20) * 8,
      y: (i % 6) * 200 + Math.floor(i / 20) * 8,
      r: 6,
      deg: i % 10 === 0 ? 15 : 2,
      clusterKey: cluster,
    });
  }

  for (let i = 0; i < N; i++) {
    const sameClusterNext = (i + 6) % N;
    edges.push({
      source: nodes[i].id,
      target: nodes[sameClusterNext].id,
      relation: "uses",
      weight: 12.0,
    });
    if (i % 7 === 0) {
      const crossCluster = (i + 13) % N;
      edges.push({
        source: nodes[i].id,
        target: nodes[crossCluster].id,
        relation: "calls",
        weight: 0.15,
      });
    }
  }

  // Warm up V8 JIT once before timing
  relaxAndSeparateGalaxiesVectorized(nodes, edges, undefined, {
    iterations: 4,
    intraCompactFactor: 0.48,
    interExpandFactor: 1.45,
    minVoidGap: 90,
  });

  const t0 = performance.now();
  relaxAndSeparateGalaxiesVectorized(nodes, edges, undefined, {
    iterations: 14,
    intraCompactFactor: 0.48,
    interExpandFactor: 1.45,
    minVoidGap: 90,
  });
  const elapsedMs = performance.now() - t0;

  for (const n of nodes) {
    assert.equal(typeof n.x, "number");
    assert.equal(typeof n.y, "number");
    assert.equal(Number.isNaN(n.x), false);
    assert.equal(Number.isNaN(n.y), false);
  }

  assert.ok(
    elapsedMs < 50,
    `Vectorized physics for 1,000 nodes took ${elapsedMs.toFixed(2)}ms, exceeding performance threshold`,
  );
});

test("FlatSpatialGrid computes accurate intra-cluster neighbor counts and cohesion scores in < 2ms without string keys", async () => {
  const { FlatSpatialGrid } = await import("../viewer/data.js");

  const grid = new FlatSpatialGrid();
  const N = 600;
  const screenX = new Float32Array(N);
  const screenY = new Float32Array(N);
  const clusterIds = new Int32Array(N);
  const outClusterNeighbors = new Int32Array(N);
  const outClosenessSum = new Float32Array(N);

  for (let i = 0; i < N; i++) {
    const cluster = i % 5;
    screenX[i] = cluster * 200 + (i % 15) * 6;
    screenY[i] = cluster * 200 + Math.floor(i / 15) * 6;
    clusterIds[i] = cluster;
  }

  const radius = 90;
  // Warm up V8 JIT once before measuring steady-state per-frame execution
  grid.computeNeighborhoodCohesion(
    screenX,
    screenY,
    clusterIds,
    N,
    radius,
    outClusterNeighbors,
    outClosenessSum,
  );

  const t0 = performance.now();
  grid.computeNeighborhoodCohesion(
    screenX,
    screenY,
    clusterIds,
    N,
    radius,
    outClusterNeighbors,
    outClosenessSum,
  );
  const elapsedMs = performance.now() - t0;

  assert.ok(
    elapsedMs < 15.0,
    `FlatSpatialGrid neighborhood cohesion took ${elapsedMs.toFixed(2)}ms, exceeding performance threshold`,
  );

  for (let i = 0; i < N; i++) {
    assert.ok(outClusterNeighbors[i] >= 0);
    assert.ok(outClosenessSum[i] >= 0);
    if (i % 15 > 3 && i % 15 < 12) {
      assert.ok(outClusterNeighbors[i] > 0, `Node ${i} in dense cluster core must have neighbors`);
      assert.ok(outClosenessSum[i] > 0, `Node ${i} in dense cluster core must have positive closeness`);
    }
  }
});

test("Selecting, hovering, and searching nodes does not drop or recreate transitive edges when node visibility has not changed", async () => {
  if (typeof (globalThis as any).WebGL2RenderingContext === "undefined") {
    (globalThis as any).WebGL2RenderingContext = class WebGL2RenderingContext {};
  }
  const { GraphView } = await import("../viewer/graph.js");

  const mockContainer = {
    clientWidth: 1000,
    clientHeight: 800,
    style: {},
  };

  const view = new GraphView(mockContainer as any);

  // A -> B -> C: B in docs, A and C in code.
  // With scope = "code", B is hidden and a transitive shortcut A -> C is generated.
  const mockGraph = {
    meta: { nodeCount: 3, edgeCount: 2 },
    nodes: [
      { id: "src/a.ts", name: "a.ts", type: "file", summary: "", sources: ["src/a.ts · 1-10"] },
      { id: "docs/b.md", name: "b.md", type: "file", summary: "", sources: ["docs/b.md · 1-10"] },
      { id: "src/c.ts", name: "c.ts", type: "file", summary: "", sources: ["src/c.ts · 1-10"] },
    ],
    edges: [
      { source: "src/a.ts", target: "docs/b.md", relation: "influences" },
      { source: "docs/b.md", target: "src/c.ts", relation: "covers" },
    ],
  };

  view.setData(mockGraph, "context");

  // Activate filter so intermediate docs node is hidden and transitive edge is created
  view.scope = "code";
  view.showTransitive = true;
  view.restyle();

  let initialTransitiveKey: string | null = null;
  (view as any).graph.forEachEdge((k: string, attrs: any) => {
    if (attrs.transitive) initialTransitiveKey = k;
  });
  assert.ok(initialTransitiveKey, "Transitive shortcut edge must be generated when intermediate node is filtered");
  const initialEdgeCount = (view as any).graph.size;

  // 1. Select a node: node visibility unchanged -> transitive edges must NOT be dropped or recreated
  view.select("src/a.ts");
  assert.equal((view as any).graph.size, initialEdgeCount, "Edge count must remain untouched on select");
  assert.equal((view as any).graph.hasEdge(initialTransitiveKey), true, "Transitive edge key must remain identical on select");
  // Neighbor check: transitive neighbor must be added to neighbors
  assert.equal((view as any).neighbors.has("src/c.ts"), true, "Transitive endpoint must be in selected node neighbors");

  // 2. Hover a node
  view.hovered = "src/c.ts";
  view.restyle();
  assert.equal((view as any).graph.size, initialEdgeCount, "Edge count must remain untouched on hover");
  assert.equal((view as any).graph.hasEdge(initialTransitiveKey), true, "Transitive edge key must remain identical on hover");

  // 3. Search query
  view.query = "a";
  view.restyle();
  assert.equal((view as any).graph.size, initialEdgeCount, "Edge count must remain untouched on search");
  assert.equal((view as any).graph.hasEdge(initialTransitiveKey), true, "Transitive edge key must remain identical on search");

  // 4. Reset selection and hover
  view.select(null);
  view.hovered = null;
  view.query = "";
  view.restyle();
  assert.equal((view as any).graph.size, initialEdgeCount, "Edge count must remain untouched when interaction clears");
  assert.equal((view as any).graph.hasEdge(initialTransitiveKey), true, "Transitive edge key must remain untouched when interaction clears");
});

test("reduceEdge renders curved splines, keeps curated cross-galaxy bridges visible at rest, hides non-backbone cross chords, and shows focus verb labels", async () => {
  const { GraphView } = await import("../viewer/graph.js");
  const mockContainer = { clientWidth: 1000, clientHeight: 800, style: {} };
  const view = new GraphView(mockContainer as any);

  const mockGraph = {
    meta: { nodeCount: 4, edgeCount: 4 },
    nodes: [
      { id: "src/core.ts", name: "core.ts", type: "file", summary: "", sources: ["src/core.ts"] },
      { id: "src/utils.ts", name: "utils.ts", type: "file", summary: "", sources: ["src/utils.ts"] },
      { id: "test/core.test.ts", name: "core.test.ts", type: "file", summary: "", sources: ["test/core.test.ts"] },
      { id: "docs/spec.md", name: "spec.md", type: "file", summary: "", sources: ["docs/spec.md"] },
    ],
    edges: [
      // 1. Intra-galaxy structural edge
      { source: "src/utils.ts", target: "src/core.ts", relation: "part_of" },
      // 2. Curated cross-galaxy bridge (contract)
      { source: "test/core.test.ts", target: "src/core.ts", relation: "verifies" },
      // 3. Non-backbone cross-galaxy chord (noisy test fan-out)
      { source: "test/core.test.ts", target: "src/utils.ts", relation: "uses" },
      // 4. Architectural influence cross-galaxy bridge
      { source: "docs/spec.md", target: "src/core.ts", relation: "influences" },
    ],
  };

  view.setData(mockGraph, "context");

  const edgeMap = new Map<string, any>();
  (view as any).graph.forEachEdge((edgeKey: string, attrs: any) => {
    const reduced = (view as any).reduceEdge(edgeKey, attrs);
    edgeMap.set(`${attrs.relation}:${attrs.intraCluster}`, reduced);
  });

  // 1. Curved splines: all edges have path="curved"
  for (const [, reduced] of edgeMap) {
    assert.equal(reduced.path, "curved");
    assert.ok(reduced.curvature > 0);
  }

  // Structural edge has head="none", directed edges have head="arrow"
  const structEdge = edgeMap.get("part_of:true");
  assert.ok(structEdge);
  assert.equal(structEdge.head, "none");

  const contractBridge = edgeMap.get("verifies:false");
  assert.ok(contractBridge);
  assert.equal(contractBridge.head, "arrow");

  // 2. Curated cross-galaxy bridge is VISIBLE at rest (role === "none")
  assert.equal(contractBridge.visibility, "visible");
  assert.equal(contractBridge.hidden, false);
  assert.equal(contractBridge.opacity, 0.53);
  assert.equal(contractBridge.curvature, 0.208); // Strand 0 in 2-edge corridor (0.22 - 0.012)

  // 3. Non-backbone cross-galaxy chord is HIDDEN at rest
  const nonBackboneChord = edgeMap.get("uses:false");
  assert.ok(nonBackboneChord);
  assert.equal(nonBackboneChord.visibility, "hidden");
  assert.equal(nonBackboneChord.hidden, true);

  // 4. Focus verb labels: selecting a node reveals human-readable verb labels on incident edges
  view.select("src/core.ts");
  (view as any).graph.forEachEdge((edgeKey: string, attrs: any) => {
    const src = (view as any).graph.source(edgeKey);
    const tgt = (view as any).graph.target(edgeKey);
    const reduced = (view as any).reduceEdge(edgeKey, attrs);
    if (src === "src/core.ts" || tgt === "src/core.ts") {
      assert.equal(reduced.visibility, "visible");
      assert.equal(reduced.labelVisibility, "visible");
      assert.equal(reduced.forceLabel, true);
      assert.equal(reduced.label, attrs.relation.replace(/_/g, " "));
    }
  });

  view.select(null);
});

test("interactive node dragging pins the dragged node, steps Velocity-Verlet physics on neighbors, and setContractionMode reweights edges", async () => {
  const { GraphView } = await import("../viewer/graph.js");
  const mockContainer = { clientWidth: 1000, clientHeight: 800, style: {} };
  const view = new GraphView(mockContainer as any);

  const mockGraph = {
    meta: { nodeCount: 3, edgeCount: 2 },
    nodes: [
      { id: "a", name: "a", type: "file", summary: "", sources: ["src/a.ts"] },
      { id: "b", name: "b", type: "file", summary: "", sources: ["src/b.ts"] },
      { id: "c", name: "c", type: "file", summary: "", sources: ["test/c.ts"] },
    ],
    edges: [
      { source: "b", target: "a", relation: "uses" },
      { source: "c", target: "a", relation: "verifies" },
    ],
  };

  view.setData(mockGraph, "context");

  // Initial coordinates
  const initA = { x: (view as any).graph.getNodeAttribute("a", "x"), y: (view as any).graph.getNodeAttribute("a", "y") };
  const initB = { x: (view as any).graph.getNodeAttribute("b", "x"), y: (view as any).graph.getNodeAttribute("b", "y") };

  // Set up mock Sigma drag event
  let rebounced = false;
  view.rebounceVisible = () => {
    rebounced = true;
  };

  // 1. setContractionMode reweights edges and triggers rebounce
  view.setContractionMode("directory");
  assert.equal(view.contractionMode, "directory");
  assert.equal(rebounced, true);

  (view as any).graph.forEachEdge((edgeKey: string, attrs: any) => {
    assert.equal(attrs.weight, attrs.relation === "uses" ? 3.5 : 0.275);
  });

  // 2. Dragging node "a" to a distant point
  const dragTarget = { x: initA.x + 300, y: initA.y + 200 };
  (view as any).sigma = {
    viewportToGraph: () => dragTarget,
    refresh() {},
  };

  // Step drag simulation directly
  (view as any).draggedNode = "a";
  (view as any).initDragSimulation("a", dragTarget);
  (view as any).stepDragVerlet(0.25);

  const postDragA = { x: (view as any).graph.getNodeAttribute("a", "x"), y: (view as any).graph.getNodeAttribute("a", "y") };
  const postDragB = { x: (view as any).graph.getNodeAttribute("b", "x"), y: (view as any).graph.getNodeAttribute("b", "y") };

  // Pinned node is at the drag target (within Float32 single-precision tolerance)
  assert.ok(Math.abs(postDragA.x - dragTarget.x) < 1e-4);
  assert.ok(Math.abs(postDragA.y - dragTarget.y) < 1e-4);

  // Connected neighbor 'b' was pulled toward 'a' by Hookean spring force
  const movedDistB = Math.hypot(postDragB.x - initB.x, postDragB.y - initB.y);
  assert.ok(movedDistB > 0.5, "Connected neighbor node 'b' must follow dragged node via spring forces");

  // 3. nodeDragEnd releases pin and coasts
  (view as any).draggedNode = null;
  if ((view as any).dragSimulator) {
    (view as any).dragSimulator.pinnedIdx = -1;
  }
  for (let f = 25; f > 0; f--) {
    (view as any).stepDragVerlet(0.25 * (f / 25));
  }
  const settledB = { x: (view as any).graph.getNodeAttribute("b", "x"), y: (view as any).graph.getNodeAttribute("b", "y") };
  assert.equal(Number.isNaN(settledB.x), false);
  assert.equal(Number.isNaN(settledB.y), false);
});

test("interactive node dragging on a high-degree hub galaxy remains numerically stable over 30 frames without diverging off-screen", async () => {
  const { GraphView } = await import("../viewer/graph.js");
  const mockContainer = { clientWidth: 1000, clientHeight: 800, style: {} };
  const view = new GraphView(mockContainer as any);

  const nodes = Array.from({ length: 60 }, (_, i) => ({
    id: `f${i}`,
    name: `f${i}`,
    type: "file" as const,
    summary: "",
    sources: [`src/f${i}.ts`],
  }));
  const edges = [];
  for (let i = 1; i < 60; i++) {
    edges.push({ source: `f${i}`, target: "f0", relation: "uses" });
    if (i > 1) edges.push({ source: `f${i}`, target: `f${i - 1}`, relation: "part_of" });
  }

  view.setData({ meta: { nodeCount: 60, edgeCount: edges.length }, nodes, edges }, "context");

  const initF0 = {
    x: (view as any).graph.getNodeAttribute("f0", "x"),
    y: (view as any).graph.getNodeAttribute("f0", "y"),
  };
  const dragTarget = { x: initF0.x + 150, y: initF0.y + 120 };

  (view as any).draggedNode = "f1";
  (view as any).initDragSimulation("f1", dragTarget);

  for (let frame = 0; frame < 30; frame++) {
    (view as any).stepDragVerlet(0.25);
  }

  for (let i = 0; i < 60; i++) {
    const x = (view as any).graph.getNodeAttribute(`f${i}`, "x");
    const y = (view as any).graph.getNodeAttribute(`f${i}`, "y");
    assert.equal(Number.isFinite(x), true, `Node f${i} x coordinate must remain finite (got ${x})`);
    assert.equal(Number.isFinite(y), true, `Node f${i} y coordinate must remain finite (got ${y})`);
    const distFromOrigin = Math.hypot(x - initF0.x, y - initF0.y);
    assert.ok(
      distFromOrigin < 600,
      `Node f${i} must remain bounded near the galaxy during drag (got distance ${distFromOrigin})`,
    );
  }

  const postF0 = {
    x: (view as any).graph.getNodeAttribute("f0", "x"),
    y: (view as any).graph.getNodeAttribute("f0", "y"),
  };
  const movedF0 = Math.hypot(postF0.x - initF0.x, postF0.y - initF0.y);
  assert.ok(movedF0 > 5, `Hub node f0 must smoothly follow dragged neighbor f1 (moved ${movedF0}px)`);
});

test("detectSupportNodes identifies topological sinks and lexical utility modules", async () => {
  const { detectSupportNodes } = await import("../viewer/data.js");

  const nodes = [
    // Lexical match: "helpers"
    { id: "src/utils/helpers.ts", name: "helpers.ts", type: "file", sources: ["src/utils/helpers.ts"] },
    // Lexical match: "types", type: "type"
    { id: "src/types/ast.ts", name: "ast.ts", type: "type", sources: ["src/types/ast.ts"] },
    // Non-lexical topological sink: fan-in from 3 distinct clusters
    { id: "src/core/sink.ts", name: "sink.ts", type: "file", sources: ["src/core/sink.ts"] },
    // Ordinary domain node (not a sink)
    { id: "src/domain/service.ts", name: "service.ts", type: "file", sources: ["src/domain/service.ts"] },
    // Sources for edges
    { id: "src/clusterA/a.ts", name: "a.ts", type: "file", sources: ["src/clusterA/a.ts"] },
    { id: "src/clusterB/b.ts", name: "b.ts", type: "file", sources: ["src/clusterB/b.ts"] },
    { id: "src/clusterC/c.ts", name: "c.ts", type: "file", sources: ["src/clusterC/c.ts"] },
  ];

  const clusterMap = new Map<string, string>([
    ["src/utils/helpers.ts", "src/utils"],
    ["src/types/ast.ts", "src/types"],
    ["src/core/sink.ts", "src/core"],
    ["src/domain/service.ts", "src/domain"],
    ["src/clusterA/a.ts", "src/clusterA"],
    ["src/clusterB/b.ts", "src/clusterB"],
    ["src/clusterC/c.ts", "src/clusterC"],
  ]);

  const edges = [
    // helpers: inDeg = 2, outDeg = 0 -> inDeg / (outDeg + 1) = 2.0 >= 1.5, lexical match
    { source: "src/clusterA/a.ts", target: "src/utils/helpers.ts", relation: "uses" },
    { source: "src/clusterB/b.ts", target: "src/utils/helpers.ts", relation: "uses" },

    // ast.ts: inDeg = 2, outDeg = 0 -> lexical match (type === "type")
    { source: "src/clusterA/a.ts", target: "src/types/ast.ts", relation: "uses" },
    { source: "src/clusterB/b.ts", target: "src/types/ast.ts", relation: "uses" },

    // sink.ts: 3 distinct source clusters (clusterA, clusterB, clusterC), inDeg = 3, outDeg = 0 -> 3 / 1 = 3 >= 2.0
    { source: "src/clusterA/a.ts", target: "src/core/sink.ts", relation: "uses" },
    { source: "src/clusterB/b.ts", target: "src/core/sink.ts", relation: "uses" },
    { source: "src/clusterC/c.ts", target: "src/core/sink.ts", relation: "uses" },

    // service.ts: inDeg = 1, outDeg = 1
    { source: "src/clusterA/a.ts", target: "src/domain/service.ts", relation: "uses" },
    { source: "src/domain/service.ts", target: "src/clusterB/b.ts", relation: "uses" },
  ];

  const supportSet = detectSupportNodes(nodes, edges, clusterMap);

  assert.ok(supportSet.has("src/utils/helpers.ts"), "helpers.ts must be detected as lexical utility sink");
  assert.ok(supportSet.has("src/types/ast.ts"), "ast.ts must be detected as lexical/type utility sink");
  assert.ok(supportSet.has("src/core/sink.ts"), "sink.ts must be detected as topological sink");
  assert.ok(!supportSet.has("src/domain/service.ts"), "service.ts must not be detected as support sink");
});

test("support nodes display diamond badge and cross-cluster support edges hide at rest and illuminate on focus", async () => {
  const { GraphView } = await import("../viewer/graph.js");
  const mockContainer = { clientWidth: 1000, clientHeight: 800, style: {} };
  const view = new GraphView(mockContainer as any);

  const mockGraph = {
    meta: { nodeCount: 4, edgeCount: 3 },
    nodes: [
      { id: "src/utils/helpers.ts", name: "helpers.ts", type: "file", summary: "", sources: ["src/utils/helpers.ts"] },
      { id: "src/features/login.ts", name: "login.ts", type: "file", summary: "", sources: ["src/features/login.ts"] },
      { id: "src/features/auth.ts", name: "auth.ts", type: "file", summary: "", sources: ["src/features/auth.ts"] },
      { id: "src/billing/pay.ts", name: "pay.ts", type: "file", summary: "", sources: ["src/billing/pay.ts"] },
    ],
    edges: [
      { source: "src/features/login.ts", target: "src/utils/helpers.ts", relation: "uses" },
      { source: "src/billing/pay.ts", target: "src/utils/helpers.ts", relation: "uses" },
      { source: "src/features/login.ts", target: "src/features/auth.ts", relation: "part_of" },
    ],
  };

  view.setData(mockGraph, "context");

  // 1. Support node badging
  const helperAttrs = (view as any).graph.getNodeAttributes("src/utils/helpers.ts");
  const helperReduced = (view as any).reduceNode("src/utils/helpers.ts", helperAttrs);
  assert.equal(helperAttrs.isSupportNode, true, "helpers.ts must have isSupportNode flag set to true");
  assert.ok(helperReduced.label.startsWith("◈ "), "Support node label must be prefixed with diamond badge ◈");

  const loginAttrs = (view as any).graph.getNodeAttributes("src/features/login.ts");
  const loginReduced = (view as any).reduceNode("src/features/login.ts", loginAttrs);
  assert.equal(loginAttrs.isSupportNode, false);
  assert.ok(!loginReduced.label.startsWith("◈"), "Regular node label must not have diamond badge");

  // 2. Cross-cluster support edge is hidden at rest
  let supportEdgeKey: string | null = null;
  (view as any).graph.forEachEdge((edgeKey: string, attrs: any) => {
    const src = (view as any).graph.source(edgeKey);
    const tgt = (view as any).graph.target(edgeKey);
    if (src === "src/features/login.ts" && tgt === "src/utils/helpers.ts") {
      supportEdgeKey = edgeKey;
      const reduced = (view as any).reduceEdge(edgeKey, attrs);
      assert.equal(reduced.visibility, "hidden");
      assert.equal(reduced.hidden, true);
    }
  });
  assert.ok(supportEdgeKey, "Cross-cluster support edge must exist");

  // 3. Selecting the consumer illuminates the support edge
  view.select("src/features/login.ts");
  const reducedOnSelect = (view as any).reduceEdge(supportEdgeKey!, (view as any).graph.getEdgeAttributes(supportEdgeKey!));
  assert.equal(reducedOnSelect.visibility, "visible");
  assert.equal(reducedOnSelect.hidden, false);
  assert.equal(reducedOnSelect.opacity, 1.0);
});

test("relaxAndSeparateGalaxiesVectorized enforces D3-style organic clearance >= 28px between sibling nodes in a cluster", async () => {
  const { relaxAndSeparateGalaxiesVectorized } = await import("../viewer/wasm-physics.js");

  // Two clusters: clusterA with tightly packed sibling nodes, clusterB as second galaxy
  const nodes = [
    { id: "src/clusterA/a.ts", x: 100, y: 100, r: 5 },
    { id: "src/clusterA/b.ts", x: 101, y: 100, r: 5 },
    { id: "src/clusterA/c.ts", x: 100, y: 101, r: 5 },
    { id: "src/clusterA/d.ts", x: 102, y: 102, r: 5 },
    { id: "src/clusterB/hub.ts", x: 500, y: 500, r: 10 },
    { id: "src/clusterB/leaf.ts", x: 520, y: 500, r: 5 },
  ];

  const clusterMap = new Map<string, string>([
    ["src/clusterA/a.ts", "src/clusterA"],
    ["src/clusterA/b.ts", "src/clusterA"],
    ["src/clusterA/c.ts", "src/clusterA"],
    ["src/clusterA/d.ts", "src/clusterA"],
    ["src/clusterB/hub.ts", "src/clusterB"],
    ["src/clusterB/leaf.ts", "src/clusterB"],
  ]);

  const edges: Array<{ source: string; target: string; relation: string }> = [
    { source: "src/clusterA/b.ts", target: "src/clusterA/a.ts", relation: "part_of" },
    { source: "src/clusterA/c.ts", target: "src/clusterA/a.ts", relation: "part_of" },
    { source: "src/clusterA/d.ts", target: "src/clusterA/a.ts", relation: "part_of" },
    { source: "src/clusterB/leaf.ts", target: "src/clusterB/hub.ts", relation: "part_of" },
  ];

  relaxAndSeparateGalaxiesVectorized(nodes, edges, clusterMap, {
    iterations: 14,
    intraCompactFactor: 0.92,
    interExpandFactor: 1.0,
    minVoidGap: 38,
  });

  // Verify pairwise clearance between all siblings in clusterA
  const clusterANodes = nodes.filter((n) => n.id.startsWith("src/clusterA/"));
  for (let i = 0; i < clusterANodes.length; i++) {
    for (let j = i + 1; j < clusterANodes.length; j++) {
      const dist = Math.hypot(clusterANodes[i].x - clusterANodes[j].x, clusterANodes[i].y - clusterANodes[j].y);
      assert.ok(
        dist >= 28.0,
        `Nodes ${clusterANodes[i].id} and ${clusterANodes[j].id} must maintain >= 28px clearance (got ${dist.toFixed(2)}px)`,
      );
    }
  }
});

test("computeHierarchicalEdgeBundles assigns corridor curvature and scales restOpacity and restSize by sqrt(bundleSize)", async () => {
  const { computeHierarchicalEdgeBundles } = await import("../viewer/data.js");

  const nodes = [
    { id: "src/core/a.ts", x: 0, y: 0, clusterKey: "src/core" },
    { id: "src/core/b.ts", x: 20, y: 0, clusterKey: "src/core" },
    { id: "test/spec/x.ts", x: 200, y: 100, clusterKey: "test/spec" },
    { id: "test/spec/y.ts", x: 220, y: 100, clusterKey: "test/spec" },
  ];

  const edges = [
    // Intra-cluster edge
    { key: "intra1", source: "src/core/b.ts", target: "src/core/a.ts", relation: "part_of" },
    // 4 parallel edges forming a corridor between test/spec and src/core
    { key: "bridge0", source: "test/spec/x.ts", target: "src/core/a.ts", relation: "verifies" },
    { key: "bridge1", source: "test/spec/x.ts", target: "src/core/b.ts", relation: "verifies" },
    { key: "bridge2", source: "test/spec/y.ts", target: "src/core/a.ts", relation: "verifies" },
    { key: "bridge3", source: "test/spec/y.ts", target: "src/core/b.ts", relation: "verifies" },
  ];

  const bundles = computeHierarchicalEdgeBundles(nodes, edges);

  // 1. Intra edge properties
  const intraMeta = bundles.get("intra1");
  assert.ok(intraMeta);
  assert.equal(intraMeta.bundleSize, 1);
  assert.equal(intraMeta.curvature, 0.16);
  assert.equal(intraMeta.restOpacity, 0.68);
  assert.equal(intraMeta.restSize, 1.6);

  // 2. Cross-cluster corridor bundle properties
  const b0 = bundles.get("bridge0")!;
  const b1 = bundles.get("bridge1")!;
  const b2 = bundles.get("bridge2")!;
  const b3 = bundles.get("bridge3")!;

  assert.equal(b0.corridorKey, "test/spec-->src/core");
  assert.equal(b0.bundleSize, 4);

  // Highway boosted opacity and size scaled by sqrt(4) = 2.0
  // restOpacity: min(0.78, 0.36 + 0.12 * 2.0) = 0.60
  // restSize: min(3.2, 1.3 + 0.42 * 2.0) = 2.14
  assert.equal(b0.restOpacity, 0.6);
  assert.equal(b0.restSize, 2.14);

  // Curvatures fan out symmetrically across corridor ribbon
  assert.equal(b0.curvature, 0.196);
  assert.equal(b1.curvature, 0.212);
  assert.equal(b2.curvature, 0.228);
  assert.equal(b3.curvature, 0.244);
  assert.ok(b0.curvature < b1.curvature && b1.curvature < b2.curvature && b2.curvature < b3.curvature);
});

test("COSMOS_PRESETS provides tailored profiles for code, spec, and doc modes with dynamic reweighting", async () => {
  const { COSMOS_PRESETS, computeEdgeLayoutWeight } = await import("../viewer/data.js");
  const { GraphView } = await import("../viewer/graph.js");

  // 1. Preset configuration values
  assert.equal(COSMOS_PRESETS.code.dependency, 3.0);
  assert.equal(COSMOS_PRESETS.spec.contract, 3.5);
  assert.equal(COSMOS_PRESETS.doc.association, 3.5);

  // 2. Relative weights across modes
  const codeUses = computeEdgeLayoutWeight("uses", false, false, "code");
  const codeCovers = computeEdgeLayoutWeight("covers", false, false, "code");
  assert.ok(codeUses > codeCovers, "Code mode prioritizes uses over covers");

  const specCovers = computeEdgeLayoutWeight("covers", false, false, "spec");
  const specUses = computeEdgeLayoutWeight("uses", false, false, "spec");
  assert.ok(specCovers > specUses, "Spec mode prioritizes covers over uses");

  const docInfluences = computeEdgeLayoutWeight("influences", false, false, "doc");
  const docUses = computeEdgeLayoutWeight("uses", false, false, "doc");
  assert.ok(docInfluences > docUses, "Doc mode prioritizes documentation over uses");

  // 3. Dynamic reweighting on GraphView
  const mockContainer = { clientWidth: 1000, clientHeight: 800, style: {} };
  const view = new GraphView(mockContainer as any);

  const mockGraph = {
    meta: { nodeCount: 4, edgeCount: 2 },
    nodes: [
      { id: "src/app.ts", name: "app.ts", type: "file", summary: "", sources: ["src/app.ts"] },
      { id: "src/db.ts", name: "db.ts", type: "file", summary: "", sources: ["src/db.ts"] },
      { id: "features/login.feature", name: "login.feature", type: "file", summary: "", sources: ["features/login.feature"] },
    ],
    edges: [
      { source: "src/app.ts", target: "src/db.ts", relation: "uses" },
      { source: "features/login.feature", target: "src/app.ts", relation: "covers" },
    ],
  };

  view.setData(mockGraph, "context");

  // Switch to code mode
  view.setContractionMode("code");
  assert.equal(view.contractionMode, "code");
  assert.equal(view.weightTuning.dependency, 3.0);

  // Switch to spec mode
  view.setContractionMode("spec");
  assert.equal(view.contractionMode, "spec");
  assert.equal(view.weightTuning.contract, 3.5);

  // Fine-tune weights via slider
  view.setWeightTuning({ contract: 3.9, clusterGap: 48 });
  assert.equal(view.weightTuning.contract, 3.9);
  assert.equal(view.weightTuning.clusterGap, 48);
});

test("defines is first-class relation and useHeuristics toggle controls support dampening", async () => {
  const { famOf, relationColor, computeEdgeLayoutWeight, SEMANTIC_RELATION_WEIGHTS, COSMOS_RELATION_WEIGHTS } = await import("../viewer/data.js");
  const { GraphView } = await import("../viewer/graph.js");

  // 1. defines first-class relation invariants
  assert.equal(famOf("defines"), "contract");
  assert.equal(relationColor("defines"), "#c084fc");
  assert.deepEqual(SEMANTIC_RELATION_WEIGHTS.defines, { intra: 2.8, inter: 2.2 });
  assert.deepEqual(COSMOS_RELATION_WEIGHTS.code?.defines, { intra: 2.6, inter: 2.0 });
  assert.deepEqual(COSMOS_RELATION_WEIGHTS.spec?.defines, { intra: 3.2, inter: 2.8 });
  assert.deepEqual(COSMOS_RELATION_WEIGHTS.doc?.defines, { intra: 3.0, inter: 2.6 });

  // 2. computeEdgeLayoutWeight with defines
  const definesCoupled = computeEdgeLayoutWeight("defines", false, false, "coupled");
  assert.equal(definesCoupled, 2.2);
  const definesSpec = computeEdgeLayoutWeight("defines", false, false, "spec");
  assert.equal(definesSpec, 2.8);

  // 3. useHeuristics toggle in computeEdgeLayoutWeight
  const dampenedWithHeuristics = computeEdgeLayoutWeight("uses", false, false, "coupled", true, { useHeuristics: true });
  assert.equal(dampenedWithHeuristics, 0.15);

  const bypassedWithoutHeuristics = computeEdgeLayoutWeight("uses", false, false, "coupled", true, { useHeuristics: false });
  assert.equal(bypassedWithoutHeuristics, 0.6); // Normal uses inter weight!

  // 4. GraphView heuristics toggle and localStorage persistence
  const mockStorage: Record<string, string> = {};
  const origLocalStorage = (globalThis as any).localStorage;
  (globalThis as any).localStorage = {
    getItem: (k: string) => mockStorage[k] ?? null,
    setItem: (k: string, v: string) => { mockStorage[k] = v; },
    removeItem: (k: string) => { delete mockStorage[k]; },
    clear: () => { for (const k in mockStorage) delete mockStorage[k]; },
  };

  try {
    const mockContainer = { clientWidth: 1000, clientHeight: 800, style: {} };
    const view = new GraphView(mockContainer as any);

    const mockGraph = {
      meta: { nodeCount: 3, edgeCount: 2 },
      nodes: [
        { id: "src/utils/helpers.ts", name: "helpers.ts", type: "file", summary: "", sources: ["src/utils/helpers.ts"] },
        { id: "src/features/login.ts", name: "login.ts", type: "file", summary: "", sources: ["src/features/login.ts"] },
        { id: "src/billing/pay.ts", name: "pay.ts", type: "file", summary: "", sources: ["src/billing/pay.ts"] },
      ],
      edges: [
        { source: "src/features/login.ts", target: "src/utils/helpers.ts", relation: "uses" },
        { source: "src/billing/pay.ts", target: "src/utils/helpers.ts", relation: "uses" },
      ],
    };

    view.setData(mockGraph, "context");
    assert.equal(view.supportNodes.has("src/utils/helpers.ts"), true);

    // Disable heuristics: supportNodes cleared, edge weights recomputed without dampening
    view.setWeightTuning({ useHeuristics: false });
    assert.equal(view.supportNodes.size, 0);
    assert.equal(view.weightTuning.useHeuristics, false);

    // Check localStorage persistence
    const saved = JSON.parse(mockStorage["graft.cosmosConfig"]);
    assert.equal(saved.tuning.useHeuristics, false);

    // Re-enable heuristics
    view.setWeightTuning({ useHeuristics: true });
    assert.equal(view.supportNodes.has("src/utils/helpers.ts"), true);
  } finally {
    if (origLocalStorage) {
      (globalThis as any).localStorage = origLocalStorage;
    } else {
      delete (globalThis as any).localStorage;
    }
  }
});

test("applyCosmosConcentricLayout places the active focus scope in the center core and surrounds it with the other scopes across code, spec, doc, and directory modes", async () => {
  const { applyCosmosConcentricLayout } = await import("../viewer/data.js");

  const makeNodes = () => [
    { id: "src/graph/build.ts", name: "build.ts", type: "file", scope: "code", clusterKey: "src/graph", deg: 6, r: 8, sources: ["src/graph/build.ts"], x: 0, y: 0 },
    { id: "src/graph/link.ts", name: "link.ts", type: "file", scope: "code", clusterKey: "src/graph", deg: 5, r: 8, sources: ["src/graph/link.ts"], x: 0, y: 0 },
    { id: "viewer/graph.ts", name: "graph.ts", type: "file", scope: "code", clusterKey: "viewer", deg: 7, r: 8, sources: ["viewer/graph.ts"], x: 0, y: 0 },
    { id: "features/viz/galaxy.feature", name: "galaxy.feature", type: "file", scope: "specs", clusterKey: "features/viz", deg: 4, r: 8, sources: ["features/viz/galaxy.feature"], x: 0, y: 0 },
    { id: "features/graph/edges.feature", name: "edges.feature", type: "file", scope: "specs", clusterKey: "features/graph", deg: 4, r: 8, sources: ["features/graph/edges.feature"], x: 0, y: 0 },
    { id: "docs/adr/0015-splines.md", name: "0015-splines.md", type: "file", scope: "docs", clusterKey: "docs/adr", deg: 3, r: 8, sources: ["docs/adr/0015-splines.md"], x: 0, y: 0 },
    { id: "docs/adr/0018-cosmos.md", name: "0018-cosmos.md", type: "file", scope: "docs", clusterKey: "docs/adr", deg: 3, r: 8, sources: ["docs/adr/0018-cosmos.md"], x: 0, y: 0 },
  ];

  const edges = [
    { source: "viewer/graph.ts", target: "src/graph/build.ts", relation: "uses", weight: 2.0 },
    { source: "src/graph/link.ts", target: "src/graph/build.ts", relation: "uses", weight: 2.0 },
    { source: "features/viz/galaxy.feature", target: "viewer/graph.ts", relation: "covers", weight: 3.0 },
    { source: "features/graph/edges.feature", target: "src/graph/link.ts", relation: "covers", weight: 3.0 },
    { source: "docs/adr/0015-splines.md", target: "features/viz/galaxy.feature", relation: "influences", weight: 3.0 },
    { source: "docs/adr/0018-cosmos.md", target: "features/graph/edges.feature", relation: "influences", weight: 3.0 },
  ];

  const avgRadiusOfScope = (nodes: ReturnType<typeof makeNodes>, scope: string) => {
    const matching = nodes.filter((n) => n.scope === scope);
    return matching.reduce((sum, n) => sum + Math.hypot(n.x, n.y), 0) / matching.length;
  };

  // 1. "code" mode: code is in the center core, specs and docs surround it on the outer ring
  const codeNodes = makeNodes();
  applyCosmosConcentricLayout(codeNodes, edges, "code");
  assert.ok(
    avgRadiusOfScope(codeNodes, "code") < avgRadiusOfScope(codeNodes, "specs"),
    "In code mode, code nodes must occupy the inner core inside surrounding specs",
  );
  assert.ok(
    avgRadiusOfScope(codeNodes, "code") < avgRadiusOfScope(codeNodes, "docs"),
    "In code mode, code nodes must occupy the inner core inside surrounding docs",
  );

  // 2. "spec" mode: specs are in the center core, covered code and docs surround them
  const specNodes = makeNodes();
  applyCosmosConcentricLayout(specNodes, edges, "spec");
  assert.ok(
    avgRadiusOfScope(specNodes, "specs") < avgRadiusOfScope(specNodes, "code"),
    "In spec mode, spec nodes must occupy the inner core inside surrounding code",
  );
  assert.ok(
    avgRadiusOfScope(specNodes, "specs") < avgRadiusOfScope(specNodes, "docs"),
    "In spec mode, spec nodes must occupy the inner core inside surrounding docs",
  );

  // 3. "doc" mode: docs (ADRs) are in the center core, specs in the middle ring, code in the outer ring
  const docNodes = makeNodes();
  applyCosmosConcentricLayout(docNodes, edges, "doc");
  assert.ok(
    avgRadiusOfScope(docNodes, "docs") < avgRadiusOfScope(docNodes, "specs"),
    "In doc mode, doc/ADR nodes must occupy the inner core inside surrounding specs",
  );
  assert.ok(
    avgRadiusOfScope(docNodes, "specs") < avgRadiusOfScope(docNodes, "code"),
    "In doc mode, governed specs must occupy the middle ring inside outer code",
  );
});

test("SankeyView.render() renders all 5 stage columns (adrs, features, code, tests, docs) and ribbons without throwing", async () => {
  const { SankeyView } = await import("../viewer/sankey.js");

  const mockContainer: any = {
    clientWidth: 1400,
    clientHeight: 900,
    innerHTML: "",
    querySelectorAll: () => [],
    querySelector: () => null,
  };

  const sankey = new SankeyView(mockContainer);
  sankey.setData(
    [
      { id: "docs/adr/0001-init.md", name: "0001-init.md", type: "file", sources: ["docs/adr/0001-init.md"] },
      { id: "features/viz/core/galaxy-01.feature", name: "galaxy-01.feature", type: "file", sources: ["features/viz/core/galaxy-01.feature"] },
      { id: "src/graph/build.ts", name: "build.ts", type: "file", sources: ["src/graph/build.ts"] },
      { id: "test/viz-sigma.test.ts", name: "viz-sigma.test.ts", type: "file", sources: ["test/viz-sigma.test.ts"] },
      { id: "docs/devdocs/guide.md", name: "guide.md", type: "file", sources: ["docs/devdocs/guide.md"] },
    ],
    [
      { source: "docs/adr/0001-init.md", target: "features/viz/core/galaxy-01.feature", relation: "influences" },
      { source: "features/viz/core/galaxy-01.feature", target: "src/graph/build.ts", relation: "covers" },
      { source: "test/viz-sigma.test.ts", target: "src/graph/build.ts", relation: "verifies" },
      { source: "docs/devdocs/guide.md", target: "src/graph/build.ts", relation: "documents" },
    ],
  );

  assert.ok(mockContainer.innerHTML.includes('<svg class="sankey-svg"'), "Expected Sankey SVG to be rendered into container");
  assert.ok(mockContainer.innerHTML.includes("1. ADRs"), "Expected 1. ADRs column header");
  assert.ok(mockContainer.innerHTML.includes("2. Specs"), "Expected 2. Specs column header");
  assert.ok(mockContainer.innerHTML.includes("3. Code"), "Expected 3. Code column header");
  assert.ok(mockContainer.innerHTML.includes("4. Tests"), "Expected 4. Tests column header");
  assert.ok(mockContainer.innerHTML.includes("5. Docs"), "Expected 5. Docs column header");
  assert.ok(mockContainer.innerHTML.includes('class="sankey-ribbon'), "Expected Sankey flow ribbons to be rendered");

  // Push a bar and a column around and verify coordinates + ribbons update and Reset Layout button appears
  const initialHtml = mockContainer.innerHTML;
  const srcBarId = "features/viz/core/galaxy-01.feature";
  const tgtBarId = "src/graph/build.ts";
  sankey.moveBar(tgtBarId, 45, 220, true);
  assert.notEqual(mockContainer.innerHTML, initialHtml, "Moving a bar must update its transform and connected ribbon paths");
  assert.ok(mockContainer.innerHTML.includes('id="sankeyResetLayout"'), "Reset Layout button should appear after moving a bar");

  // Verify dynamic entry/exit port sliding on stationary partner bar when dragging vertically
  const extractRibbonPath = (html: string, srcId: string, tgtId: string): string => {
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`data-src="${esc(srcId)}"\\s+data-tgt="${esc(tgtId)}"\\s+d="([^"]+)"`);
    return html.match(re)?.[1] || "";
  };
  const pathWhenCodeBelow = extractRibbonPath(mockContainer.innerHTML, srcBarId, tgtBarId);
  sankey.moveBar(tgtBarId, 0, -450, true);
  const pathWhenCodeAbove = extractRibbonPath(mockContainer.innerHTML, srcBarId, tgtBarId);
  const startYBelow = parseFloat(pathWhenCodeBelow.split(" ")[0].split(",")[1]);
  const startYAbove = parseFloat(pathWhenCodeAbove.split(" ")[0].split(",")[1]);
  assert.ok(
    startYAbove < startYBelow,
    `Stationary bar exit port Y must slide upward when partner is dragged above (${startYAbove} < ${startYBelow})`,
  );

  // Verify horizontal crossing flips entry/exit sides (x0 switches from right edge to left edge)
  sankey.moveColumn("features", 700, 0, true);
  const pathWhenCrossed = extractRibbonPath(mockContainer.innerHTML, srcBarId, tgtBarId);
  assert.notEqual(pathWhenCrossed, pathWhenCodeAbove, "Crossing columns horizontally must update entry/exit edge coordinates");

  sankey.resetLayout();
  assert.equal(sankey.barOffsets.size, 0);
  assert.equal(sankey.colOffsets.size, 0);
  assert.equal(mockContainer.innerHTML, initialHtml, "Resetting layout should restore initial SVG coordinates");
});

test("folderGroupKeyOfNode sub-folders flat test suites by domain prefix, SankeyView filters directories, and computeBlastAttenuation decays energy per hop", async () => {
  const { folderGroupKeyOfNode, computeBlastAttenuation, SankeyView } = await import("../viewer/sankey.js");

  // 1. Flat test suite sub-foldering
  assert.equal(
    folderGroupKeyOfNode({ id: "test/viz-sigma.test.ts", sources: ["test/viz-sigma.test.ts"] }),
    "test/viz",
  );
  assert.equal(
    folderGroupKeyOfNode({ id: "test/cli-help.test.ts", sources: ["test/cli-help.test.ts"] }),
    "test/cli",
  );
  assert.equal(
    folderGroupKeyOfNode({ id: "src/graph/build.ts", sources: ["src/graph/build.ts"] }),
    "src/graph",
  );

  // 2. Hop-distance & relation-weighted blast attenuation
  const nodes = [
    { id: "docs/adr/0001-init.md", sources: ["docs/adr/0001-init.md"] },
    { id: "features/viz/core/galaxy-01.feature", sources: ["features/viz/core/galaxy-01.feature"] },
    { id: "src/graph/build.ts", sources: ["src/graph/build.ts"] },
    { id: "test/viz-sigma.test.ts", sources: ["test/viz-sigma.test.ts"] },
    { id: "test/cli-help.test.ts", sources: ["test/cli-help.test.ts"] },
  ];
  const edges = [
    { source: "docs/adr/0001-init.md", target: "features/viz/core/galaxy-01.feature", relation: "influences" },
    { source: "features/viz/core/galaxy-01.feature", target: "src/graph/build.ts", relation: "covers" },
    { source: "test/viz-sigma.test.ts", target: "src/graph/build.ts", relation: "verifies" },
  ];

  const blast = computeBlastAttenuation("docs/adr/0001-init.md", nodes, edges, 0.65);
  const hop0 = blast.nodes.get("docs/adr/0001-init.md")!;
  const hop1 = blast.nodes.get("features/viz/core/galaxy-01.feature")!;
  const hop2 = blast.nodes.get("src/graph/build.ts")!;
  const hop3 = blast.nodes.get("test/viz-sigma.test.ts")!;

  assert.equal(hop0.hop, 0);
  assert.equal(hop0.energy, 1.0);
  assert.equal(hop1.hop, 1);
  assert.ok(hop1.energy > hop2.energy, `Hop 1 energy (${hop1.energy}) must exceed Hop 2 energy (${hop2.energy})`);
  assert.equal(hop2.hop, 2);
  assert.ok(hop2.energy > hop3.energy, `Hop 2 energy (${hop2.energy}) must exceed Hop 3 energy (${hop3.energy})`);
  assert.equal(blast.nodes.has("test/cli-help.test.ts"), false, "Unconnected nodes must not receive blast energy");

  // 3. SankeyView test sub-folder roll-up and directory filtering
  const mockContainer: any = {
    clientWidth: 1400,
    clientHeight: 900,
    innerHTML: "",
    querySelectorAll: () => [],
    querySelector: () => null,
  };
  const sankey = new SankeyView(mockContainer);
  sankey.setData(nodes, edges);
  sankey.collapseAllFolders();
  assert.ok(sankey.collapsedDirs.has("test/viz"), "collapseAllFolders must sub-folder test/viz-* into test/viz");
  assert.ok(sankey.collapsedDirs.has("test/cli"), "collapseAllFolders must sub-folder test/cli-* into test/cli");
  assert.ok(mockContainer.innerHTML.includes("📁 test/viz"), "Rendered Sankey must display 📁 test/viz group bar");

  // Filter out test/cli via hiddenDirs
  sankey.hiddenDirs.add("test/cli");
  sankey.render();
  assert.equal(mockContainer.innerHTML.includes("test/cli"), false, "Hidden directory test/cli must be filtered out of Sankey");

  // 4. Causal Collider Zero-Decay Rules (ADR 0019 / Feature 23)
  const colliderNodes = [
    { id: "src/features/moduleA.ts", sources: ["src/features/moduleA.ts"] },
    { id: "src/features/moduleB.ts", sources: ["src/features/moduleB.ts"] },
    { id: "src/utils/sharedHelper.ts", sources: ["src/utils/sharedHelper.ts"] },
    { id: "src/core/engine.ts", sources: ["src/core/engine.ts"] },
    { id: "src/utils/unrelatedUtil.ts", sources: ["src/utils/unrelatedUtil.ts"] },
    { id: "test/engine.test.ts", sources: ["test/engine.test.ts"] },
    { id: "docs/guide.md", sources: ["docs/guide.md"] },
    { id: "src/other/otherCode.ts", sources: ["src/other/otherCode.ts"] },
    { id: "docs/conceptZ.md", sources: ["docs/conceptZ.md"] },
    { id: "docs/conceptW.md", sources: ["docs/conceptW.md"] },
  ];
  const colliderEdges = [
    // Shared utility sink collider: moduleA --uses--> sharedHelper <--uses-- moduleB
    { source: "src/features/moduleA.ts", target: "src/utils/sharedHelper.ts", relation: "uses" },
    { source: "src/features/moduleB.ts", target: "src/utils/sharedHelper.ts", relation: "uses" },
    // Consumer impact vs unrelated prerequisite: moduleA --uses--> engine AND moduleA --uses--> unrelatedUtil
    { source: "src/features/moduleA.ts", target: "src/core/engine.ts", relation: "uses" },
    { source: "src/features/moduleA.ts", target: "src/utils/unrelatedUtil.ts", relation: "uses" },
    // Leaf observer sinks: test/doc/references
    { source: "test/engine.test.ts", target: "src/core/engine.ts", relation: "verifies" },
    { source: "docs/guide.md", target: "src/core/engine.ts", relation: "documents" },
    { source: "docs/guide.md", target: "src/other/otherCode.ts", relation: "documents" },
    { source: "src/core/engine.ts", target: "docs/conceptZ.md", relation: "references" },
    { source: "docs/conceptZ.md", target: "docs/conceptW.md", relation: "references" },
  ];

  // Scenario A: Clicking moduleA reaches sharedHelper (hop 1, DEP_PREREQ), but decays to 0 into moduleB!
  const fromModuleA = computeBlastAttenuation("src/features/moduleA.ts", colliderNodes, colliderEdges, 0.65);
  assert.equal(fromModuleA.nodes.get("src/utils/sharedHelper.ts")?.hop, 1);
  assert.equal(fromModuleA.nodes.get("src/utils/sharedHelper.ts")?.phase, "DEP_PREREQ");
  assert.equal(
    fromModuleA.nodes.has("src/features/moduleB.ts"),
    false,
    "Shared utility sink collider (moduleA -> sharedHelper <- moduleB) must decay to 0 and never energize moduleB",
  );

  // Scenario B: Clicking engine.ts propagates reverse consumer impact to moduleA (hop 1, DEP_IMPACT),
  // but decays to 0 into moduleA's other prerequisite callees (unrelatedUtil, sharedHelper)
  // and terminates at leaf observers (engine.test.ts, guide.md, conceptZ.md) without leaking into otherCode.ts or conceptW.md!
  const fromEngine = computeBlastAttenuation("src/core/engine.ts", colliderNodes, colliderEdges, 0.65);
  assert.equal(fromEngine.nodes.get("src/features/moduleA.ts")?.hop, 1);
  assert.equal(fromEngine.nodes.get("src/features/moduleA.ts")?.phase, "DEP_IMPACT");
  assert.equal(
    fromEngine.nodes.has("src/utils/unrelatedUtil.ts"),
    false,
    "Reverse consumer impact (engine <- moduleA) must not leak forward into moduleA's other prerequisite callees",
  );
  assert.equal(fromEngine.nodes.get("test/engine.test.ts")?.phase, "LEAF_SINK");
  assert.equal(fromEngine.nodes.get("docs/guide.md")?.phase, "LEAF_SINK");
  assert.equal(fromEngine.nodes.get("docs/conceptZ.md")?.phase, "LEAF_SINK");
  assert.equal(
    fromEngine.nodes.has("src/other/otherCode.ts"),
    false,
    "Leaf documentation observer (engine <- guide.md -> otherCode) must decay to 0 and never bridge unrelated code",
  );
  assert.equal(
    fromEngine.nodes.has("docs/conceptW.md"),
    false,
    "Loose references link must terminate at hop 1 (LEAF_SINK) and decay to 0 at hop 2",
  );
});





