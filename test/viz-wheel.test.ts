import test from "node:test";
import assert from "node:assert/strict";

class MockElement {
  public tagName: string;
  public style: Record<string, any> = {};
  public classList = {
    classes: new Set<string>(),
    add: (c: string) => this.classList.classes.add(c),
    remove: (c: string) => this.classList.classes.delete(c),
    toggle: (c: string, force?: boolean) => {
      if (force === true) this.classList.classes.add(c);
      else if (force === false) this.classList.classes.delete(c);
      else if (this.classList.classes.has(c)) this.classList.classes.delete(c);
      else this.classList.classes.add(c);
    },
    contains: (c: string) => this.classList.classes.has(c),
  };
  public innerHTML = "";
  public clientWidth = 1000;
  public clientHeight = 800;
  private listeners: Record<string, Function[]> = {};

  constructor(tagName = "div") {
    this.tagName = tagName;
  }

  addEventListener(event: string, fn: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  removeEventListener(event: string, fn: Function) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter((f) => f !== fn);
  }

  dispatchEvent(event: { type: string; target?: any }) {
    event.target = event.target || this;
    const list = this.listeners[event.type] || [];
    for (const fn of list) fn(event);
  }

  querySelector(sel: string): any {
    return null;
  }

  querySelectorAll(sel: string): any[] {
    return [];
  }

  closest(sel: string): any {
    return null;
  }
}

if (typeof (globalThis as any).document === "undefined") {
  (globalThis as any).document = {
    createElement: (tag: string) => new MockElement(tag),
  };
}

test("computeWheelModel divides circumference into 5 Tripartite sectors with interior chords", async () => {
  const { computeWheelModel } = await import("../viewer/wheel-view.js");

  const nodes = [
    { id: "docs/adr/0001-init.md", name: "0001-init.md", type: "adr" },
    { id: "features/login.feature", name: "login.feature", type: "feature" },
    { id: "src/auth.ts", name: "auth.ts", type: "file" },
    { id: "test/auth.test.ts", name: "auth.test.ts", type: "test" },
    { id: "docs/guide.md", name: "guide.md", type: "doc" },
  ];

  const edges = [
    { source: "docs/adr/0001-init.md", target: "src/auth.ts", relation: "governs" },
    { source: "features/login.feature", target: "src/auth.ts", relation: "covers" },
    { source: "test/auth.test.ts", target: "src/auth.ts", relation: "verifies" },
    { source: "docs/guide.md", target: "src/auth.ts", relation: "documents" },
  ];

  const model = computeWheelModel(nodes, edges, { width: 1000, height: 800 });

  // 1. Center & Radii
  assert.equal(model.cx, 500);
  assert.equal(model.cy, 400);
  assert.ok(model.outerRadius > 200, "Must have valid outer radius");
  assert.ok(model.innerRadius < model.outerRadius, "Inner radius must be smaller than outer radius");

  // 2. Sectors: 5 Tripartite categories
  assert.equal(model.sectors.length, 5);
  const stages = model.sectors.map((s) => s.stage);
  assert.deepEqual(stages.sort(), ["adrs", "code", "docs", "features", "tests"].sort());

  // Check sector angles cover the circle
  for (const s of model.sectors) {
    assert.ok(s.endAngle > s.startAngle, `Sector ${s.stage} end angle must exceed start angle`);
    assert.ok(s.color.length > 0, "Sector must have color");
  }

  // 3. Interior chords
  assert.equal(model.chords.length, 4);
  for (const chord of model.chords) {
    assert.ok(chord.sourceNode.id.length > 0);
    assert.ok(chord.targetNode.id.length > 0);
    assert.equal(typeof chord.x1, "number");
    assert.equal(typeof chord.y1, "number");
    assert.equal(typeof chord.x2, "number");
    assert.equal(typeof chord.y2, "number");
    assert.equal(typeof chord.cpx, "number");
    assert.equal(typeof chord.cpy, "number");
  }
});

