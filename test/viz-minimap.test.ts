import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeMinimapProjection,
  minimapPointToWorld,
  computeTwoDegreeFocus,
  MinimapOverlay,
  type MinimapPointInput,
  type FocusEdgeInput,
} from "../viewer/minimap.js";

test("Scenario 1: Minimap projects world node coordinates proportionally within canvas bounds", () => {
  const nodes: MinimapPointInput[] = [
    { id: "A", x: -200, y: -100, color: "#ff0000", radius: 5 },
    { id: "B", x: 200, y: 100, color: "#00ff00", radius: 5 },
    { id: "C", x: 0, y: 0, color: "#0000ff", radius: 3 },
  ];

  const camera = {
    cx: 0,
    cy: 0,
    zoom: 1.0,
    viewportWidth: 800,
    viewportHeight: 600,
  };

  const width = 160;
  const height = 110;
  const padding = 10;

  const projection = computeMinimapProjection(nodes, camera, width, height, padding);

  // Bounds checks
  assert.equal(projection.worldBounds.minX, -200);
  assert.equal(projection.worldBounds.maxX, 200);
  assert.equal(projection.worldBounds.minY, -100);
  assert.equal(projection.worldBounds.maxY, 100);

  // Usable area: (160 - 20) = 140 width, (110 - 20) = 90 height
  // worldSpanX = 400, worldSpanY = 200
  // scale = min(140 / 400 = 0.35, 90 / 200 = 0.45) = 0.35
  assert.equal(projection.scale, 0.35);

  // Center node C (0, 0) should project exactly to minimap center (80, 55)
  const projC = projection.points.find((p) => p.id === "C");
  assert.ok(projC);
  assert.equal(projC.x, 80);
  assert.equal(projC.y, 55);
  assert.equal(projC.color, "#0000ff");
  assert.equal(projC.radius, 3);

  // All points must be within [padding, width - padding] and [padding, height - padding]
  for (const pt of projection.points) {
    assert.ok(pt.x >= padding - 1e-4 && pt.x <= width - padding + 1e-4, `pt.x (${pt.x}) within bounds`);
    assert.ok(pt.y >= padding - 1e-4 && pt.y <= height - padding + 1e-4, `pt.y (${pt.y}) within bounds`);
  }
});

test("Scenario 1: Viewport indicator rectangle scales inversely with camera zoom (zoom: 0.5 -> zoom: 2.0)", () => {
  const nodes: MinimapPointInput[] = [
    { id: "A", x: -100, y: -100 },
    { id: "B", x: 100, y: 100 },
  ];

  const cameraZoomHalf = {
    cx: 0,
    cy: 0,
    zoom: 0.5,
    viewportWidth: 800,
    viewportHeight: 600,
  };

  const cameraZoomDouble = {
    cx: 0,
    cy: 0,
    zoom: 2.0,
    viewportWidth: 800,
    viewportHeight: 600,
  };

  const projHalf = computeMinimapProjection(nodes, cameraZoomHalf, 160, 110, 10);
  const projDouble = computeMinimapProjection(nodes, cameraZoomDouble, 160, 110, 10);

  // In zoom: 0.5, the visible world width is 800 / 0.5 = 1600
  // In zoom: 2.0, the visible world width is 800 / 2.0 = 400
  // Therefore, viewportRect.w at zoom 0.5 should be exactly 4x viewportRect.w at zoom 2.0
  assert.ok(Math.abs(projHalf.viewportRect.w - 4 * projDouble.viewportRect.w) < 1e-4);
  assert.ok(Math.abs(projHalf.viewportRect.h - 4 * projDouble.viewportRect.h) < 1e-4);

  // Center of viewportRect should match center of minimap when cx = 0, cy = 0
  const centerHalfX = projHalf.viewportRect.x + projHalf.viewportRect.w / 2;
  const centerHalfY = projHalf.viewportRect.y + projHalf.viewportRect.h / 2;
  assert.ok(Math.abs(centerHalfX - 80) < 1e-4);
  assert.ok(Math.abs(centerHalfY - 55) < 1e-4);

  const centerDoubleX = projDouble.viewportRect.x + projDouble.viewportRect.w / 2;
  const centerDoubleY = projDouble.viewportRect.y + projDouble.viewportRect.h / 2;
  assert.ok(Math.abs(centerDoubleX - 80) < 1e-4);
  assert.ok(Math.abs(centerDoubleY - 55) < 1e-4);
});

