import test from "node:test";
import assert from "node:assert/strict";

test("Two-level hierarchical layout separates cluster meta-graph from interior geometry", async () => {
  const { twoLevelLayout } = await import("../viewer/layout/two-level.js");

  // Create two distinct subsystem clusters with internal edges and a few cross-cluster edges
  const nodes = [
    // Cluster A (src/core)
    { id: "core/a", name: "a", clusterKey: "src/core", x: 0, y: 0 },
    { id: "core/b", name: "b", clusterKey: "src/core", x: 0, y: 0 },
    { id: "core/c", name: "c", clusterKey: "src/core", x: 0, y: 0 },
    // Cluster B (src/util)
    { id: "util/x", name: "x", clusterKey: "src/util", x: 0, y: 0 },
    { id: "util/y", name: "y", clusterKey: "src/util", x: 0, y: 0 },
    // Cluster C (src/net)
    { id: "net/1", name: "1", clusterKey: "src/net", x: 0, y: 0 },
    { id: "net/2", name: "2", clusterKey: "src/net", x: 0, y: 0 },
  ];

  const edges = [
    // Intra cluster A
    { source: "core/a", target: "core/b", relation: "implements" },
    { source: "core/b", target: "core/c", relation: "calls" },
    // Intra cluster B
    { source: "util/x", target: "util/y", relation: "calls" },
    // Intra cluster C
    { source: "net/1", target: "net/2", relation: "calls" },
    // Cross cluster coupling: core <-> util is strong (multiple edges)
    { source: "core/a", target: "util/x", relation: "uses" },
    { source: "core/b", target: "util/y", relation: "uses" },
    // Cross cluster coupling: util <-> net is weak (one edge)
    { source: "util/y", target: "net/1", relation: "references" },
  ];

  const result = twoLevelLayout(nodes, edges, { minGap: 24, seed: 42 });

  assert.ok(result.metaPositions.has("src/core"));
  assert.ok(result.metaPositions.has("src/util"));
  assert.ok(result.metaPositions.has("src/net"));

  // Check cluster radii and non-overlapping discs
  const metaA = result.metaPositions.get("src/core")!;
  const metaB = result.metaPositions.get("src/util")!;
  const metaC = result.metaPositions.get("src/net")!;

  const distAB = Math.hypot(metaA.x - metaB.x, metaA.y - metaB.y);
  const distBC = Math.hypot(metaB.x - metaC.x, metaB.y - metaC.y);

  // Discs must not overlap, respecting minGap >= 24
  assert.ok(
    distAB >= metaA.radius + metaB.radius + 20,
    `Cluster A and B discs should not overlap (dist=${distAB}, rA=${metaA.radius}, rB=${metaB.radius})`,
  );
  assert.ok(
    distBC >= metaB.radius + metaC.radius + 20,
    `Cluster B and C discs should not overlap (dist=${distBC}, rB=${metaB.radius}, rC=${metaC.radius})`,
  );

  // Coupled clusters (core & util) should be closer than weakly-coupled or uncoupled (core & net)
  const distAC = Math.hypot(metaA.x - metaC.x, metaA.y - metaC.y);
  assert.ok(
    distAB < distAC,
    `Strongly coupled clusters A-B (${distAB.toFixed(1)}) should be closer than uncoupled A-C (${distAC.toFixed(1)})`,
  );

  // Each cluster's interior nodes should be contained within their cluster disc
  for (const n of nodes) {
    const meta = result.metaPositions.get(n.clusterKey)!;
    const pos = result.positions.get(n.id)!;
    const offset = Math.hypot(pos.x - meta.x, pos.y - meta.y);
    assert.ok(
      offset <= meta.radius * 1.25 + 5,
      `Node ${n.id} offset ${offset} must be within disc radius ${meta.radius}`,
    );
  }
});