test("WheelView renders into DOM and illuminates connected chords on node selection", async () => {
  const { WheelView } = await import("../viewer/wheel-view.js");

  const mockContainer = new MockElement("div") as any;
  const view = new WheelView(mockContainer);

  const nodes = [
    { id: "docs/adr/0001-init.md", name: "0001-init.md", type: "adr" },
    { id: "src/auth.ts", name: "auth.ts", type: "file" },
    { id: "test/auth.test.ts", name: "auth.test.ts", type: "test" },
  ];
  const edges = [
    { source: "docs/adr/0001-init.md", target: "src/auth.ts", relation: "governs" },
    { source: "test/auth.test.ts", target: "src/auth.ts", relation: "verifies" },
  ];

  let selectedId: string | null = null;
  view.onSelect = (id) => {
    selectedId = id;
  };

  view.setData(nodes, edges);
  assert.ok(mockContainer.innerHTML.includes("wheel-svg"));
  assert.ok(mockContainer.innerHTML.includes("wheel-sector"));
  assert.ok(mockContainer.innerHTML.includes("wheel-chord"));

  // Select node
  view.selectNode("src/auth.ts");
  assert.equal(selectedId, "src/auth.ts");
  assert.equal(view.selectedNodeId, "src/auth.ts");
  assert.ok(mockContainer.innerHTML.includes("chord-illuminated"));
});

test("computeWheelModel supports Module, File, and Symbol depth granularities with chord aggregation", async () => {
  const { computeWheelModel } = await import("../viewer/wheel-view.js");

  const nodes = [
    { id: "src/graph/extract.ts#parseAst", name: "parseAst", type: "function", sources: ["src/graph/extract.ts"] },
    { id: "src/graph/extract.ts#extractSymbols", name: "extractSymbols", type: "function", sources: ["src/graph/extract.ts"] },
    { id: "src/mcp/tools.ts#handleCall", name: "handleCall", type: "function", sources: ["src/mcp/tools.ts"] },
    { id: "src/mcp/tools.ts#listTools", name: "listTools", type: "function", sources: ["src/mcp/tools.ts"] },
  ];

  const edges = [
    { source: "src/mcp/tools.ts#handleCall", target: "src/graph/extract.ts#parseAst", relation: "calls" },
    { source: "src/mcp/tools.ts#listTools", target: "src/graph/extract.ts#extractSymbols", relation: "calls" },
  ];

  // 1. Symbol depth: 4 distinct nodes, 2 chords
  const symModel = computeWheelModel(nodes, edges, { depth: "symbol" });
  assert.equal(symModel.depth, "symbol");
  const codeSecSym = symModel.sectors.find((s) => s.stage === "code")!;
  assert.equal(codeSecSym.nodes.length, 4);
  assert.equal(symModel.chords.length, 2);

  // 2. File depth: 2 files (extract.ts, tools.ts), 1 aggregated chord with weight 2
  const fileModel = computeWheelModel(nodes, edges, { depth: "file" });
  assert.equal(fileModel.depth, "file");
  const codeSecFile = fileModel.sectors.find((s) => s.stage === "code")!;
  assert.equal(codeSecFile.nodes.length, 2);
  assert.equal(fileModel.chords.length, 1);
  assert.equal(fileModel.chords[0].weight, 2);

  // 3. Module depth: 2 modules (src/graph, src/mcp), 1 aggregated chord with weight 2
  const modModel = computeWheelModel(nodes, edges, { depth: "module" });
  assert.equal(modModel.depth, "module");
  const codeSecMod = modModel.sectors.find((s) => s.stage === "code")!;
  assert.equal(codeSecMod.nodes.length, 2);
  assert.ok(codeSecMod.nodes.some((n) => n.id === "mod:src/graph" && n.isModule));
  assert.ok(codeSecMod.nodes.some((n) => n.id === "mod:src/mcp" && n.isModule));
  assert.equal(modModel.chords.length, 1);
  assert.equal(modModel.chords[0].weight, 2);
});

