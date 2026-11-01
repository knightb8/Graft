import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SankeyView,
  computeSankeyColumns,
  orderBarsByBarycenter,
  countCrossings,
  computeBlastAttenuation,
  sortSankeyColumns,
  applyBlastScoresToRibbons,
  buildSankeyData,
  getNodeDirPath,
  getDirDepth,
  SankeySortOrder,
} from "../viewer/sankey.js";

// Helper to create a minimal DOM container mock for testing
function createMockContainer(width = 1200, height = 700) {
  const listeners = new Map<string, Function[]>();
  const elements = new Map<string, any>();

  const container: any = {
    clientWidth: width,
    clientHeight: height,
    innerHTML: "",
    style: {},
    addEventListener: (event: string, fn: Function) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(fn);
    },
    removeEventListener: (event: string, fn: Function) => {
      const list = listeners.get(event);
      if (list) {
        const idx = list.indexOf(fn);
        if (idx >= 0) list.splice(idx, 1);
      }
    },
    dispatchEvent: (event: any) => {
      const list = listeners.get(event.type);
      if (list) {
        for (const fn of list) fn(event);
      }
      return true;
    },
    querySelector: (sel: string) => {
      // Return a dummy interactive element if sel matches toolbar or svg
      if (sel.includes("input") || sel.includes("button") || sel.startsWith("#")) {
        return {
          addEventListener: () => {},
          value: "",
          checked: false,
          style: {},
          focus: () => {},
          setSelectionRange: () => {},
        };
      }
      return null;
    },
    querySelectorAll: (sel: string) => [],
  };

  return container;
}

test("Simple click immediately selects while right-click or ctrl-click opens contextual menu with expansion controls", async () => {
  const container = createMockContainer();
  const sankey = new SankeyView(container);

  const nodes = [
    { id: "src/graph/core.ts", sources: ["src/graph/core.ts"] },
    { id: "src/graph/layout.ts", sources: ["src/graph/layout.ts"] },
    { id: "test/viz-sigma.test.ts", sources: ["test/viz-sigma.test.ts"] },
  ];
  const edges = [
    { source: "test/viz-sigma.test.ts", target: "src/graph/core.ts", relation: "verifies" },
  ];

  sankey.setData(nodes, edges);
  sankey.collapsedDirs.add("src/graph");
  sankey.render();

  // Initially src/graph is collapsed
  assert.equal(sankey.isFolderExpanded("src/graph"), false, "src/graph should start collapsed");

  // Single click: immediately selects without delay
  sankey.handleBarClick("dir:code:src/graph");
  assert.ok(sankey.selectedBarIds, "Single click should select the bar");
  assert.ok(sankey.selectedBarIds.includes("src/graph/core.ts"), "Blast trace should target members");

  // Context menu items for folder bar
  const menuItems = sankey.getContextMenuItems("dir:code:src/graph");
  assert.ok(menuItems.length >= 4, "Context menu should offer multiple actions");
  const expandAction = menuItems.find((m) => m.id === "expand-folder");
  assert.ok(expandAction, "Context menu must include 'Expand Folder' action");

  // Executing the expand action expands the folder
  expandAction!.action();
  assert.equal(sankey.isFolderExpanded("src/graph"), true, "Menu expand action should expand the folder");
  assert.ok(sankey.selectedBarIds, "Selection should persist after menu expansion");

  // Context menu now reflects collapse action
  const expandedMenu = sankey.getContextMenuItems("dir:code:src/graph");
  const collapseAction = expandedMenu.find((m) => m.id === "collapse-folder");
  assert.ok(collapseAction, "Context menu should now offer 'Collapse Folder'");

  // Double click also toggles folder
  sankey.handleBarDoubleClick("dir:code:src/graph");
  assert.equal(sankey.isFolderExpanded("src/graph"), false, "Double click should collapse the folder back");
});

