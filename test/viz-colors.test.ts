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

test("cyberpunk 2077 theme integrates authentic UI and Title Card color palettes", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const css = fs.readFileSync(path.resolve("viewer/style.css"), "utf-8");

  // Extract the cyberpunk theme block
  const match = css.match(/:root\[data-theme="cyberpunk"\]\{([^}]+)\}/);
  assert.ok(match, "Cyberpunk theme definition found in style.css");
  const themeCss = match[1].toLowerCase();

  // 1. UI Color Palette
  const uiColors = [
    "#000000", // Black
    "#c5003c", // Crimson
    "#880425", // Dark Red
    "#f3e600", // Yellow
    "#55ead4", // Cyan
  ];
  for (const color of uiColors) {
    assert.ok(
      themeCss.includes(color),
      `Cyberpunk theme must include UI palette color ${color}`
    );
  }

  // 2. Title Card Color Palette
  const titleCardColors = [
    "#00060e", // Dark Blue
    "#9a9f17", // Olive Green
    "#fee801", // Bright Yellow
    "#54c1e6", // Light Blue
    "#39c4b6", // Teal
  ];
  for (const color of titleCardColors) {
    assert.ok(
      themeCss.includes(color),
      `Cyberpunk theme must include Title Card palette color ${color}`
    );
  }
});
