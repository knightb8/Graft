import { test } from "node:test";
import assert from "node:assert/strict";
import { SankeyView } from "../viewer/sankey.js";

interface MockElement {
  tagName: string;
  attrs: Map<string, string>;
  classes: Set<string>;
  style: Record<string, string>;
  parentElement: MockElement | null;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  classList: {
    add(c: string): void;
    remove(c: string): void;
    contains(c: string): boolean;
    toggle(c: string, force?: boolean): boolean;
  };
  addEventListener(event: string, fn: Function): void;
  removeEventListener(event: string, fn: Function): void;
  dispatchEvent(event: any): boolean;
  closest(selector: string): MockElement | null;
  setPointerCapture(id: number): void;
  releasePointerCapture(id: number): void;
}

function parseHTMLIntoElements(html: string): MockElement[] {
  const elements: MockElement[] = [];
  const tagRegex = /<([a-zA-Z0-9_-]+)([^>]*)>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(html)) !== null) {
    const tagName = match[1];
    const rawAttrs = match[2];
    const attrs = new Map<string, string>();
    const attrRegex = /([a-zA-Z0-9_-]+)(?:="([^"]*)")?/g;
    let aMatch: RegExpExecArray | null;
    while ((aMatch = attrRegex.exec(rawAttrs)) !== null) {
      attrs.set(aMatch[1], aMatch[2] !== undefined ? aMatch[2] : "");
    }

    const classStr = attrs.get("class") || "";
    const classes = new Set(classStr.split(/\s+/).filter(Boolean));
    const listeners = new Map<string, Function[]>();

    const el: MockElement = {
      tagName,
      attrs,
      classes,
      style: {},
      parentElement: null,
      getAttribute(k: string) {
        return attrs.get(k) ?? null;
      },
      setAttribute(k: string, v: string) {
        attrs.set(k, String(v));
      },
      classList: {
        add(c: string) {
          classes.add(c);
        },
        remove(c: string) {
          classes.delete(c);
        },
        contains(c: string) {
          return classes.has(c);
        },
        toggle(c: string, force?: boolean) {
          if (force !== undefined) {
            if (force) classes.add(c);
            else classes.delete(c);
            return force;
          }
          if (classes.has(c)) {
            classes.delete(c);
            return false;
          }
          classes.add(c);
          return true;
        },
      },
      addEventListener(evt: string, fn: Function) {
        if (!listeners.has(evt)) listeners.set(evt, []);
        listeners.get(evt)!.push(fn);
      },
      removeEventListener(evt: string, fn: Function) {
        const list = listeners.get(evt);
        if (list) {
          const idx = list.indexOf(fn);
          if (idx >= 0) list.splice(idx, 1);
        }
      },
      dispatchEvent(evt: any) {
        const list = listeners.get(evt.type) || [];
        for (const fn of list) {
          fn(evt);
        }
        return true;
      },
      closest(sel: string) {
        if (sel.startsWith(".")) {
          const cls = sel.slice(1);
          if (classes.has(cls)) return el;
        }
        if (tagName.toLowerCase() === sel.toLowerCase()) return el;
        return null;
      },
      setPointerCapture() {},
      releasePointerCapture() {},
    };

    elements.push(el);
  }

  return elements;
}

function createInteractiveContainer(width = 1200, height = 700) {
  let parsedElements: MockElement[] = [];
  let rawHtml = "";

  const container: any = {
    clientWidth: width,
    clientHeight: height,
    style: {},
    get innerHTML() {
      return rawHtml;
    },
    set innerHTML(html: string) {
      rawHtml = html;
      parsedElements = parseHTMLIntoElements(html);
    },
    querySelector(sel: string): MockElement | null {
      const results = container.querySelectorAll(sel);
      return results.length > 0 ? results[0] : null;
    },
    querySelectorAll(sel: string): MockElement[] {
      const selectors = sel.split(",").map((s) => s.trim());
      return parsedElements.filter((el) => {
        return selectors.some((s) => {
          if (s.startsWith("#")) {
            const id = s.slice(1);
            return el.getAttribute("id") === id;
          }
          if (s.startsWith(".")) {
            const cls = s.slice(1);
            return el.classList.contains(cls);
          }
          return el.tagName.toLowerCase() === s.toLowerCase();
        });
      });
    },
    addEventListener() {},
    removeEventListener() {},
  };

  return container;
}

