/**
 * Tripartite Audit: Verifies semantic connections between ADRs, Features, Code, and Tests.
 *
 * Checks:
 * 1. Disconnected ADRs: Architectural decisions without any specifying/realizing BDD Feature.
 * 2. Unanchored Features: BDD Features missing a governing ADR (@adr:<path> or [ADR](<path>)).
 * 3. Uncovered Features: BDD Features missing `@covers:<path>` implementation or test link.
 * 4. Broken References: `@adr:` or `@covers:` tags pointing to non-existent files.
 * 5. Unreferenced Tests: Test files not covered by any feature and not importing source files.
 *
 * Usage:
 *   node scripts/audit-tripartite.mjs [features_dir] [adrs_dir] [--summary] [--json] [--strict]
 */

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const rootDir = process.cwd();
const args = process.argv.slice(2);
const isSummary = args.includes("--summary");
const isJson = args.includes("--json");
const isStrict = args.includes("--strict");

const positionalArgs = args.filter((a) => !a.startsWith("-"));
const featuresDir = positionalArgs[0] ? resolve(rootDir, positionalArgs[0]) : resolve(rootDir, "features");
const adrsDir = positionalArgs[1] ? resolve(rootDir, positionalArgs[1]) : resolve(rootDir, "docs/adr");
const testsDir = resolve(rootDir, "test");

function walk(dir, ext) {
  if (!existsSync(dir)) return [];
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(fullPath, ext));
    } else if (entry.isFile() && (!ext || entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

// 1. Collect Assets
const featureFiles = walk(featuresDir, ".feature").map((f) => relative(rootDir, f));
const adrFiles = walk(adrsDir, ".md")
  .filter((f) => !f.endsWith("README.md") && !f.endsWith("template.md"))
  .map((f) => relative(rootDir, f));
const testFiles = walk(testsDir, ".test.ts").map((f) => relative(rootDir, f));

// 2. Parse Features
const featureData = new Map();
const adrReferences = new Map(); // adr -> Set<feature>
const coversReferences = new Map(); // path -> Set<feature>
const brokenRefs = [];

for (const adr of adrFiles) {
  adrReferences.set(adr, new Set());
}

for (const feat of featureFiles) {
  const content = readFileSync(join(rootDir, feat), "utf8");
  const adrLinks = new Set();
  const coversLinks = new Set();

  // Match @adr:<path>
  const adrTagMatches = content.matchAll(/@adr:([^\s@\r\n]+)/g);
  for (const m of adrTagMatches) {
    const target = m[1].replace(/[),;]+$/, "");
    adrLinks.add(target);
    if (!existsSync(join(rootDir, target))) {
      brokenRefs.push({ file: feat, tag: `@adr:${target}`, target });
    } else {
      if (!adrReferences.has(target)) adrReferences.set(target, new Set());
      adrReferences.get(target).add(feat);
    }
  }

  // Match narrative [ADR ...](docs/adr/...)
  const adrNarrativeMatches = content.matchAll(/\[(?:ADR|Architectural Decision)[^\]]*\]\((docs\/adr\/[^)]+\.md)\)/g);
  for (const m of adrNarrativeMatches) {
    const target = m[1];
    adrLinks.add(target);
    if (!existsSync(join(rootDir, target))) {
      brokenRefs.push({ file: feat, tag: `[ADR](${target})`, target });
    } else {
      if (!adrReferences.has(target)) adrReferences.set(target, new Set());
      adrReferences.get(target).add(feat);
    }
  }

  // Match @covers:<path>
  const coversTagMatches = content.matchAll(/@covers:([^\s@\r\n]+)/g);
  for (const m of coversTagMatches) {
    const target = m[1].replace(/[),;]+$/, "");
    coversLinks.add(target);
    if (!existsSync(join(rootDir, target))) {
      brokenRefs.push({ file: feat, tag: `@covers:${target}`, target });
    } else {
      if (!coversReferences.has(target)) coversReferences.set(target, new Set());
      coversReferences.get(target).add(feat);
    }
  }

  featureData.set(feat, {
    adrLinks: Array.from(adrLinks),
    coversLinks: Array.from(coversLinks),
  });
}

// 3. Find Disconnected Entities
const unanchoredFeatures = [];
const uncoveredFeatures = [];

for (const [feat, data] of featureData.entries()) {
  if (data.adrLinks.length === 0) {
    unanchoredFeatures.push(feat);
  }
  if (data.coversLinks.length === 0) {
    uncoveredFeatures.push(feat);
  }
}

const disconnectedAdrs = [];
for (const [adr, referencingFeatures] of adrReferences.entries()) {
  if (referencingFeatures.size === 0) {
    disconnectedAdrs.push(adr);
  }
}