test("Scenario 1: Bidirectional coordinate conversion: clicking projected point maps back to exact world and pan offsets", () => {
  const nodes: MinimapPointInput[] = [
    { id: "TargetNode", x: 120, y: -80 },
    { id: "OriginNode", x: -120, y: 80 },
  ];

  const camera = {
    cx: 0,
    cy: 0,
    zoom: 1.5,
    viewportWidth: 1000,
    viewportHeight: 800,
  };

  const projection = computeMinimapProjection(nodes, camera, 200, 150, 15);
  const targetPoint = projection.points.find((p) => p.id === "TargetNode")!;
  assert.ok(targetPoint);

  // Convert minimap pixel position of TargetNode back to world coords
  const converted = minimapPointToWorld(targetPoint.x, targetPoint.y, projection, camera);

  assert.ok(Math.abs(converted.worldX - 120) < 1e-4, `Expected worldX ~ 120, got ${converted.worldX}`);
  assert.ok(Math.abs(converted.worldY - (-80)) < 1e-4, `Expected worldY ~ -80, got ${converted.worldY}`);

  // When camera centers on TargetNode (worldX = 120, worldY = -80):
  // screenX = worldX * zoom + panX = 1000 / 2 => panX = 500 - 120 * 1.5 = 500 - 180 = 320
  // screenY = worldY * zoom + panY = 800 / 2 => panY = 400 - (-80) * 1.5 = 400 + 120 = 520
  assert.ok(Math.abs(converted.panX - 320) < 1e-4, `Expected panX ~ 320, got ${converted.panX}`);
  assert.ok(Math.abs(converted.panY - 520) < 1e-4, `Expected panY ~ 520, got ${converted.panY}`);
});

test("Scenario 1: Supports Graft panX/panY camera state convention", () => {
  const nodes: MinimapPointInput[] = [
    { id: "N1", x: 0, y: 0 },
    { id: "N2", x: 100, y: 100 },
  ];

  // Camera pan offset: screenX = worldX * zoom + panX
  // If panX = 400 and viewportWidth = 800 with zoom = 1,
  // worldCenter cx = (800 / 2 - 400) / 1 = 0
  const camera = {
    panX: 400,
    panY: 300,
    zoom: 1.0,
    viewportWidth: 800,
    viewportHeight: 600,
  };

  const projection = computeMinimapProjection(nodes, camera, 160, 110, 10);
  const vpCenterX = projection.viewportRect.x + projection.viewportRect.w / 2;
  const vpCenterY = projection.viewportRect.y + projection.viewportRect.h / 2;

  // Since cx = 0, cy = 0 and node N1 is at (0, 0), the viewport center should match N1 projected
  const n1Proj = projection.points.find((p) => p.id === "N1")!;
  assert.ok(Math.abs(vpCenterX - n1Proj.x) < 1e-4);
  assert.ok(Math.abs(vpCenterY - n1Proj.y) < 1e-4);
});