test("computeWheelModel in-place drill-down expands module into constituent child files", async () => {
  const { computeWheelModel } = await import("../viewer/wheel-view.js");

  const nodes = [
    { id: "src/graph/extract.ts", name: "extract.ts", type: "file", sources: ["src/graph/extract.ts"] },
    { id: "src/graph/native.ts", name: "native.ts", type: "file", sources: ["src/graph/native.ts"] },
    { id: "src/mcp/tools.ts", name: "tools.ts", type: "file", sources: ["src/mcp/tools.ts"] },
  ];

  const edges = [
    { source: "src/mcp/tools.ts", target: "src/graph/extract.ts", relation: "uses" },
    { source: "src/mcp/tools.ts", target: "src/graph/native.ts", relation: "uses" },
  ];

  // At module depth with drilldownModule = "src/graph"
  const drilledModel = computeWheelModel(nodes, edges, {
    depth: "module",
    drilldownModule: "src/graph",
  });

  assert.equal(drilledModel.drilldownModule, "src/graph");
  const codeSec = drilledModel.sectors.find((s) => s.stage === "code")!;

  // "src/mcp" is still a macro module, but "src/graph" is expanded into its 2 child files!
  assert.ok(codeSec.nodes.some((n) => n.id === "mod:src/mcp" && n.isModule));
  assert.ok(codeSec.nodes.some((n) => n.id === "src/graph/extract.ts" && n.isDrilldownChild));
  assert.ok(codeSec.nodes.some((n) => n.id === "src/graph/native.ts" && n.isDrilldownChild));
});

test("Hierarchical Edge Bundling routes cubic Béziers through radial corridors when enabled and quadratic curves when disabled", async () => {
  const { computeWheelModel } = await import("../viewer/wheel-view.js");

  const nodes = [
    { id: "src/app.ts", name: "app.ts", type: "file" },
    { id: "features/app.feature", name: "app.feature", type: "feature" },
  ];
  const edges = [
    { source: "features/app.feature", target: "src/app.ts", relation: "covers" },
  ];

  // Bundling ON (default): cubic Bézier curve "C"
  const bundledModel = computeWheelModel(nodes, edges, { bundleChords: true });
  assert.equal(bundledModel.bundleChords, true);
  assert.equal(bundledModel.chords.length, 1);
  assert.equal(bundledModel.chords[0].bundled, true);
  assert.ok(bundledModel.chords[0].pathD.includes(" C "), "Bundled chord must use cubic Bézier 'C' path");

  // Bundling OFF: direct quadratic Bézier curve "Q"
  const directModel = computeWheelModel(nodes, edges, { bundleChords: false });
  assert.equal(directModel.bundleChords, false);
  assert.equal(directModel.chords.length, 1);
  assert.equal(directModel.chords[0].bundled, false);
  assert.ok(directModel.chords[0].pathD.includes(" Q "), "Direct chord must use quadratic Bézier 'Q' path");
});

test("WheelView controls depth, bundle toggle, and drilldown through UI methods", async () => {
  const { WheelView } = await import("../viewer/wheel-view.js");

  const mockContainer = new MockElement("div") as any;
  const view = new WheelView(mockContainer);

  const nodes = [
    { id: "src/graph/extract.ts", name: "extract.ts", type: "file", sources: ["src/graph/extract.ts"] },
    { id: "src/graph/native.ts", name: "native.ts", type: "file", sources: ["src/graph/native.ts"] },
    { id: "src/mcp/tools.ts", name: "tools.ts", type: "file", sources: ["src/mcp/tools.ts"] },
  ];
  const edges = [
    { source: "src/mcp/tools.ts", target: "src/graph/extract.ts", relation: "uses" },
  ];

  view.setData(nodes, edges);
  assert.equal(view.depth, "file");
  assert.equal(view.bundleChords, true);

  // Switch depth
  view.setDepth("module");
  assert.equal(view.depth, "module");
  assert.ok(mockContainer.innerHTML.includes("📦 Module"));

  // Toggle bundling
  view.toggleBundle();
  assert.equal(view.bundleChords, false);

  // Set drilldown
  view.setDrilldown("src/graph");
  assert.equal(view.drilldownModule, "src/graph");
  assert.ok(mockContainer.innerHTML.includes("Zoom: <strong>src/graph</strong>"));
});

