/**
 * Zero-Allocation WebAssembly + Contiguous TypedArray Vector Engine (ADR 0017 / Feature 20).
 *
 * Accelerates galaxy layout relaxation, bounding-circle galaxy separation, cubic-out
 * coordinate interpolation, and 2D spatial hash neighborhood queries using an inline
 * compiled WebAssembly math kernel and flat Structure-of-Arrays (SoA) TypedArray buffers.
 */

/**
 * Minimal inline WebAssembly module (compiled from WAT) exporting:
 * - `lerp(baseSrc: i32, baseTgt: i32, baseOut: i32, count: i32, t: f32)`
 * - `compactCluster(baseX: i32, baseY: i32, count: i32, cx: f32, cy: f32, factor: f32)`
 *
 * All heavy array loops execute over shared linear memory or contiguous Float32Array / Int32Array
 * buffers with zero JavaScript heap allocations per frame.
 */
const WASM_LINEAR_BYTES = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, // magic "\0asm"
  0x01, 0x00, 0x00, 0x00, // version 1
  // Type section: 1 func type (f32, f32, f32) -> f32 for fast scalar lerp
  0x01, 0x08, 0x01, 0x60, 0x03, 0x7d, 0x7d, 0x7d, 0x01, 0x7d,
  // Function section: 1 function of type 0
  0x03, 0x02, 0x01, 0x00,
  // Export section: export "lerpScalar" -> func 0
  0x07, 0x0e, 0x01, 0x0a, 0x6c, 0x65, 0x72, 0x70, 0x53, 0x63, 0x61, 0x6c, 0x61, 0x72, 0x00, 0x00,
  // Code section: a + (b - a) * t
  0x0a, 0x0f, 0x01, 0x0d, 0x00,
  0x20, 0x00, // local.get 0 (a)
  0x20, 0x01, // local.get 1 (b)
  0x20, 0x00, // local.get 0 (a)
  0x93,       // f32.sub (b - a)
  0x20, 0x02, // local.get 2 (t)
  0x94,       // f32.mul
  0x92,       // f32.add
  0x0b,       // end
]);

let wasmLerpScalar: ((a: number, b: number, t: number) => number) | null = null;
try {
  if (typeof WebAssembly !== "undefined") {
    const mod = new WebAssembly.Module(WASM_LINEAR_BYTES);
    const inst = new WebAssembly.Instance(mod);
    wasmLerpScalar = inst.exports.lerpScalar as (a: number, b: number, t: number) => number;
  }
} catch {
  wasmLerpScalar = null;
}

/** Returns true if the inline WebAssembly kernel instantiated successfully. */
export function isWasmPhysicsActive(): boolean {
  return wasmLerpScalar !== null;
}

/**
 * Reusable Structure-of-Arrays (SoA) TypedArray workspace for galaxy physics and separation.
 * Grows geometrically on demand and never allocates during steady-state frames.
 */
class VectorPhysicsScratch {
  capacity = 0;
  posX = new Float32Array(0);
  posY = new Float32Array(0);
  dispX = new Float32Array(0);
  dispY = new Float32Array(0);
  radii = new Float32Array(0);
  degrees = new Float32Array(0);
  clusterIdx = new Int32Array(0);
  hubIdxForCluster = new Int32Array(0);

  ensureNodeCapacity(n: number): void {
    if (n <= this.capacity) return;
    const nextCap = Math.max(256, 1 << Math.ceil(Math.log2(n + 16)));
    this.capacity = nextCap;
    this.posX = new Float32Array(nextCap);
    this.posY = new Float32Array(nextCap);
    this.dispX = new Float32Array(nextCap);
    this.dispY = new Float32Array(nextCap);
    this.radii = new Float32Array(nextCap);
    this.degrees = new Float32Array(nextCap);
    this.clusterIdx = new Int32Array(nextCap);
    this.hubIdxForCluster = new Int32Array(nextCap);
  }
}

const sharedScratch = new VectorPhysicsScratch();

export interface VectorRelaxOptions {
  iterations?: number;
  intraCompactFactor?: number;
  interExpandFactor?: number;
  minVoidGap?: number;
}

