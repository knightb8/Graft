import { test } from "node:test";
import assert from "node:assert/strict";
import { generateTransitiveEdges } from "../src/graph/transitive.js";
import { filterVizGraph } from "../src/graph/filter.js";

test("generateTransitiveEdges connects visible endpoints across hidden node", () => {
  // A -> B -> C
  const edges = [
    { source: "A", target: "B", relation: "influences" },
    { source: "B", target: "C", relation: "covers" },
  ];

  // B is filtered out (hidden)
  const isVisible = (id: string) => id !== "B";

  const transitive = generateTransitiveEdges(edges, isVisible);

  assert.equal(transitive.length, 1);
  assert.equal(transitive[0].source, "A");
  assert.equal(transitive[0].target, "C");
  assert.equal(transitive[0].relation, "transitive");
  assert.deepEqual(transitive[0].via, ["B"]);
  assert.equal(transitive[0].transitive, true);
});

test("generateTransitiveEdges respects maxHops and avoids cycles", () => {
  // A -> B -> C -> D -> E
  const edges = [
    { source: "A", target: "B", relation: "step1" },
    { source: "B", target: "C", relation: "step2" },
    { source: "C", target: "D", relation: "step3" },
    { source: "D", target: "E", relation: "step4" },
    // Cycle in hidden nodes: B -> B_cycle -> B
    { source: "B", target: "B_cycle", relation: "cycle" },
    { source: "B_cycle", target: "B", relation: "cycle" },
  ];

  // Only A and E visible
  const isVisible = (id: string) => id === "A" || id === "E";

  // maxHops = 3 cannot bridge 3 hidden nodes (B, C, D) if intermediate limit exceeded
  const trans3 = generateTransitiveEdges(edges, isVisible, 2);
  assert.equal(trans3.length, 0);

  // maxHops = 4 reaches E
  const trans4 = generateTransitiveEdges(edges, isVisible, 4);
  assert.equal(trans4.length, 1);
  assert.equal(trans4[0].source, "A");
  assert.equal(trans4[0].target, "E");
  assert.deepEqual(trans4[0].via, ["B", "C", "D"]);
});

test("generateTransitiveEdges does not duplicate existing direct visible edges", () => {
  // A -> B -> C and direct A -> C
  const edges = [
    { source: "A", target: "B", relation: "step1" },
    { source: "B", target: "C", relation: "step2" },
    { source: "A", target: "C", relation: "direct" },
  ];

  const isVisible = (id: string) => id !== "B";

  const transitive = generateTransitiveEdges(edges, isVisible);
  // Direct A -> C already exists between visible nodes, so no redundant transitive edge
  assert.equal(transitive.length, 0);
});

test("filterVizGraph includes transitive edges when transitive option is set", () => {
  const graph = {
    meta: { nodeCount: 3, edgeCount: 2 },
    nodes: [
      { id: "docs/0001.md", name: "ADR-0001", type: "doc" },
      { id: "features/login.feature", name: "Login Feature", type: "spec" },
      { id: "src/login.ts", name: "Login Implementation", type: "module" },
    ],
    edges: [
      { source: "docs/0001.md", target: "features/login.feature", relation: "influences" },
      { source: "features/login.feature", target: "src/login.ts", relation: "covers" },
    ],
  };

  // Filter with scope: ["docs", "code"], hiding "features/login.feature" (specs)
  const filteredWithoutTransitive = filterVizGraph(graph, {
    scopes: new Set(["docs", "code"]),
    transitive: false,
  });
  assert.equal(filteredWithoutTransitive.nodes.length, 2);
  assert.equal(filteredWithoutTransitive.edges.length, 0);

  const filteredWithTransitive = filterVizGraph(graph, {
    scopes: new Set(["docs", "code"]),
    transitive: true,
  });
  assert.equal(filteredWithTransitive.nodes.length, 2);
  assert.equal(filteredWithTransitive.edges.length, 1);
  assert.equal(filteredWithTransitive.edges[0].source, "docs/0001.md");
  assert.equal(filteredWithTransitive.edges[0].target, "src/login.ts");
  assert.equal((filteredWithTransitive.edges[0] as any).relation, "transitive");
});