test("Progressive one-level drill-down compacts single-child directory chains", async () => {
  const nodes = [
    { id: "features/viz/core/galaxy-01.feature", sources: ["features/viz/core/galaxy-01.feature"] },
    { id: "features/viz/core/galaxy-02.feature", sources: ["features/viz/core/galaxy-02.feature"] },
    { id: "features/auth/login.feature", sources: ["features/auth/login.feature"] },
  ];
  const edges: any[] = [];

  // Initial state: root "features" is collapsed
  const expandedDirs = new Set<string>();
  const s0 = computeSankeyColumns(nodes, edges, new Set(), 1, expandedDirs);
  const featBars0 = s0.columns.features.bars;
  assert.equal(featBars0.length, 1, "Initially only root 'features' bar should be visible");
  assert.equal(featBars0[0].label, "features");

  // Expand root "features":
  // "features/viz" has single child "core" with no files -> should compact into "features/viz/core"
  // "features/auth" has file "login.feature" -> revealed as "features/auth"
  expandedDirs.add("features");
  const s1 = computeSankeyColumns(nodes, edges, new Set(), 1, expandedDirs);
  const featBars1 = s1.columns.features.bars;
  const labels1 = featBars1.map((b) => b.label).sort();

  // Only immediate child subdirectories revealed; single-child chain compacted
  assert.ok(
    labels1.includes("features/viz/core") || labels1.includes("viz/core"),
    `Single-child chain should compact into features/viz/core, got: ${JSON.stringify(labels1)}`,
  );
  // Leaf files must NOT flood the column yet
  assert.equal(
    featBars1.some((b) => b.id.includes("galaxy-01.feature")),
    false,
    "Leaf files should not flood the column when parent folder is collapsed",
  );

  // Subsequently expand subfolder bar "features/viz/core"
  expandedDirs.add("features/viz/core");
  const s2 = computeSankeyColumns(nodes, edges, new Set(), 1, expandedDirs);
  const featBars2 = s2.columns.features.bars;
  assert.ok(
    featBars2.some((b) => b.id === "features/viz/core/galaxy-01.feature"),
    "galaxy-01.feature should be revealed after expanding features/viz/core",
  );
  assert.ok(
    featBars2.some((b) => b.id === "features/viz/core/galaxy-02.feature"),
    "galaxy-02.feature should be revealed after expanding features/viz/core",
  );
});

test("Expanded child bars remain contiguous at the parent's vertical slot", async () => {
  const nodes = [
    { id: "src/alpha/a.ts", sources: ["src/alpha/a.ts"] },
    { id: "src/beta/b_heavy.ts", sources: ["src/beta/b_heavy.ts"] },
    { id: "src/beta/b_light.ts", sources: ["src/beta/b_light.ts"] },
    { id: "src/gamma/c.ts", sources: ["src/gamma/c.ts"] },
  ];
  // Assign heavy weight to b_heavy so weight-sorting would move it to top if not grouped
  const edges = [
    { source: "src/alpha/a.ts", target: "docs/a.md", relation: "documents" },
    { source: "src/beta/b_heavy.ts", target: "docs/b1.md", relation: "documents" },
    { source: "src/beta/b_heavy.ts", target: "docs/b2.md", relation: "documents" },
    { source: "src/beta/b_heavy.ts", target: "docs/b3.md", relation: "documents" },
    { source: "src/gamma/c.ts", target: "docs/c.md", relation: "documents" },
  ];

  // Start with src/alpha, src/beta, src/gamma as top-level folders
  const expandedDirs = new Set(["src"]);
  // Now expand src/beta, but keep src/alpha and src/gamma collapsed
  expandedDirs.add("src/beta");

  const s = computeSankeyColumns(nodes, edges, new Set(), 1, expandedDirs);
  const codeBars = s.columns.code.bars;

  // The bar order in the column must keep children of beta contiguous between alpha and gamma
  const barIds = codeBars.map((b) => b.id);
  const alphaIdx = barIds.findIndex((id) => id.includes("alpha"));
  const betaHeavyIdx = barIds.findIndex((id) => id.includes("b_heavy"));
  const betaLightIdx = barIds.findIndex((id) => id.includes("b_light"));
  const gammaIdx = barIds.findIndex((id) => id.includes("gamma"));

  assert.ok(alphaIdx >= 0 && betaHeavyIdx >= 0 && betaLightIdx >= 0 && gammaIdx >= 0);

  // Sibling children of beta must be contiguous: difference in their indices must be exactly 1
  assert.equal(
    Math.abs(betaHeavyIdx - betaLightIdx),
    1,
    `Sibling child bars must remain contiguous in the column, indices were ${betaHeavyIdx} and ${betaLightIdx}`,
  );

  // And the beta group must remain between alpha and gamma (or preserve parent's relative slot)
  const minBeta = Math.min(betaHeavyIdx, betaLightIdx);
  const maxBeta = Math.max(betaHeavyIdx, betaLightIdx);
  if (alphaIdx < gammaIdx) {
    assert.ok(alphaIdx < minBeta && maxBeta < gammaIdx, "Beta children must sit between alpha and gamma");
  } else {
    assert.ok(gammaIdx < minBeta && maxBeta < alphaIdx, "Beta children must sit between gamma and alpha");
  }
});

