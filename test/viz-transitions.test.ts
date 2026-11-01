import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cubicEaseOut,
  interpolatePositions,
  LayoutTransitionManager,
  type Point2D,
} from "../viewer/transitions.js";

test("cubicEaseOut computes deceleration curve adhering to Lanum Ch. 6 Sec 6.4", () => {
  // Exact boundary conditions
  assert.equal(cubicEaseOut(0.0), 0.0);
  assert.equal(cubicEaseOut(1.0), 1.0);

  // Deceleration property: at midpoint 0.5, traveled distance is 0.875 (> 80%)
  const mid = cubicEaseOut(0.5);
  assert.equal(mid, 0.875);
  assert.ok(mid > 0.8, "Cubic ease-out must travel > 80% distance at 50% time elapsed");

  // Out-of-bounds clamping
  assert.equal(cubicEaseOut(-0.25), 0.0);
  assert.equal(cubicEaseOut(1.5), 1.0);

  // Monotonic increase
  let prev = -1;
  for (let t = 0; t <= 1.0; t += 0.1) {
    const val = cubicEaseOut(t);
    assert.ok(val >= prev, `Monotonicity violated at t=${t}`);
    prev = val;
  }
});

test("interpolatePositions smoothly interpolates between node coordinate maps", () => {
  const from = new Map<string, Point2D>([
    ["node-a", { x: 0, y: 0 }],
    ["node-b", { x: 100, y: 200 }],
    ["node-deleted", { x: 50, y: 50 }],
  ]);

  const to = new Map<string, Point2D>([
    ["node-a", { x: 100, y: 200 }],
    ["node-b", { x: 300, y: 400 }],
    ["node-created", { x: 80, y: 90 }],
  ]);

  // At progress 0.0: exact start coordinates for existing nodes
  const atZero = interpolatePositions(from, to, 0.0);
  assert.deepEqual(atZero.get("node-a"), { x: 0, y: 0 });
  assert.deepEqual(atZero.get("node-b"), { x: 100, y: 200 });
  assert.deepEqual(atZero.get("node-deleted"), { x: 50, y: 50 });
  assert.deepEqual(atZero.get("node-created"), { x: 80, y: 90 });

  // At progress 0.5: cubic ease-out is 0.875 (> 80% distance traveled)
  const atMid = interpolatePositions(from, to, 0.5);
  // node-a: 0 + (100 - 0) * 0.875 = 87.5; 0 + (200 - 0) * 0.875 = 175
  assert.deepEqual(atMid.get("node-a"), { x: 87.5, y: 175 });
  // node-b: 100 + (300 - 100) * 0.875 = 275; 200 + (400 - 200) * 0.875 = 375
  assert.deepEqual(atMid.get("node-b"), { x: 275, y: 375 });
  // Nodes existing only in one map remain stable
  assert.deepEqual(atMid.get("node-deleted"), { x: 50, y: 50 });
  assert.deepEqual(atMid.get("node-created"), { x: 80, y: 90 });

  // At progress 1.0: exact target coordinates
  const atOne = interpolatePositions(from, to, 1.0);
  assert.deepEqual(atOne.get("node-a"), { x: 100, y: 200 });
  assert.deepEqual(atOne.get("node-b"), { x: 300, y: 400 });
  assert.deepEqual(atOne.get("node-deleted"), { x: 50, y: 50 });
  assert.deepEqual(atOne.get("node-created"), { x: 80, y: 90 });
});

test("Scenario: Cubic ease-out interpolation smoothly transitions node positions from start to target coordinates", () => {
  const manager = new LayoutTransitionManager();
  assert.equal(manager.isActive(), false);

  const startPositions = new Map<string, Point2D>([
    ["alpha", { x: 0, y: 0 }],
    ["beta", { x: 200, y: 200 }],
  ]);

  const targetPositions = new Map<string, Point2D>([
    ["alpha", { x: 100, y: 100 }],
    ["beta", { x: 400, y: 600 }],
  ]);

  // Given nodes at starting coordinates and distinct target coordinates for a new layout mode
  const startTime = 1000;
  const duration = 280;
  manager.start(startPositions, targetPositions, startTime, duration);
  assert.equal(manager.isActive(), true);

  // When evaluated at progress 0.0 (t = 1000)
  const stepZero = manager.step(1000);
  assert.equal(stepZero.progress, 0.0);
  assert.equal(stepZero.eased, 0.0);
  assert.equal(stepZero.done, false);
  // Then at progress 0.0 nodes should remain at their exact starting coordinates
  assert.deepEqual(stepZero.positions.get("alpha"), { x: 0, y: 0 });
  assert.deepEqual(stepZero.positions.get("beta"), { x: 200, y: 200 });

  // When evaluated at progress 0.5 (t = 1140 = 1000 + 140)
  const stepMid = manager.step(1140);
  assert.equal(stepMid.progress, 0.5);
  assert.equal(stepMid.eased, 0.875);
  assert.equal(stepMid.done, false);
  // And at progress 0.5 nodes should have traveled more than 80% of the distance
  // alpha: 0 + (100 - 0) * 0.875 = 87.5
  assert.deepEqual(stepMid.positions.get("alpha"), { x: 87.5, y: 87.5 });
  // beta: 200 + (400 - 200) * 0.875 = 375; 200 + (600 - 200) * 0.875 = 550
  assert.deepEqual(stepMid.positions.get("beta"), { x: 375, y: 550 });

  // When evaluated at progress 1.0 (t = 1280 = 1000 + 280)
  const stepEnd = manager.step(1280);
  assert.equal(stepEnd.progress, 1.0);
  assert.equal(stepEnd.eased, 1.0);
  assert.equal(stepEnd.done, true);
  // And at progress 1.0 nodes should arrive at their exact target coordinates
  assert.deepEqual(stepEnd.positions.get("alpha"), { x: 100, y: 100 });
  assert.deepEqual(stepEnd.positions.get("beta"), { x: 400, y: 600 });
  assert.equal(manager.isActive(), false);

  // Subsequent steps maintain target coordinates and report done: true
  const stepAfter = manager.step(1500);
  assert.equal(stepAfter.done, true);
  assert.deepEqual(stepAfter.positions.get("alpha"), { x: 100, y: 100 });
  assert.deepEqual(stepAfter.positions.get("beta"), { x: 400, y: 600 });
});

