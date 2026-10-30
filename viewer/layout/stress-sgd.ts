/**
 * Stress Majorization via Stochastic Gradient Descent (Zheng, Pawar, Goodman 2018).
 *
 * Solves graph drawing by minimizing graph-theoretic stress:
 *   E(X) = sum_{i < j} w_ij * (||X_i - X_j|| - d_ij)^2
 * where:
 *   d_ij = weighted shortest path distance between i and j (APSP via Dijkstra)
 *   w_ij = 1 / (d_ij ^ 2)
 *
 * Runs with an exponential annealing schedule over ~30 iterations, deterministic seeded PRNG,
 * contiguous typed arrays, and separate layout/packing for disconnected components.
 */

import { getIdealLength } from "./relations-adapter.js";

/** Mulberry32 seeded deterministic PRNG */
export function createMulberry32(seed: number): () => number {
  let s = Math.floor(seed) >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface StressSgdOptions {
  iterations?: number;
  seed?: number;
  pivots?: number;
  recordStressHistory?: boolean;
  epsilon?: number;
  getIdealLength?: (edge: any) => number;
  getWeight?: (edge: any) => number;
}

export interface StressSgdResult {
  positions: Map<string, { x: number; y: number }>;
  stressHistory?: number[];
  finalStress: number;
}

interface CSRGraph {
  N: number;
  head: Int32Array;
  next: Int32Array;
  to: Int32Array;
  len: Float32Array;
}

function buildCSRGraph(numNodes: number, edges: Array<{ u: number; v: number; length: number }>): CSRGraph {
  const N = numNodes;
  const head = new Int32Array(N).fill(-1);
  const next = new Int32Array(edges.length * 2);
  const to = new Int32Array(edges.length * 2);
  const len = new Float32Array(edges.length * 2);
  let edgeCount = 0;

  function addDirectedEdge(u: number, v: number, l: number) {
    const e = edgeCount++;
    to[e] = v;
    len[e] = l;
    next[e] = head[u];
    head[u] = e;
  }

  for (const edge of edges) {
    addDirectedEdge(edge.u, edge.v, edge.length);
    addDirectedEdge(edge.v, edge.u, edge.length);
  }

  return { N, head, next, to, len };
}

function runSingleSourceDijkstra(graph: CSRGraph, src: number, outDists: Float32Array): void {
  const { N, head, next, to, len } = graph;
  outDists.fill(Infinity);
  outDists[src] = 0;

  const heap = new Int32Array(N);
  const heapPos = new Int32Array(N).fill(-1);
  let heapSize = 0;

  function heapSwap(a: number, b: number) {
    const nA = heap[a];
    const nB = heap[b];
    heap[a] = nB;
    heap[b] = nA;
    heapPos[nA] = b;
    heapPos[nB] = a;
  }

  function heapUp(pos: number) {
    while (pos > 0) {
      const parent = (pos - 1) >> 1;
      if (outDists[heap[pos]] < outDists[heap[parent]]) {
        heapSwap(pos, parent);
        pos = parent;
      } else {
        break;
      }
    }
  }

  function heapDown(pos: number) {
    while ((pos << 1) + 1 < heapSize) {
      let smallest = pos;
      const left = (pos << 1) + 1;
      const right = left + 1;
      if (left < heapSize && outDists[heap[left]] < outDists[heap[smallest]]) {
        smallest = left;
      }
      if (right < heapSize && outDists[heap[right]] < outDists[heap[smallest]]) {
        smallest = right;
      }
      if (smallest !== pos) {
        heapSwap(pos, smallest);
        pos = smallest;
      } else {
        break;
      }
    }
  }

  heap[0] = src;
  heapPos[src] = 0;
  heapSize = 1;

  while (heapSize > 0) {
    const u = heap[0];
    const last = --heapSize;
    if (last > 0) {
      heap[0] = heap[last];
      heapPos[heap[0]] = 0;
      heapDown(0);
    }
    heapPos[u] = -2;

    const dU = outDists[u];
    for (let e = head[u]; e !== -1; e = next[e]) {
      const v = to[e];
      if (heapPos[v] === -2) continue;
      const alt = dU + len[e];
      if (alt < outDists[v]) {
        outDists[v] = alt;
        if (heapPos[v] === -1) {
          const p = heapSize++;
          heap[p] = v;
          heapPos[v] = p;
          heapUp(p);
        } else {
          heapUp(heapPos[v]);
        }
      }
    }
  }
}

/**
 * Computes all-pairs shortest paths for a connected subgraph using typed Dijkstra.
 * Returns a Float32Array of size N * N where dists[i * N + j] = shortest path distance.
 */
export function computeAllPairsShortestPaths(
  numNodes: number,
  edges: Array<{ u: number; v: number; length: number }>,
): Float32Array {
  const N = numNodes;
  const dists = new Float32Array(N * N);
  const graph = buildCSRGraph(N, edges);

  for (let src = 0; src < N; src++) {
    const offset = src * N;
    const nodeDists = dists.subarray(offset, offset + N);
    runSingleSourceDijkstra(graph, src, nodeDists);
  }

  return dists;
}

/**
 * Solves stress majorization on a single connected component using SGD.
 */
function solveComponentStressSGD(
  compNodes: number[],
  compEdges: Array<{ u: number; v: number; length: number }>,
  posX: Float32Array,
  posY: Float32Array,
  options: StressSgdOptions,
): { stressHistory?: number[]; finalStress: number } {
  const N = compNodes.length;
  if (N <= 1) return { finalStress: 0 };

  const rand = createMulberry32(options.seed ?? 42);
  const iterations = options.iterations ?? 30;

  // Map component-local index 0..N-1 to original node index
  const localToGlobal = compNodes;
  const globalToLocal = new Map<number, number>();
  for (let i = 0; i < N; i++) {
    globalToLocal.set(localToGlobal[i], i);
  }

  const localEdges = compEdges.map((e) => ({
    u: globalToLocal.get(e.u)!,
    v: globalToLocal.get(e.v)!,
    length: e.length,
  }));

  const useSparsePivots = (options.pivots !== undefined && options.pivots > 0) || N >= 800;
  const pivotCount = Math.min(N, options.pivots ?? 50);

  let pairU: Int32Array;
  let pairV: Int32Array;
  let pairD: Float32Array;
  let pairW: Float32Array;
  let numPairs = 0;

  if (!useSparsePivots) {
    // Dense APSP
    const dists = computeAllPairsShortestPaths(N, localEdges);
    const totalPairs = (N * (N - 1)) / 2;
    pairU = new Int32Array(totalPairs);
    pairV = new Int32Array(totalPairs);
    pairD = new Float32Array(totalPairs);
    pairW = new Float32Array(totalPairs);

    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const d = dists[i * N + j];
        if (Number.isFinite(d) && d > 1e-4) {
          pairU[numPairs] = localToGlobal[i];
          pairV[numPairs] = localToGlobal[j];
          pairD[numPairs] = d;
          pairW[numPairs] = 1 / (d * d);
          numPairs++;
        }
      }
    }
  } else {
    // Sparse stress with MaxMin pivots
    const graph = buildCSRGraph(N, localEdges);
    const pivots: number[] = [Math.floor(rand() * N)];
    const distToPivots = new Float32Array(N).fill(Infinity);
    const pivotDists = new Map<number, Float32Array>();

    const firstDists = new Float32Array(N);
    runSingleSourceDijkstra(graph, pivots[0], firstDists);
    pivotDists.set(pivots[0], firstDists);
    for (let i = 0; i < N; i++) {
      distToPivots[i] = firstDists[i];
    }

    // MaxMin pivot selection via single-source Dijkstra
    while (pivots.length < pivotCount) {
      let maxDist = -1;
      let nextPivot = 0;
      for (let i = 0; i < N; i++) {
        if (distToPivots[i] > maxDist) {
          maxDist = distToPivots[i];
          nextPivot = i;
        }
      }
      pivots.push(nextPivot);
      const nextDists = new Float32Array(N);
      runSingleSourceDijkstra(graph, nextPivot, nextDists);
      pivotDists.set(nextPivot, nextDists);
      for (let i = 0; i < N; i++) {
        distToPivots[i] = Math.min(distToPivots[i], nextDists[i]);
      }
    }

    // Include all pairs between (pivot, node) and all direct edges
    const pairSet = new Set<number>();
    const tempU: number[] = [];
    const tempV: number[] = [];
    const tempD: number[] = [];
    const tempW: number[] = [];

    for (const p of pivots) {
      const pDists = pivotDists.get(p)!;
      for (let v = 0; v < N; v++) {
        if (p === v) continue;
        const low = Math.min(p, v);
        const high = Math.max(p, v);
        const key = low * N + high;
        if (!pairSet.has(key)) {
          pairSet.add(key);
          const d = pDists[v];
          if (Number.isFinite(d) && d > 1e-4) {
            tempU.push(localToGlobal[p]);
            tempV.push(localToGlobal[v]);
            tempD.push(d);
            tempW.push(1 / (d * d));
          }
        }
      }
    }

    for (const e of localEdges) {
      const low = Math.min(e.u, e.v);
      const high = Math.max(e.u, e.v);
      const key = low * N + high;
      if (!pairSet.has(key)) {
        pairSet.add(key);
        const d = e.length;
        if (Number.isFinite(d) && d > 1e-4) {
          tempU.push(localToGlobal[e.u]);
          tempV.push(localToGlobal[e.v]);
          tempD.push(d);
          tempW.push(1 / (d * d));
        }
      }
    }

    numPairs = tempU.length;
    pairU = new Int32Array(tempU);
    pairV = new Int32Array(tempV);
    pairD = new Float32Array(tempD);
    pairW = new Float32Array(tempW);
  }

  // Calculate dMax and dMin
  let dMax = 1.0;
  let dMin = Infinity;
  for (let p = 0; p < numPairs; p++) {
    const d = pairD[p];
    if (d > dMax) dMax = d;
    if (d < dMin) dMin = d;
  }
  if (!Number.isFinite(dMin)) dMin = 1.0;

  const etaMax = dMax * dMax;
  const etaMin = options.epsilon ?? 0.1;

  // Pre-allocate pair order indices for shuffling
  const order = new Int32Array(numPairs);
  for (let p = 0; p < numPairs; p++) {
    order[p] = p;
  }

  // Initial seeding if positions are all 0
  let allZero = true;
  for (let i = 0; i < N; i++) {
    const g = localToGlobal[i];
    if (posX[g] !== 0 || posY[g] !== 0) {
      allZero = false;
      break;
    }
  }

  if (allZero) {
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const g = localToGlobal[i];
      const r = 25 * Math.sqrt(i + 1);
      const theta = i * goldenAngle;
      posX[g] = r * Math.cos(theta);
      posY[g] = r * Math.sin(theta);
    }
  }

  const stressHistory: number[] = options.recordStressHistory ? [] : [];

  const calcCurrentStress = () => {
    let s = 0;
    for (let p = 0; p < numPairs; p++) {
      const u = pairU[p];
      const v = pairV[p];
      const dx = posX[u] - posX[v];
      const dy = posY[u] - posY[v];
      const dist = Math.sqrt(dx * dx + dy * dy);
      const diff = dist - pairD[p];
      s += pairW[p] * diff * diff;
    }
    return s;
  };

  if (options.recordStressHistory) {
    stressHistory.push(calcCurrentStress());
  }

  // Annealing SGD loop (Zheng, Pawar, Goodman 2018)
  // For large pair counts, a seeded coprime stride gives deterministic pseudo-random traversal
  // without the heavy overhead of repeated 500,000-element array shuffles.
  const coprime = numPairs > 3 ? (numPairs % 2 === 0 ? numPairs - 1 : numPairs - 2) : 1;

  for (let iter = 0; iter < iterations; iter++) {
    const eta = etaMax * Math.pow(etaMin / etaMax, iter / Math.max(1, iterations - 1));
    const offset = Math.floor(rand() * numPairs);

    // SGD updates
    for (let idx = 0; idx < numPairs; idx++) {
      const p = numPairs > 10000 ? (idx * coprime + offset) % numPairs : order[idx];
      const u = pairU[p];
      const v = pairV[p];
      const targetD = pairD[p];
      const w = pairW[p];

      let dx = posX[u] - posX[v];
      let dy = posY[u] - posY[v];
      let dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 1e-4) {
        const ang = rand() * 2 * Math.PI;
        dx = Math.cos(ang) * 0.1;
        dy = Math.sin(ang) * 0.1;
        dist = 0.1;
      }

      // Zheng et al. step formulation: mu = min(1.0, w * eta)
      const mu = Math.min(1.0, w * eta);
      const step = 0.5 * mu * ((dist - targetD) / dist);

      const sx = step * dx;
      const sy = step * dy;

      posX[u] -= sx;
      posY[u] -= sy;
      posX[v] += sx;
      posY[v] += sy;
    }

    if (options.recordStressHistory) {
      stressHistory.push(calcCurrentStress());
    }
  }

  return {
    stressHistory: options.recordStressHistory ? stressHistory : undefined,
    finalStress: calcCurrentStress(),
  };
}