test("Automated UI Test: Single-click immediately selects bubble and exposes Clear Blast Trace button", () => {
  const container = createInteractiveContainer();
  const sankey = new SankeyView(container);

  const nodes = [
    { id: "src/graph/core.ts", sources: ["src/graph/core.ts"] },
    { id: "src/graph/layout.ts", sources: ["src/graph/layout.ts"] },
    { id: "test/viz.test.ts", sources: ["test/viz.test.ts"] },
  ];
  const edges = [
    { source: "test/viz.test.ts", target: "src/graph/core.ts", relation: "verifies" },
  ];

  sankey.setData(nodes, edges);
  sankey.collapsedDirs.add("src/graph");
  sankey.render();

  // Initially nothing is selected and Clear Blast Trace button is absent
  assert.equal(sankey.selectedId, null);
  assert.equal(container.querySelector("#sankeyClearTrace"), null);

  // Find the folder bubble element
  const bars = container.querySelectorAll(".sankey-bar");
  const folderBar = bars.find((b) => b.getAttribute("data-bar-id") === "dir:code:src/graph");
  assert.ok(folderBar, "Expected to find .sankey-bar for dir:code:src/graph");

  // Dispatch pointerdown and pointerup (single click without movement)
  let stopped = false;
  folderBar.dispatchEvent({
    type: "pointerdown",
    button: 0,
    clientX: 100,
    clientY: 100,
    pointerId: 1,
    stopPropagation() { stopped = true; },
  });
  assert.equal(stopped, true, "pointerdown should stop propagation");

  folderBar.dispatchEvent({
    type: "pointerup",
    clientX: 100,
    clientY: 100,
    pointerId: 1,
    stopPropagation() {},
  });

  // Single click must immediately set selectedId and selectedBarIds
  assert.ok(sankey.selectedId, "Single click must set selectedId");
  assert.ok(sankey.selectedBarIds && sankey.selectedBarIds.length >= 2, "selectedBarIds must contain directory members");

  // Clear Blast Trace button must now be present in the toolbar
  const clearBtn = container.querySelector("#sankeyClearTrace");
  assert.ok(clearBtn, "Clear Blast Trace button must be rendered when blast trace is active");
});

test("Automated UI Test: Clear Blast Trace button clears selection and removes itself from DOM", () => {
  const container = createInteractiveContainer();
  const sankey = new SankeyView(container);

  const nodes = [
    { id: "src/graph/core.ts", sources: ["src/graph/core.ts"] },
    { id: "test/viz.test.ts", sources: ["test/viz.test.ts"] },
  ];
  const edges = [
    { source: "test/viz.test.ts", target: "src/graph/core.ts", relation: "verifies" },
  ];

  sankey.setData(nodes, edges);
  sankey.select("src/graph/core.ts");

  // Selection is active
  assert.equal(sankey.selectedId, "src/graph/core.ts");
  const clearBtn = container.querySelector("#sankeyClearTrace");
  assert.ok(clearBtn, "Clear Blast Trace button should be rendered");

  // Click the clear button
  let clickPrevented = false;
  let clickStopped = false;
  clearBtn.dispatchEvent({
    type: "click",
    preventDefault() { clickPrevented = true; },
    stopPropagation() { clickStopped = true; },
  });

  // Assert selection is cleared
  assert.equal(sankey.selectedId, null, "Clear button must set selectedId to null");
  assert.equal(sankey.selectedBarIds, null, "Clear button must set selectedBarIds to null");
  assert.equal(clickPrevented, true, "Click event must call preventDefault");
  assert.equal(clickStopped, true, "Click event must call stopPropagation");

  // Clear button is now removed from DOM
  const clearBtnAfter = container.querySelector("#sankeyClearTrace");
  assert.equal(clearBtnAfter, null, "Clear button must disappear after clearing blast trace");
});

