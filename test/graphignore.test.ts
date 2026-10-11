/**
 * Tests for .graphignore parser, glob matching, and repo walking integration.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseGraphIgnore, loadGraphIgnore } from "../src/util/graphignore.js";
import { walkDir } from "../src/ingest/fs.js";

test("parseGraphIgnore handles basic directory and glob rules", () => {
  const content = `
# Comment line
docs/checkpoints
*.log
src/generated/**
`;
  const gi = parseGraphIgnore(content);
  assert.equal(gi.ignores("docs/checkpoints/run.log"), true);
  assert.equal(gi.ignores("docs/checkpoints/sub/nested.txt"), true);
  assert.equal(gi.ignores("server.log"), true);
  assert.equal(gi.ignores("logs/server.log"), true);
  assert.equal(gi.ignores("src/generated/types.ts"), true);
  assert.equal(gi.ignores("src/main.ts"), false);
  assert.equal(gi.ignores("docs/adr/0001.md"), false);
});

test("parseGraphIgnore handles negation rules", () => {
  const content = `
docs/**
!docs/adr
!docs/adr/**
`;
  const gi = parseGraphIgnore(content);
  assert.equal(gi.ignores("docs/notes.md"), true);
  assert.equal(gi.ignores("docs/scratch/test.txt"), true);
  assert.equal(gi.ignores("docs/adr/0001-init.md"), false);
});

test("walkDir filters out files matching .graphignore", () => {
  const d = mkdtempSync(join(tmpdir(), "graft-graphignore-test-"));
  try {
    mkdirSync(join(d, "src"), { recursive: true });
    mkdirSync(join(d, "docs", "checkpoints"), { recursive: true });
    mkdirSync(join(d, "docs", "adr"), { recursive: true });

    writeFileSync(join(d, ".graphignore"), "docs/checkpoints\n*.tmp\n");
    writeFileSync(join(d, "src", "index.ts"), "export const ok = 1;\n");
    writeFileSync(join(d, "src", "scratch.tmp"), "temp data\n");
    writeFileSync(join(d, "docs", "checkpoints", "checkpoint.md"), "checkpoint\n");
    writeFileSync(join(d, "docs", "adr", "0001.md"), "ADR\n");

    const files = walkDir(d);
    const rels = files.map((f) => f.slice(d.length + 1).replace(/\\/g, "/"));

    assert.ok(rels.includes("src/index.ts"), "src/index.ts must be included");
    assert.ok(rels.includes("docs/adr/0001.md"), "docs/adr/0001.md must be included");
    assert.ok(!rels.includes("docs/checkpoints/checkpoint.md"), "docs/checkpoints must be ignored");
    assert.ok(!rels.includes("src/scratch.tmp"), "*.tmp must be ignored");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("walkDir filters out files matching .graftignore as alias", () => {
  const d = mkdtempSync(join(tmpdir(), "graft-graftignore-test-"));
  try {
    mkdirSync(join(d, "src"), { recursive: true });
    mkdirSync(join(d, "scratch"), { recursive: true });

    writeFileSync(join(d, ".graftignore"), "scratch/\n");
    writeFileSync(join(d, "src", "index.ts"), "export const ok = 1;\n");
    writeFileSync(join(d, "scratch", "draft.txt"), "draft\n");

    const files = walkDir(d);
    const rels = files.map((f) => f.slice(d.length + 1).replace(/\\/g, "/"));

    assert.ok(rels.includes("src/index.ts"), "src/index.ts must be included");
    assert.ok(!rels.includes("scratch/draft.txt"), "scratch/ must be ignored via .graftignore");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
