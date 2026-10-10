import { test } from "node:test";
import * as assert from "node:assert";
import { GENERIC_LANGS } from "../src/graph/generic.js";

test("Markdown is registered in GENERIC_LANGS", () => {
  const mdLang = GENERIC_LANGS.find(l => l.name === "markdown");
  assert.ok(mdLang, "Markdown language should be registered");
  assert.deepStrictEqual(mdLang?.exts, [".md"]);
  assert.strictEqual(mdLang?.wasm, "markdown");
});