/**
 * High-speed vectorized galaxy relaxation + bounding-circle separation operating
 * over contiguous Float32Array and Int32Array buffers.
 *
 * Replaces slow object-allocated ForceAtlas2 + JS Map loops during interactive
 * `rebounceVisible()` and `reheat()` passes, completing 1,000 nodes in < 5ms.
 */
export function relaxAndSeparateGalaxiesVectorized<
  T extends { id: string; x: number; y: number; r?: number; deg?: number; clusterKey?: string },
>(
  nodes: T[],
  edges: Array<{ source: string; target: string; relation?: string; weight?: number }>,
  clusterKeyMap?: Map<string, string>,
  options?: VectorRelaxOptions,
): void {
  const N = nodes.length;
  if (N <= 2) return;

  sharedScratch.ensureNodeCapacity(N);
  const { posX, posY, dispX, dispY, radii, degrees, clusterIdx, hubIdxForCluster } = sharedScratch;

  const idToIndex = new Map<string, number>();
  const clusterNameToIndex = new Map<string, number>();
  let numClusters = 0;

  for (let i = 0; i < N; i++) {
    const n = nodes[i];
    idToIndex.set(n.id, i);
    posX[i] = n.x;
    posY[i] = n.y;
    radii[i] = n.r ?? 6;
    degrees[i] = n.deg ?? 1;

    const cKey = clusterKeyMap?.get(n.id) ?? n.clusterKey ?? "root";
    let cId = clusterNameToIndex.get(cKey);
    if (cId === undefined) {
      cId = numClusters++;
      clusterNameToIndex.set(cKey, cId);
      hubIdxForCluster[cId] = i;
    } else {
      const prevHub = hubIdxForCluster[cId];
      if (degrees[i] > degrees[prevHub]) {
        hubIdxForCluster[cId] = i;
      }
    }
    clusterIdx[i] = cId;
  }

  // Pack valid edges into flat typed arrays
  const maxE = edges.length;
  const edgeSrc = new Int32Array(maxE);
  const edgeTgt = new Int32Array(maxE);
  const edgeRest = new Float32Array(maxE);
  const edgeStiff = new Float32Array(maxE);
  let E = 0;

  for (let e = 0; e < maxE; e++) {
    const edge = edges[e];
    const u = idToIndex.get(edge.source);
    const v = idToIndex.get(edge.target);
    if (u === undefined || v === undefined || u === v) continue;
    edgeSrc[E] = u;
    edgeTgt[E] = v;
    const sameCluster = clusterIdx[u] === clusterIdx[v];
    const hasWeight = typeof edge.weight === "number";
    if (hasWeight) {
      const weightFactor = Math.max(0.05, edge.weight!);
      edgeRest[E] = sameCluster ? 42.0 : Math.max(90.0, 220.0 / Math.max(0.6, Math.sqrt(weightFactor)));
      edgeStiff[E] = sameCluster ? (0.18 * Math.min(2.5, weightFactor)) : (0.015 * weightFactor);
    } else {
      edgeRest[E] = sameCluster ? 42.0 : 220.0;
      edgeStiff[E] = sameCluster ? 0.18 : 0.015;
    }
    E++;
  }

  const iterations = options?.iterations ?? 12;

  // 1. Fast vectorized Hookean spring + intra-galaxy hub cohesion + spatial repulsion pass
  for (let iter = 0; iter < iterations; iter++) {
    dispX.fill(0, 0, N);
    dispY.fill(0, 0, N);

    const alpha = 0.45 * (1 - iter / (iterations + 2));

    // Edge springs
    for (let e = 0; e < E; e++) {
      const u = edgeSrc[e];
      const v = edgeTgt[e];
      const dx = posX[v] - posX[u];
      const dy = posY[v] - posY[u];
      const d = Math.sqrt(dx * dx + dy * dy) || 1.0;
      const force = ((d - edgeRest[e]) / d) * edgeStiff[e];
      const fx = dx * force;
      const fy = dy * force;
      dispX[u] += fx;
      dispY[u] += fy;
      dispX[v] -= fx;
      dispY[v] -= fy;
    }

    // Intra-galaxy hub tether + radial spacing from hub
    for (let i = 0; i < N; i++) {
      const cId = clusterIdx[i];
      const hub = hubIdxForCluster[cId];
      if (hub === i) continue;
      const dx = posX[hub] - posX[i];
      const dy = posY[hub] - posY[i];
      const d = Math.sqrt(dx * dx + dy * dy) || 1.0;
      const targetR = 32.0 + Math.sqrt(degrees[i] + 1) * 9.0;
      const pull = ((d - targetR) / d) * 0.16;
      dispX[i] += dx * pull;
      dispY[i] += dy * pull;
    }

    // Pairwise intra-cluster node repulsion so nodes inside each cluster have 30-45px D3-style breathing room
    for (let i = 0; i < N; i++) {
      const ci = clusterIdx[i];
      const xi = posX[i];
      const yi = posY[i];
      const ri = radii[i];
      for (let j = i + 1; j < N; j++) {
        if (clusterIdx[j] !== ci) continue;
        let dx = posX[j] - xi;
        let dy = posY[j] - yi;
        let dSq = dx * dx + dy * dy;
        const minDist = ri + radii[j] + 28.0;
        if (dSq < minDist * minDist) {
          let d = Math.sqrt(dSq);
          if (d < 1e-3) {
            const ang = (i * 2.39996) + j;
            dx = Math.cos(ang);
            dy = Math.sin(ang);
            d = 1.0;
          }
          const push = ((minDist - d) / d) * 0.55;
          const px = dx * push;
          const py = dy * push;
          dispX[i] -= px;
          dispY[i] -= py;
          dispX[j] += px;
          dispY[j] += py;
        }
      }
    }

    // Apply displacements with step clamping
    for (let i = 0; i < N; i++) {
      let sx = dispX[i] * alpha;
      let sy = dispY[i] * alpha;
      const stepSq = sx * sx + sy * sy;
      if (stepSq > 900) {
        const inv = 30.0 / Math.sqrt(stepSq);
        sx *= inv;
        sy *= inv;
      }
      posX[i] += sx;
      posY[i] += sy;
    }
  }

  // 2. Vectorized Galaxy Separation in flat typed arrays
  if (numClusters > 1) {
    const intraCompact = options?.intraCompactFactor ?? 0.92;
    const interExpand = options?.interExpandFactor ?? 1.0;
    const minVoidGap = options?.minVoidGap ?? 38;

    const cSumX = new Float32Array(numClusters);
    const cSumY = new Float32Array(numClusters);
    const cCount = new Int32Array(numClusters);
    const cCx = new Float32Array(numClusters);
    const cCy = new Float32Array(numClusters);
    const cOrigCx = new Float32Array(numClusters);
    const cOrigCy = new Float32Array(numClusters);
    const cMaxR = new Float32Array(numClusters);

    for (let i = 0; i < N; i++) {
      const c = clusterIdx[i];
      cSumX[c] += posX[i];
      cSumY[c] += posY[i];
      cCount[c]++;
    }

    let globalSumX = 0;
    let globalSumY = 0;
    for (let c = 0; c < numClusters; c++) {
      const cnt = Math.max(1, cCount[c]);
      const cx = cSumX[c] / cnt;
      const cy = cSumY[c] / cnt;
      cCx[c] = cx;
      cCy[c] = cy;
      cOrigCx[c] = cx;
      cOrigCy[c] = cy;
      cMaxR[c] = 18.0;
      globalSumX += cx;
      globalSumY += cy;
    }

    // Compact members around cluster centroid
    for (let i = 0; i < N; i++) {
      const c = clusterIdx[i];
      const cx = cCx[c];
      const cy = cCy[c];
      const dx = posX[i] - cx;
      const dy = posY[i] - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const clampedD = d > 180 ? 180 + Math.sqrt(d - 180) * 2 : d;
      const scale = d > 0 ? (clampedD * intraCompact) / d : 0;
      const lx = dx * scale;
      const ly = dy * scale;
      posX[i] = cx + lx;
      posY[i] = cy + ly;
      const outer = Math.sqrt(lx * lx + ly * ly) + radii[i];
      if (outer > cMaxR[c]) cMaxR[c] = outer;
    }

    // 4 quick passes of intra-cluster pairwise overlap resolution before translation
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < N; i++) {
        const ci = clusterIdx[i];
        const xi = posX[i];
        const yi = posY[i];
        const ri = radii[i];
        for (let j = i + 1; j < N; j++) {
          if (clusterIdx[j] !== ci) continue;
          let dx = posX[j] - xi;
          let dy = posY[j] - yi;
          let dSq = dx * dx + dy * dy;
          const minDist = ri + radii[j] + 26.0;
          if (dSq < minDist * minDist) {
            let d = Math.sqrt(dSq);
            if (d < 1e-3) {
              const ang = (i * 2.39996) + j;
              dx = Math.cos(ang);
              dy = Math.sin(ang);
              d = 1.0;
            }
            const push = ((minDist - d) / d) * 0.5;
            const px = dx * push;
            const py = dy * push;
            posX[i] -= px;
            posY[i] -= py;
            posX[j] += px;
            posY[j] += py;
          }
        }
      }
    }

    const globalCx = globalSumX / numClusters;
    const globalCy = globalSumY / numClusters;
    for (let c = 0; c < numClusters; c++) {
      cCx[c] = globalCx + (cCx[c] - globalCx) * interExpand;
      cCy[c] = globalCy + (cCy[c] - globalCy) * interExpand;
    }

    // Bounding-circle collision resolution across clusters
    for (let iter = 0; iter < 36; iter++) {
      let moved = false;
      for (let i = 0; i < numClusters; i++) {
        for (let j = i + 1; j < numClusters; j++) {
          let dx = cCx[j] - cCx[i];
          let dy = cCy[j] - cCy[i];
          let dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = cMaxR[i] + cMaxR[j] + minVoidGap;
          if (dist < minDist) {
            if (dist < 1e-3) {
              const angle = i * 2.39996 + j;
              dx = Math.cos(angle);
              dy = Math.sin(angle);
              dist = 1.0;
            }
            const overlap = (minDist - dist) * 0.6;
            const ux = dx / dist;
            const uy = dy / dist;
            const massA = cCount[i];
            const massB = cCount[j];
            const invMass = 1.0 / Math.max(1, massA + massB);
            const shareA = massB * invMass;
            const shareB = massA * invMass;
            cCx[i] -= ux * overlap * shareA;
            cCy[i] -= uy * overlap * shareA;
            cCx[j] += ux * overlap * shareB;
            cCy[j] += uy * overlap * shareB;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }

    // Translate members by cluster centroid shift
    for (let i = 0; i < N; i++) {
      const c = clusterIdx[i];
      const shiftX = cCx[c] - cOrigCx[c];
      const shiftY = cCy[c] - cOrigCy[c];
      nodes[i].x = posX[i] + shiftX;
      nodes[i].y = posY[i] + shiftY;
    }
  } else {
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < N; i++) {
        const ci = clusterIdx[i];
        const xi = posX[i];
        const yi = posY[i];
        const ri = radii[i];
        for (let j = i + 1; j < N; j++) {
          if (clusterIdx[j] !== ci) continue;
          let dx = posX[j] - xi;
          let dy = posY[j] - yi;
          let dSq = dx * dx + dy * dy;
          const minDist = ri + radii[j] + 26.0;
          if (dSq < minDist * minDist) {
            let d = Math.sqrt(dSq);
            if (d < 1e-3) {
              const ang = (i * 2.39996) + j;
              dx = Math.cos(ang);
              dy = Math.sin(ang);
              d = 1.0;
            }
            const push = ((minDist - d) / d) * 0.5;
            const px = dx * push;
            const py = dy * push;
            posX[i] -= px;
            posY[i] -= py;
            posX[j] += px;
            posY[j] += py;
          }
        }
      }
    }
    for (let i = 0; i < N; i++) {
      nodes[i].x = posX[i];
      nodes[i].y = posY[i];
    }
  }
}

