/**
 * #252 — `graft build --deep --exclude-dir` must not walk the whole repo.
 *
 * Tier-1 wiring already honors `--exclude-dir` (`filterByExcludeDirs`). The Tier-2
 * concept pass (`buildContext`) and its freshness check (`checkContext`) must
 * enumerate the same blocklist — otherwise out-of-scope files get summarized
 * and pulled into concept synthesis, and `graft check` reports them as removed
 * if the fingerprint isn't matched.
 *
 * No LLM: a recording summarizer is the queue. Wiring assertions reuse
 * `buildGraph` so this file cannot drift from `graph-exclude-dir.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { buildContext } from "../src/context/build.js";
import { checkContext } from "../src/context/check.js";
import { buildGraph } from "../src/graph/build.js";
import { Graft } from "../src/engine.js";
import { fakeProviders, tmpRepo } from "./helpers.js";

function repoWithOutOfScope(): string {
  const d = tmpRepo("ctx-exclude-dir");
  mkdirSync(join(d, "src"), { recursive: true });
  mkdirSync(join(d, "docs", "checkpoints"), { recursive: true });
  writeFileSync(join(d, "src", "a.ts"), "// [[In Scope]]\nexport const a = 1;\n");
  writeFileSync(join(d, "docs", "checkpoints", "b.ts"), "// [[Out Of Scope]]\nexport const b = 2;\n");
  return d;
}

test("buildContext and checkContext skip files matching excludeDirs", async () => {
  const d = repoWithOutOfScope();
  try {
    const providers = fakeProviders();

    // 1. Wiring build records excludeDirs in the fingerprint (simulates CLI)
    await buildGraph(d, { excludeDirs: ["docs/checkpoints"] });

    // 2. Concept build reads excludeDirs from the fingerprint
    const b = await buildContext(d, {
      model: "test-model",
      summarizer: providers.summarizer,
      synthesizer: providers.synthesizer,
    });
    
    assert.equal(b.files, 1, "only src/a.ts must be counted");
    
    // 3. checkContext must read the same fingerprint and report clean
    const c = checkContext(d);
    assert.ok(c.ok, "checkContext must not report docs/checkpoints/b.ts as un-summarized drift");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