test("Scrollable stage columns preserve minimum bar heights under expansion", async () => {
  // Create 35 nodes in code stage
  const nodes: Array<{ id: string; sources: string[] }> = [];
  for (let i = 0; i < 35; i++) {
    nodes.push({ id: `src/mod_${i}.ts`, sources: [`src/mod_${i}.ts`] });
  }

  const container = createMockContainer(1000, 500); // 500px height total, usable height ~260px
  const sankey = new SankeyView(container);
  sankey.setData(nodes, []);

  // When rendered, bars should NOT be squashed below min height (>= 20px)
  const layout = sankey.getBarLayout();
  assert.ok(layout.size >= 35, "All bars should be laid out");

  for (const [id, bar] of layout.entries()) {
    assert.ok(
      bar.h >= 20,
      `Bar ${id} height (${bar.h}) must be >= 20px to prevent visual squashing`,
    );
  }

  // The total required SVG height should grow to accommodate all bars
  assert.ok(
    sankey.getComputedContentHeight() > 500,
    "Computed content height must grow beyond viewport height when bars exceed space",
  );
});

test("Barycenter sweeps minimize ribbon crossings between adjacent columns", async () => {
  // Construct a fixture where independent weight sorting causes ribbon crossings:
  // Features column: [F1, F2, F3]
  // Code column: [C1, C2, C3]
  // Edges: F1 -> C3, F2 -> C2, F3 -> C1
  const nodes = [
    { id: "features/f1.feature", sources: ["features/f1.feature"] },
    { id: "features/f2.feature", sources: ["features/f2.feature"] },
    { id: "features/f3.feature", sources: ["features/f3.feature"] },
    { id: "src/c1.ts", sources: ["src/c1.ts"] },
    { id: "src/c2.ts", sources: ["src/c2.ts"] },
    { id: "src/c3.ts", sources: ["src/c3.ts"] },
  ];
  const edges = [
    { source: "features/f1.feature", target: "src/c3.ts", relation: "covers" },
    { source: "features/f2.feature", target: "src/c2.ts", relation: "covers" },
    { source: "features/f3.feature", target: "src/c1.ts", relation: "covers" },
  ];

  const graph = computeSankeyColumns(nodes, edges);

  // Under un-optimized ordering [C1, C2, C3] with [F1, F2, F3], there are crossings
  const unoptimizedCrossings = countCrossings(graph.columns, graph.ribbons);

  // Apply barycenter crossing minimization
  const optimizedColumns = orderBarsByBarycenter(graph.columns, graph.ribbons);
  const optimizedCrossings = countCrossings(optimizedColumns, graph.ribbons);

  assert.ok(
    unoptimizedCrossings > 0,
    `Fixture must initially have ribbon crossings (had ${unoptimizedCrossings})`,
  );
  assert.ok(
    optimizedCrossings < unoptimizedCrossings,
    `Barycenter sweeps must reduce crossings from ${unoptimizedCrossings} (got ${optimizedCrossings})`,
  );
  assert.equal(optimizedCrossings, 0, "Crossing minimization should eliminate all invertible crossings on this fixture");
});