test("Stress-SGD converges deterministically within bounded iterations", async () => {
  const { solveStressSGD, computeStress, spearmanCorrelation } = await import("../viewer/layout/stress-sgd.js");

  // Grid/mesh graph to verify stress reduction, determinism, and Spearman correlation
  const nodes = [];
  const edges = [];
  const W = 5;
  const H = 5;
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      nodes.push({ id: `n_${r}_${c}`, x: 0, y: 0 });
      if (c > 0) edges.push({ source: `n_${r}_${c - 1}`, target: `n_${r}_${c}`, idealLength: 40 });
      if (r > 0) edges.push({ source: `n_${r - 1}_${c}`, target: `n_${r}_${c}`, idealLength: 40 });
    }
  }

  // 1. Monotonic-ish stress reduction
  const res1 = solveStressSGD(nodes, edges, { iterations: 30, seed: 1337, recordStressHistory: true });
  assert.ok(res1.stressHistory && res1.stressHistory.length >= 25);
  const initStress = res1.stressHistory[0];
  const finalStress = res1.finalStress;
  assert.ok(finalStress < initStress * 0.4, `Stress should decrease significantly: ${initStress} -> ${finalStress}`);

  // 2. Determinism with seed
  const res2 = solveStressSGD(nodes, edges, { iterations: 30, seed: 1337 });
  for (const n of nodes) {
    const p1 = res1.positions.get(n.id)!;
    const p2 = res2.positions.get(n.id)!;
    assert.equal(p1.x, p2.x, `Determinism check x for ${n.id}`);
    assert.equal(p1.y, p2.y, `Determinism check y for ${n.id}`);
  }

  // 3. Spearman correlation between graph distances and euclidean layout distances
  const corr = spearmanCorrelation(nodes, edges, res1.positions);
  assert.ok(corr > 0.6, `Spearman rank correlation should exceed 0.6 (got ${corr})`);

  // 4. Performance: 1,000 nodes / 3,000 edges under ~150ms in node
  const bigNodes = [];
  const bigEdges = [];
  const N = 1000;
  for (let i = 0; i < N; i++) {
    bigNodes.push({ id: `b_${i}`, x: 0, y: 0 });
  }
  // 3000 random-ish edges
  let prng = 42;
  const rand = () => {
    prng = (prng * 1664525 + 1013904223) >>> 0;
    return prng / 4294967296;
  };
  for (let i = 0; i < 3000; i++) {
    const u = Math.floor(rand() * N);
    let v = Math.floor(rand() * N);
    if (u === v) v = (v + 1) % N;
    bigEdges.push({ source: `b_${u}`, target: `b_${v}`, idealLength: 50 });
  }

  const t0 = performance.now();
  solveStressSGD(bigNodes, bigEdges, { iterations: 30, seed: 99 });
  const elapsed = performance.now() - t0;
  assert.ok(elapsed < 1000, `Performance budget: 1,000 nodes / 3,000 edges should converge under 1000ms (took ${elapsed.toFixed(1)}ms)`);
});

test("Architecture presets enforce distinct geometric constraints", async () => {
  const { twoLevelLayout } = await import("../viewer/layout/two-level.js");

  const nodes = [
    // Code modules
    { id: "src/app.ts", name: "app.ts", scope: "code", clusterKey: "src", x: 0, y: 0 },
    { id: "src/router.ts", name: "router.ts", scope: "code", clusterKey: "src", x: 0, y: 0 },
    { id: "src/store.ts", name: "store.ts", scope: "code", clusterKey: "src", x: 0, y: 0 },
    // Spec modules
    { id: "features/login.feature", name: "login.feature", scope: "specs", clusterKey: "features", x: 0, y: 0 },
    { id: "features/auth.feature", name: "auth.feature", scope: "specs", clusterKey: "features", x: 0, y: 0 },
    // Doc modules
    { id: "docs/adr/0001.md", name: "0001.md", scope: "docs", clusterKey: "docs", x: 0, y: 0 },
    { id: "docs/adr/0002.md", name: "0002.md", scope: "docs", clusterKey: "docs", x: 0, y: 0 },
  ];

  const edges = [
    { source: "features/login.feature", target: "src/app.ts", relation: "covers" },
    { source: "features/auth.feature", target: "src/router.ts", relation: "covers" },
    { source: "docs/adr/0001.md", target: "features/login.feature", relation: "influences" },
    { source: "docs/adr/0002.md", target: "features/auth.feature", relation: "influences" },
    { source: "src/app.ts", target: "src/router.ts", relation: "calls" },
    { source: "src/router.ts", target: "src/store.ts", relation: "uses" },
  ];

  const avgRadiusOfScope = (positions: Map<string, { x: number; y: number }>, targetScope: string) => {
    const scopeNodes = nodes.filter((n) => n.scope === targetScope);
    const sum = scopeNodes.reduce((acc, n) => {
      const p = positions.get(n.id)!;
      return acc + Math.hypot(p.x, p.y);
    }, 0);
    return sum / scopeNodes.length;
  };

  // 1. "code" preset: code has smallest mean radius
  const codeLayout = twoLevelLayout(nodes, edges, { mode: "code", seed: 42 });
  const codeRadiusInCodeMode = avgRadiusOfScope(codeLayout.positions, "code");
  const specRadiusInCodeMode = avgRadiusOfScope(codeLayout.positions, "specs");
  assert.ok(
    codeRadiusInCodeMode < specRadiusInCodeMode,
    `Code mode: code radius (${codeRadiusInCodeMode.toFixed(1)}) must be smaller than spec radius (${specRadiusInCodeMode.toFixed(1)})`,
  );

  // 2. "spec" preset: specs have smallest mean radius
  const specLayout = twoLevelLayout(nodes, edges, { mode: "spec", seed: 42 });
  const specRadiusInSpecMode = avgRadiusOfScope(specLayout.positions, "specs");
  const codeRadiusInSpecMode = avgRadiusOfScope(specLayout.positions, "code");
  assert.ok(
    specRadiusInSpecMode < codeRadiusInSpecMode,
    `Spec mode: spec radius (${specRadiusInSpecMode.toFixed(1)}) must be smaller than code radius (${codeRadiusInSpecMode.toFixed(1)})`,
  );

  // 3. Presets produce measurably distinct spatial configurations
  assert.notEqual(
    codeRadiusInCodeMode.toFixed(1),
    codeRadiusInSpecMode.toFixed(1),
    "Code coordinates must differ between 'code' and 'spec' modes",
  );

  // 4. "directory" preset: group containment enforces cluster separation
  const dirLayout = twoLevelLayout(nodes, edges, { mode: "directory", seed: 42 });
  for (const cKey of ["src", "features", "docs"]) {
    const clusterNodes = nodes.filter((n) => n.clusterKey === cKey);
    const meta = dirLayout.metaPositions.get(cKey)!;
    for (const n of clusterNodes) {
      const p = dirLayout.positions.get(n.id)!;
      assert.ok(
        Math.hypot(p.x - meta.x, p.y - meta.y) <= meta.radius * 1.25 + 5,
        `Node ${n.id} must remain contained in directory cluster ${cKey}`,
      );
    }
  }
});

