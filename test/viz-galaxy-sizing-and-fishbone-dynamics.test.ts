import test from "node:test";
import assert from "node:assert/strict";
import {
  extractNodeLoc,
  computeNodeSizeRadius,
  type NodeSizeMetric,
} from "../viewer/data.js";
import { computeFishboneModel } from "../viewer/fishbone-view.js";

test("extractNodeLoc accurately parses source spans and provides sensible fallbacks", () => {
  // 1. Explicit line ranges
  assert.equal(extractNodeLoc({ sources: ["src/app.ts · L1-L150"] }), 150);
  assert.equal(extractNodeLoc({ sources: ["src/graph/index.ts · 1-25"] }), 25);
  assert.equal(extractNodeLoc({ sources: ["src/util.ts · L10-L29"] }), 20);

  // 2. Multiple source spans summed
  assert.equal(
    extractNodeLoc({
      sources: ["src/part1.ts · L1-L50", "src/part2.ts · L1-L30"],
    }),
    80,
  );

  // 3. Fallback based on child symbols count
  assert.equal(extractNodeLoc({ sources: ["src/empty.ts"], childCount: 4 }), 60);
  assert.equal(extractNodeLoc({ sources: [], childCount: 0 }), 25);
});

test("computeNodeSizeRadius scales predictably across all 5 dimensions", () => {
  const node = {
    id: "src/heavy.ts",
    name: "heavy.ts",
    type: "file",
    sources: ["src/heavy.ts · L1-L1200"],
    childCount: 30,
  };

  const stats = {
    deg: 3,
    inDeg: 1,
    outDeg: 2,
  };

  // 1. Degree metric
  const rDeg = computeNodeSizeRadius(node, "degree", stats);

  // 2. LOC metric: 1200 LOC should produce a substantially larger radius than 3 degree
  const rLoc = computeNodeSizeRadius(node, "loc", stats);
  assert.ok(rLoc > rDeg, `LOC radius (${rLoc}) should be greater than Degree radius (${rDeg})`);

  // 3. Symbols metric: 30 functions/methods should produce large symbol radius
  const rSym = computeNodeSizeRadius(node, "symbols", stats);
  assert.ok(rSym > rDeg, `Symbols radius (${rSym}) should be greater than Degree radius (${rDeg})`);

  // 4. In-degree vs Out-degree
  const rIn = computeNodeSizeRadius(node, "indegree", stats);
  const rOut = computeNodeSizeRadius(node, "outdegree", stats);
  assert.ok(rOut > rIn, `Out-degree radius (${rOut}) should exceed In-degree radius (${rIn})`);

  // 5. Verification on a small helper with 50 LOC and 40 in-degree references
  const popularSmallNode = {
    id: "src/helper.ts",
    name: "helper.ts",
    type: "file",
    sources: ["src/helper.ts · L1-L40"],
    childCount: 2,
  };
  const popularStats = { deg: 40, inDeg: 38, outDeg: 2 };
  const rSmallLoc = computeNodeSizeRadius(popularSmallNode, "loc", popularStats);
  const rSmallIn = computeNodeSizeRadius(popularSmallNode, "indegree", popularStats);
  assert.ok(
    rSmallIn > rSmallLoc,
    `In-degree radius (${rSmallIn}) must exceed LOC radius (${rSmallLoc}) for heavily referenced small helper`,
  );
});

test("Ishikawa Fishbone scales rib lengths and junction spacing dynamically without card overlap", () => {
  const nodes = [
    { id: "src/core.ts", name: "core.ts", type: "file" },
    { id: "docs/adr/0001.md", name: "0001.md", type: "adr" },
    { id: "docs/adr/0002.md", name: "0002.md", type: "adr" },
    { id: "docs/adr/0003.md", name: "0003.md", type: "adr" },
    { id: "docs/adr/0004.md", name: "0004.md", type: "adr" },
    { id: "docs/adr/0005.md", name: "0005.md", type: "adr" },
    { id: "docs/adr/0006.md", name: "0006.md", type: "adr" },
    { id: "features/feat1.feature", name: "feat1.feature", type: "feature" },
    { id: "features/feat2.feature", name: "feat2.feature", type: "feature" },
  ];

  const edges = [
    { source: "docs/adr/0001.md", target: "src/core.ts", relation: "governs" },
    { source: "docs/adr/0002.md", target: "src/core.ts", relation: "governs" },
    { source: "docs/adr/0003.md", target: "src/core.ts", relation: "governs" },
    { source: "docs/adr/0004.md", target: "src/core.ts", relation: "governs" },
    { source: "docs/adr/0005.md", target: "src/core.ts", relation: "governs" },
    { source: "docs/adr/0006.md", target: "src/core.ts", relation: "governs" },
    { source: "features/feat1.feature", target: "src/core.ts", relation: "covers" },
    { source: "features/feat2.feature", target: "src/core.ts", relation: "covers" },
  ];

  const model = computeFishboneModel("src/core.ts", nodes, edges, {
    width: 1400,
    height: 800,
  });

  const adrRib = model.ribs.find((r) => r.stage === "adrs")!;
  const featRib = model.ribs.find((r) => r.stage === "features")!;

  assert.ok(adrRib, "ADR rib must exist");
  assert.ok(featRib, "Features rib must exist");
  assert.equal(adrRib.subBones.length, 6);

  // 1. Rib height must expand dynamically: (6 + 1) * 38 = 266px > 160px
  const adrDeltaY = Math.abs(adrRib.tipY - adrRib.junctionY);
  assert.ok(
    adrDeltaY >= 266,
    `ADR rib height (${adrDeltaY}) must be at least 266px to accommodate 6 sub-bones`,
  );

  // 2. Check vertical separation between all sequential sub-bone cards
  for (let i = 0; i < adrRib.subBones.length - 1; i++) {
    const cardA = adrRib.subBones[i];
    const cardB = adrRib.subBones[i + 1];
    const verticalSeparation = Math.abs(cardB.y1 - cardA.y1);
    // Sub-bone cards are 24px tall, so separation must be >= 36px to guarantee >= 12px clearance
    assert.ok(
      verticalSeparation >= 36,
      `Vertical separation (${verticalSeparation}px) between sub-bones ${i} and ${i + 1} must be >= 36px`,
    );
  }

  // 3. Horizontal separation between ADR junction and Features junction along the central spine
  const junctionGap = featRib.junctionX - adrRib.junctionX;
  assert.ok(
    junctionGap >= adrDeltaY + 60,
    `Junction gap (${junctionGap}px) must be >= ADR deltaX + 60 to prevent horizontal rib collision`,
  );

  // 4. Central spine must extend past the rightmost sub-bone
  assert.ok(
    model.spine.x2 > featRib.tipX + 160,
    `Spine end (${model.spine.x2}) must extend past features tip (${featRib.tipX})`,
  );
});