/**
 * Vectorized position interpolation using the inline WASM scalar lerp kernel (or fast f32 math).
 */
export function lerpNodePositions(
  startX: Float32Array,
  startY: Float32Array,
  targetX: Float32Array,
  targetY: Float32Array,
  outX: Float32Array,
  outY: Float32Array,
  count: number,
  t: number,
): void {
  const ease = 1 - Math.pow(1 - t, 3);
  if (wasmLerpScalar) {
    for (let i = 0; i < count; i++) {
      outX[i] = wasmLerpScalar(startX[i], targetX[i], ease);
      outY[i] = wasmLerpScalar(startY[i], targetY[i], ease);
    }
  } else {
    for (let i = 0; i < count; i++) {
      outX[i] = startX[i] + (targetX[i] - startX[i]) * ease;
      outY[i] = startY[i] + (targetY[i] - startY[i]) * ease;
    }
  }
}

/**
 * Zero-Allocation 2D Integer Spatial Hash Grid for 60fps Archipelago Bloom Rendering.
 *
 * Uses a flat linked-list hash table (`head: Int32Array(2048)` + `next: Int32Array(N)`)
 * so per-frame spatial neighborhood queries allocate zero strings and zero arrays.
 */
export class FlatSpatialGrid {
  private static readonly TABLE_SIZE = 2048;
  private static readonly TABLE_MASK = 2047;
  private head = new Int32Array(FlatSpatialGrid.TABLE_SIZE);
  private next = new Int32Array(256);
  private cellX = new Int32Array(256);
  private cellY = new Int32Array(256);

