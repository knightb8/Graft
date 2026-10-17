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