test("Scenario: Interrupting an in-flight transition retargets smoothly from the current interpolated position", () => {
  const manager = new LayoutTransitionManager();

  const initialPositions = new Map<string, Point2D>([
    ["node-1", { x: 0, y: 0 }],
  ]);

  const firstTarget = new Map<string, Point2D>([
    ["node-1", { x: 100, y: 100 }],
  ]);

  // Given an active layout transition at intermediate progress
  manager.start(initialPositions, firstTarget, 1000, 280);
  // Step to midpoint t = 1140 (progress 0.5, eased 0.875 -> (87.5, 87.5))
  const mid = manager.step(1140);
  assert.deepEqual(mid.positions.get("node-1"), { x: 87.5, y: 87.5 });
  assert.equal(manager.isActive(), true);

  // When a new layout target is triggered before completion
  const secondTarget = new Map<string, Point2D>([
    ["node-1", { x: 200, y: 200 }],
  ]);
  manager.retarget(secondTarget, 1140, 280);

  // Then the new transition should start from the current interpolated coordinates without jumping backward
  const retargetStart = manager.step(1140);
  assert.equal(retargetStart.progress, 0.0);
  assert.equal(retargetStart.eased, 0.0);
  assert.equal(retargetStart.done, false);
  assert.deepEqual(
    retargetStart.positions.get("node-1"),
    { x: 87.5, y: 87.5 },
    "Transition must start immediately from (87.5, 87.5) and not jump backward to (0, 0)"
  );
  assert.deepEqual(manager.getCurrentPositions().get("node-1"), { x: 87.5, y: 87.5 });

  // Progress halfway through new transition (t = 1280 = 1140 + 140)
  const retargetMid = manager.step(1280);
  assert.equal(retargetMid.progress, 0.5);
  assert.equal(retargetMid.eased, 0.875);
  // 87.5 + (200 - 87.5) * 0.875 = 87.5 + 98.4375 = 185.9375
  assert.deepEqual(retargetMid.positions.get("node-1"), { x: 185.9375, y: 185.9375 });

  // And cancelling the transition should cleanly halt updates
  manager.cancel();
  assert.equal(manager.isActive(), false);

  const stepAfterCancel = manager.step(1300);
  assert.equal(stepAfterCancel.done, true);
  assert.deepEqual(stepAfterCancel.positions.get("node-1"), { x: 185.9375, y: 185.9375 });
  assert.deepEqual(manager.getCurrentPositions().get("node-1"), { x: 185.9375, y: 185.9375 });
});

test("LayoutTransitionManager edge cases: zero duration and retarget while inactive", () => {
  const manager = new LayoutTransitionManager();
  const start = new Map<string, Point2D>([["n", { x: 10, y: 20 }]]);
  const end = new Map<string, Point2D>([["n", { x: 50, y: 60 }]]);

  // Zero duration immediately reaches target
  manager.start(start, end, 500, 0);
  const stepZeroDur = manager.step(500);
  assert.equal(stepZeroDur.done, true);
  assert.deepEqual(stepZeroDur.positions.get("n"), { x: 50, y: 60 });
  assert.equal(manager.isActive(), false);

  // Retarget while inactive starts a new transition from current positions
  const newTarget = new Map<string, Point2D>([["n", { x: 100, y: 100 }]]);
  manager.retarget(newTarget, 600, 200);
  assert.equal(manager.isActive(), true);
  const stepNew = manager.step(600);
  assert.deepEqual(stepNew.positions.get("n"), { x: 50, y: 60 });
});
