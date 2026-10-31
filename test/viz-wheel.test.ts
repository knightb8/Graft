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
