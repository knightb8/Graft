/**
 * `graft build --exclude-dir <path>` end-to-end through the real CLI.
 *
 * The blocklist excludes specific directories that would otherwise be indexed.
 * It is recorded in the fingerprint — the graph's own freshness sidecar under
 * `graft/` — never in the source repo's `.graft/config.json`, so a limited
 * build leaves no trace under the repo being indexed. That also keeps the
 * query-path freshness probe honest: the excluded files must not read as
 * phantom "removed" drift on every query.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { readGraph, wiringPath } from "../src/graph/write.js";
import { probeDrift, isClean, readFingerprint } from "../src/graph/fingerprint.js";
import type { GraphV1 } from "../src/graph/types.js";

function repoWithDirs(): string {
  const d = mkdtempSync(join(tmpdir(), "graft-exclude-dir-"));
  mkdirSync(join(d, "src", "a"), { recursive: true });
  mkdirSync(join(d, "docs", "checkpoints"), { recursive: true });
  writeFileSync(join(d, "src", "a", "a.ts"), "export function a(): number {\n  return 1;\n}\n");
  writeFileSync(join(d, "docs", "checkpoints", "log.txt"), "run details\n");
  writeFileSync(join(d, "docs", "checkpoints", "checkpoint.ts"), "export const c = 1;\n");
  writeFileSync(join(d, "top.ts"), "export function top(): number {\n  return 3;\n}\n");
  return d;
}

function runCli(args: string[]): void {
  execFileSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], { stdio: "pipe" });
}

function graphOf(d: string): GraphV1 | null {
  return readGraph(wiringPath(join(d, "graft")));
}

test("--exclude-dir limits the walk, records the blocklist in the fingerprint, and the probe stays clean", () => {
  const d = repoWithDirs();
  try {
    // Default: everything is indexed.
    runCli(["build", d]);
    const full = graphOf(d);
    assert.ok(full, "expected a built graph");
    assert.ok(full!.nodes.some((n) => n.path === "src/a/a.ts"), "src/a indexed by default");
    assert.ok(full!.nodes.some((n) => n.path === "docs/checkpoints/checkpoint.ts"), "docs/checkpoints indexed by default");
    assert.ok(full!.nodes.some((n) => n.path === "top.ts"), "top.ts indexed by default");

    // Exclude docs/checkpoints
    runCli(["build", d, "--exclude-dir", "docs/checkpoints"]);
    const limited = graphOf(d);
    assert.ok(limited, "expected a rebuilt graph");
    assert.ok(limited!.nodes.some((n) => n.path === "src/a/a.ts"), "src/a must be indexed");
    assert.ok(!limited!.nodes.some((n) => n.path === "docs/checkpoints/checkpoint.ts"), "docs/checkpoints must be skipped");
    assert.ok(limited!.nodes.some((n) => n.path === "top.ts"), "top.ts must still be indexed");

    // The blocklist lives in the fingerprint, not the source repo's config.
    const fp = readFingerprint(join(d, "graft"));
    assert.deepEqual(fp?.excludeDirs, ["docs/checkpoints"], "fingerprint must record the blocklist");
    assert.ok(!existsSync(join(d, ".graft", "config.json")), "source repo config must be untouched");

    // The fingerprint probe (the fast path `ensureFreshGraph`/hooks use, which
    // never sees CLI flags) must enumerate the same excluded set.
    const drift = probeDrift(d, join(d, "graft"));
    assert.ok(drift && isClean(drift), "excluded files must not read as drift");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("--exclude-dir rejects a prefix that normalizes to empty", () => {
  const d = repoWithDirs();
  try {
    let failed = false;
    try {
      execFileSync(process.execPath, ["--import", "tsx", "src/cli.ts", "build", d, "--exclude-dir", "/"], {
        stdio: "pipe",
      });
    } catch {
      failed = true;
    }
    assert.ok(failed, "a bare / prefix must be rejected");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