test("State pruning removes stale offsets and isolates view state across graphs", async () => {
  const container = createMockContainer();
  const sankey = new SankeyView(container);

  const nodes = [
    { id: "src/graph/core.ts", sources: ["src/graph/core.ts"] },
    { id: "src/graph/layout.ts", sources: ["src/graph/layout.ts"] },
  ];
  sankey.setData(nodes, []);

  // Set drag offset on a valid bar and on a stale bar
  sankey.barOffsets.set("src/graph/core.ts", { dx: 10, dy: 20 });
  sankey.barOffsets.set("src/removed/module.ts", { dx: 50, dy: 50 });
  sankey.hoveredBarId = "src/removed/module.ts";

  // Prune state
  sankey.pruneStaleState();

  assert.ok(sankey.barOffsets.has("src/graph/core.ts"), "Active bar offset should be preserved");
  assert.equal(sankey.barOffsets.has("src/removed/module.ts"), false, "Stale bar offset must be pruned");
  assert.equal(sankey.hoveredBarId, null, "Stale hoveredBarId must be cleared");

  // Reset isolates view state across graphs
  sankey.expandedDirs.add("src/graph");
  sankey.reset();

  assert.equal(sankey.barOffsets.size, 0, "barOffsets must be cleared on reset");
  assert.equal(sankey.colOffsets.size, 0, "colOffsets must be cleared on reset");
  assert.equal(sankey.expandedDirs.size, 0, "expandedDirs must be cleared on reset");
  assert.equal(sankey.collapsedDirs.size, 0, "collapsedDirs must be cleared on reset");
  assert.equal(sankey.selectedId, null, "selectedId must be cleared on reset");
  assert.equal(sankey.selectedBarIds, null, "selectedBarIds must be cleared on reset");
});

test("Directional blast step transitions match canonical RELATIONS registry rules", async () => {
  const { RELATIONS } = await import("../viewer/relations.js");
  const { evaluateDirectionalBlastStep } = await import("../viewer/sankey-engine.js");

  // 1. Governance: influences
  const infFwd = evaluateDirectionalBlastStep("influences", "forward", "SEED");
  const infDef = RELATIONS.influences.blast.forward("SEED");
  assert.equal(infFwd.weight, infDef.weight);
  assert.equal(infFwd.nextPhase, infDef.nextPhase);

  // 2. Verification: verifies reverse
  const verRev = evaluateDirectionalBlastStep("verifies", "reverse", "SEED");
  const verDef = RELATIONS.verifies.blast.reverse("SEED");
  assert.equal(verRev.weight, verDef.weight);
  assert.equal(verRev.nextPhase, verDef.nextPhase);

  // 3. Specification: covers forward
  const covFwd = evaluateDirectionalBlastStep("covers", "forward", "SEED");
  const covDef = RELATIONS.covers.blast.forward("SEED");
  assert.equal(covFwd.weight, covDef.weight);
  assert.equal(covFwd.nextPhase, covDef.nextPhase);

  // 4. Dependency: uses forward
  const usesFwd = evaluateDirectionalBlastStep("uses", "forward", "SEED");
  const usesDef = RELATIONS.uses.blast.forward("SEED");
  assert.equal(usesFwd.weight, usesDef.weight);
  assert.equal(usesFwd.nextPhase, usesDef.nextPhase);

  // 5. Causal Collider Zero-Decay check
  const colliderRev = evaluateDirectionalBlastStep("uses", "reverse", "DEP_PREREQ");
  assert.equal(colliderRev.weight, 0.0);
  assert.equal(colliderRev.nextPhase, "LEAF_SINK");
});