/**
 * Computes stress value for a graph layout given target distances.
 */
export function computeStress(
  nodes: Array<{ id: string; x: number; y: number }>,
  targetDistances: Map<string, number>,
): number {
  let totalStress = 0;
  const N = nodes.length;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const u = nodes[i];
      const v = nodes[j];
      const key = `${u.id}::${v.id}`;
      const dTarget = targetDistances.get(key);
      if (dTarget !== undefined && dTarget > 0) {
        const dx = u.x - v.x;
        const dy = u.y - v.y;
        const dActual = Math.hypot(dx, dy);
        const w = 1 / (dTarget * dTarget);
        totalStress += w * (dActual - dTarget) * (dActual - dTarget);
      }
    }
  }
  return totalStress;
}

/**
 * Calculates Spearman rank correlation between target graph distances and Euclidean layout distances.
 */
export function spearmanCorrelation(
  nodes: Array<{ id: string }>,
  edges: Array<{ source: string; target: string; idealLength?: number; relation?: string }>,
  positions: Map<string, { x: number; y: number }>,
): number {
  const N = nodes.length;
  const idToIndex = new Map<string, number>();
  for (let i = 0; i < N; i++) idToIndex.set(nodes[i].id, i);

  const indexedEdges = edges
    .map((e) => ({
      u: idToIndex.get(e.source)!,
      v: idToIndex.get(e.target)!,
      length: e.idealLength ?? getIdealLength(e.relation),
    }))
    .filter((e) => e.u !== undefined && e.v !== undefined && e.u !== e.v);

  const dists = computeAllPairsShortestPaths(N, indexedEdges);

  const targetArr: number[] = [];
  const layoutArr: number[] = [];

  for (let i = 0; i < N; i++) {
    const idA = nodes[i].id;
    const posA = positions.get(idA);
    if (!posA) continue;
    for (let j = i + 1; j < N; j++) {
      const idB = nodes[j].id;
      const posB = positions.get(idB);
      if (!posB) continue;
      const dTarget = dists[i * N + j];
      if (Number.isFinite(dTarget) && dTarget > 0) {
        const dLayout = Math.hypot(posA.x - posB.x, posA.y - posB.y);
        targetArr.push(dTarget);
        layoutArr.push(dLayout);
      }
    }
  }

  const n = targetArr.length;
  if (n < 3) return 1.0;

  // Rank arrays
  const rank = (arr: number[]): Float64Array => {
    const indices = Array.from({ length: n }, (_, i) => i);
    indices.sort((a, b) => arr[a] - arr[b]);
    const ranks = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      ranks[indices[i]] = i + 1;
    }
    return ranks;
  };

  const rankTarget = rank(targetArr);
  const rankLayout = rank(layoutArr);

  let dSqSum = 0;
  for (let i = 0; i < n; i++) {
    const diff = rankTarget[i] - rankLayout[i];
    dSqSum += diff * diff;
  }

  return 1 - (6 * dSqSum) / (n * (n * n - 1));
}

