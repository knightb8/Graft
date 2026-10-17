import { test } from "node:test";
import assert from "node:assert/strict";
import { extractAsciiDoc } from "../src/graph/asciidoc.js";
import { extractFile } from "../src/graph/extract.js";
import { scopeOfPath } from "../src/graph/filter.js";
import { resolveEdges } from "../src/graph/resolve.js";

test("scopeOfPath recognizes .adoc and .asciidoc as docs scope", () => {
  assert.equal(scopeOfPath("docs/architecture.adoc"), "docs");
  assert.equal(scopeOfPath("README.asciidoc"), "docs");
  assert.equal(scopeOfPath("architecture.adoc#overview"), "docs");
});

test("extractAsciiDoc extracts file node and section hierarchy with spans and containment", () => {
  const content = [
    "= System Architecture",
    "",
    "Introductory paragraph.",
    "",
    "== Core Engine",
    "",
    "Details of core engine.",
    "",
    "=== WebGL Visualizer",
    "",
    "WebGL rendering pipeline.",
    "",
    "== Data Storage",
    "",
    "Storage mechanisms.",
  ].join("\n");

  const { nodes, rawEdges } = extractAsciiDoc("docs/arch.adoc", content);

  // Should have file node + 4 section nodes
  assert.equal(nodes.length, 5);

  const fileNode = nodes.find((n) => n.kind === "file");
  assert.ok(fileNode);
  assert.equal(fileNode.id, "docs/arch.adoc");
  assert.equal(fileNode.span, "L1-L15");

  const titleNode = nodes.find((n) => n.name === "System Architecture");
  assert.ok(titleNode);
  assert.equal(titleNode.kind, "module");
  assert.equal(titleNode.signature, "= System Architecture");

  const coreNode = nodes.find((n) => n.name === "Core Engine");
  assert.ok(coreNode);
  assert.equal(coreNode.kind, "module");
  assert.equal(coreNode.span, "L5-L12");

  const webglNode = nodes.find((n) => n.name === "WebGL Visualizer");
  assert.ok(webglNode);
  assert.equal(webglNode.span, "L9-L12");

  const storageNode = nodes.find((n) => n.name === "Data Storage");
  assert.ok(storageNode);
  assert.equal(storageNode.span, "L13-L15");

  // Check containment
  const containsEdges = rawEdges.filter((e) => e.relation === "contains");
  assert.equal(containsEdges.length, 4);

  // File contains root title
  assert.ok(containsEdges.some((e) => e.source === "docs/arch.adoc" && e.targetId === "docs/arch.adoc#System Architecture"));
  // Root title contains Core Engine
  assert.ok(containsEdges.some((e) => e.source === "docs/arch.adoc#System Architecture" && e.targetId === "docs/arch.adoc#Core Engine"));
  // Core Engine contains WebGL Visualizer
  assert.ok(containsEdges.some((e) => e.source === "docs/arch.adoc#Core Engine" && e.targetId === "docs/arch.adoc#WebGL Visualizer"));
  // Root title contains Data Storage
  assert.ok(containsEdges.some((e) => e.source === "docs/arch.adoc#System Architecture" && e.targetId === "docs/arch.adoc#Data Storage"));
});

test("extractAsciiDoc extracts include directives and cross-references to rawEdges", () => {
  const content = [
    "= Architecture Guide",
    "",
    "== Overview",
    "Governed by xref:docs/adr/0001.adoc[ADR 0001].",
    "",
    "== Implementation Details",
    "include::src/core/engine.ts[]",
    "See also <<docs/storage.adoc#,Storage Guide>>.",
  ].join("\n");

  const { rawEdges } = extractAsciiDoc("docs/guide.adoc", content);

  // ADR xref -> influences
  const adrRef = rawEdges.find((e) => e.specifier === "docs/adr/0001.adoc");
  assert.ok(adrRef);
  assert.equal(adrRef.relation, "influences");
  assert.equal(adrRef.source, "docs/guide.adoc#Overview");

  // include::src/core/engine.ts[] -> documents
  const incRef = rawEdges.find((e) => e.specifier === "src/core/engine.ts");
  assert.ok(incRef);
  assert.equal(incRef.relation, "documents");
  assert.equal(incRef.source, "docs/guide.adoc#Implementation Details");

  // <<docs/storage.adoc#>> -> documents
  const angleRef = rawEdges.find((e) => e.specifier === "docs/storage.adoc#");
  assert.ok(angleRef);
  assert.equal(angleRef.relation, "documents");
  assert.equal(angleRef.source, "docs/guide.adoc#Implementation Details");
});

test("extractFile dispatches .adoc to extractAsciiDoc and resolves edges", () => {
  const content = [
    "= Service Specs",
    "== Auth Section",
    "include::src/auth.ts[]",
  ].join("\n");

  const result = extractFile("docs/auth.adoc", content, "asciidoc");
  assert.equal(result.nodes.length, 3);

  // Test resolution through resolveEdges
  const allNodes = [
    ...result.nodes,
    {
      id: "src/auth.ts",
      name: "auth.ts",
      kind: "file" as const,
      path: "src/auth.ts",
      span: "L1-L10",
      signature: null,
      exported: true,
      origin: "ast" as const,
      body_hash: "hash123",
      summary_state: "pending" as const,
      summary: null,
      crux: null,
    },
  ];

  const resolved = resolveEdges(allNodes, result.rawEdges, {});
  const docEdge = resolved.find((e) => e.target === "src/auth.ts");
  assert.ok(docEdge);
  assert.equal(docEdge.source, "docs/auth.adoc#Auth Section");
  assert.equal(docEdge.relation, "documents");
  assert.equal(docEdge.confidence, "extracted");
});