test("Blast trace propagates consistently upstream from tests through code to specs and downstream from specs through code to tests", async () => {
  const nodes = [
    { id: "docs/adr/0001-auth.md", type: "adr", sources: ["docs/adr/0001-auth.md"] },
    { id: "features/auth/login.feature", type: "feature", sources: ["features/auth/login.feature"] },
    { id: "src/auth/service.ts", type: "code", sources: ["src/auth/service.ts"] },
    { id: "test/auth/service.test.ts", type: "test", sources: ["test/auth/service.test.ts"] },
    { id: "src/unrelated/logger.ts", type: "code", sources: ["src/unrelated/logger.ts"] },
  ];
  const edges = [
    { source: "docs/adr/0001-auth.md", target: "features/auth/login.feature", relation: "influences" },
    { source: "features/auth/login.feature", target: "src/auth/service.ts", relation: "covers" },
    { source: "test/auth/service.test.ts", target: "src/auth/service.ts", relation: "uses" },
    { source: "src/unrelated/logger.ts", target: "src/auth/service.ts", relation: "uses" },
  ];

  // Upstream: selecting Test propagates upstream through Code to Spec and ADR
  const upBlast = computeBlastAttenuation(["test/auth/service.test.ts"], nodes, edges);
  assert.ok(upBlast.nodes.has("test/auth/service.test.ts"), "Test is seed");
  assert.equal(upBlast.nodes.get("test/auth/service.test.ts")!.phase, "SEED");
  assert.ok(upBlast.nodes.has("src/auth/service.ts"), "Code reached as DEP_PREREQ");
  assert.equal(upBlast.nodes.get("src/auth/service.ts")!.phase, "DEP_PREREQ");
  assert.ok(upBlast.nodes.has("features/auth/login.feature"), "Spec reached as UP_PROVENANCE");
  assert.equal(upBlast.nodes.get("features/auth/login.feature")!.phase, "UP_PROVENANCE");
  assert.ok(upBlast.nodes.has("docs/adr/0001-auth.md"), "ADR reached as UP_PROVENANCE");
  assert.equal(upBlast.nodes.get("docs/adr/0001-auth.md")!.phase, "UP_PROVENANCE");

  // Collider: unrelated logger that also uses auth service must NOT be reached
  assert.equal(upBlast.nodes.has("src/unrelated/logger.ts"), false, "Causal collider blocks reverse uses from DEP_PREREQ");

  // Active edges must only illuminate the causal path
  assert.ok(upBlast.activeEdges.has("test/auth/service.test.ts->src/auth/service.ts"));
  assert.ok(upBlast.activeEdges.has("src/auth/service.ts->features/auth/login.feature"));
  assert.ok(upBlast.activeEdges.has("features/auth/login.feature->docs/adr/0001-auth.md"));
  assert.equal(upBlast.activeEdges.has("src/auth/service.ts->src/unrelated/logger.ts"), false);

  // Downstream: selecting Spec propagates downstream through Code to Test
  const downBlast = computeBlastAttenuation(["features/auth/login.feature"], nodes, edges);
  assert.ok(downBlast.nodes.has("features/auth/login.feature"), "Spec is seed");
  assert.ok(downBlast.nodes.has("src/auth/service.ts"), "Code reached as DOWN_REALIZE");
  assert.equal(downBlast.nodes.get("src/auth/service.ts")!.phase, "DOWN_REALIZE");
  assert.ok(downBlast.nodes.has("test/auth/service.test.ts"), "Test reached as LEAF_SINK");
  assert.equal(downBlast.nodes.get("test/auth/service.test.ts")!.phase, "LEAF_SINK");

  // Ribbon active blast edge filtering
  const graph = computeSankeyColumns(nodes, edges);
  applyBlastScoresToRibbons(graph.ribbons, graph.columns, upBlast);
  for (const r of graph.ribbons) {
    const isAuthPath =
      (r.sourceBarId.includes("auth") && r.targetBarId.includes("auth")) ||
      (r.sourceBarId.includes("adr") && r.targetBarId.includes("auth"));
    if (isAuthPath) {
      assert.equal(r.inLineage, true, `Ribbon ${r.sourceBarId} -> ${r.targetBarId} must be active`);
    } else {
      assert.equal(r.inLineage, false, `Unrelated ribbon ${r.sourceBarId} -> ${r.targetBarId} must stay dimmed`);
    }
  }
});

