/**
 * `graft build` with .graphignore in Git repositories.
 *
 * Verifies that git-tracked files matching .graphignore are completely ignored
 * in the graph and never appear in nodes or cause phantom drift in probes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { readGraph, wiringPath } from "../src/graph/write.js";
import { probeDrift, isClean } from "../src/graph/fingerprint.js";
import type { GraphV1 } from "../src/graph/types.js";

function repoWithGit(): string {
  const d = mkdtempSync(join(tmpdir(), "graft-graphignore-git-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: d, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: d, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@test.local"], { cwd: d, stdio: "ignore" });

  mkdirSync(join(d, "src"), { recursive: true });
  mkdirSync(join(d, "docs", "checkpoints"), { recursive: true });
  mkdirSync(join(d, "docs", "adr"), { recursive: true });

  writeFileSync(join(d, "src", "index.ts"), "export const code = 42;\n");
  writeFileSync(join(d, "src", "generated.tmp.ts"), "export const tmp = 1;\n");
  writeFileSync(join(d, "docs", "checkpoints", "checkpoint.ts"), "export const cp = 1;\n");
  writeFileSync(join(d, "docs", "adr", "0001-init.ts"), "export const adr = 1;\n");

  // Track everything in git initially (simulates drumknot tracking checkpoints)
  execFileSync("git", ["add", "."], { cwd: d, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "Initial commit"], { cwd: d, stdio: "ignore" });

  // Now create .graphignore
  writeFileSync(join(d, ".graphignore"), "docs/checkpoints\n*.tmp.ts\n");

  return d;
}

function runCli(args: string[]): void {
  execFileSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], { stdio: "pipe" });
}

function graphOf(d: string): GraphV1 | null {
  return readGraph(wiringPath(join(d, "graft")));
}

test(".graphignore filters out git-tracked noise files and keeps probe clean", () => {
  const d = repoWithGit();
  try {
    runCli(["build", d]);
    const graph = graphOf(d);
    assert.ok(graph, "graph should exist");

    const paths = new Set(graph!.nodes.map((n) => n.path));
    assert.ok(paths.has("src/index.ts"), "src/index.ts must be indexed");
    assert.ok(paths.has("docs/adr/0001-init.ts"), "docs/adr/0001-init.ts must be indexed");
    assert.ok(!paths.has("docs/checkpoints/checkpoint.ts"), "docs/checkpoints must be ignored despite git tracking");
    assert.ok(!paths.has("src/generated.tmp.ts"), "*.tmp.ts must be ignored despite git tracking");

    // Freshness probe should stay clean and not report the ignored files as missing or drift
    const drift = probeDrift(d, join(d, "graft"));
    assert.ok(drift && isClean(drift), "freshness probe must be clean with .graphignore");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
