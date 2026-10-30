/**
 * Empirical Benchmark: Entity Event System (EES) vs. Object-Oriented Graph.
 *
 * Evaluates memory footprint, physics loop, VBO streaming, and interaction
 * throughput across 10,000 nodes and 30,000 edges.
 *
 * Usage:
 *   npx tsx scripts/bench-ees.ts
 */

import {
  createEntityStore,
  allocateEntity,
  EntityFlag,
  buildCSRTopology,
  EntityEventRingBuffer,
  EntityOpCode,
  VerletPhysicsSystem,
  CausalBlastSystem,
  extractWebGLVBOData,
  EventDispatcherSystem,
} from "../viewer/entity/index.js";
import { evaluateDirectionalBlastStep, BlastPhase } from "../viewer/sankey-engine.js";

const NUM_ENTITIES = 10000;
const EDGES_PER_ENTITY = 3;
const NUM_EDGES = NUM_ENTITIES * EDGES_PER_ENTITY;

console.log(`\n======================================================`);
console.log(`  GRAFT PERFORMANCE BENCHMARK: OOP vs COLUMNAR EES  `);
console.log(`  Scale: ${NUM_ENTITIES.toLocaleString()} Entities, ${NUM_EDGES.toLocaleString()} Edges`);
console.log(`======================================================\n`);

// -----------------------------------------------------------------
// 1. MEMORY FOOTPRINT & HEAP FRAGMENTATION
// -----------------------------------------------------------------
console.log(`--- [1/5] Memory Footprint & Allocation ---`);

if (global.gc) global.gc();
const oopHeapBefore = process.memoryUsage().heapUsed;

interface OOPNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  blastEnergy: number;
  flags: { pinned: boolean; selected: boolean; hovered: boolean; hidden: boolean };
  scope: string;
  stage: string;
}

interface OOPEdge {
  source: string;
  target: string;
  relation: string;
  direction: "forward" | "reverse";
}

const oopNodes = new Map<string, OOPNode>();
const oopAdj = new Map<string, OOPEdge[]>();

for (let i = 0; i < NUM_ENTITIES; i++) {
  const id = `node_${i}`;
  oopNodes.set(id, {
    id,
    x: Math.random() * 1000,
    y: Math.random() * 1000,
    vx: 0,
    vy: 0,
    blastEnergy: 0,
    flags: { pinned: false, selected: false, hovered: false, hidden: false },
    scope: "code",
    stage: "implementation",
  });
  oopAdj.set(id, []);
}

const rawEdgeList: Array<{ source: string; target: string; relation: string }> = [];
for (let i = 0; i < NUM_ENTITIES; i++) {
  for (let e = 1; e <= EDGES_PER_ENTITY; e++) {
    const targetIdx = (i + e * 7) % NUM_ENTITIES;
    oopAdj.get(`node_${i}`)!.push({
      source: `node_${i}`,
      target: `node_${targetIdx}`,
      relation: "imports",
      direction: "forward",
    });
    oopAdj.get(`node_${targetIdx}`)!.push({
      source: `node_${targetIdx}`,
      target: `node_${i}`,
      relation: "imports",
      direction: "reverse",
    });
    rawEdgeList.push({
      source: `node_${i}`,
      target: `node_${targetIdx}`,
      relation: "imports",
    });
  }
}

const oopHeapAfter = process.memoryUsage().heapUsed;
const oopMemoryBytes = Math.max(0, oopHeapAfter - oopHeapBefore);

// B. Columnar TypedArray EES
const eesStore = createEntityStore(NUM_ENTITIES);
for (let i = 0; i < NUM_ENTITIES; i++) {
  allocateEntity(eesStore, `node_${i}`, Math.random() * 1000, Math.random() * 1000, 1, 2);
}
const csrTopology = buildCSRTopology(eesStore, rawEdgeList);