/**
 * Main Stress-SGD layout solver.
 * Handles connected components, sparse pivots for large graphs, and determinism.
 */
export function solveStressSGD<T extends { id: string; x: number; y: number; [k: string]: any }>(
  nodes: T[],
  edges: Array<{ source: string; target: string; idealLength?: number; relation?: string; [k: string]: any }>,
  options: StressSgdOptions = {},
): StressSgdResult {
  const N = nodes.length;
  const positions = new Map<string, { x: number; y: number }>();

  if (N === 0) {
    return { positions, finalStress: 0 };
  }
  if (N === 1) {
    positions.set(nodes[0].id, { x: 0, y: 0 });
    return { positions, finalStress: 0 };
  }

  const idToIndex = new Map<string, number>();
  const posX = new Float32Array(N);
  const posY = new Float32Array(N);

  for (let i = 0; i < N; i++) {
    idToIndex.set(nodes[i].id, i);
    posX[i] = nodes[i].x ?? 0;
    posY[i] = nodes[i].y ?? 0;
  }

  const indexedEdges: Array<{ u: number; v: number; length: number }> = [];
  const adj = Array.from({ length: N }, () => [] as number[]);

  for (const edge of edges) {
    const u = idToIndex.get(edge.source);
    const v = idToIndex.get(edge.target);
    if (u === undefined || v === undefined || u === v) continue;
    const len = options.getIdealLength
      ? options.getIdealLength(edge)
      : (edge.idealLength ?? getIdealLength(edge.relation));
    indexedEdges.push({ u, v, length: len });
    adj[u].push(v);
    adj[v].push(u);
  }

  // Partition into connected components via BFS
  const visited = new Uint8Array(N);
  const components: number[][] = [];

  for (let i = 0; i < N; i++) {
    if (visited[i]) continue;
    const comp: number[] = [];
    const queue: number[] = [i];
    visited[i] = 1;

    while (queue.length > 0) {
      const curr = queue.shift()!;
      comp.push(curr);
      for (const neighbor of adj[curr]) {
        if (!visited[neighbor]) {
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      }
    }
    components.push(comp);
  }

  // Edge lookup by component
  const compEdgeMap = new Map<number, Array<{ u: number; v: number; length: number }>>();
  const nodeCompIdx = new Int32Array(N);
  for (let c = 0; c < components.length; c++) {
    for (const nodeIdx of components[c]) {
      nodeCompIdx[nodeIdx] = c;
    }
    compEdgeMap.set(c, []);
  }

  for (const edge of indexedEdges) {
    const c = nodeCompIdx[edge.u];
    if (c === nodeCompIdx[edge.v]) {
      compEdgeMap.get(c)!.push(edge);
    }
  }

  let totalFinalStress = 0;
  let combinedHistory: number[] | undefined = options.recordStressHistory ? [] : undefined;

  // Lay out each component
  interface CompBounds {
    cIdx: number;
    cx: number;
    cy: number;
    radius: number;
  }
  const componentBounds: CompBounds[] = [];

  for (let c = 0; c < components.length; c++) {
    const comp = components[c];
    const cEdges = compEdgeMap.get(c)!;

    const res = solveComponentStressSGD(comp, cEdges, posX, posY, options);
    totalFinalStress += res.finalStress;

    if (options.recordStressHistory && res.stressHistory) {
      if (combinedHistory!.length === 0) {
        combinedHistory = [...res.stressHistory];
      } else {
        for (let t = 0; t < res.stressHistory.length; t++) {
          combinedHistory![t] = (combinedHistory![t] ?? 0) + res.stressHistory[t];
        }
      }
    }

    // Centroid and radius of component
    let sumX = 0;
    let sumY = 0;
    for (const idx of comp) {
      sumX += posX[idx];
      sumY += posY[idx];
    }
    const cx = sumX / comp.length;
    const cy = sumY / comp.length;
    let maxR = 20;
    for (const idx of comp) {
      posX[idx] -= cx;
      posY[idx] -= cy;
      const r = Math.hypot(posX[idx], posY[idx]);
      if (r > maxR) maxR = r;
    }
    componentBounds.push({ cIdx: c, cx: 0, cy: 0, radius: maxR + 30 });
  }

  // Pack disconnected components (spiral placement)
  if (components.length > 1) {
    componentBounds.sort((a, b) => b.radius - a.radius);
    const placed: Array<{ x: number; y: number; r: number; cIdx: number }> = [];

    for (const cb of componentBounds) {
      if (placed.length === 0) {
        placed.push({ x: 0, y: 0, r: cb.radius, cIdx: cb.cIdx });
        continue;
      }
      // Spiral search for non-overlapping placement
      let angle = 0;
      let radiusStep = 30;
      let dist = placed[0].r + cb.radius;
      let bestX = 0;
      let bestY = 0;
      let found = false;

      for (let step = 0; step < 300; step++) {
        angle += 0.5;
        dist += radiusStep * 0.05;
        const testX = dist * Math.cos(angle);
        const testY = dist * Math.sin(angle);

        let collides = false;
        for (const p of placed) {
          const minSep = p.r + cb.radius + 20;
          if (Math.hypot(testX - p.x, testY - p.y) < minSep) {
            collides = true;
            break;
          }
        }
        if (!collides) {
          bestX = testX;
          bestY = testY;
          found = true;
          break;
        }
      }

      if (!found) {
        bestX = dist * Math.cos(angle);
        bestY = dist * Math.sin(angle);
      }

      placed.push({ x: bestX, y: bestY, r: cb.radius, cIdx: cb.cIdx });
    }

    for (const p of placed) {
      const comp = components[p.cIdx];
      for (const idx of comp) {
        posX[idx] += p.x;
        posY[idx] += p.y;
      }
    }
  }

  for (let i = 0; i < N; i++) {
    positions.set(nodes[i].id, { x: posX[i], y: posY[i] });
  }

  return {
    positions,
    stressHistory: combinedHistory,
    finalStress: totalFinalStress,
  };
}