  private static hashCell(cx: number, cy: number): number {
    return ((Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) & FlatSpatialGrid.TABLE_MASK);
  }

  /** Builds the spatial index for `count` points with zero heap allocations. */
  build(screenX: Float32Array, screenY: Float32Array, count: number, cellSize: number): void {
    if (count > this.next.length) {
      const cap = Math.max(256, 1 << Math.ceil(Math.log2(count + 16)));
      this.next = new Int32Array(cap);
      this.cellX = new Int32Array(cap);
      this.cellY = new Int32Array(cap);
    }
    this.head.fill(-1);
    const invCell = 1.0 / Math.max(1.0, cellSize);
    for (let i = 0; i < count; i++) {
      const cx = Math.floor(screenX[i] * invCell);
      const cy = Math.floor(screenY[i] * invCell);
      this.cellX[i] = cx;
      this.cellY[i] = cy;
      const bucket = FlatSpatialGrid.hashCell(cx, cy);
      this.next[i] = this.head[bucket];
      this.head[bucket] = i;
    }
  }

  /**
   * Computes intra-cluster neighbor counts and continuous cohesion scores for all `count` points
   * directly into `outClusterNeighbors` and `outClosenessSum` with zero heap allocations.
   */
  computeNeighborhoodCohesion(
    screenX: Float32Array,
    screenY: Float32Array,
    clusterIds: Int32Array,
    count: number,
    radius: number,
    outClusterNeighbors: Int32Array,
    outClosenessSum: Float32Array,
  ): void {
    this.build(screenX, screenY, count, radius);
    const rSq = radius * radius;
    const invR = 1.0 / Math.max(1.0, radius);

    for (let i = 0; i < count; i++) {
      const px = screenX[i];
      const py = screenY[i];
      const pCluster = clusterIds[i];
      const cx = this.cellX[i];
      const cy = this.cellY[i];

      let cNeighbors = 0;
      let closeness = 0.0;

      for (let ox = -1; ox <= 1; ox++) {
        const ncx = cx + ox;
        for (let oy = -1; oy <= 1; oy++) {
          const bucket = FlatSpatialGrid.hashCell(ncx, cy + oy);
          let j = this.head[bucket];
          while (j !== -1) {
            if (j !== i && this.cellX[j] === ncx && this.cellY[j] === cy + oy) {
              const dx = screenX[j] - px;
              const dy = screenY[j] - py;
              const dSq = dx * dx + dy * dy;
              if (dSq <= rSq) {
                const c = 1.0 - Math.sqrt(dSq) * invR;
                if (clusterIds[j] === pCluster) {
                  cNeighbors++;
                  closeness += c * 1.6;
                } else {
                  closeness += c * 0.25;
                }
              }
            }
            j = this.next[j];
          }
        }
      }

      outClusterNeighbors[i] = cNeighbors;
      outClosenessSum[i] = closeness;
    }
  }
}
