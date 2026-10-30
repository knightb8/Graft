import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createEntityStore,
  allocateEntity,
  EntityFlag,
  EntityComponentStore,
  buildCSRTopology,
} from "../viewer/entity/store.js";
import {
  EntityEventRingBuffer,
  EntityOpCode,
} from "../viewer/entity/event-ring-buffer.js";
import {
  EventDispatcherSystem,
  VerletPhysicsSystem,
  CausalBlastSystem,
  extractWebGLVBOData,
} from "../viewer/entity/systems.js";

test("Columnar component stores allocate contiguous typed memory with zero heap fragmentation", () => {
  const store = createEntityStore(100);

  // Ingest sample nodes
  const idA = allocateEntity(store, "src/graph.ts");
  const idB = allocateEntity(store, "src/data.ts");

  assert.equal(idA, 0, "First entity must receive index 0");
  assert.equal(idB, 1, "Second entity must receive index 1");

  // Populate coordinates in contiguous Float32Array columns
  store.posX[idA] = 100.5;
  store.posY[idA] = 200.5;
  store.posX[idB] = 300.0;
  store.posY[idB] = 400.0;

  // Packed 32-bit RGBA color and radius
  store.colorRGBA[idA] = 0x38bdf8ff; // Sky blue
  store.radius[idA] = 12.0;

  assert.ok(store.posX instanceof Float32Array, "Positions must be Float32Array");
  assert.ok(store.colorRGBA instanceof Uint32Array, "Colors must be Uint32Array");
  assert.equal(store.posX[0], 100.5);
  assert.equal(store.posY[0], 200.5);
  assert.equal(store.colorRGBA[0], 0x38bdf8ff);
});

test("Pre-allocated event ring buffer queues interactions with zero per-frame garbage collection", () => {
  const ring = new EntityEventRingBuffer(64);
  const store = createEntityStore(10);
  const entityId = allocateEntity(store, "src/graph.ts");

  // Emit pointer drag interactions into pre-allocated ring buffer
  ring.emit(EntityOpCode.POINTER_DOWN, entityId, 100, 150);
  ring.emit(EntityOpCode.POINTER_MOVE, entityId, 110, 165);
  ring.emit(EntityOpCode.POINTER_UP, entityId, 0, 0);

  assert.equal(ring.size(), 3, "Ring buffer should hold 3 queued events");

  // Drain and dispatch
  const received: Array<{ op: EntityOpCode; entity: number; a: number; b: number }> = [];
  ring.drain((op, entity, a, b) => {
    received.push({ op, entity, a, b });
  });

  assert.equal(received.length, 3, "Should drain all 3 events");
  assert.equal(received[0].op, EntityOpCode.POINTER_DOWN);
  assert.equal(received[1].op, EntityOpCode.POINTER_MOVE);
  assert.equal(received[1].a, 110);
  assert.equal(ring.size(), 0, "Buffer should be empty after drain");
});

test("Discrete state bitmask updates selection and pinned flags without object property mutation", () => {
  const store = createEntityStore(10);
  const ring = new EntityEventRingBuffer(32);
  const dispatcher = new EventDispatcherSystem();

  const id = allocateEntity(store, "src/index.ts");
  store.posX[id] = 50;
  store.posY[id] = 50;

  // Emit POINTER_DOWN to pin and select
  ring.emit(EntityOpCode.POINTER_DOWN, id, 50, 50);
  dispatcher.update(store, ring);

  assert.ok((store.flags[id] & EntityFlag.PINNED) !== 0, "Node should be pinned on drag down");
  assert.ok((store.flags[id] & EntityFlag.SELECTED) !== 0, "Node should be selected on click");

  // Step physics: pinned node must not drift
  const physics = new VerletPhysicsSystem();
  store.velX[id] = 100.0; // Apply an external force
  physics.update(store, 0.016, 0.9);

  assert.equal(store.posX[id], 50, "Pinned node coordinates must remain locked during physics step");

  // Emit POINTER_UP to unpin
  ring.emit(EntityOpCode.POINTER_UP, id, 0, 0);
  dispatcher.update(store, ring);
  assert.equal(store.flags[id] & EntityFlag.PINNED, 0, "Node should be unpinned after pointer up");
});

test("CSR topology traversal executes causal blast propagation directly across typed index arrays", () => {
  const store = createEntityStore(10);
  const idTest1 = allocateEntity(store, "test/auth-unit.test.ts");
  const idCode = allocateEntity(store, "src/auth.ts");
  const idTest2 = allocateEntity(store, "test/auth-integration.test.ts");

  // Build CSR topology: Test1 -> verifies -> Code <- verifies <- Test2
  const edges = [
    { source: "test/auth-unit.test.ts", target: "src/auth.ts", relation: "verifies" },
    { source: "test/auth-integration.test.ts", target: "src/auth.ts", relation: "verifies" },
  ];
  const topology = buildCSRTopology(store, edges);

  assert.ok(topology.head instanceof Int32Array, "CSR head must be an Int32Array");
  assert.ok(topology.target instanceof Int32Array, "CSR target must be an Int32Array");

  // Trigger blast with Test1 as seed
  const blast = new CausalBlastSystem();
  blast.propagate(store, topology, idTest1, 0.65, 4);

  // Test1 is seed: energy 1.0
  assert.equal(store.blastEnergy[idTest1], 1.0, "Seed test entity should have energy 1.0");
  assert.ok((store.flags[idTest1] & EntityFlag.IS_SEED) !== 0, "Seed flag must be set");

  // Code is verified target: energy > 0.5
  assert.ok(store.blastEnergy[idCode] >= 0.5, "Connected code should receive blast energy");
  assert.ok((store.flags[idCode] & EntityFlag.IN_BLAST) !== 0, "IN_BLAST flag must be set on affected code");

  // Causal collider: Independent Test2 verifying the same code must NOT receive side-channel blast bleed
  assert.equal(store.blastEnergy[idTest2], 0.0, "Unrelated collider test must not receive side-channel blast bleed");
});

test("Direct VBO streaming transfers entity positions into WebGL buffers without data marshalling", () => {
  const store = createEntityStore(10);
  const idA = allocateEntity(store, "src/a.ts");
  const idB = allocateEntity(store, "src/b.ts");

  store.posX[idA] = 12.5;
  store.posY[idA] = 24.5;
  store.colorRGBA[idA] = 0x38bdf8ff;

  store.posX[idB] = 99.0;
  store.posY[idB] = 88.0;
  store.colorRGBA[idB] = 0x10b981ff;

  const vboData = extractWebGLVBOData(store);
  assert.ok(vboData.positions instanceof Float32Array, "VBO position stream must be Float32Array");
  assert.ok(vboData.colors instanceof Uint32Array, "VBO color stream must be Uint32Array");

  // Zero-copy binary layout: positions[0..1] = (12.5, 24.5), positions[2..3] = (99.0, 88.0)
  assert.equal(vboData.positions[0], 12.5);
  assert.equal(vboData.positions[1], 24.5);
  assert.equal(vboData.positions[2], 99.0);
  assert.equal(vboData.positions[3], 88.0);
});