test("Automated UI Test: Double-clicking folder bubble toggles expansion without dropping selection", () => {
  const container = createInteractiveContainer();
  const sankey = new SankeyView(container);

  const nodes = [
    { id: "src/graph/core.ts", sources: ["src/graph/core.ts"] },
    { id: "src/graph/layout.ts", sources: ["src/graph/layout.ts"] },
  ];
  const edges: any[] = [];

  sankey.setData(nodes, edges);
  sankey.collapsedDirs.add("src/graph");
  sankey.render();

  // Initially collapsed
  assert.equal(sankey.isFolderExpanded("src/graph"), false, "Folder starts collapsed");

  // Click 1 on the bubble
  let bars = container.querySelectorAll(".sankey-bar");
  let folderBar = bars.find((b) => b.getAttribute("data-bar-id") === "dir:code:src/graph")!;
  assert.ok(folderBar);

  folderBar.dispatchEvent({
    type: "pointerdown",
    button: 0,
    clientX: 120,
    clientY: 120,
    pointerId: 1,
    stopPropagation() {},
  });
  folderBar.dispatchEvent({
    type: "pointerup",
    clientX: 120,
    clientY: 120,
    pointerId: 1,
    stopPropagation() {},
  });

  // Click 1 selected the bar
  assert.ok(sankey.selectedBarIds, "Click 1 selected the bar");
  assert.equal(sankey.isFolderExpanded("src/graph"), false, "Click 1 does not expand folder");

  // Click 2 immediately follows (simulating double click within 320ms)
  // Note: Click 1 re-rendered the container, so we query the new element from the DOM
  bars = container.querySelectorAll(".sankey-bar");
  folderBar = bars.find((b) => b.getAttribute("data-bar-id") === "dir:code:src/graph")!;
  assert.ok(folderBar);

  folderBar.dispatchEvent({
    type: "pointerdown",
    button: 0,
    clientX: 120,
    clientY: 120,
    pointerId: 1,
    stopPropagation() {},
  });
  folderBar.dispatchEvent({
    type: "pointerup",
    clientX: 120,
    clientY: 120,
    pointerId: 1,
    stopPropagation() {},
  });

  // Click 2 must expand the folder and preserve selection!
  assert.equal(sankey.isFolderExpanded("src/graph"), true, "Double-click must expand the folder");
  assert.ok(sankey.selectedBarIds, "Selection must be preserved during double-click expansion");
});

test("Automated UI Test: Chevron hit area expands folder and stops pointerdown propagation", () => {
  const container = createInteractiveContainer();
  const sankey = new SankeyView(container);

  const nodes = [
    { id: "src/graph/core.ts", sources: ["src/graph/core.ts"] },
    { id: "src/graph/layout.ts", sources: ["src/graph/layout.ts"] },
  ];

  sankey.setData(nodes, []);
  sankey.collapsedDirs.add("src/graph");
  sankey.render();

  assert.equal(sankey.isFolderExpanded("src/graph"), false);

  const chevrons = container.querySelectorAll(".sankey-chevron-hit");
  const chev = chevrons.find((c) => c.getAttribute("data-bar-id") === "dir:code:src/graph");
  assert.ok(chev, "Expected .sankey-chevron-hit element");

  let pointerDownStopped = false;
  chev.dispatchEvent({
    type: "pointerdown",
    stopPropagation() { pointerDownStopped = true; },
  });
  assert.equal(pointerDownStopped, true, "Chevron pointerdown must stop propagation to prevent parent bar drag");

  let clickStopped = false;
  let clickPrevented = false;
  chev.dispatchEvent({
    type: "click",
    stopPropagation() { clickStopped = true; },
    preventDefault() { clickPrevented = true; },
  });
  assert.equal(clickStopped, true, "Chevron click must stop propagation");
  assert.equal(clickPrevented, true, "Chevron click must prevent default");

  // Folder is now expanded
  assert.equal(sankey.isFolderExpanded("src/graph"), true, "Clicking chevron must expand folder");
});

test("Automated UI Test: Clicking empty SVG canvas background clears active blast trace", () => {
  const container = createInteractiveContainer();
  const sankey = new SankeyView(container);

  const nodes = [
    { id: "src/graph/core.ts", sources: ["src/graph/core.ts"] },
  ];

  sankey.setData(nodes, []);
  sankey.select("src/graph/core.ts");
  assert.equal(sankey.selectedId, "src/graph/core.ts");

  const svg = container.querySelector(".sankey-svg");
  assert.ok(svg, "Expected .sankey-svg canvas element");

  // Dispatch pointerdown and pointerup on empty background (without dragging)
  svg.dispatchEvent({
    type: "pointerdown",
    button: 0,
    clientX: 500,
    clientY: 500,
    pointerId: 1,
    target: svg,
  });

  svg.dispatchEvent({
    type: "pointerup",
    clientX: 500,
    clientY: 500,
    pointerId: 1,
  });

  assert.equal(sankey.selectedId, null, "Clicking empty background canvas must clear selectedId");
  assert.equal(sankey.selectedBarIds, null, "Clicking empty background canvas must clear selectedBarIds");
});