test("Directory hierarchy remains intact per column with collapsible parent folder headers and contiguous children", async () => {
  const nodes = [
    { id: "src/parser/ast.ts", sources: ["src/parser/ast.ts"] },
    { id: "src/parser/lexer.ts", sources: ["src/parser/lexer.ts"] },
    { id: "src/parser/tokens.ts", sources: ["src/parser/tokens.ts"] },
    { id: "src/net/client.ts", sources: ["src/net/client.ts"] },
    { id: "src/net/server.ts", sources: ["src/net/server.ts"] },
  ];
  const edges: any[] = [];

  // Expanded directory: src and src/parser
  const expandedDirs = new Set(["src", "src/parser"]);
  const graph = computeSankeyColumns(nodes, edges, new Set(), 1, expandedDirs);
  const codeBars = graph.columns.code.bars;

  // 1. Collapsible parent header bar for src/parser exists
  const parserHeader = codeBars.find((b) => b.id === "dir:code:src/parser");
  assert.ok(parserHeader, "Parent folder header bar for src/parser must exist");
  assert.equal(parserHeader.isGroup, true);
  assert.equal(parserHeader.isExpandedHeader, true);
  assert.equal(parserHeader.dirPath, "src/parser");
  assert.equal(parserHeader.parentDir, "src");

  // 2. Immediate children of src/parser appear contiguously right after header
  const headerIdx = codeBars.indexOf(parserHeader);
  const astIdx = codeBars.findIndex((b) => b.id === "src/parser/ast.ts");
  const lexerIdx = codeBars.findIndex((b) => b.id === "src/parser/lexer.ts");
  const tokensIdx = codeBars.findIndex((b) => b.id === "src/parser/tokens.ts");

  assert.ok(astIdx > headerIdx && lexerIdx > headerIdx && tokensIdx > headerIdx);
  const childIndices = [astIdx, lexerIdx, tokensIdx].sort((a, b) => a - b);
  assert.equal(childIndices[0], headerIdx + 1, "First child must follow header immediately");
  assert.equal(childIndices[1], headerIdx + 2, "Second child must be contiguous");
  assert.equal(childIndices[2], headerIdx + 3, "Third child must be contiguous");

  // 3. Child bars carry depth higher than header depth
  assert.ok(codeBars[astIdx].depth! > parserHeader.depth!, "Child bars must carry indented depth");

  // 4. Collapsed sibling folder src/net remains grouped as folder
  const netBar = codeBars.find((b) => b.id === "dir:code:src/net");
  assert.ok(netBar, "Collapsed sibling folder src/net must be present");
  assert.equal(netBar.isGroup, true);
  assert.equal(netBar.isExpandedHeader, false);

  // 5. Flat mode also populates parentDir and depth on all bars
  const flatGraph = computeSankeyColumns(nodes, edges);
  for (const bar of flatGraph.columns.code.bars) {
    assert.ok(bar.parentDir !== undefined, `Flat bar ${bar.id} must have parentDir`);
    assert.ok(bar.depth !== undefined, `Flat bar ${bar.id} must have depth`);
  }
});

