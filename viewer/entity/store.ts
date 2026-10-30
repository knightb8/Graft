/**
 * Entity Component Store (Structure of Arrays - SoA)
 *
 * Implements flat contiguous TypedArray memory stores for nodes and CSR topology.
 * Governed by ADR 0023 and Feature 27.
 */

export const enum EntityFlag {
  VISIBLE          = 1 << 0,  // Node passes active scope & directory filters
  HOVERED          = 1 << 1,  // Mouse cursor is hovering over node
  SELECTED         = 1 << 2,  // Active focus target
  IS_SEED          = 1 << 3,  // Originating seed for blast propagation
  IN_BLAST         = 1 << 4,  // Retains blast energy >= threshold (0.14)
  PINNED           = 1 << 5,  // Dragged by pointer; velocity integration skipped
  DIRTY_POSITION   = 1 << 6,  // Position updated; requires GPU buffer sync
  DIRTY_VISUAL     = 1 << 7,  // Color or radius updated
  SUPPORT_SINK     = 1 << 8,  // Utility hub / leaf sink dampening active
  HAS_GAP          = 1 << 9,  // Code module lacks verification or documentation
}

export interface EntityComponentStore {
  capacity: number;
  count: number;

  // 1. Transform Component (Positions in World Coordinates)
  posX: Float32Array;
  posY: Float32Array;

  // 2. Physics Component (Dynamics & Forces)
  velX: Float32Array;
  velY: Float32Array;
  mass: Float32Array;

  // 3. Visual Styling Component (Render Primitives)
  colorRGBA: Uint32Array;     // Packed 32-bit color (0xRRGGBBAA)
  radius: Float32Array;       // Node circle radius (px)
  borderWidth: Float32Array;  // Outline stroke width (px)

  // 4. Directional Blast & Attenuation Component
  blastEnergy: Float32Array;  // Attenuated energy [0.0 .. 1.0]
  blastHop: Uint8Array;       // Discrete hop distance from seed [0 .. 255]
  blastPhase: Uint8Array;     // Phase enum

  // 5. State Bitmask Component (Dense Flags per Node)
  flags: Uint32Array;

  // 6. Lifecycle & Scope Component
  stage: Uint8Array;          // 0: ADR, 1: Spec, 2: Code, 3: Test, 4: Doc
  clusterId: Uint16Array;     // Subsystem cluster identifier

  // Bidirectional ID lookup table
  idToEntity: Map<string, number>;
  entityToId: string[];
}

export function createEntityStore(capacity = 1024): EntityComponentStore {
  return {
    capacity,
    count: 0,
    posX: new Float32Array(capacity),
    posY: new Float32Array(capacity),
    velX: new Float32Array(capacity),
    velY: new Float32Array(capacity),
    mass: new Float32Array(capacity).fill(1.0),
    colorRGBA: new Uint32Array(capacity).fill(0x38bdf8ff),
    radius: new Float32Array(capacity).fill(8.0),
    borderWidth: new Float32Array(capacity).fill(1.0),
    blastEnergy: new Float32Array(capacity),
    blastHop: new Uint8Array(capacity).fill(255),
    blastPhase: new Uint8Array(capacity),
    flags: new Uint32Array(capacity).fill(EntityFlag.VISIBLE),
    stage: new Uint8Array(capacity),
    clusterId: new Uint16Array(capacity),
    idToEntity: new Map<string, number>(),
    entityToId: [],
  };
}

export function ensureCapacity(store: EntityComponentStore, required: number): void {
  if (required <= store.capacity) return;
  const newCap = Math.max(required, store.capacity * 2);

  const realloc = <T extends ArrayBufferView>(old: T, Ctor: new (n: number) => T): T => {
    const next = new Ctor(newCap);
    (next as any).set(old);
    return next;
  };

  store.posX = realloc(store.posX, Float32Array);
  store.posY = realloc(store.posY, Float32Array);
  store.velX = realloc(store.velX, Float32Array);
  store.velY = realloc(store.velY, Float32Array);
  store.mass = realloc(store.mass, Float32Array);
  store.colorRGBA = realloc(store.colorRGBA, Uint32Array);
  store.radius = realloc(store.radius, Float32Array);
  store.borderWidth = realloc(store.borderWidth, Float32Array);
  store.blastEnergy = realloc(store.blastEnergy, Float32Array);
  store.blastHop = realloc(store.blastHop, Uint8Array);
  store.blastPhase = realloc(store.blastPhase, Uint8Array);
  store.flags = realloc(store.flags, Uint32Array);
  store.stage = realloc(store.stage, Uint8Array);
  store.clusterId = realloc(store.clusterId, Uint16Array);
  store.capacity = newCap;
}

export function allocateEntity(store: EntityComponentStore, stringId: string): number {
  const existing = store.idToEntity.get(stringId);
  if (existing !== undefined) return existing;

  const id = store.count;
  ensureCapacity(store, id + 1);

  store.idToEntity.set(stringId, id);
  store.entityToId[id] = stringId;
  store.count++;
  return id;
}

export function getEntity(store: EntityComponentStore, stringId: string): number | undefined {
  return store.idToEntity.get(stringId);
}

export interface CSRTopologyStore {
  N: number;
  E: number;
  head: Int32Array;           // Offset into target array for entity i (length N + 1)
  target: Int32Array;         // Target entity index (length E)
  relation: string[];         // Canonical relation verb (length E)
  direction: Uint8Array;      // 0 = forward, 1 = reverse (length E)
}

export function buildCSRTopology(
  store: EntityComponentStore,
  edges: Array<{ source: string; target: string; relation?: string }>,
): CSRTopologyStore {
  const N = store.count;
  const edgeList: Array<{ u: number; v: number; rel: string; dir: number }> = [];

  for (const e of edges) {
    const u = store.idToEntity.get(e.source);
    const v = store.idToEntity.get(e.target);
    if (u === undefined || v === undefined || u === v) continue;
    const rel = e.relation || "uses";
    edgeList.push({ u, v, rel, dir: 0 }); // forward
    edgeList.push({ u: v, v: u, rel, dir: 1 }); // reverse
  }

  // Count degrees per node
  const degrees = new Int32Array(N);
  for (const e of edgeList) {
    degrees[e.u]++;
  }

  // Compute prefix sum for head pointers
  const head = new Int32Array(N + 1);
  for (let i = 0; i < N; i++) {
    head[i + 1] = head[i] + degrees[i];
  }

  const E = edgeList.length;
  const target = new Int32Array(E);
  const relation: string[] = new Array(E);
  const direction = new Uint8Array(E);

  const cur = new Int32Array(head);
  for (const e of edgeList) {
    const p = cur[e.u]++;
    target[p] = e.v;
    relation[p] = e.rel;
    direction[p] = e.dir;
  }

  return { N, E, head, target, relation, direction };
}
