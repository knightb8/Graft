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

test("viewer style defines all 13 themes with required palette tokens", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const css = fs.readFileSync(path.resolve("viewer/style.css"), "utf-8");
  const html = fs.readFileSync(path.resolve("viewer/index.html"), "utf-8");

  const expectedThemes = [
    // Dark themes
    "dark",
    "tokyonight",
    "synthwave",
    "cyberpunk",
    "spring",
    "summer",
    "autumn",
    "christmas",
    // Light themes
    "light",
    "nord-light",
    "solarized-light",
    "github-light",
    "sepia",
  ];

  for (const theme of expectedThemes) {
    assert.ok(
      css.includes(`data-theme="${theme}"`),
      `Theme data-theme="${theme}" must be defined in style.css`
    );
    // Verify each theme is in index.html select options
    assert.ok(
      html.includes(`value="${theme}"`),
      `Theme "${theme}" must be present in index.html #themeSelect`
    );
  }

  // Verify essential CSS tokens and document stage tokens exist
  const essentialTokens = [
    "--bg",
    "--panel",
    "--panel2",
    "--border",
    "--ink",
    "--muted",
    "--accent",
    "--edge",
    "--stage-adrs",
    "--stage-features",
    "--stage-code",
    "--stage-tests",
    "--stage-docs",
    "--rel-structure",
    "--rel-dependency",
    "--rel-contract",
    "--rel-association",
  ];
  for (const token of essentialTokens) {
    assert.ok(css.includes(`${token}:`), `Token ${token} must be defined in style.css`);
  }
});