const eesTypedBytes =
  eesStore.posX.byteLength +
  eesStore.posY.byteLength +
  eesStore.velX.byteLength +
  eesStore.velY.byteLength +
  eesStore.mass.byteLength +
  eesStore.colorRGBA.byteLength +
  eesStore.radius.byteLength +
  eesStore.borderWidth.byteLength +
  eesStore.blastEnergy.byteLength +
  eesStore.blastHop.byteLength +
  eesStore.blastPhase.byteLength +
  eesStore.flags.byteLength +
  eesStore.stage.byteLength +
  eesStore.clusterId.byteLength +
  csrTopology.head.byteLength +
  csrTopology.target.byteLength +
  csrTopology.direction.byteLength;

console.log(`Traditional OOP Heap:   ${(oopMemoryBytes / 1024 / 1024).toFixed(2)} MB (~${(oopMemoryBytes / NUM_ENTITIES).toFixed(0)} bytes/node on V8 heap)`);
console.log(`Columnar Typed Store:   ${(eesTypedBytes / 1024 / 1024).toFixed(2)} MB (${(eesTypedBytes / NUM_ENTITIES).toFixed(0)} bytes/node strictly contiguous)`);
console.log(`Memory Compaction:      ${(oopMemoryBytes / eesTypedBytes).toFixed(1)}x reduction\n`);

// -----------------------------------------------------------------
// 2. CAUSAL BLAST TRAVERSAL SPEED
// -----------------------------------------------------------------
console.log(`--- [2/5] Full Causal Machine Blast Waves (1,000 Waves) ---`);

const tOopBlastStart = performance.now();
for (let iter = 0; iter < 1000; iter++) {
  const seedId = `node_${iter % 100}`;
  const queue: Array<{ id: string; hop: number; energy: number; phase: BlastPhase }> = [
    { id: seedId, hop: 0, energy: 1.0, phase: "SEED" },
  ];
  const visited = new Set<string>([seedId]);

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr.hop >= 3 || curr.phase === "LEAF_SINK") continue;

    const edges = oopAdj.get(curr.id) || [];
    for (const edge of edges) {
      const { weight, nextPhase } = evaluateDirectionalBlastStep(
        edge.relation,
        edge.direction,
        curr.phase,
        true,
      );
      if (weight <= 0) continue;

      const nextEnergy = curr.energy * 0.7 * weight;
      if (!visited.has(edge.target)) {
        visited.add(edge.target);
        queue.push({ id: edge.target, hop: curr.hop + 1, energy: nextEnergy, phase: nextPhase });
      }
    }
  }
}
const oopBlastDuration = performance.now() - tOopBlastStart;

const blastSystem = new CausalBlastSystem();
const tEesBlastStart = performance.now();
for (let iter = 0; iter < 1000; iter++) {
  const seedIdx = iter % 100;
  blastSystem.propagate(eesStore, csrTopology, seedIdx, 0.7, 3);
}
const eesBlastDuration = performance.now() - tEesBlastStart;

console.log(`Traditional OOP Graph:  ${oopBlastDuration.toFixed(2)} ms (${(1000 / (oopBlastDuration / 1000)).toFixed(0)} waves/sec)`);
console.log(`CSR TypedArray BFS:     ${eesBlastDuration.toFixed(2)} ms (${(1000 / (eesBlastDuration / 1000)).toFixed(0)} waves/sec)`);
console.log(`Blast Comparison:       ${(oopBlastDuration / eesBlastDuration).toFixed(2)}x speedup\n`);

// -----------------------------------------------------------------
// 3. CONTINUOUS PHYSICS SIMULATION (100 Frames)
// -----------------------------------------------------------------
console.log(`--- [3/5] Physics Simulation Loop (100 Frames @ 10,000 Nodes) ---`);

for (let i = 0; i < 100; i++) {
  oopNodes.get(`node_${i}`)!.flags.pinned = true;
  eesStore.flags[i] |= EntityFlag.PINNED;
}

const tOopSimStart = performance.now();
for (let frame = 0; frame < 100; frame++) {
  for (const node of oopNodes.values()) {
    if (node.flags.pinned) continue;
    node.vx = (node.vx + 0.1) * 0.85;
    node.vy = (node.vy + 0.1) * 0.85;
    node.x += node.vx;
    node.y += node.vy;
  }
}
const oopSimDuration = performance.now() - tOopSimStart;

