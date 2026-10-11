import { test } from "node:test";
import * as assert from "node:assert";
import { GENERIC_LANGS } from "../src/graph/generic.js";
import { resolveEdges } from "../src/graph/resolve.js";
import type { NodeV1 } from "../src/graph/types.js";
import type { RawEdge } from "../src/graph/extract.js";

test("Markdown is registered in GENERIC_LANGS", () => {
  const mdLang = GENERIC_LANGS.find(l => l.name === "markdown");
  assert.ok(mdLang, "Markdown language should be registered");
  assert.deepStrictEqual(mdLang?.exts, [".md"]);
  assert.strictEqual(mdLang?.wasm, "markdown");
});

test("Markdown relative link resolution: resolves paths without ./ or root-relative", () => {
  const nodes: NodeV1[] = [
    { id: "docs/guide.md", name: "guide.md", kind: "file", path: "docs/guide.md", span: "L1-L10" },
    { id: "docs/adr/0001-init.md", name: "0001-init.md", kind: "file", path: "docs/adr/0001-init.md", span: "L1-L10" },
    { id: "skills/rubric.md", name: "rubric.md", kind: "file", path: "skills/rubric.md", span: "L1-L10" },
    { id: "skills/sources.md", name: "sources.md", kind: "file", path: "skills/sources.md", span: "L1-L10" },
  ];

  const rawEdges: RawEdge[] = [
    // 1. Link without leading ./ relative to current directory
    {
      source: "docs/guide.md",
      file: "docs/guide.md",
      relation: "documents",
      specifier: "adr/0001-init.md",
    },
    // 2. Link in same folder without ./
    {
      source: "skills/rubric.md",
      file: "skills/rubric.md",
      relation: "documents",
      specifier: "sources.md",
    },
    // 3. Root-relative link starting with /
    {
      source: "skills/rubric.md",
      file: "skills/rubric.md",
      relation: "documents",
      specifier: "/docs/adr/0001-init.md",
    },
  ];

  const edges = resolveEdges(nodes, rawEdges);
  assert.strictEqual(edges.length, 3);
  assert.deepStrictEqual(edges[0], {
    source: "docs/guide.md",
    target: "docs/adr/0001-init.md",
    relation: "documents",
    confidence: "extracted",
  });
  assert.deepStrictEqual(edges[1], {
    source: "skills/rubric.md",
    target: "skills/sources.md",
    relation: "documents",
    confidence: "extracted",
  });
  assert.deepStrictEqual(edges[2], {
    source: "skills/rubric.md",
    target: "docs/adr/0001-init.md",
    relation: "documents",
    confidence: "extracted",
  });
});