test("Scenario 2: Two-degree focus neighborhood classifies hops and computes exact opacities and edge tiers", () => {
  // Chain: Seed -> Hop1 -> Hop2 -> Hop3 (beyond 2 hops)
  // Plus Hop1_b connected to Seed, and Hop1_b connected to Hop1 (intra-hop1 edge)
  // Plus Isolated node
  const edges: FocusEdgeInput[] = [
    { source: "Seed", target: "Hop1" },
    { source: "Seed", target: "Hop1_b" },
    { source: "Hop1", target: "Hop1_b" }, // hop1 to hop1
    { source: "Hop1", target: "Hop2" },   // hop1 to hop2
    { source: "Hop2", target: "Hop3" },   // hop2 to hop3 (beyond 2 hops)
  ];

  const focus = computeTwoDegreeFocus("Seed", edges);

  // Hop sets
  assert.equal(focus.seedId, "Seed");
  assert.deepEqual(Array.from(focus.hop0), ["Seed"]);
  assert.deepEqual(Array.from(focus.hop1).sort(), ["Hop1", "Hop1_b"]);
  assert.deepEqual(Array.from(focus.hop2), ["Hop2"]);

  // Node focus and opacity checks
  assert.deepEqual(focus.getNodeFocus("Seed"), { hop: 0, opacity: 1.0 });
  assert.deepEqual(focus.getNodeFocus("Hop1"), { hop: 1, opacity: 1.0 });
  assert.deepEqual(focus.getNodeFocus("Hop1_b"), { hop: 1, opacity: 1.0 });
  assert.deepEqual(focus.getNodeFocus("Hop2"), { hop: 2, opacity: 0.55 });
  assert.deepEqual(focus.getNodeFocus("Hop3"), { hop: null, opacity: 0.10 });
  assert.deepEqual(focus.getNodeFocus("Unrelated"), { hop: null, opacity: 0.10 });

  // Primary edge checks (Seed <-> Hop1, Seed <-> Hop1_b)
  assert.ok(focus.primaryEdges.has("Seed->Hop1"));
  assert.ok(focus.primaryEdges.has("Seed->Hop1_b"));
  assert.deepEqual(focus.getEdgeFocus("Seed", "Hop1"), { tier: 1, opacity: 0.9, dashed: false });
  // Symmetrical lookup
  assert.deepEqual(focus.getEdgeFocus("Hop1", "Seed"), { tier: 1, opacity: 0.9, dashed: false });

  // Secondary edge checks (Hop1 <-> Hop1_b, Hop1 <-> Hop2)
  assert.ok(focus.secondaryEdges.has("Hop1->Hop1_b"));
  assert.ok(focus.secondaryEdges.has("Hop1->Hop2"));
  assert.deepEqual(focus.getEdgeFocus("Hop1", "Hop1_b"), { tier: 2, opacity: 0.45, dashed: true });
  assert.deepEqual(focus.getEdgeFocus("Hop1", "Hop2"), { tier: 2, opacity: 0.45, dashed: true });
  // Symmetrical lookup
  assert.deepEqual(focus.getEdgeFocus("Hop2", "Hop1"), { tier: 2, opacity: 0.45, dashed: true });

  // Transitive edges beyond 2-hop (Hop2 -> Hop3) should be dimmed into background
  assert.ok(!focus.primaryEdges.has("Hop2->Hop3"));
  assert.ok(!focus.secondaryEdges.has("Hop2->Hop3"));
  assert.deepEqual(focus.getEdgeFocus("Hop2", "Hop3"), { tier: null, opacity: 0.05, dashed: false });
  assert.deepEqual(focus.getEdgeFocus("Hop3", "Hop2"), { tier: null, opacity: 0.05, dashed: false });
  assert.deepEqual(focus.getEdgeFocus("Unrelated1", "Unrelated2"), { tier: null, opacity: 0.05, dashed: false });
});

test("Scenario 2: Undirected edge inputs are recognized symmetrically", () => {
  // Input edge directed from child to seed
  const edges: FocusEdgeInput[] = [
    { source: "Child", target: "MySeed" },
    { source: "Grandchild", target: "Child" },
  ];

  const focus = computeTwoDegreeFocus("MySeed", edges);

  assert.deepEqual(Array.from(focus.hop0), ["MySeed"]);
  assert.deepEqual(Array.from(focus.hop1), ["Child"]);
  assert.deepEqual(Array.from(focus.hop2), ["Grandchild"]);

  assert.deepEqual(focus.getNodeFocus("MySeed"), { hop: 0, opacity: 1.0 });
  assert.deepEqual(focus.getNodeFocus("Child"), { hop: 1, opacity: 1.0 });
  assert.deepEqual(focus.getNodeFocus("Grandchild"), { hop: 2, opacity: 0.55 });

  assert.deepEqual(focus.getEdgeFocus("Child", "MySeed"), { tier: 1, opacity: 0.9, dashed: false });
  assert.deepEqual(focus.getEdgeFocus("MySeed", "Child"), { tier: 1, opacity: 0.9, dashed: false });
  assert.deepEqual(focus.getEdgeFocus("Grandchild", "Child"), { tier: 2, opacity: 0.45, dashed: true });
});