const physicsSystem = new VerletPhysicsSystem();
const tEesSimStart = performance.now();
for (let frame = 0; frame < 100; frame++) {
  physicsSystem.update(eesStore, 0.016, 0.85);
}
const eesSimDuration = performance.now() - tEesSimStart;

console.log(`Traditional OOP Loop:   ${oopSimDuration.toFixed(2)} ms (${(oopSimDuration / 100).toFixed(3)} ms/frame)`);
console.log(`Columnar Vectorized:    ${eesSimDuration.toFixed(2)} ms (${(eesSimDuration / 100).toFixed(3)} ms/frame)`);
console.log(`Simulation Speedup:     ${(oopSimDuration / eesSimDuration).toFixed(2)}x faster\n`);

// -----------------------------------------------------------------
// 4. EVENT INGESTION & GC PRESSURE (10,000 Operations)
// -----------------------------------------------------------------
console.log(`--- [4/5] Event Ingestion & GC Pressure (10,000 Operations) ---`);

const tOopEventStart = performance.now();
const eventList: Array<{ type: string; targetId: string; x: number; y: number }> = [];
for (let i = 0; i < 10000; i++) {
  eventList.push({ type: "pointermove", targetId: `node_${i}`, x: 100.5, y: 200.5 });
}
for (const ev of eventList) {
  const node = oopNodes.get(ev.targetId);
  if (node) {
    node.flags.selected = true;
    node.x = ev.x;
  }
}
const oopEventDuration = performance.now() - tOopEventStart;

const ringBuffer = new EntityEventRingBuffer(4096);
const dispatcher = new EventDispatcherSystem();
const tEesEventStart = performance.now();
for (let i = 0; i < 10000; i++) {
  ringBuffer.emit(EntityOpCode.NODE_SELECT, i % NUM_ENTITIES, 0, 0);
  if (ringBuffer.size() >= 4000) {
    dispatcher.update(eesStore, ringBuffer);
  }
}
dispatcher.update(eesStore, ringBuffer);
const eesEventDuration = performance.now() - tEesEventStart;

console.log(`OOP Event Allocations:  ${oopEventDuration.toFixed(2)} ms (10,000 JS heap objects allocated)`);
console.log(`RingBuffer Bitmask:     ${eesEventDuration.toFixed(2)} ms (0 JS heap objects, stride-4 ring buffer)`);
console.log(`Event Speedup:          ${(oopEventDuration / eesEventDuration).toFixed(2)}x faster\n`);

// -----------------------------------------------------------------
// 5. DIRECT GPU VBO STREAMING PREPARATION (60 Frames)
// -----------------------------------------------------------------
console.log(`--- [5/5] WebGL VBO Streaming Prep (60 Frames to GPU Buffer) ---`);

const tOopVboStart = performance.now();
for (let frame = 0; frame < 60; frame++) {
  const vbo = new Float32Array(NUM_ENTITIES * 4);
  let idx = 0;
  for (const node of oopNodes.values()) {
    vbo[idx++] = node.x;
    vbo[idx++] = node.y;
    vbo[idx++] = (node.flags.selected ? 1 : 0) | (node.flags.pinned ? 2 : 0);
    vbo[idx++] = node.blastEnergy;
  }
}
const oopVboDuration = performance.now() - tOopVboStart;

const preallocatedVbo = new Float32Array(NUM_ENTITIES * 4);
const tEesVboStart = performance.now();
for (let frame = 0; frame < 60; frame++) {
  extractWebGLVBOData(eesStore, preallocatedVbo);
}
const eesVboDuration = performance.now() - tEesVboStart;

console.log(`OOP Property Packing:   ${oopVboDuration.toFixed(2)} ms (${(oopVboDuration / 60).toFixed(3)} ms/frame)`);
console.log(`Direct Columnar VBO:    ${eesVboDuration.toFixed(2)} ms (${(eesVboDuration / 60).toFixed(3)} ms/frame)`);
console.log(`GPU Prep Speedup:       ${(oopVboDuration / eesVboDuration).toFixed(2)}x faster\n`);

console.log(`======================================================\n`);