test("Columns support sorting by barycenter flow, directory tree hierarchy, alphabetical name, and coupling weight", async () => {
  const nodes = [
    { id: "src/zebra/z1.ts", sources: ["src/zebra/z1.ts"] },
    { id: "src/zebra/z2.ts", sources: ["src/zebra/z2.ts"] },
    { id: "src/alpha/a1.ts", sources: ["src/alpha/a1.ts"] },
    { id: "src/alpha/a2.ts", sources: ["src/alpha/a2.ts"] },
    { id: "src/beta/b1.ts", sources: ["src/beta/b1.ts"] },
  ];
  // Assign heavy edges to zebra/z2 and alpha/a1
  const edges = [
    { source: "src/alpha/a1.ts", target: "docs/d1.md", relation: "documents" },
    { source: "src/alpha/a1.ts", target: "docs/d2.md", relation: "documents" },
    { source: "src/alpha/a1.ts", target: "docs/d3.md", relation: "documents" },
    { source: "src/alpha/a1.ts", target: "docs/d4.md", relation: "documents" },
    { source: "src/alpha/a1.ts", target: "docs/d5.md", relation: "documents" },
    { source: "src/alpha/a2.ts", target: "docs/d6.md", relation: "documents" },
    { source: "src/zebra/z2.ts", target: "docs/d7.md", relation: "documents" },
    { source: "src/zebra/z2.ts", target: "docs/d8.md", relation: "documents" },
    { source: "src/zebra/z2.ts", target: "docs/d9.md", relation: "documents" },
  ];

  const expandedDirs = new Set(["src", "src/alpha", "src/zebra"]);

  // Test 1: Name sort order (A-Z)
  const nameData = buildSankeyData(nodes, edges, { expandedDirs, sortOrder: "name" });
  const nameLabels = nameData.columns.code.bars.map((b) => b.label);
  const alphaHeaderIdx = nameLabels.findIndex((l) => l.includes("alpha"));
  const betaIdx = nameLabels.findIndex((l) => l.includes("beta"));
  const zebraHeaderIdx = nameLabels.findIndex((l) => l.includes("zebra"));
  assert.ok(alphaHeaderIdx < betaIdx && betaIdx < zebraHeaderIdx, "Directory groups must sort alphabetically A-Z");

  // Inside alpha: a1 before a2
  const a1Idx = nameLabels.findIndex((l) => l === "a1.ts");
  const a2Idx = nameLabels.findIndex((l) => l === "a2.ts");
  assert.ok(a1Idx < a2Idx, "Sibling files in alpha must sort A-Z");

  // Test 2: Weight sort order (descending)
  const weightData = buildSankeyData(nodes, edges, { expandedDirs, sortOrder: "weight" });
  const weightBars = weightData.columns.code.bars;
  const wAlpha = weightBars.findIndex((b) => b.label.includes("alpha"));
  const wZebra = weightBars.findIndex((b) => b.label.includes("zebra"));
  assert.ok(wAlpha < wZebra, "Alpha (higher weight) must precede Zebra");

  // Test 3: Hierarchy sort order (path-based)
  const hierData = buildSankeyData(nodes, edges, { expandedDirs, sortOrder: "hierarchy" });
  const hierBars = hierData.columns.code.bars;
  const hAlpha = hierBars.findIndex((b) => b.label.includes("alpha"));
  const hZebra = hierBars.findIndex((b) => b.label.includes("zebra"));
  assert.ok(hAlpha < hZebra, "Hierarchy order must preserve path lexicographical order");

  // Invariant across all sort orders: sibling bars remain contiguous
  for (const sOrder of ["name", "weight", "hierarchy", "barycenter"] as SankeySortOrder[]) {
    const data = buildSankeyData(nodes, edges, { expandedDirs, sortOrder: sOrder });
    const barIds = data.columns.code.bars.map((b) => b.id);
    const z1 = barIds.indexOf("src/zebra/z1.ts");
    const z2 = barIds.indexOf("src/zebra/z2.ts");
    assert.equal(Math.abs(z1 - z2), 1, `Children of zebra must remain contiguous under sort order "${sOrder}"`);
    const a1 = barIds.indexOf("src/alpha/a1.ts");
    const a2 = barIds.indexOf("src/alpha/a2.ts");
    assert.equal(Math.abs(a1 - a2), 1, `Children of alpha must remain contiguous under sort order "${sOrder}"`);
  }
});

test("Bars and columns remain in fixed layout slots without freeform node dragging and click selection is immediate", async () => {
  const container = createMockContainer();
  const sankey = new SankeyView(container);
  const nodes = [
    { id: "src/core/main.ts", sources: ["src/core/main.ts"] },
    { id: "src/core/util.ts", sources: ["src/core/util.ts"] },
  ];
  sankey.setData(nodes, []);

  // Single click immediately selects bar without 320ms timer interference
  sankey.handleBarClick("src/core/main.ts");
  assert.equal(sankey.selectedId, "src/core/main.ts");
  assert.deepEqual(sankey.selectedBarIds, ["src/core/main.ts"]);

  // Clicking again immediately deselects
  sankey.handleBarClick("src/core/main.ts");
  assert.equal(sankey.selectedId, null);
  assert.equal(sankey.selectedBarIds, null);

  // Sorting order change updates sortOrder property
  sankey.sortOrder = "name";
  sankey.rebuild();
  assert.equal(sankey.sortOrder, "name");

  const layout = sankey.getBarLayout().get("src/core/main.ts")!;
  assert.ok(layout, "Bar layout must be computed");
  assert.equal(typeof layout.x, "number", "Bar horizontal position must be computed");
  assert.equal(typeof layout.y, "number", "Bar vertical position must be computed");
});
