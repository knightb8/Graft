import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SankeyView,
  computeSankeyColumns,
  orderBarsByBarycenter,
  countCrossings,
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