const unreferencedTests = [];
for (const t of testFiles) {
  if (!coversReferences.has(t)) {
    unreferencedTests.push(t);
  }
}

// 4. Compute Health Scores
const totalAdrs = adrFiles.length;
const connectedAdrs = totalAdrs - disconnectedAdrs.length;
const adrCoveragePct = totalAdrs > 0 ? ((connectedAdrs / totalAdrs) * 100).toFixed(1) : "100.0";

const totalFeatures = featureFiles.length;
const fullyLinkedFeatures = totalFeatures - new Set([...unanchoredFeatures, ...uncoveredFeatures]).size;
const featHealthPct = totalFeatures > 0 ? ((fullyLinkedFeatures / totalFeatures) * 100).toFixed(1) : "100.0";

// 5. Output
if (isJson) {
  const result = {
    totalAdrs,
    connectedAdrs,
    adrCoveragePct: Number(adrCoveragePct),
    disconnectedAdrs,
    totalFeatures,
    fullyLinkedFeatures,
    featureHealthPct: Number(featHealthPct),
    unanchoredFeatures,
    uncoveredFeatures,
    totalTests: testFiles.length,
    unreferencedTests,
    brokenReferences: brokenRefs,
  };
  console.log(JSON.stringify(result, null, 2));
  if (isStrict && (disconnectedAdrs.length > 0 || unanchoredFeatures.length > 0 || brokenRefs.length > 0)) {
    process.exit(1);
  }
  process.exit(0);
}

if (isSummary) {
  console.log(`  ADR Coverage:     ${connectedAdrs}/${totalAdrs} (${adrCoveragePct}%)`);
  console.log(`  Feature Health:   ${fullyLinkedFeatures}/${totalFeatures} (${featHealthPct}%) fully linked`);
  if (brokenRefs.length > 0) {
    console.log(`  ⚠️ Broken Links:   ${brokenRefs.length} dead path references!`);
  }
  if (unanchoredFeatures.length > 0) {
    console.log(`  ⚠️ Disconnected:   ${unanchoredFeatures.length} specs missing @adr:, ${disconnectedAdrs.length} ADRs unreferenced`);
  }
  process.exit(0);
}

// Full Interactive Report
console.log(`\n======================================================================`);
console.log(`       GRAFT TRIPARTITE CONNECTIVITY AUDIT (ADRs ↔ Specs ↔ Code)      `);
console.log(`======================================================================\n`);

console.log(`📊 Health Summary:`);
console.log(`  • ADR Realization Coverage:   ${connectedAdrs} / ${totalAdrs} ADRs specified by features (${adrCoveragePct}%)`);
console.log(`  • Feature Tripartite Health:  ${fullyLinkedFeatures} / ${totalFeatures} features fully linked (${featHealthPct}%)`);
console.log(`  • Test Verification Links:    ${testFiles.length - unreferencedTests.length} / ${testFiles.length} tests covered`);

if (brokenRefs.length > 0) {
  console.log(`\n❌ Broken Path References (${brokenRefs.length}):`);
  for (const b of brokenRefs) {
    console.log(`  • ${b.file} -> ${b.tag} (file does not exist!)`);
  }
}

if (disconnectedAdrs.length > 0) {
  console.log(`\n🟣 Disconnected ADRs (unrealized / missing specifying .feature) (${disconnectedAdrs.length}):`);
  for (const adr of disconnectedAdrs) {
    console.log(`  • ${adr}`);
  }
}

if (unanchoredFeatures.length > 0) {
  console.log(`\n🔴 Unanchored Features (missing governing ADR / @adr:<path>) (${unanchoredFeatures.length}):`);
  for (const f of unanchoredFeatures) {
    console.log(`  • ${f}`);
  }
}

if (uncoveredFeatures.length > 0) {
  console.log(`\n🟡 Uncovered Features (missing @covers:<path>) (${uncoveredFeatures.length}):`);
  for (const f of uncoveredFeatures) {
    console.log(`  • ${f}`);
  }
}

if (unreferencedTests.length > 0) {
  console.log(`\n🧪 Tests not explicitly referenced by a feature's @covers tag (${unreferencedTests.length}):`);
  for (const t of unreferencedTests) {
    console.log(`  • ${t}`);
  }
}

console.log(`\n======================================================================\n`);

if (isStrict && (disconnectedAdrs.length > 0 || unanchoredFeatures.length > 0 || brokenRefs.length > 0)) {
  console.error(`❌ Tripartite audit failed in --strict mode.`);
  process.exit(1);
}