test("MinimapOverlay controller renders, handles drag/click, and executes pan callbacks", () => {
  const drawnRects: Array<{ x: number; y: number; w: number; h: number; type: "fill" | "stroke" }> = [];
  const drawnArcs: Array<{ x: number; y: number; r: number }> = [];

  const mockCtx = {
    clearRect: () => {},
    fillRect: (x: number, y: number, w: number, h: number) => {
      drawnRects.push({ x, y, w, h, type: "fill" });
    },
    strokeRect: (x: number, y: number, w: number, h: number) => {
      drawnRects.push({ x, y, w, h, type: "stroke" });
    },
    beginPath: () => {},
    arc: (x: number, y: number, r: number) => {
      drawnArcs.push({ x, y, r });
    },
    fill: () => {},
    stroke: () => {},
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
  };

  const listeners: Record<string, Function[]> = {};
  const mockCanvas = {
    getContext: (type: string) => (type === "2d" ? mockCtx : null),
    addEventListener: (event: string, fn: Function) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(fn);
    },
    removeEventListener: (event: string, fn: Function) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((f) => f !== fn);
      }
    },
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 160, height: 110 }),
    parentElement: {
      removeChild: () => {},
    },
    width: 160,
    height: 110,
    className: "",
  };

  let pannedCoords: { worldX: number; worldY: number; panX: number; panY: number } | null = null;

  const overlay = new MinimapOverlay({
    canvas: mockCanvas as any,
    width: 160,
    height: 110,
    onPanTo: (wx, wy, px, py) => {
      pannedCoords = { worldX: wx, worldY: wy, panX: px, panY: py };
    },
  });

  const nodes: MinimapPointInput[] = [
    { id: "A", x: 0, y: 0 },
    { id: "B", x: 100, y: 100 },
  ];

  const camera = {
    cx: 50,
    cy: 50,
    zoom: 1.0,
    viewportWidth: 800,
    viewportHeight: 600,
  };

  overlay.update(nodes, camera);

  // Check that nodes and viewport rect were drawn
  assert.ok(drawnArcs.length >= 2, "Expected at least 2 arcs drawn for the 2 nodes");
  assert.ok(drawnRects.length >= 2, "Expected rects drawn for background and viewport indicator");

  // Simulate pointerdown at center (clientX = 10 + 80 = 90, clientY = 20 + 55 = 75)
  const pointerDownFn = listeners["pointerdown"]?.[0];
  assert.ok(pointerDownFn);
  pointerDownFn({ clientX: 90, clientY: 75 });

  assert.ok(pannedCoords);
  // Center of minimap corresponds to world center (50, 50)
  assert.ok(Math.abs(pannedCoords.worldX - 50) < 1e-3, `worldX ~ 50, got ${pannedCoords.worldX}`);
  assert.ok(Math.abs(pannedCoords.worldY - 50) < 1e-3, `worldY ~ 50, got ${pannedCoords.worldY}`);

  // Test drag via pointermove
  const pointerMoveFn = listeners["pointermove"]?.[0];
  assert.ok(pointerMoveFn);
  pointerMoveFn({ clientX: 100, clientY: 85 });
  assert.ok(pannedCoords);

  // Test pointerup stops dragging
  const pointerUpFn = listeners["pointerup"]?.[0];
  assert.ok(pointerUpFn);
  pointerUpFn({});
  assert.equal(overlay.isDragging, false);

  // Calling destroy detaches listeners
  overlay.destroy();
  assert.equal(listeners["pointerdown"]?.length ?? 0, 0);
  assert.equal(listeners["pointermove"]?.length ?? 0, 0);
  assert.equal(listeners["pointerup"]?.length ?? 0, 0);
});

test("Edge cases: handles empty nodes, single node, and degenerate bounds gracefully", () => {
  const camera = {
    cx: 0,
    cy: 0,
    zoom: 1.0,
    viewportWidth: 800,
    viewportHeight: 600,
  };

  // Empty nodes
  const emptyProj = computeMinimapProjection([], camera);
  assert.equal(emptyProj.points.length, 0);
  assert.ok(Number.isFinite(emptyProj.scale) && emptyProj.scale > 0);
  assert.ok(Number.isFinite(emptyProj.viewportRect.w) && emptyProj.viewportRect.w > 0);

  // Single node
  const singleProj = computeMinimapProjection([{ id: "Sole", x: 42, y: 84 }], camera);
  assert.equal(singleProj.points.length, 1);
  assert.ok(Number.isFinite(singleProj.scale) && singleProj.scale > 0);
  // Should project to minimap center (80, 55)
  assert.equal(singleProj.points[0].x, 80);
  assert.equal(singleProj.points[0].y, 55);

  // Focus on isolated seed with no edges
  const isolatedFocus = computeTwoDegreeFocus("Alone", []);
  assert.equal(isolatedFocus.hop0.size, 1);
  assert.equal(isolatedFocus.hop1.size, 0);
  assert.equal(isolatedFocus.hop2.size, 0);
  assert.deepEqual(isolatedFocus.getNodeFocus("Alone"), { hop: 0, opacity: 1.0 });
  assert.deepEqual(isolatedFocus.getNodeFocus("Other"), { hop: null, opacity: 0.10 });
  assert.deepEqual(isolatedFocus.getEdgeFocus("Alone", "Other"), { tier: null, opacity: 0.05, dashed: false });
});
