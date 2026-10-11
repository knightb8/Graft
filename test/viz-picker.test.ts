import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFileTree } from "../viewer/picker.js";
import { matchNodeFilter } from "../src/graph/filter.js";
import type { VizGraph } from "../viewer/data.js";

test("buildFileTree builds directory hierarchy with node counts and scopes", () => {
  const mockGraph: VizGraph = {
    meta: { nodeCount: 4, edgeCount: 2 },
    nodes: [
      {
        id: "src/graph/build.ts#buildGraph",
        name: "buildGraph",
        type: "function",
        summary: "Builds graph",
        sources: ["src/graph/build.ts · L10-L50"],
      },
      {
        id: "src/graph/filter.ts#filterGraph",
        name: "filterGraph",
        type: "function",
        summary: "Filters graph",
        sources: ["src/graph/filter.ts · L5-L30"],
      },
      {
        id: "docs/adr/0007.md#adr7",
        name: "ADR 0007",
        type: "concept",
        summary: "Picker panel",
        sources: ["docs/adr/0007.md · L1-L20"],
      },
      {
        id: "features/viz/tree_picker-11.feature#tree",
        name: "Tree Picker",
        type: "module",
        summary: "Feature spec",
        sources: ["features/viz/tree_picker-11.feature · L1-L25"],
      },
    ],
    edges: [],
  };

  const tree = buildFileTree(mockGraph);
  assert.equal(tree.isDir, true);
  assert.equal(tree.nodeCount, 4);
  assert.equal(tree.allFiles.length, 4);

  // Top-level children: docs, features, src
  const childNames = tree.children.map((c) => c.name);
  assert.deepEqual(childNames.sort(), ["docs", "features", "src"]);

  // Inspect "src"
  const srcDir = tree.children.find((c) => c.name === "src")!;
  assert.equal(srcDir.isDir, true);
  assert.equal(srcDir.children.length, 1);
  assert.equal(srcDir.children[0].name, "graph");
  assert.equal(srcDir.children[0].children.length, 2);

  // Inspect "docs"
  const docsDir = tree.children.find((c) => c.name === "docs")!;
  assert.equal(docsDir.children[0].name, "adr");
  assert.equal(docsDir.children[0].children[0].scope, "docs");

  // Inspect "features"
  const featuresDir = tree.children.find((c) => c.name === "features")!;
  assert.equal(featuresDir.children[0].children[0].scope, "specs");
});

test("filtering visualizer nodes by selected files set", () => {
  const node1 = { path: "src/graph/build.ts" };
  const node2 = { path: "docs/adr/0007.md" };
  const node3 = { path: "features/viz/tree_picker-11.feature" };

  // Only src/graph files selected
  const filterSelected = new Set(["src/graph/build.ts"]);

  assert.equal(matchNodeFilter(node1, { selectedFiles: filterSelected }), true);
  assert.equal(matchNodeFilter(node2, { selectedFiles: filterSelected }), false);
  assert.equal(matchNodeFilter(node3, { selectedFiles: filterSelected }), false);

  // When selectedFiles is empty, all nodes filtered
  assert.equal(matchNodeFilter(node1, { selectedFiles: new Set() }), false);

  // When selectedFiles is undefined, nodes pass through
  assert.equal(matchNodeFilter(node1, {}), true);
});
