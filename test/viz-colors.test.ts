import { test } from "node:test";
import assert from "node:assert/strict";
import { colorToken } from "../viewer/data.js";

test("colorToken returns scope-specific tokens for docs, specs, and code", () => {
  // specs scope always returns --scope-specs
  assert.equal(colorToken("code", "file", "specs"), "--scope-specs");
  assert.equal(colorToken("code", "function", "specs"), "--scope-specs");
  assert.equal(colorToken("context", "file", "specs"), "--scope-specs");

  // docs scope returns --scope-docs (or specific context concept/system tokens)
  assert.equal(colorToken("code", "file", "docs"), "--scope-docs");
  assert.equal(colorToken("context", "file", "docs"), "--scope-docs");
  assert.equal(colorToken("context", "concept", "docs"), "--con");
  assert.equal(colorToken("context", "system", "docs"), "--sys");

  // code scope returns type-specific code tokens or fallback --scope-code
  assert.equal(colorToken("code", "file", "code"), "--k-file");
  assert.equal(colorToken("code", "class", "code"), "--k-class");
  assert.equal(colorToken("code", "function", "code"), "--k-fn");
  assert.equal(colorToken("context", "file", "code"), "--fil");

  // when scope is not provided, falls back to tab + type
  assert.equal(colorToken("code", "class"), "--k-class");
  assert.equal(colorToken("context", "concept"), "--con");
});
