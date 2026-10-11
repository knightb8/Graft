import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scopeOfPath,
  scopeOfNode,
  matchesScope,
  isPathExcluded,
  matchNodeFilter,
  filterGraphV1,
  type TripartiteScope,
} from "../src/graph/filter.js";
import type { GraphV1 } from "../src/graph/types.js";

test("scopeOfPath correctly identifies code, docs, and specs", () => {
  assert.equal(scopeOfPath("src/graph/build.ts"), "code");
  assert.equal(scopeOfPath("src/cli.ts"), "code");
  assert.equal(scopeOfPath("docs/adr/0001-init.md"), "docs");
  assert.equal(scopeOfPath("README.md"), "docs");
  // Feature specification files
  assert.equal(scopeOfPath("features/graph/core/semantic_edges-11.feature"), "specs");
  assert.equal(scopeOfPath("features/cli/core/exclude_dir-10.feature"), "specs");
  // Step implementation files (code scope, distinct from .feature specs)
  assert.equal(scopeOfPath("features/steps/viewport_capture_steps.py"), "code");
  assert.equal(scopeOfPath("features/steps/login_steps.ts"), "code");
  assert.equal(scopeOfPath("test/steps/auth_step.py"), "code");
});

test("scopeOfNode classifies nodes based on path or sources", () => {
  assert.equal(scopeOfNode({ path: "src/server.ts" }), "code");
  assert.equal(scopeOfNode({ path: "docs/architecture.md" }), "docs");
  assert.equal(scopeOfNode({ path: "features/login.feature" }), "specs");
  assert.equal(scopeOfNode({ path: "features/steps/login_steps.py" }), "code");
  assert.equal(scopeOfNode({ sources: ["src/index.ts · L1-L10"] }), "code");
  assert.equal(scopeOfNode({ sources: ["docs/readme.md · L5-L20"] }), "docs");
  assert.equal(scopeOfNode({ sources: ["features/test.feature · L1-L15"] }), "specs");
  assert.equal(scopeOfNode({ sources: ["features/steps/test_steps.py · L1-L20"] }), "code");
});

test("isPathExcluded handles single-segment and nested directories", () => {
  const excluded = ["test", "docs/checkpoints", "vendor"];

  assert.equal(isPathExcluded("test/helpers.ts", excluded), true);
  assert.equal(isPathExcluded("src/test/mock.ts", excluded), true);
  assert.equal(isPathExcluded("docs/checkpoints/run.log", excluded), true);
  assert.equal(isPathExcluded("docs/adr/0001.md", excluded), false);
  assert.equal(isPathExcluded("src/graph/build.ts", excluded), false);
  assert.equal(isPathExcluded("vendor/bundle.js", excluded), true);
});

test("matchNodeFilter evaluates scope and exclusions together", () => {
  const codeNode = { path: "src/app.ts" };
  const testNode = { path: "test/app.test.ts" };
  const docNode = { path: "docs/guide.md" };
  const specNode = { path: "features/auth.feature" };

  // Only docs
  assert.equal(matchNodeFilter(codeNode, { scope: "docs" }), false);
  assert.equal(matchNodeFilter(docNode, { scope: "docs" }), true);
  assert.equal(matchNodeFilter(specNode, { scope: "docs" }), false);

  // Exclude test dir
  assert.equal(matchNodeFilter(codeNode, { excludeDirs: ["test"] }), true);
  assert.equal(matchNodeFilter(testNode, { excludeDirs: ["test"] }), false);

  // Scope code + exclude test
  assert.equal(matchNodeFilter(codeNode, { scope: "code", excludeDirs: ["test"] }), true);
  assert.equal(matchNodeFilter(testNode, { scope: "code", excludeDirs: ["test"] }), false);
  assert.equal(matchNodeFilter(docNode, { scope: "code", excludeDirs: ["test"] }), false);

  // Multi-scope checkboxes (scopes Set)
  const docsAndSpecs = new Set<"code" | "docs" | "specs">(["docs", "specs"]);
  assert.equal(matchNodeFilter(codeNode, { scopes: docsAndSpecs }), false);
  assert.equal(matchNodeFilter(docNode, { scopes: docsAndSpecs }), true);
  assert.equal(matchNodeFilter(specNode, { scopes: docsAndSpecs }), true);

  const codeOnly = new Set<"code" | "docs" | "specs">(["code"]);
  assert.equal(matchNodeFilter(codeNode, { scopes: codeOnly }), true);
  assert.equal(matchNodeFilter(docNode, { scopes: codeOnly }), false);
  assert.equal(matchNodeFilter(specNode, { scopes: codeOnly }), false);

  // Selected files set
  const selectedSet = new Set(["src/app.ts", "docs/guide.md"]);
  assert.equal(matchNodeFilter(codeNode, { selectedFiles: selectedSet }), true);
  assert.equal(matchNodeFilter(docNode, { selectedFiles: selectedSet }), true);
  assert.equal(matchNodeFilter(testNode, { selectedFiles: selectedSet }), false);
  assert.equal(matchNodeFilter(specNode, { selectedFiles: selectedSet }), false);
  assert.equal(matchNodeFilter(codeNode, { selectedFiles: new Set() }), false);
});

test("filterGraphV1 removes nodes and dangling edges", () => {
  const graph: GraphV1 = {
    meta: { version: 1, nodeCount: 3, edgeCount: 2, languages: ["ts", "md"] },
    nodes: [
      {
        id: "src/a.ts#fnA",
        name: "fnA",
        kind: "function",
        path: "src/a.ts",
        span: "L1-L10",
        signature: "fnA()",
        exported: true,
        origin: "ast",
        body_hash: "hash1",
        summary_state: "ready",
        summary: "test",
        crux: null,
      },
      {
        id: "test/a.test.ts#testA",
        name: "testA",
        kind: "function",
        path: "test/a.test.ts",
        span: "L1-L10",
        signature: "testA()",
        exported: false,
        origin: "ast",
        body_hash: "hash2",
        summary_state: "ready",
        summary: "test",
        crux: null,
      },
      {
        id: "docs/a.md#sectionA",
        name: "sectionA",
        kind: "module",
        path: "docs/a.md",
        span: "L1-L10",
        signature: null,
        exported: false,
        origin: "ast",
        body_hash: "hash3",
        summary_state: "ready",
        summary: "test",
        crux: null,
      },
    ],
    edges: [
      { source: "test/a.test.ts#testA", target: "src/a.ts#fnA", relation: "verifies", confidence: "extracted" },
      { source: "docs/a.md#sectionA", target: "src/a.ts#fnA", relation: "documents", confidence: "extracted" },
    ],
  };

  const filtered = filterGraphV1(graph, { scope: "code", excludeDirs: ["test"] });
  assert.equal(filtered.nodes.length, 1);
  assert.equal(filtered.nodes[0].id, "src/a.ts#fnA");
  assert.equal(filtered.edges.length, 0); // Both edges connected to excluded nodes
  assert.equal(filtered.meta.nodeCount, 1);
  assert.equal(filtered.meta.edgeCount, 0);
});