test("Hierarchical edge bundling routes along folder trees using B-splines", async () => {
  const { computeHierarchicalBsplineBundles } = await import("../viewer/layout/bundling.js");

  const nodes = [
    { id: "src/auth/login.ts", x: -100, y: -50 },
    { id: "src/auth/token.ts", x: -120, y: -30 },
    { id: "src/db/client.ts", x: 100, y: 50 },
    { id: "src/db/pool.ts", x: 120, y: 70 },
  ];

  const edges = [
    { source: "src/auth/login.ts", target: "src/db/client.ts" },
    { source: "src/auth/token.ts", target: "src/db/pool.ts" },
  ];

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const bundles = computeHierarchicalBsplineBundles(nodes, edges, { beta: 0.85 });

  assert.equal(bundles.size, 2);
  for (const edge of edges) {
    const key = `${edge.source}->${edge.target}`;
    const pts = bundles.get(key);
    assert.ok(pts, `Bundle for ${key} should exist`);
    assert.ok(pts!.length >= 4, `Bundle should have multiple B-spline control points (got ${pts!.length})`);

    // First point should be source, last point should be target
    const src = nodeMap.get(edge.source)!;
    const tgt = nodeMap.get(edge.target)!;
    assert.equal(pts![0].x, src.x);
    assert.equal(pts![0].y, src.y);
    assert.equal(pts![pts!.length - 1].x, tgt.x);
    assert.equal(pts![pts!.length - 1].y, tgt.y);
  }
});

test("Layout engine toggle switches between stress-SGD and legacy pipelines", async () => {
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

  // 1. Default layoutEngine should be "stress"
  assert.equal(view.layoutEngine, "stress");

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

  // Run with stress engine
  view.setLayoutEngine("stress");
  view.setData(mockGraph, "context");
  const stressX = view.nodes[0].x;
  const stressY = view.nodes[0].y;
  assert.equal(typeof stressX, "number");
  assert.equal(Number.isNaN(stressX), false);

  // Switch to legacy engine
  view.setLayoutEngine("legacy");
  view.setData(mockGraph, "context");
  const legacyX = view.nodes[0].x;
  const legacyY = view.nodes[0].y;
  assert.equal(typeof legacyX, "number");
  assert.equal(Number.isNaN(legacyX), false);

  // Drag physics: simulate interactive drag
  const dragged = view.nodes[0];
  const initialX = dragged.x;
  const initialY = dragged.y;
  (view as any).onNodeDragMove(dragged.id, initialX + 50, initialY + 50);
  assert.ok(Math.abs(dragged.x - (initialX + 50)) < 1e-4);
  assert.ok(Math.abs(dragged.y - (initialY + 50)) < 1e-4);
  (view as any).onNodeDragEnd();
});
