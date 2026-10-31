import test from "node:test";
import assert from "node:assert/strict";

// Mock minimal DOM environment if running in pure Node.js
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
  public clientWidth = 1200;
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

  dispatchEvent(event: { type: string; target?: any; preventDefault?: Function; stopPropagation?: Function }) {
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

test("FishboneView partitions causal nodes into Tripartite ribs with head on the left", async () => {
  const { FishboneView, computeFishboneModel } = await import("../viewer/fishbone-view.js");

  const nodes = [
    { id: "src/auth.ts", name: "auth.ts", type: "file", sources: ["src/auth.ts · 1-10"] },
    { id: "docs/adr/0001-init.md", name: "0001-init.md", type: "adr", sources: ["docs/adr/0001-init.md · 1-10"] },
    { id: "features/auth.feature", name: "auth.feature", type: "feature", sources: ["features/auth.feature · 1-10"] },
    { id: "src/crypto.ts", name: "crypto.ts", type: "file", sources: ["src/crypto.ts · 1-10"] },
    { id: "test/auth.test.ts", name: "auth.test.ts", type: "test", sources: ["test/auth.test.ts · 1-10"] },
    { id: "docs/security.md", name: "security.md", type: "doc", sources: ["docs/security.md · 1-10"] },
  ];

  const edges = [
    { source: "docs/adr/0001-init.md", target: "src/auth.ts", relation: "governs" },
    { source: "features/auth.feature", target: "src/auth.ts", relation: "covers" },
    { source: "src/auth.ts", target: "src/crypto.ts", relation: "uses" },
    { source: "test/auth.test.ts", target: "src/auth.ts", relation: "verifies" },
    { source: "docs/security.md", target: "src/auth.ts", relation: "documents" },
  ];

  const model = computeFishboneModel("src/auth.ts", nodes, edges, {
    width: 1200,
    height: 800,
  });

  // 1. Head should be anchored on the left
  assert.equal(model.head.id, "src/auth.ts");
  assert.ok(model.head.x < 300, `Head x (${model.head.x}) should be anchored on the left`);
  assert.equal(model.head.y, 400); // Centered vertically

  // 2. Central horizontal spine must extend to the right
  assert.equal(model.spine.y1, 400);
  assert.equal(model.spine.y2, 400);
  assert.ok(model.spine.x2 > model.spine.x1, "Spine must run from left to right");

  // 3. Ribs must be grouped into Tripartite stages
  const ribStages = model.ribs.map((r) => r.stage);
  assert.ok(ribStages.includes("adrs"), "Must have an ADRs rib");
  assert.ok(ribStages.includes("features"), "Must have a Features rib");
  assert.ok(ribStages.includes("tests"), "Must have a Tests rib");
  assert.ok(ribStages.includes("docs"), "Must have a Docs rib");
  assert.ok(ribStages.includes("code"), "Must have a Code rib");

  // 4. Rib angles: Top ribs angle up-and-right, bottom ribs angle down-and-right
  for (const rib of model.ribs) {
    if (rib.side === "top") {
      assert.ok(rib.tipY < rib.junctionY, `Top rib tip (${rib.tipY}) should be above junction (${rib.junctionY})`);
      assert.ok(rib.tipX > rib.junctionX, `Top rib tip (${rib.tipX}) should be to the right of junction (${rib.junctionX})`);
    } else {
      assert.ok(rib.tipY > rib.junctionY, `Bottom rib tip (${rib.tipY}) should be below junction (${rib.junctionY})`);
      assert.ok(rib.tipX > rib.junctionX, `Bottom rib tip (${rib.tipX}) should be to the right of junction (${rib.junctionX})`);
    }

    // 5. Sub-bones must extend horizontally to the right
    for (const bone of rib.subBones) {
      assert.equal(bone.y1, bone.y2, "Sub-bone must be horizontal");
      assert.ok(bone.x2 > bone.x1, `Sub-bone must extend to the right (x1=${bone.x1}, x2=${bone.x2})`);
      assert.ok(bone.node.id.length > 0, "Sub-bone must hold a valid node");
    }
  }
});

test("FishboneView renders into DOM container and supports click re-rooting", async () => {
  const { FishboneView } = await import("../viewer/fishbone-view.js");

  const mockContainer = new MockElement("div") as any;
  const view = new FishboneView(mockContainer);

  const nodes = [
    { id: "src/core.ts", name: "core.ts", type: "file" },
    { id: "docs/adr/0001-init.md", name: "0001-init.md", type: "adr" },
    { id: "test/core.test.ts", name: "core.test.ts", type: "test" },
  ];
  const edges = [
    { source: "docs/adr/0001-init.md", target: "src/core.ts", relation: "governs" },
    { source: "test/core.test.ts", target: "src/core.ts", relation: "verifies" },
  ];

  let selectedTarget: string | null = null;
  view.onSelect = (id) => {
    selectedTarget = id;
  };

  // 1. Initial render with core.ts
  view.setData(nodes, edges, "src/core.ts");
  assert.ok(mockContainer.innerHTML.includes("fishbone-svg"));
  assert.ok(mockContainer.innerHTML.includes("core.ts"));
  assert.ok(mockContainer.innerHTML.includes("0001-init.md"));

  // 2. Click re-rooting: select docs/adr/0001-init.md
  view.selectNode("docs/adr/0001-init.md");
  assert.equal(selectedTarget, "docs/adr/0001-init.md");
  assert.equal(view.selectedNodeId, "docs/adr/0001-init.md");

  // 3. Empty state when no node selected
  view.setData(nodes, edges, null);
  assert.ok(mockContainer.innerHTML.includes("fishbone-empty") || mockContainer.innerHTML.includes("Select a node"));
});
