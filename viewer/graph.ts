/**
 * Hardware-accelerated WebGL graph view using Sigma.js and Graphology.
 *
 * Edge grammar (per the design spec):
 *   part of            thick · muted
 *   uses-family        solid · directed arrow
 *   extends/implements directed arrow
 *   references         faint
 *   transitive edges   distinct stroke · inferred
 *
 * Focus mode: selecting a node highlights incoming edges (accent),
 * outgoing edges (amber), keeps direct neighbors visible, and dims
 * the rest of the graph via reactive WebGL reducers.
 */
import "./webgl-shim.js";
import Sigma, { DEFAULT_STYLES } from "sigma";
import { pathCurved, pathLine, pathLoop, extremityArrow } from "sigma/rendering";
import { MultiDirectedGraph } from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
} from "d3-force";
import { twoLevelLayout } from "./layout/two-level.js";
import {
  type VizGraph, type NodeOwner, type TripartiteScope, type ConcreteScope,
  type EdgeContractionMode, type CosmosWeightTuning, type EdgeBundleMeta,
  COSMOS_PRESETS, SEMANTIC_RELATION_WEIGHTS, SUPPORT_CLASS_EDGE_WEIGHT,
  detectSupportNodes, computeHierarchicalEdgeBundles, seedClusteredPositions,
  famOf, chipKey, colorToken, cvar, matchNodeFilter, scopeOfNode,
  generateTransitiveEdges, relationColor, aggregateGraphToParents, parentIdOfNode,
  clusterKeyOfNode, galaxyColorOfCluster, computeEdgeLayoutWeight, separateGalaxies,
  computeGalaxyLandmarks, relaxLocalNeighborhood, type TriStateFilterResult,
  extractTreeBackbone, relaxAndSeparateGalaxiesVectorized, lerpNodePositions, FlatSpatialGrid,
  consolidateOrphanClusters, synthesizeDirectoryTree, applyCosmosConcentricLayout,
} from "./data.js";

export type GraphLayoutEngine = "stress" | "cosmos" | "d3" | "legacy";

/**
 * Original upstream D3-force graph layout algorithm (from NanoNets/context-graph-engine):
 * - Barnes-Hut repulsion: forceManyBody().strength(-220)
 * - Hooke's Law semantic springs: forceLink().distance(REST[family]).strength(0.5)
 *     structure (contains, part_of): 85px
 *     dependency (uses, calls, imports, depends_on): 145px
 *     contract (implements, extends, validates): 150px
 *     association (references, documents, influences): 185px
 * - Centering: forceCenter(0, 0)
 * - Collision avoidance: forceCollide().radius((n) => n.r + 6)
 */
export function applyClassicD3ForceLayout(
  nodes: SimNode[],
  edges: Array<{ source: string; target: string; relation?: string }>,
  iterations = 220,
): void {
  if (nodes.length === 0) return;

  const nodeMap = new Map<string, SimNode>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  const validLinks: Array<{ source: SimNode; target: SimNode; relation?: string }> = [];
  for (const e of edges) {
    const s = nodeMap.get(e.source);
    const t = nodeMap.get(e.target);
    if (s && t && s !== t) {
      validLinks.push({ source: s, target: t, relation: e.relation });
    }
  }

  const REST_DISTANCES: Record<string, number> = {
    structure: 85,
    dependency: 145,
    contract: 150,
    association: 185,
  };

  const sim = forceSimulation(nodes as any)
    .force("charge", forceManyBody().strength(-220))
    .force(
      "link",
      forceLink(validLinks as any)
        .distance((l: any) => {
          const fam = famOf(l.relation || "uses");
          return REST_DISTANCES[fam] ?? 145;
        })
        .strength(0.5),
    )
    .force("center", forceCenter(0, 0))
    .force(
      "collide",
      forceCollide<any>().radius((n: any) => (n.r || 8) + 6),
    )
    .stop();

  for (let i = 0; i < iterations; i++) {
    sim.tick();
  }
}

export interface SimNode {
  id: string;
  name: string;
  type: string;
  sources?: string[];
  scope: "code" | "docs" | "specs";
  deg: number;
  r: number;
  owners?: NodeOwner[];
  x: number;
  y: number;
  clusterKey?: string;
  isSupportNode?: boolean;
}

export interface NodeAttrs {
  x: number;
  y: number;
  size: number;
  color: string;
  label: string;
  nodeType: string;
  scope: "code" | "docs" | "specs";
  hidden?: boolean;
  visibility?: "visible" | "hidden";
  labelVisibility?: "visible" | "hidden";
  labelPosition?: "below" | "above" | "left" | "right" | "over";
  labelSize?: number;
  labelColor?: string;
  labelBackgroundColor?: string;
  labelBackgroundPadding?: number;
  isSupportNode?: boolean;
}

export interface EdgeAttrs {
  relation: string;
  description?: string;
  confidence?: string;
  transitive?: boolean;
  via?: string[];
  size: number;
  color: string;
  weight?: number;
  intraCluster?: boolean;
  hidden?: boolean;
  visibility?: "visible" | "hidden";
  isBackbone?: boolean;
  isSupportEdge?: boolean;
  restOpacity?: number;
  restSize?: number;
  path?: string;
  curvature?: number;
  head?: string;
  label?: string;
  labelVisibility?: "visible" | "hidden";
  forceLabel?: boolean;
}

function colorWithAlpha(color: string, alpha: number): string {
  if (color.startsWith("#")) {
    const c = color.slice(1);
    const num = parseInt(c.length === 3 ? c.split("").map((x) => x + x).join("") : c, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (color.startsWith("rgb")) {
    return color.replace(/rgb\((.+)\)/, `rgba($1, ${alpha})`).replace(/rgba\(([^,]+,[^,]+,[^,]+),[^)]+\)/, `rgba($1, ${alpha})`);
  }
  return color;
}

function parseColorToRgba(color: string, alpha: number): [number, number, number, number] {
  if (color.startsWith("#")) {
    const c = color.slice(1);
    const num = parseInt(c.length === 3 ? c.split("").map((x) => x + x).join("") : c, 16);
    return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255, alpha];
  }
  if (color.startsWith("rgb")) {
    const match = color.match(/\d+/g);
    if (match && match.length >= 3) {
      return [Number(match[0]) / 255, Number(match[1]) / 255, Number(match[2]) / 255, alpha];
    }
  }
  return [0.22, 0.74, 0.97, alpha];
}

export class GraphView {
  private container: HTMLElement;
  private graph: MultiDirectedGraph<NodeAttrs, EdgeAttrs>;
  private sigma: Sigma<NodeAttrs, EdgeAttrs>;
  private tab: "context" | "code" = "context";
  private rawGraph: VizGraph | null = null;
  private nodes: SimNode[] = [];
  private nodeMap = new Map<string, SimNode>();
  private neighbors = new Set<string>();
  private archGL: WebGL2RenderingContext | null = null;
  private archProgram: WebGLProgram | null = null;
  private archQuadBuffer: WebGLBuffer | null = null;
  private archInstanceBuffer: WebGLBuffer | null = null;
  private archBadgeCanvas: HTMLCanvasElement | null = null;
  private archBadgeCtx: CanvasRenderingContext2D | null = null;

  hovered: string | null = null;
  private hoverNeighbors = new Set<string>();
  selected: string | null = null;
  query = "";
  hiddenRels: Record<string, boolean> = {};
  hiddenTypes: Record<string, boolean> = {};
  scope: TripartiteScope = "all";
  scopes?: Set<ConcreteScope>;
  excludeDirs: string[] = [];
  selectedFiles?: Set<string>;
  showTransitive = true;
  showOwners = true;
  showBlooms = false;
  rainbowEdges = true;
  aggregateToParent = true;
  private bloomSlowFrameCount = 0;
  onBloomsThrottled?: () => void;
  private sourceGraph: VizGraph | null = null;
  private lastLayoutKey = "";
  private draggedNode: string | null = null;
  onSelect: (id: string | null) => void = () => {};
  cachedVisibleCount = 0;
  cachedMaxDeg = 0;
  landmarkSet = new Set<string>();
  triStateResult: TriStateFilterResult | null = null;
  public autoRebounce = true;
  public layoutEngine: GraphLayoutEngine = "stress";
  public contractionMode: EdgeContractionMode = "coupled";
  public weightTuning: CosmosWeightTuning = { ...COSMOS_PRESETS.coupled };
  public supportNodes: Set<string> = new Set<string>();
  private rebounceAnimId: number | null = null;
  private dragSimulator: {
    activeNodes: SimNode[];
    idToIndex: Map<string, number>;
    posX: Float32Array;
    posY: Float32Array;
    velX: Float32Array;
    velY: Float32Array;
    forceX: Float32Array;
    forceY: Float32Array;
    radii: Float32Array;
    nodeStiffSum: Float32Array;
    pinnedIdx: number;
    edgeU: Int32Array;
    edgeV: Int32Array;
    edgeRest: Float32Array;
    edgeStiff: Float32Array;
    edgeCount: number;
    settlingFrames: number;
  } | null = null;
  private dragAnimId: number | null = null;
  private lastDraggedNode: string | null = null;

  setLayoutEngine(engine: GraphLayoutEngine): void {
    this.layoutEngine = engine;
    this.persistCosmosConfig();
    if (this.autoRebounce) {
      this.rebounceVisible();
    }
  }

  onNodeDragMove(nodeId: string, x: number, y: number): void {
    this.draggedNode = nodeId;
    if (!this.dragSimulator || this.dragSimulator.pinnedIdx === -1) {
      this.initDragSimulation(nodeId, { x, y });
    } else {
      this.dragSimulator.posX[this.dragSimulator.pinnedIdx] = x;
      this.dragSimulator.posY[this.dragSimulator.pinnedIdx] = y;
    }
    this.stepDragVerlet(0.25);
  }

  onNodeDragEnd(): void {
    this.draggedNode = null;
    if (this.dragSimulator) {
      this.dragSimulator = null;
    }
  }

  private loadPersistedCosmosConfig(): {
    mode?: EdgeContractionMode;
    tuning?: Partial<CosmosWeightTuning>;
    layoutEngine?: GraphLayoutEngine;
  } | null {
    if (typeof localStorage === "undefined") return null;
    try {
      const raw = localStorage.getItem("graft.cosmosConfig");
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
    return null;
  }

  private persistCosmosConfig(): void {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem("graft.cosmosConfig", JSON.stringify({
        mode: this.contractionMode,
        tuning: this.weightTuning,
        layoutEngine: this.layoutEngine,
      }));
    } catch {
      // ignore
    }
  }

  setContractionMode(mode: EdgeContractionMode): void {
    this.contractionMode = mode;
    this.weightTuning = { ...(COSMOS_PRESETS[mode] ?? COSMOS_PRESETS.coupled) };
    const heuristicsActive = this.weightTuning.useHeuristics !== false;
    this.graph.forEachEdge((edgeKey, attrs) => {
      const isIntra = attrs.intraCluster !== false;
      const target = this.graph.target(edgeKey);
      const isSupportTarget = heuristicsActive && (this.supportNodes?.has(target) ?? false);
      const weight = computeEdgeLayoutWeight(attrs.relation, isIntra, !!attrs.transitive, mode, isSupportTarget, this.weightTuning);
      this.graph.setEdgeAttribute(edgeKey, "weight", weight);
      this.graph.setEdgeAttribute(edgeKey, "isSupportEdge", isSupportTarget && (famOf(attrs.relation) === "dependency" || attrs.relation === "references"));
    });
    this.persistCosmosConfig();
    if (this.autoRebounce) {
      this.rebounceVisible();
    }
  }

  setWeightTuning(tuning: Partial<CosmosWeightTuning>): void {
    this.weightTuning = { ...this.weightTuning, ...tuning };
    if (tuning.useHeuristics !== undefined && this.rawGraph) {
      if (this.weightTuning.useHeuristics === false) {
        this.supportNodes.clear();
      } else {
        const nodesWithScope = this.rawGraph.nodes.map((n) => ({ ...n, scope: scopeOfNode(n) }));
        const nodeClusterKeys = consolidateOrphanClusters(nodesWithScope);
        this.supportNodes = detectSupportNodes(this.rawGraph.nodes, this.rawGraph.edges, nodeClusterKeys);
      }
      for (const n of this.nodes) {
        n.isSupportNode = this.supportNodes.has(n.id);
        if (this.graph.hasNode(n.id)) {
          this.graph.setNodeAttribute(n.id, "isSupportNode", n.isSupportNode);
          this.graph.setNodeAttribute(n.id, "label", n.isSupportNode ? `◈ ${n.name}` : n.name);
        }
      }
    }
    const heuristicsActive = this.weightTuning.useHeuristics !== false;
    this.graph.forEachEdge((edgeKey, attrs) => {
      const isIntra = attrs.intraCluster !== false;
      const target = this.graph.target(edgeKey);
      const isSupportTarget = heuristicsActive && (this.supportNodes?.has(target) ?? false);
      const weight = computeEdgeLayoutWeight(attrs.relation, isIntra, !!attrs.transitive, this.contractionMode, isSupportTarget, this.weightTuning);
      this.graph.setEdgeAttribute(edgeKey, "weight", weight);
      this.graph.setEdgeAttribute(edgeKey, "isSupportEdge", isSupportTarget && (famOf(attrs.relation) === "dependency" || attrs.relation === "references"));
    });
    this.persistCosmosConfig();
    this.restyle();
    if (this.autoRebounce) {
      this.rebounceVisible();
    }
  }

  private initDragSimulation(draggedId: string, coords: { x: number; y: number }): void {
    const existingNode = this.nodeMap.get(draggedId);
    const connectedIds = new Set<string>([draggedId]);
    if (this.graph.hasNode(draggedId)) {
      this.graph.forEachNeighbor(draggedId, (nbr) => {
        connectedIds.add(nbr);
        this.graph.forEachNeighbor(nbr, (n2) => connectedIds.add(n2));
      });
    }
    const cKey = existingNode?.clusterKey ?? clusterKeyOfNode(existingNode ?? { id: draggedId, scope: "code" }).key;
    for (const n of this.nodes) {
      if (this.isNodeShown(n) && (n.clusterKey === cKey || connectedIds.has(n.id))) {
        connectedIds.add(n.id);
      }
    }
    if (this.nodes.length <= 300) {
      for (const n of this.nodes) {
        if (this.isNodeShown(n)) connectedIds.add(n.id);
      }
    }

    const activeNodes = this.nodes.filter((n) => connectedIds.has(n.id) && this.isNodeShown(n));
    const M = activeNodes.length;
    const idToIndex = new Map<string, number>();
    const posX = new Float32Array(M);
    const posY = new Float32Array(M);
    const velX = new Float32Array(M);
    const velY = new Float32Array(M);
    const forceX = new Float32Array(M);
    const forceY = new Float32Array(M);
    const radii = new Float32Array(M);
    const nodeStiffSum = new Float32Array(M);

    let pinnedIdx = -1;
    for (let i = 0; i < M; i++) {
      const n = activeNodes[i];
      idToIndex.set(n.id, i);
      // Seed with pre-drag resting coordinates so initial edge rest lengths are measured accurately
      posX[i] = Number.isFinite(n.x) ? n.x : 0;
      posY[i] = Number.isFinite(n.y) ? n.y : 0;
      radii[i] = n.r ?? 6;
      if (n.id === draggedId) pinnedIdx = i;
    }

    const maxEdges = Math.max(128, this.graph.size + 16);
    const edgeU = new Int32Array(maxEdges);
    const edgeV = new Int32Array(maxEdges);
    const edgeRest = new Float32Array(maxEdges);
    const edgeStiff = new Float32Array(maxEdges);
    let edgeCount = 0;
    const pairIndexMap = new Map<number, number>();

    this.graph.forEachEdge((edgeKey, attrs) => {
      if (edgeCount >= maxEdges) return;
      const src = this.graph.source(edgeKey);
      const tgt = this.graph.target(edgeKey);
      const u = idToIndex.get(src);
      const v = idToIndex.get(tgt);
      if (u !== undefined && v !== undefined && u !== v) {
        const sameCluster = attrs.intraCluster ?? (activeNodes[u].clusterKey === activeNodes[v].clusterKey);
        const fam = famOf(attrs.relation);
        const baseRest = sameCluster ? (fam === "structure" ? 38.0 : 50.0) : 130.0;
        const baseStiff = sameCluster ? (fam === "structure" ? 0.35 : 0.24) : 0.1;
        const weight = computeEdgeLayoutWeight(attrs.relation, sameCluster, attrs.transitive, this.contractionMode);
        const pinBoost = u === pinnedIdx || v === pinnedIdx ? 1.8 : 1.0;
        const stiff = baseStiff * Math.max(0.4, Math.min(2.5, weight)) * pinBoost;

        const lo = u < v ? u : v;
        const hi = u < v ? v : u;
        const pairKey = lo * M + hi;
        const existingEdgeIdx = pairIndexMap.get(pairKey);
        if (existingEdgeIdx !== undefined) {
          if (stiff > edgeStiff[existingEdgeIdx]) {
            const diff = stiff - edgeStiff[existingEdgeIdx];
            edgeStiff[existingEdgeIdx] = stiff;
            nodeStiffSum[u] += diff;
            nodeStiffSum[v] += diff;
          }
          return;
        }

        const dx0 = posX[v] - posX[u];
        const dy0 = posY[v] - posY[u];
        const d0 = Math.sqrt(dx0 * dx0 + dy0 * dy0) || baseRest;

        pairIndexMap.set(pairKey, edgeCount);
        edgeU[edgeCount] = u;
        edgeV[edgeCount] = v;
        edgeRest[edgeCount] = Math.max(28.0, Math.min(d0, sameCluster ? 85.0 : 165.0));
        edgeStiff[edgeCount] = stiff;
        nodeStiffSum[u] += stiff;
        nodeStiffSum[v] += stiff;
        edgeCount++;
      }
    });

    if (pinnedIdx >= 0 && Number.isFinite(coords.x) && Number.isFinite(coords.y)) {
      posX[pinnedIdx] = coords.x;
      posY[pinnedIdx] = coords.y;
    }

    this.dragSimulator = {
      activeNodes,
      idToIndex,
      posX,
      posY,
      velX,
      velY,
      forceX,
      forceY,
      radii,
      nodeStiffSum,
      pinnedIdx,
      edgeU,
      edgeV,
      edgeRest,
      edgeStiff,
      edgeCount,
      settlingFrames: 0,
    };
  }

  private stepDragVerlet(alpha: number): void {
    if (!this.dragSimulator) return;
    const {
      activeNodes, posX, posY, velX, velY, forceX, forceY, radii,
      nodeStiffSum, pinnedIdx, edgeU, edgeV, edgeRest, edgeStiff, edgeCount,
    } = this.dragSimulator;
    const M = activeNodes.length;
    forceX.fill(0);
    forceY.fill(0);

    for (let k = 0; k < edgeCount; k++) {
      const u = edgeU[k];
      const v = edgeV[k];
      const dx = posX[v] - posX[u];
      const dy = posY[v] - posY[u];
      const d = Math.sqrt(dx * dx + dy * dy) || 1.0;
      const force = ((d - edgeRest[k]) / d) * edgeStiff[k];
      const fx = dx * force;
      const fy = dy * force;
      forceX[u] += fx;
      forceY[u] += fy;
      forceX[v] -= fx;
      forceY[v] -= fy;
    }

    // Normalize spring force by incident stiffness sum (d3-force link degree normalization)
    // so high-degree hubs never exceed the Verlet stability limit and explode off-screen
    for (let i = 0; i < M; i++) {
      const norm = Math.max(1.0, nodeStiffSum[i] * 1.35);
      forceX[i] /= norm;
      forceY[i] /= norm;
    }

    for (let i = 0; i < M; i++) {
      for (let j = i + 1; j < M; j++) {
        const dx = posX[j] - posX[i];
        const dy = posY[j] - posY[i];
        const d = Math.sqrt(dx * dx + dy * dy) || 0.1;
        const minD = radii[i] + radii[j] + 10.0;
        if (d < minD) {
          const push = ((minD - d) / d) * 0.18;
          forceX[i] -= dx * push;
          forceY[i] -= dy * push;
          forceX[j] += dx * push;
          forceY[j] += dy * push;
        }
      }
    }

    const decay = 0.82;
    const maxSpeed = 24.0;
    const maxSpeedSq = maxSpeed * maxSpeed;
    for (let i = 0; i < M; i++) {
      if (i === pinnedIdx && this.draggedNode) {
        velX[i] = 0;
        velY[i] = 0;
        continue;
      }
      let vx = (velX[i] + forceX[i] * alpha) * decay;
      let vy = (velY[i] + forceY[i] * alpha) * decay;
      const vSq = vx * vx + vy * vy;
      if (vSq > maxSpeedSq) {
        const scale = maxSpeed / Math.sqrt(vSq);
        vx *= scale;
        vy *= scale;
      }
      if (!Number.isFinite(vx)) vx = 0;
      if (!Number.isFinite(vy)) vy = 0;
      velX[i] = vx;
      velY[i] = vy;
      posX[i] += vx;
      posY[i] += vy;
    }

    for (let i = 0; i < M; i++) {
      const n = activeNodes[i];
      if (!Number.isFinite(posX[i]) || !Number.isFinite(posY[i])) continue;
      n.x = posX[i];
      n.y = posY[i];
      if (this.graph.hasNode(n.id)) {
        this.graph.setNodeAttribute(n.id, "x", posX[i]);
        this.graph.setNodeAttribute(n.id, "y", posY[i]);
      }
    }
  }

  private spatialGrid = new FlatSpatialGrid();
  private bloomScreenX = new Float32Array(256);
  private bloomScreenY = new Float32Array(256);
  private bloomClusterIds = new Int32Array(256);
  private bloomNeighbors = new Int32Array(256);
  private bloomCloseness = new Float32Array(256);
  private bloomInstances = new Float32Array(256 * 8);
  private clusterIdMap = new Map<string, number>();
  private lastTransitiveSignature = "";
  private themeColors = {
    ink: "#E7E9EA",
    panel: "#15181B",
    chip: "#1C2125",
    muted: "#8B9298",
    edge: "#3b4d54",
    amber: "#fbbf24",
    accent: "#38bdf8",
  };

  private refreshThemeColors(): void {
    this.themeColors = {
      ink: cvar("--ink") || "#E7E9EA",
      panel: cvar("--panel") || "#15181B",
      chip: cvar("--chip") || "#1C2125",
      muted: cvar("--muted") || "#8B9298",
      edge: cvar("--edge") || "#3b4d54",
      amber: cvar("--amber") || "#fbbf24",
      accent: cvar("--accent") || "#38bdf8",
    };
  }

  setTriStateFilter(result: TriStateFilterResult | null): void {
    this.triStateResult = result;
    this.restyle();
  }

  constructor(container: HTMLElement | SVGElement | any) {
    if (typeof SVGElement !== "undefined" && container instanceof SVGElement) {
      const div = document.createElement("div");
      div.className = container.getAttribute("class") || "graph";
      div.id = container.id || "graphContainer";
      container.replaceWith(div);
      this.container = div;
    } else {
      this.container = container;
    }
    if (this.container && this.container.style) {
      this.container.style.position = "relative";
    }

    const saved = this.loadPersistedCosmosConfig();
    if (saved) {
      if (saved.mode && COSMOS_PRESETS[saved.mode]) {
        this.contractionMode = saved.mode;
      }
      const basePreset = COSMOS_PRESETS[this.contractionMode] ?? COSMOS_PRESETS.coupled;
      this.weightTuning = { ...basePreset, ...(saved.tuning ?? {}) };
      if (
        saved.layoutEngine === "stress" ||
        saved.layoutEngine === "cosmos" ||
        saved.layoutEngine === "d3" ||
        saved.layoutEngine === "legacy"
      ) {
        this.layoutEngine = saved.layoutEngine;
      }
    }

    this.graph = new MultiDirectedGraph<NodeAttrs, EdgeAttrs>();

    try {
      this.sigma = new Sigma(this.graph, this.container, {
        settings: {
          renderLabels: true,
          renderEdgeLabels: true,
          enableNodeDrag: true,
          stagePadding: 50,
          labelRenderedSizeThreshold: 8.0,
          labelDensity: 0.75,
          labelGridCellSize: 110,
          itemSizesReference: "screen",
          zoomToSizeRatioFunction: Math.sqrt,
          autoRescale: false,
          minEdgeThickness: 1,
        },
        primitives: {
          edges: {
            paths: [
              pathCurved({ segments: 18, curvature: { attribute: "curvature", default: 0.16 } }),
              pathLine(),
              pathLoop(),
            ],
            extremities: [extremityArrow({ lengthRatio: 4.5, widthRatio: 3.5 })],
            defaultHead: "arrow",
          },
        },
        styles: {
          edges: {
            ...DEFAULT_STYLES.edges,
            path: { attribute: "path", defaultValue: "curved" },
            head: { attribute: "head", defaultValue: "arrow" },
            size: { attribute: "size", defaultValue: 1.4 },
            color: { attribute: "color", defaultValue: "#38bdf8" },
          },
        },
        nodeReducer: (nodeId, data) => this.reduceNode(nodeId, data),
        edgeReducer: (edgeId, data) => this.reduceEdge(edgeId, data),
      });
    } catch {
      this.sigma = null as any;
    }

    if (this.sigma) {
      try {
        this.archGL = this.sigma.createWebGLContext("archipelago", {
          beforeLayer: "stage",
          style: { pointerEvents: "none" },
        });
        this.initArchipelagoWebGL();
      } catch {
        this.archGL = null;
      }

      try {
        this.archBadgeCanvas = this.sigma.createCanvas("archipelago-badges", {
          beforeLayer: "mouse",
          style: { pointerEvents: "none" },
        });
        this.archBadgeCtx = this.archBadgeCanvas.getContext("2d");
      } catch {
        this.archBadgeCanvas = null;
        this.archBadgeCtx = null;
      }

      this.sigma.on("clickNode", (event) => {
        this.select(event.node);
      });

      this.sigma.on("clickStage", () => {
        this.select(null);
      });

      this.sigma.on("enterNode", (event) => {
        this.hovered = event.node;
        this.hoverNeighbors.clear();
        if (this.graph.hasNode(event.node)) {
          this.graph.forEachNeighbor(event.node, (nbr) => {
            this.hoverNeighbors.add(nbr);
          });
        }
        this.sigma?.refresh();
        this.drawArchipelago();
      });

      this.sigma.on("leaveNode", () => {
        this.hovered = null;
        this.hoverNeighbors.clear();
        this.sigma?.refresh();
        this.drawArchipelago();
      });

      this.sigma.getCamera().on("updated", () => {
        this.drawArchipelago();
      });

      if (typeof window !== "undefined") {
        window.addEventListener("resize", () => {
          this.drawArchipelago();
        });
      }

      this.sigma.on("nodeDrag", (e) => {
        this.draggedNode = e.node;
        this.lastDraggedNode = e.node;
        const hasDragSession = Boolean((this.sigma as any)?.internals?.dragManager?.session);
        const gx = this.graph.hasNode(e.node) ? this.graph.getNodeAttribute(e.node, "x") : undefined;
        const gy = this.graph.hasNode(e.node) ? this.graph.getNodeAttribute(e.node, "y") : undefined;
        const coords = (hasDragSession && typeof gx === "number" && typeof gy === "number" && Number.isFinite(gx) && Number.isFinite(gy))
          ? { x: gx, y: gy }
          : this.sigma.viewportToGraph(e.event);

        if (
          !this.dragSimulator ||
          this.dragSimulator.pinnedIdx === -1 ||
          this.dragSimulator.activeNodes[this.dragSimulator.pinnedIdx]?.id !== e.node
        ) {
          this.initDragSimulation(e.node, coords);
        } else {
          this.dragSimulator.posX[this.dragSimulator.pinnedIdx] = coords.x;
          this.dragSimulator.posY[this.dragSimulator.pinnedIdx] = coords.y;
        }

        // Always step at least 1 physics tick immediately (essential for synchronous unit tests)
        this.stepDragVerlet(0.25);

        if (this.dragAnimId === null && typeof requestAnimationFrame !== "undefined") {
          const runDragLoop = () => {
            if (this.draggedNode) {
              this.stepDragVerlet(0.25);
              this.drawArchipelago();
              this.dragAnimId = requestAnimationFrame(runDragLoop);
            } else if (this.dragSimulator && this.dragSimulator.settlingFrames > 0) {
              this.dragSimulator.settlingFrames--;
              const decayAlpha = 0.25 * (this.dragSimulator.settlingFrames / 25);
              this.stepDragVerlet(decayAlpha);
              this.drawArchipelago();
              this.dragAnimId = requestAnimationFrame(runDragLoop);
            } else {
              this.dragAnimId = null;
              this.dragSimulator = null;
              this.sigma?.refresh();
              this.drawArchipelago();
            }
          };
          this.dragAnimId = requestAnimationFrame(runDragLoop);
        }

        this.drawArchipelago();
      });

      this.sigma.on("nodeDragEnd", () => {
        const releasedNode = this.draggedNode || this.lastDraggedNode;
        this.draggedNode = null;
        if (this.dragSimulator) {
          this.dragSimulator.pinnedIdx = -1;
          this.dragSimulator.settlingFrames = 25;
        }

        if (typeof requestAnimationFrame === "undefined") {
          if (this.dragSimulator) {
            for (let f = 25; f > 0; f--) {
              this.stepDragVerlet(0.25 * (f / 25));
            }
          }
          if (releasedNode && this.graph.hasNode(releasedNode)) {
            const neighborIds = new Set<string>();
            this.graph.forEachNeighbor(releasedNode, (nbr) => {
              neighborIds.add(nbr);
            });
            relaxLocalNeighborhood(this.nodes, releasedNode, neighborIds, 8);
            for (const nbr of neighborIds) {
              const n = this.nodeMap.get(nbr);
              if (n && this.graph.hasNode(nbr)) {
                this.graph.setNodeAttribute(nbr, "x", n.x);
                this.graph.setNodeAttribute(nbr, "y", n.y);
              }
            }
          }
          this.dragSimulator = null;
        }

        this.sigma?.refresh();
        this.drawArchipelago();
      });
    }
  }

  /** Load (or morph into) a new dataset. */
  setData(graph: VizGraph, tab: "context" | "code"): void {
    const layoutKey = `${tab}:${tab === "code" ? this.aggregateToParent : false}`;
    const canReusePositions = this.lastLayoutKey === layoutKey && this.graph.order > 0;
    this.lastLayoutKey = layoutKey;

    this.lastTransitiveSignature = "";
    this.tab = tab;
    this.sourceGraph = graph;
    const effectiveGraph = (this.aggregateToParent && tab === "code")
      ? aggregateGraphToParents(graph)
      : graph;
    this.rawGraph = effectiveGraph;

    const deg: Record<string, number> = {};
    for (const e of effectiveGraph.edges) {
      deg[e.source] = (deg[e.source] ?? 0) + 1;
      deg[e.target] = (deg[e.target] ?? 0) + 1;
    }

    const prevPositions = new Map<string, { x: number; y: number }>();
    if (canReusePositions) {
      this.graph.forEachNode((id, attrs) => {
        prevPositions.set(id, { x: attrs.x, y: attrs.y });
      });
    }

    // Build a detached Graphology instance so adding 3,000+ nodes and 12,000+ edges
    // does not fire 15,000+ synchronous Sigma WebGL buffer/event callbacks.
    const nextGraph = new MultiDirectedGraph<NodeAttrs, EdgeAttrs>();
    this.nodeMap.clear();

    // Group nodes by architectural subsystem cluster and consolidate 1-node orphan clusters
    const nodesWithScope = effectiveGraph.nodes.map((n) => ({ ...n, scope: scopeOfNode(n) }));
    const nodeClusterKeys = consolidateOrphanClusters(nodesWithScope);
    const supportNodes = (this.weightTuning?.useHeuristics !== false)
      ? detectSupportNodes(effectiveGraph.nodes, effectiveGraph.edges, nodeClusterKeys)
      : new Set<string>();
    this.supportNodes = supportNodes;
    const clusterHubs = new Map<string, { id: string; deg: number }>();
    const clusterTotals = new Map<string, number>();
    for (const n of effectiveGraph.nodes) {
      const cKey = nodeClusterKeys.get(n.id) ?? "root";
      clusterTotals.set(cKey, (clusterTotals.get(cKey) ?? 0) + 1);
      const d = (deg[n.id] ?? 0) + (n.type === "module" ? 500 : 0);
      const prevHub = clusterHubs.get(cKey);
      if (!prevHub || d > prevHub.deg) {
        clusterHubs.set(cKey, { id: n.id, deg: d });
      }
    }

    // Sort clusters deterministically by descending size so core galaxies seed centrally
    const uniqueClusters = Array.from(clusterTotals.keys()).sort(
      (a, b) => (clusterTotals.get(b) ?? 0) - (clusterTotals.get(a) ?? 0) || a.localeCompare(b),
    );
    const clusterCentroids = new Map<string, { x: number; y: number }>();
    const numClusters = uniqueClusters.length;
    const ringRadius = 160 + Math.sqrt(numClusters) * 75;

    // Seed galaxy centroids on a 2D golden-angle phyllotaxis spiral (never a 1D perimeter ring)
    uniqueClusters.forEach((key, ci) => {
      if (ci === 0 && uniqueClusters.length === 1) {
        clusterCentroids.set(key, { x: 0, y: 0 });
      } else {
        const cRadius = Math.sqrt(ci + 1) * (ringRadius / Math.max(1, Math.sqrt(numClusters)));
        const cAngle = ci * 2.399963229728653;
        clusterCentroids.set(key, {
          x: Math.cos(cAngle) * cRadius,
          y: Math.sin(cAngle) * cRadius,
        });
      }
    });

    const clusterMemberCounts = new Map<string, number>();

    // Sort nodes within each cluster so module container / highest-degree hub sits at mIdx = 0 center
    const sortedInputNodes = [...effectiveGraph.nodes].sort((a, b) => {
      const rankA = (a.type === "module" ? 1000 : 0) + (deg[a.id] ?? 0);
      const rankB = (b.type === "module" ? 1000 : 0) + (deg[b.id] ?? 0);
      return rankB - rankA;
    });

    this.nodes = sortedInputNodes.map((n) => {
      const p = prevPositions.get(n.id);
      const d = deg[n.id] ?? 0;
      const scope = scopeOfNode(n);
      const cKey = nodeClusterKeys.get(n.id) || "root";
      const cc = clusterCentroids.get(cKey) || { x: 0, y: 0 };
      const mIdx = clusterMemberCounts.get(cKey) ?? 0;
      clusterMemberCounts.set(cKey, mIdx + 1);

      // Phyllotaxis golden-angle spiral around cluster centroid (mIdx=0 hub sits at r=0 center)
      const r = mIdx === 0 ? 0 : 34 * Math.sqrt(mIdx + 1);
      const th = mIdx * 2.399963229728653;

      const baseR = n.type === "module"
        ? 9 + Math.min(10, Math.sqrt(n.childCount ?? 4) * 1.2)
        : n.childCount ? 5 + Math.min(14, Math.sqrt(n.childCount) * 1.3) : 4;

      return {
        id: n.id,
        name: n.name,
        type: n.type,
        sources: n.sources,
        owners: n.owners,
        scope,
        deg: d,
        r: baseR + Math.min(7, Math.sqrt(d) * 1.2),
        x: p?.x ?? (cc.x + Math.cos(th) * r),
        y: p?.y ?? (cc.y + Math.sin(th) * r),
        clusterKey: cKey,
        isSupportNode: supportNodes.has(n.id),
      };
    });

    // Cache CSS custom properties once before the loop instead of calling getComputedStyle 15,000 times
    const inkColor = cvar("--ink");
    const panelColor = cvar("--panel");
    const defaultEdgeColor = cvar("--edge");
    const tokenColorCache = new Map<string, string>();
    const resolveTokenColor = (token: string) => {
      let cached = tokenColorCache.get(token);
      if (cached === undefined) {
        cached = cvar(token);
        tokenColorCache.set(token, cached);
      }
      return cached;
    };

    for (const node of this.nodes) {
      this.nodeMap.set(node.id, node);
      const color = (this.tab === "code" && this.aggregateToParent && (node.type === "file" || node.type === "module"))
        ? galaxyColorOfCluster(node.clusterKey || "root", node.scope)
        : resolveTokenColor(colorToken(this.tab, node.type, node.scope));
      nextGraph.addNode(node.id, {
        x: node.x,
        y: node.y,
        size: node.r,
        color,
        label: node.isSupportNode ? `◈ ${node.name}` : node.name,
        nodeType: node.type,
        scope: node.scope,
        isSupportNode: node.isSupportNode,
        labelPosition: "below",
        labelSize: 11,
        labelColor: inkColor,
        labelBackgroundColor: panelColor,
        labelBackgroundPadding: 2,
      });
    }

    const backboneEdges = effectiveGraph.edges.map((e, idx) => ({
      key: `${e.source}->${e.target}:${e.relation}:${idx}`,
      source: e.source,
      target: e.target,
      relation: e.relation,
    }));
    const backboneSet = extractTreeBackbone(this.nodes, backboneEdges, nodeClusterKeys, supportNodes);

    let edgeIdx = 0;
    for (const e of effectiveGraph.edges) {
      if (nextGraph.hasNode(e.source) && nextGraph.hasNode(e.target)) {
        const srcCluster = nodeClusterKeys.get(e.source) ?? "root";
        const tgtCluster = nodeClusterKeys.get(e.target) ?? "root";
        const intraCluster = srcCluster === tgtCluster;
        const heuristicsActive = this.weightTuning?.useHeuristics !== false;
        const isSupportTarget = heuristicsActive && supportNodes.has(e.target);
        const weight = computeEdgeLayoutWeight(e.relation, intraCluster, false, this.contractionMode, isSupportTarget, this.weightTuning);
        const key = `${e.source}->${e.target}:${e.relation}:${edgeIdx++}`;
        const isBackbone = backboneSet.has(key);
        const fam = famOf(e.relation);
        const isSupportEdge = isSupportTarget && (fam === "dependency" || e.relation === "references");
        nextGraph.addEdgeWithKey(key, e.source, e.target, {
          relation: e.relation,
          description: e.description,
          confidence: e.confidence,
          transitive: false,
          size: intraCluster ? 1.6 : 0.9,
          color: defaultEdgeColor,
          weight,
          intraCluster,
          isBackbone,
          isSupportEdge,
          path: "curved",
          curvature: intraCluster ? 0.16 : 0.22,
          head: fam === "structure" ? "none" : "arrow",
        });
      }
    }

    // Converge layout on the detached graph before attaching to Sigma
    if (nextGraph.order > 0) {
      if (this.layoutEngine === "stress") {
        const result = twoLevelLayout(this.nodes, effectiveGraph.edges, {
          mode: this.contractionMode as any,
          minGap: this.weightTuning?.clusterGap ?? 24,
          clusterKeyMap: nodeClusterKeys,
        });
        for (const n of this.nodes) {
          const pos = result.positions.get(n.id);
          if (pos) {
            n.x = pos.x;
            n.y = pos.y;
          }
        }
      } else if (this.layoutEngine === "d3") {
        applyClassicD3ForceLayout(this.nodes, effectiveGraph.edges);
      } else {
        const virtualSprings: string[] = [];
        try {
          // Inject temporary intra-galaxy cohesion springs
          let vIdx = 0;
          const isGranularCode = this.tab === "code" && !this.aggregateToParent;
          for (const n of this.nodes) {
            const cKey = n.clusterKey || "root";
            const hub = clusterHubs.get(cKey);
            // In granular mode, tether symbols to their parent file and files to the galaxy hub
            if (isGranularCode && n.type !== "file") {
              const pid = parentIdOfNode(n);
              if (pid !== n.id && nextGraph.hasNode(pid)) {
                const pKey = `__file_spring_${vIdx++}`;
                nextGraph.addEdgeWithKey(pKey, n.id, pid, {
                  relation: "part_of",
                  transitive: false,
                  size: 0,
                  color: "transparent",
                  weight: 18.0,
                  intraCluster: true,
                });
                virtualSprings.push(pKey);
                continue;
              }
            }
            const nodeDeg = nextGraph.hasNode(n.id) ? nextGraph.degree(n.id) : 0;
            if (hub && hub.id !== n.id && nextGraph.hasNode(hub.id) && (nodeDeg === 0)) {
              const vKey = `__galaxy_spring_${vIdx++}`;
              nextGraph.addEdgeWithKey(vKey, n.id, hub.id, {
                relation: "part_of",
                transitive: false,
                size: 0,
                color: "transparent",
                weight: 1.2,
                intraCluster: true,
              });
              virtualSprings.push(vKey);
            }
          }

          const settings = forceAtlas2.inferSettings(nextGraph);
          const iterations = nextGraph.order > 1200
            ? 20
            : Math.min(80, Math.max(40, Math.floor(1500 / Math.max(1, nextGraph.order))));
          forceAtlas2.assign(nextGraph, {
            iterations,
            settings: {
              ...settings,
              barnesHutOptimize: true,
              barnesHutTheta: nextGraph.order > 1200 ? 0.9 : 0.75,
              linLogMode: true,
              outboundAttractionDistribution: false,
              adjustSizes: false,
              edgeWeightInfluence: 1.2,
              scalingRatio: 5,
              strongGravityMode: false,
              gravity: 0.35,
              slowDown: 4,
            },
          });
        } catch {
          // Fallback: keep cluster-seeded initial coordinates
        } finally {
          for (const vKey of virtualSprings) {
            if (nextGraph.hasEdge(vKey)) nextGraph.dropEdge(vKey);
          }
        }

        // Synchronize converged coordinates back to this.nodes
        nextGraph.forEachNode((id, attrs) => {
          const n = this.nodeMap.get(id);
          if (n) {
            n.x = attrs.x;
            n.y = attrs.y;
          }
        });

        if (this.contractionMode !== "coupled") {
          const weightedEdges = effectiveGraph.edges.map((e) => {
            const intra = (nodeClusterKeys.get(e.source) ?? "root") === (nodeClusterKeys.get(e.target) ?? "root");
            const isSup = (this.weightTuning?.useHeuristics !== false) && supportNodes.has(e.target);
            return {
              ...e,
              weight: computeEdgeLayoutWeight(e.relation, intra, false, this.contractionMode, isSup, this.weightTuning),
            };
          });
          applyCosmosConcentricLayout(this.nodes, weightedEdges, this.contractionMode, this.weightTuning);
        } else {
          // Apply vectorized post-convergence collision & galaxy separation so nodes never overlap inside a cluster
          relaxAndSeparateGalaxiesVectorized(this.nodes, effectiveGraph.edges, nodeClusterKeys, {
            iterations: 14,
            intraCompactFactor: 0.92,
            interExpandFactor: 1.0,
            minVoidGap: this.weightTuning?.clusterGap ?? 38,
          });
        }
      }

      for (const n of this.nodes) {
        if (nextGraph.hasNode(n.id)) {
          nextGraph.setNodeAttribute(n.id, "x", n.x);
          nextGraph.setNodeAttribute(n.id, "y", n.y);
        }
      }

      const bundleMap = computeHierarchicalEdgeBundles(
        this.nodes,
        effectiveGraph.edges.map((e, idx) => ({
          key: `${e.source}->${e.target}:${e.relation}:${idx}`,
          source: e.source,
          target: e.target,
          relation: e.relation,
          intraCluster: (nodeClusterKeys.get(e.source) ?? "root") === (nodeClusterKeys.get(e.target) ?? "root"),
          isBackbone: backboneSet.has(`${e.source}->${e.target}:${e.relation}:${idx}`),
        })),
        nodeClusterKeys,
      );

      nextGraph.forEachEdge((edgeKey) => {
        const meta = bundleMap.get(edgeKey);
        if (meta) {
          nextGraph.setEdgeAttribute(edgeKey, "curvature", meta.curvature);
          nextGraph.setEdgeAttribute(edgeKey, "restOpacity", meta.restOpacity);
          nextGraph.setEdgeAttribute(edgeKey, "restSize", meta.restSize);
          nextGraph.setEdgeAttribute(edgeKey, "size", meta.restSize);
        }
      });
    }

    // Swap the fully converged graph into Sigma in a single atomic batch!
    this.graph = nextGraph;
    if (this.sigma) {
      this.sigma.setGraph(nextGraph);
      // Monkeypatch Sigma v4 bug: setGraph() forgets to update dragManager.graph and edgeGroups.graph
      const sigmaAny = this.sigma as any;
      if (sigmaAny.internals?.dragManager) {
        sigmaAny.internals.dragManager.graph = nextGraph;
      }
      if (sigmaAny.edgeGroups) {
        sigmaAny.edgeGroups.graph = nextGraph;
      }
    }

    this.restyle();
    this.resetView();
    this.drawArchipelago();
    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(() => {
        this.resetView();
        this.drawArchipelago();
      });
    }
  }

  private reduceNode(nodeId: string, data: any): any {
    const node = this.nodeMap.get(nodeId);
    if (!node) return data;

    const shown = this.isNodeShown(node);
    if (!shown) {
      return {
        ...data,
        visibility: "hidden",
        hidden: true,
        size: 0,
        opacity: 0,
        color: "transparent",
        label: null,
        labelVisibility: "hidden",
      };
    }

    const q = this.query.toLowerCase();
    const match = !q || node.name.toLowerCase().includes(q);

    let size = data.size;
    let opacity = match ? 0.95 : 0.2;
    let highlighted = false;
    let labelSize = 10.5;
    let labelColor = this.themeColors.ink;
    let labelBg = this.themeColors.panel;
    let labelVisibility: "visible" | "auto" | "hidden" = "auto";

    const isSelected = Boolean(this.selected && nodeId === this.selected);
    const isSelectedNeighbor = Boolean(this.selected && this.neighbors.has(nodeId));
    const isHovered = Boolean(this.hovered && nodeId === this.hovered);
    const isHoverNeighbor = Boolean(this.hovered && this.hoverNeighbors.has(nodeId));
    const isSearchHit = Boolean(q && node.name.toLowerCase().includes(q));
    const isLandmark = this.landmarkSet.has(nodeId);

    if (this.selected) {
      if (isSelected) {
        size = data.size + 4;
        opacity = 1.0;
        highlighted = true;
        labelSize = 13;
        labelBg = this.themeColors.chip;
        labelVisibility = "visible";
      } else if (isSelectedNeighbor) {
        size = data.size + 1.5;
        opacity = 0.95;
        labelSize = 11.5;
        labelVisibility = "visible";
      } else {
        opacity = Math.min(opacity, 0.12);
        labelColor = this.themeColors.muted;
        labelSize = 10;
        labelVisibility = "hidden";
      }
    } else if (this.hovered) {
      if (isHovered) {
        size = data.size + 3.5;
        opacity = 1.0;
        highlighted = true;
        labelSize = 13;
        labelBg = this.themeColors.chip;
        labelVisibility = "visible";
      } else if (isHoverNeighbor) {
        size = data.size + 1.5;
        opacity = 0.95;
        labelSize = 11.5;
        labelVisibility = "visible";
      } else if (isSearchHit) {
        labelVisibility = "visible";
        highlighted = true;
        labelBg = this.themeColors.chip;
        size = data.size + 2;
      } else {
        opacity = match ? 0.35 : 0.12;
        labelColor = this.themeColors.muted;
        labelSize = 10;
        labelVisibility = "hidden";
      }
    } else if (isSearchHit) {
      labelVisibility = "visible";
      highlighted = true;
      labelBg = this.themeColors.chip;
      size = data.size + 2;
    } else if (isLandmark) {
      labelVisibility = "visible";
      labelSize = 11;
      opacity = Math.max(opacity, 0.95);
    } else {
      labelColor = this.themeColors.muted;
      labelSize = 10.5;
      labelVisibility = "auto";
    }

    const isCircletraceReflected = Boolean(this.triStateResult?.circletraceReflectedIds?.has(nodeId));
    const isCircletracePrimary = Boolean(this.triStateResult?.circletracePrimaryIds?.has(nodeId));
    const isPinnedLineage = Boolean(this.triStateResult?.pinnedLineageIds?.has(nodeId));

    if (isCircletraceReflected) {
      size = data.size + 3;
      opacity = 1.0;
      highlighted = true;
      labelSize = 12.5;
      labelBg = "rgba(251, 191, 36, 0.3)";
      labelColor = "#fbbf24";
      labelVisibility = "visible";
    } else if (isCircletracePrimary) {
      size = data.size + 2.5;
      opacity = 1.0;
      highlighted = true;
      labelSize = 12;
      labelVisibility = "visible";
    } else if (isPinnedLineage) {
      opacity = Math.max(opacity, 0.95);
      labelVisibility = "visible";
    }

    let color = data.color || "#38bdf8";
    if (isCircletraceReflected) {
      color = "#fbbf24";
    }

    return {
      ...data,
      visibility: "visible",
      size,
      color,
      opacity,
      hidden: false,
      highlighted,
      label: (node.isSupportNode ?? Boolean(data.isSupportNode)) ? `◈ ${node.name}` : node.name,
      labelPosition: "below",
      labelSize,
      labelColor,
      labelBackgroundColor: labelBg,
      labelBackgroundPadding: 2,
      labelFont: '"Avenir Next", "Segoe UI", system-ui, -apple-system, sans-serif',
      labelVisibility,
    };
  }

  private reduceEdge(edgeId: string, data: any): any {
    const attrs = this.graph.getEdgeAttributes(edgeId);
    const source = this.graph.source(edgeId);
    const target = this.graph.target(edgeId);

    const sourceNode = this.nodeMap.get(source);
    const targetNode = this.nodeMap.get(target);
    const fam = famOf(attrs.relation);
    const isIntra = (attrs.intraCluster !== undefined ? attrs.intraCluster : data.intraCluster) ?? (Boolean(sourceNode && targetNode && sourceNode.clusterKey === targetNode.clusterKey));
    const isBackbone = Boolean(attrs.isBackbone ?? data.isBackbone);
    const defaultCurvature = isIntra ? 0.16 : 0.22;
    const edgeHead = fam === "structure" ? "none" : "arrow";

    const hiddenEdge = {
      ...data,
      visibility: "hidden" as const,
      hidden: true,
      size: 0,
      opacity: 0,
      color: "transparent",
      path: "curved",
      curvature: defaultCurvature,
      head: edgeHead,
      label: "",
      labelVisibility: "hidden" as const,
      forceLabel: false,
    };

    if (!sourceNode || !targetNode) return hiddenEdge;

    const sourceShown = this.isNodeShown(sourceNode);
    const targetShown = this.isNodeShown(targetNode);
    if (!sourceShown || !targetShown) return hiddenEdge;

    if (attrs.transitive) {
      if (!this.showTransitive) return hiddenEdge;
    } else if (this.hiddenRels[chipKey(attrs.relation)]) {
      return hiddenEdge;
    }

    const q = this.query.toLowerCase();
    const matchA = !q || sourceNode.name.toLowerCase().includes(q);
    const matchB = !q || targetNode.name.toLowerCase().includes(q);

    const isHoverActive = !this.selected && Boolean(this.hovered);
    const activeFocusId = this.selected ?? (isHoverActive ? this.hovered : null);

    const role = activeFocusId
      ? (source === activeFocusId ? "out" : target === activeFocusId ? "in" : "far")
      : "none";

    const relColor = relationColor(attrs.relation);
    const neutralEdge = this.themeColors.edge;
    let color = this.rainbowEdges ? relColor : neutralEdge;

    let size = isIntra ? 1.6 : 0.85;
    let opacity = isIntra ? 0.68 : 0.11;

    if (fam === "structure") {
      size = isIntra ? 2.2 : 1.1;
      opacity = isIntra ? 0.58 : 0.16;
    } else if (fam === "contract") {
      size = isIntra ? 1.7 : 1.0;
      opacity = isIntra ? 0.72 : 0.18;
    } else if (fam === "association") {
      size = isIntra ? 1.2 : 0.75;
      opacity = isIntra ? 0.42 : 0.08;
    }

    const isReflectedSource = Boolean(this.triStateResult?.circletraceReflectedIds?.has(source));
    const isReflectedTarget = Boolean(this.triStateResult?.circletraceReflectedIds?.has(target));
    const isReflected = isReflectedSource || isReflectedTarget;
    const isFocused = role === "out" || role === "in";

    const edgeLabel = isFocused ? (data.relation || attrs.relation || "").replace(/_/g, " ") : "";
    const labelVisibility = isFocused ? ("visible" as const) : ("hidden" as const);
    const forceLabel = isFocused;

    let curvature = defaultCurvature;

    if (isFocused || isReflected) {
      if (isReflected) {
        color = "#fbbf24";
      } else if (role === "out") {
        color = this.rainbowEdges ? relColor : this.themeColors.amber;
      } else if (role === "in") {
        color = this.rainbowEdges ? relColor : this.themeColors.accent;
      }
      opacity = 1.0;
      size = Math.max(2.4, size + 1.2);
      curvature = defaultCurvature;
    } else if (role === "far") {
      opacity = isHoverActive ? 0.06 : 0.03;
      curvature = defaultCurvature;
    } else if (q && !matchA && !matchB) {
      opacity = 0.06;
      curvature = defaultCurvature;
    } else {
      // role === "none" (at rest, no node hovered or selected)
      const isSupportEdge = Boolean(attrs.isSupportEdge ?? data.isSupportEdge);
      if (isSupportEdge && !isIntra) {
        // Cross-cluster support edge: hide at rest
        return hiddenEdge;
      } else if (isBackbone && isIntra) {
        // Foreground intra-galaxy branch
        opacity = 0.68;
        size = Math.max(1.5, data.size || 1.5);
        curvature = 0.16;
      } else if (isBackbone && !isIntra) {
        // Curated cross-galaxy bridge / bundled highway
        opacity = data.restOpacity ?? attrs.restOpacity ?? 0.38;
        size = data.restSize ?? attrs.restSize ?? 1.4;
        curvature = data.curvature ?? attrs.curvature ?? 0.22;
      } else if (!isBackbone && !isIntra) {
        // Non-backbone cross-galaxy mesh chord: hide at rest
        return hiddenEdge;
      } else {
        // !isBackbone && isIntra: faint intra-galaxy chord
        opacity = 0.08;
        size = 0.8;
        curvature = 0.14;
      }
    }

    return {
      ...data,
      visibility: "visible" as const,
      color,
      size,
      opacity,
      hidden: false,
      path: "curved",
      curvature: data.curvature ?? curvature,
      head: edgeHead,
      label: edgeLabel,
      labelVisibility,
      forceLabel,
    };
  }

  /** Re-apply all style attributes (theme, filters, focus, search). */
  restyle(): void {
    this.refreshThemeColors();
    let visCount = 0;
    let maxD = 0;
    const visibleNodes: SimNode[] = [];
    for (const n of this.nodes) {
      if (this.isNodeShown(n)) {
        visCount++;
        visibleNodes.push(n);
        if (n.deg > maxD) maxD = n.deg;
      }
    }
    this.cachedVisibleCount = visCount;
    this.cachedMaxDeg = maxD;

    this.landmarkSet = computeGalaxyLandmarks(visibleNodes, 18);

    // Dynamic transitive shortcut edges between visible nodes across hidden intermediaries
    // Only compute when nodes are actually filtered out (visCount < this.nodes.length) and within interactive bounds
    const nextSig = `${this.showTransitive}:${visCount}:${visibleNodes.length > 0 ? visibleNodes[0].id : ""}:${visibleNodes.length > 1 ? visibleNodes[visibleNodes.length - 1].id : ""}`;
    if (nextSig !== this.lastTransitiveSignature) {
      this.lastTransitiveSignature = nextSig;
      const edgesToRemove: string[] = [];
      this.graph.forEachEdge((edgeKey, attrs) => {
        if (attrs.transitive) edgesToRemove.push(edgeKey);
      });
      for (const k of edgesToRemove) this.graph.dropEdge(k);

      if (this.showTransitive && this.rawGraph && visCount < this.nodes.length && this.nodes.length <= 1500) {
        const isVisible = (id: string) => {
          const node = this.nodeMap.get(id);
          return node ? this.isNodeShown(node) : false;
        };

        const transColor = cvar("--scope-transitive") || "#f97316";
        const transEdges = generateTransitiveEdges(this.rawGraph.edges, isVisible);
        let transIdx = 0;
        for (const te of transEdges) {
          if (this.graph.hasNode(te.source) && this.graph.hasNode(te.target)) {
            const key = `transitive:${te.source}->${te.target}:${transIdx++}`;
            if (!this.graph.hasEdge(key)) {
              this.graph.addEdgeWithKey(key, te.source, te.target, {
                relation: "transitive",
                description: te.description,
                confidence: "inferred",
                transitive: true,
                via: te.via,
                size: 1.6,
                color: transColor,
              });
            }
          }
        }
      }
    }

    this.neighbors.clear();
    if (this.selected && this.graph.hasNode(this.selected)) {
      this.graph.forEachNeighbor(this.selected, (neighbor) => {
        this.neighbors.add(neighbor);
      });
      this.graph.forEachEdge(this.selected, (edgeKey, attrs, source, target) => {
        if (attrs.transitive) {
          this.neighbors.add(source === this.selected ? target : source);
        }
      });
    }

    this.sigma?.refresh();
    this.drawArchipelago();
  }

  select(id: string | null): void {
    this.selected = id;
    this.restyle();
    this.onSelect(id);
  }

  /** Center the view on a node and select it (used by search). */
  focus(id: string): void {
    if (!this.graph.hasNode(id) || !this.sigma) return;
    const attrs = this.graph.getNodeAttributes(id);
    this.select(id);
    const camera = this.sigma.getCamera();
    try {
      const framed = this.sigma.graphToFramedGraph({ x: attrs.x, y: attrs.y });
      camera.animate(
        { x: framed.x, y: framed.y, ratio: Math.min(camera.ratio, 0.45) },
        { duration: 400 },
      );
    } catch {
      camera.animate(
        { x: attrs.x, y: attrs.y, ratio: Math.min(camera.ratio, 0.45) },
        { duration: 400 },
      );
    }
  }

  /** Focus the highest-degree hub node of a subsystem galaxy cluster. */
  focusCluster(clusterKey: string): void {
    let bestHub: SimNode | null = null;
    for (const n of this.nodes) {
      if (!this.isNodeShown(n)) continue;
      const cKey = n.clusterKey || clusterKeyOfNode(n).key;
      if (cKey === clusterKey) {
        if (!bestHub || n.deg > bestHub.deg) bestHub = n;
      }
    }
    if (bestHub) {
      if (this.selected === bestHub.id) {
        this.select(null);
        this.resetView();
      } else {
        this.focus(bestHub.id);
      }
    }
  }

  isNodeShown(n: SimNode): boolean {
    if (this.triStateResult && !this.triStateResult.visibleIds.has(n.id)) {
      return false;
    }
    return (
      !this.hiddenTypes[n.type] &&
      matchNodeFilter(
        { id: n.id, type: n.type, sources: n.sources },
        { scope: this.scope, scopes: this.scopes, excludeDirs: this.excludeDirs, selectedFiles: this.selectedFiles },
      )
    );
  }

  firstMatch(): SimNode | undefined {
    const q = this.query.toLowerCase();
    return this.nodes.find((n) => this.isNodeShown(n) && n.name.toLowerCase().includes(q));
  }

  zoomBy(factor: number): void {
    if (!this.sigma) return;
    const camera = this.sigma.getCamera();
    if (factor > 1) {
      camera.zoomIn({ factor });
    } else {
      camera.zoomOut({ factor: 1 / factor });
    }
  }

  resetView(): void {
    if (!this.sigma || !this.container) return;
    const camera = this.sigma.getCamera();
    const visibleNodes = this.nodes.filter((n) => this.isNodeShown(n));
    if (visibleNodes.length === 0) {
      camera.reset();
      return;
    }

    try {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      for (const n of visibleNodes) {
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.y > maxY) maxY = n.y;
      }

      const midX = (minX + maxX) / 2;
      const midY = (minY + maxY) / 2;
      const framedCenter = this.sigma.graphToFramedGraph({ x: midX, y: midY });

      const W = this.container.clientWidth || 800;
      const H = this.container.clientHeight || 600;

      // Project bounds to viewport at reference camera ratio 1.0
      const pMin = this.sigma.graphToViewport(
        { x: minX, y: minY },
        { cameraState: { x: framedCenter.x, y: framedCenter.y, ratio: 1.0, angle: 0 } },
      );
      const pMax = this.sigma.graphToViewport(
        { x: maxX, y: maxY },
        { cameraState: { x: framedCenter.x, y: framedCenter.y, ratio: 1.0, angle: 0 } },
      );

      const currentW = Math.max(10, Math.abs(pMax.x - pMin.x));
      const currentH = Math.max(10, Math.abs(pMax.y - pMin.y));

      // Desired coverage is 75% of center real estate
      const targetW = W * 0.75;
      const targetH = H * 0.75;
      const targetRatio = Math.max(0.2, Math.min(2.5, Math.max(currentW / targetW, currentH / targetH)));

      camera.setState({
        x: framedCenter.x,
        y: framedCenter.y,
        ratio: targetRatio,
        angle: 0,
      });
    } catch {
      camera.reset();
    }
  }

  reheat(): void {
    if (this.graph.order > 0) {
      this.sigma?.resize();
      this.rebounceVisible(true);
      this.sigma?.refresh();
      this.drawArchipelago();
    }
  }

  setShowBlooms(show: boolean): void {
    this.showBlooms = show;
    this.drawArchipelago();
  }

  setRainbowEdges(rainbow: boolean): void {
    this.rainbowEdges = rainbow;
    this.sigma.refresh();
  }

  setAutoRebounce(enabled: boolean): void {
    this.autoRebounce = enabled;
    if (enabled) {
      this.rebounceVisible();
    }
  }

  rebounceVisible(animate = true): void {
    const visibleNodes = this.nodes.filter((n) => this.isNodeShown(n));
    if (visibleNodes.length <= 1 || this.graph.order === 0) {
      this.restyle();
      return;
    }

    const visibleSet = new Set(visibleNodes.map((n) => n.id));
    const visibleEdges: Array<{ source: string; target: string; relation?: string; weight?: number }> = [];
    if (this.rawGraph) {
      for (const e of this.rawGraph.edges) {
        if (visibleSet.has(e.source) && visibleSet.has(e.target)) {
          if (!this.hiddenRels[chipKey(e.relation)]) {
            const srcNode = this.nodeMap.get(e.source);
            const tgtNode = this.nodeMap.get(e.target);
            const srcCluster = srcNode?.clusterKey ?? "root";
            const tgtCluster = tgtNode?.clusterKey ?? "root";
            const intra = srcCluster === tgtCluster;
            const isSupport = this.supportNodes?.has(e.target) ?? false;
            const w = computeEdgeLayoutWeight(e.relation, intra, false, this.contractionMode, isSupport, this.weightTuning);
            visibleEdges.push({ ...e, weight: w });
          }
        }
      }
    }

    const simNodes = visibleNodes.map((n) => ({ ...n }));
    if (this.layoutEngine === "stress") {
      const nodeClusterMap = new Map<string, string>();
      for (const n of visibleNodes) {
        nodeClusterMap.set(n.id, n.clusterKey ?? "root");
      }
      const result = twoLevelLayout(simNodes, visibleEdges, {
        mode: this.contractionMode as any,
        minGap: this.weightTuning?.clusterGap ?? 24,
        clusterKeyMap: nodeClusterMap,
      });
      for (const sn of simNodes) {
        const pos = result.positions.get(sn.id);
        if (pos) {
          sn.x = pos.x;
          sn.y = pos.y;
        }
      }
    } else if (this.layoutEngine === "d3") {
      applyClassicD3ForceLayout(simNodes, visibleEdges);
    } else {
      applyCosmosConcentricLayout(simNodes, visibleEdges, this.contractionMode, this.weightTuning);
    }

    const N = visibleNodes.length;

    if (this.rebounceAnimId !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this.rebounceAnimId);
      this.rebounceAnimId = null;
    }

    if (!animate || typeof requestAnimationFrame === "undefined") {
      for (let i = 0; i < N; i++) {
        const n = visibleNodes[i];
        const sim = simNodes[i];
        n.x = sim.x;
        n.y = sim.y;
        if (this.graph.hasNode(n.id)) {
          this.graph.setNodeAttribute(n.id, "x", sim.x);
          this.graph.setNodeAttribute(n.id, "y", sim.y);
        }
      }
      this.restyle();
      this.sigma?.refresh();
      this.drawArchipelago();
      this.resetView();
      return;
    }

    const startX = new Float32Array(N);
    const startY = new Float32Array(N);
    const targetX = new Float32Array(N);
    const targetY = new Float32Array(N);
    const outX = new Float32Array(N);
    const outY = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      startX[i] = visibleNodes[i].x;
      startY[i] = visibleNodes[i].y;
      targetX[i] = simNodes[i].x;
      targetY[i] = simNodes[i].y;
    }

    const totalFrames = 18;
    let currentFrame = 0;

    const step = () => {
      currentFrame++;
      const t = Math.min(1.0, currentFrame / totalFrames);
      lerpNodePositions(startX, startY, targetX, targetY, outX, outY, N, t);

      for (let i = 0; i < N; i++) {
        const n = visibleNodes[i];
        const curX = outX[i];
        const curY = outY[i];
        n.x = curX;
        n.y = curY;
        if (this.graph.hasNode(n.id)) {
          this.graph.setNodeAttribute(n.id, "x", curX);
          this.graph.setNodeAttribute(n.id, "y", curY);
        }
      }

      this.sigma?.refresh();
      this.drawArchipelago();

      if (currentFrame < totalFrames) {
        this.rebounceAnimId = requestAnimationFrame(step);
      } else {
        this.rebounceAnimId = null;
        this.restyle();
        this.resetView();
      }
    };

    this.rebounceAnimId = requestAnimationFrame(step);
  }

  setAggregateToParent(aggregate: boolean): void {
    if (this.aggregateToParent === aggregate) return;
    this.aggregateToParent = aggregate;
    if (this.sourceGraph) {
      this.setData(this.sourceGraph, this.tab);
    }
  }

  get currentTab(): "context" | "code" {
    return this.tab;
  }

  get currentGraph(): VizGraph | null {
    return this.rawGraph;
  }

  destroy(): void {
    if (this.archGL) {
      if (this.archProgram) this.archGL.deleteProgram(this.archProgram);
      if (this.archQuadBuffer) this.archGL.deleteBuffer(this.archQuadBuffer);
      if (this.archInstanceBuffer) this.archGL.deleteBuffer(this.archInstanceBuffer);
      this.archGL = null;
      this.archProgram = null;
    }
    this.archBadgeCanvas = null;
    this.archBadgeCtx = null;
    this.sigma?.kill();
    this.graph.clear();
  }

  private initArchipelagoWebGL(): void {
    const gl = this.archGL;
    if (!gl) return;

    const vsSource = `#version 300 es
    precision highp float;
    layout(location = 0) in vec2 a_quad;
    layout(location = 1) in vec2 a_center;
    layout(location = 2) in float a_radius;
    layout(location = 3) in vec4 a_color;
    layout(location = 4) in float a_cohesion;

    uniform vec2 u_resolution;

    out vec2 v_uv;
    out vec4 v_color;
    out float v_cohesion;

    void main() {
      v_uv = a_quad;
      v_color = a_color;
      v_cohesion = a_cohesion;

      vec2 pixelPos = a_center + a_quad * a_radius;
      vec2 clip = (pixelPos / u_resolution) * 2.0 - 1.0;
      gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
    }`;

    const fsSource = `#version 300 es
    precision highp float;
    in vec2 v_uv;
    in vec4 v_color;
    in float v_cohesion;
    out vec4 fragColor;

    void main() {
      float r2 = dot(v_uv, v_uv);
      if (r2 > 1.0) discard;

      // Soft Gaussian radiance with smooth edge falloff
      float falloff = (1.0 - r2) * (1.0 - r2);
      float glow = exp(-r2 * 2.5) * falloff;
      float alpha = v_color.a * v_cohesion * glow;
      fragColor = vec4(v_color.rgb * alpha, alpha);
    }`;

    const compileShader = (type: number, src: string) => {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        gl.deleteShader(s);
        return null;
      }
      return s;
    };

    const vs = compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = compileShader(gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      gl.deleteProgram(prog);
      return;
    }
    this.archProgram = prog;

    // Unit quad: TRIANGLE_STRIP covering [-1, 1]
    const quadVertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    this.archQuadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.archQuadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

    this.archInstanceBuffer = gl.createBuffer();
  }

  private drawArchipelago(): void {
    const gl = this.archGL;
    if (!this.showBlooms) {
      if (gl) {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      if (this.archBadgeCtx && this.archBadgeCanvas) {
        const w = this.container?.clientWidth || 800;
        const h = this.container?.clientHeight || 600;
        this.archBadgeCtx.clearRect(0, 0, w, h);
      }
      return;
    }
    if (!gl || !this.archProgram || !this.container) return;
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    const canvas = gl.canvas as HTMLCanvasElement;
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 600;
    const pixelRatio = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

    const targetW = Math.round(w * pixelRatio);
    const targetH = Math.round(h * pixelRatio);

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const visibleNodes = this.nodes.filter((n) => this.isNodeShown(n));
    const N = visibleNodes.length;

    // Clear badge canvas if available
    if (this.archBadgeCtx && this.archBadgeCanvas) {
      if (this.archBadgeCanvas.width !== targetW || this.archBadgeCanvas.height !== targetH) {
        this.archBadgeCanvas.width = targetW;
        this.archBadgeCanvas.height = targetH;
        this.archBadgeCanvas.style.width = `${w}px`;
        this.archBadgeCanvas.style.height = `${h}px`;
      }
      this.archBadgeCtx.save();
      this.archBadgeCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      this.archBadgeCtx.clearRect(0, 0, w, h);
    }

    if (N === 0) {
      if (this.archBadgeCtx) this.archBadgeCtx.restore();
      return;
    }

    // 1. Ensure buffer capacity and project visible nodes to screen coordinates
    if (N > this.bloomScreenX.length) {
      const cap = Math.max(256, 1 << Math.ceil(Math.log2(N + 16)));
      this.bloomScreenX = new Float32Array(cap);
      this.bloomScreenY = new Float32Array(cap);
      this.bloomClusterIds = new Int32Array(cap);
      this.bloomNeighbors = new Int32Array(cap);
      this.bloomCloseness = new Float32Array(cap);
      this.bloomInstances = new Float32Array(cap * 8);
    }

    this.clusterIdMap.clear();
    let nextClusterId = 0;
    for (let i = 0; i < N; i++) {
      const n = visibleNodes[i];
      const vp = this.sigma.graphToViewport({ x: n.x, y: n.y });
      this.bloomScreenX[i] = vp.x;
      this.bloomScreenY[i] = vp.y;
      const cKey = n.clusterKey || clusterKeyOfNode(n).key;
      let cId = this.clusterIdMap.get(cKey);
      if (cId === undefined) {
        cId = nextClusterId++;
        this.clusterIdMap.set(cKey, cId);
      }
      this.bloomClusterIds[i] = cId;
    }

    // 2. Adaptive neighborhood distance & target cohesion
    const densityScale = Math.pow(100 / Math.max(20, N), 0.25);
    const R_nbr = Math.max(50, Math.min(180, 110 * densityScale));
    const targetNeighbors = Math.max(2.5, Math.min(10, Math.sqrt(N) * 0.45));

    // 3. Compute continuous neighborhood cohesion via zero-allocation FlatSpatialGrid
    this.spatialGrid.computeNeighborhoodCohesion(
      this.bloomScreenX,
      this.bloomScreenY,
      this.bloomClusterIds,
      N,
      R_nbr,
      this.bloomNeighbors,
      this.bloomCloseness,
    );

    let instanceCount = 0;
    const clusterCentroids = new Map<string, { sumX: number; sumY: number; count: number; name: string; scope: string; totalCohesion: number }>();

    const palette = ["#38bdf8", "#818cf8", "#c084fc", "#f472b6", "#34d399", "#fbbf24", "#2dd4bf", "#fb7185"];
    const hashColor = (str: string, scope: string) => {
      if (scope === "specs" || str.startsWith("features") || str.includes("test")) return "#10b981";
      if (scope === "docs" || str.startsWith("docs") || str.includes("adr")) return "#a855f7";
      let hash = 0;
      for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
      return palette[hash % palette.length];
    };

    for (let i = 0; i < N; i++) {
      const px = this.bloomScreenX[i];
      const py = this.bloomScreenY[i];

      // Screen bounds culling (with padding for large blooms)
      if (px < -200 || px > w + 200 || py < -200 || py > h + 200) {
        continue;
      }

      const n = visibleNodes[i];
      const clusterNeighborCount = this.bloomNeighbors[i];
      const closenessSum = this.bloomCloseness[i];

      // Check focus (hover or selected)
      const isHovered = Boolean(this.hovered && (n.id === this.hovered || this.hoverNeighbors.has(n.id)));
      const isSelected = Boolean(this.selected && (n.id === this.selected || this.neighbors.has(n.id)));
      const isFocus = isHovered || isSelected;

      // If lonely node (< 1 cluster neighbor) and not focused, no bloom
      if (clusterNeighborCount < 1 && !isFocus) {
        continue;
      }

      // Continuous cohesion factor (0.0 to 1.0)
      let cohesion = Math.min(1.0, closenessSum / targetNeighbors);
      if (isFocus) {
        cohesion = Math.min(1.0, cohesion + 0.45);
      }

      // Adaptive bloom radius: scales with node radius, cluster neighbor density, and focus
      const bloomRadius = Math.max(30, (n.r + 28) * densityScale + Math.min(40, clusterNeighborCount * 5) + (isFocus ? 18 : 0));

      const cKey = n.clusterKey || clusterKeyOfNode(n).key;
      const baseHex = hashColor(cKey, n.scope);
      const alpha = isFocus ? 0.38 : 0.16;
      const [r, g, b, a] = parseColorToRgba(baseHex, alpha);

      // Store cluster centroid stats for badge rendering
      let cc = clusterCentroids.get(cKey);
      if (!cc) {
        const cInfo = clusterKeyOfNode(n);
        cc = { sumX: 0, sumY: 0, count: 0, name: cInfo.name, scope: n.scope, totalCohesion: 0 };
        clusterCentroids.set(cKey, cc);
      }
      cc.sumX += px;
      cc.sumY += py;
      cc.count += 1;
      cc.totalCohesion += cohesion;

      // Layout per instance (8 floats):
      // a_center.x, a_center.y, a_radius, a_color.r, a_color.g, a_color.b, a_color.a, a_cohesion
      const offset = instanceCount * 8;
      this.bloomInstances[offset] = px * pixelRatio;
      this.bloomInstances[offset + 1] = py * pixelRatio;
      this.bloomInstances[offset + 2] = bloomRadius * pixelRatio;
      this.bloomInstances[offset + 3] = r;
      this.bloomInstances[offset + 4] = g;
      this.bloomInstances[offset + 5] = b;
      this.bloomInstances[offset + 6] = a;
      this.bloomInstances[offset + 7] = cohesion;
      instanceCount++;
    }

    // 4. Render WebGL instanced blooms
    if (instanceCount > 0 && this.archInstanceBuffer) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(this.archProgram);
      const uResLoc = gl.getUniformLocation(this.archProgram, "u_resolution");
      gl.uniform2f(uResLoc, canvas.width, canvas.height);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.archQuadBuffer);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      const data = this.bloomInstances.subarray(0, instanceCount * 8);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.archInstanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

      const stride = 8 * 4;
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 0);
      gl.vertexAttribDivisor(1, 1);

      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 8);
      gl.vertexAttribDivisor(2, 1);

      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, 12);
      gl.vertexAttribDivisor(3, 1);

      gl.enableVertexAttribArray(4);
      gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 28);
      gl.vertexAttribDivisor(4, 1);

      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, instanceCount);

      // Clean up vertex attribute divisors
      gl.vertexAttribDivisor(1, 0);
      gl.vertexAttribDivisor(2, 0);
      gl.vertexAttribDivisor(3, 0);
      gl.vertexAttribDivisor(4, 0);
    }

    // 5. Draw high-cohesion badges on badge canvas
    if (this.archBadgeCtx) {
      const ctx = this.archBadgeCtx;
      for (const [key, cc] of clusterCentroids.entries()) {
        const avgCohesion = cc.totalCohesion / cc.count;
        if (cc.count >= 2 && avgCohesion >= 0.25) {
          const cx = cc.sumX / cc.count;
          const cy = cc.sumY / cc.count;
          const baseColor = hashColor(key, cc.scope);
          const isClusterFocus = Boolean(
            (this.hovered && visibleNodes.some((n) => (n.clusterKey || clusterKeyOfNode(n).key) === key && (n.id === this.hovered || this.hoverNeighbors.has(n.id)))) ||
            (this.selected && visibleNodes.some((n) => (n.clusterKey || clusterKeyOfNode(n).key) === key && (n.id === this.selected || this.neighbors.has(n.id))))
          );

          ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = colorWithAlpha(baseColor, isClusterFocus ? 0.88 : 0.45);
          ctx.fillText(`⬡ ${cc.name} (${cc.count})`, cx, cy - 35);
        }
      }
      ctx.restore();
    }

    // Adaptive performance budget guard: protect 60fps frame rate
    if (typeof performance !== "undefined") {
      const elapsed = performance.now() - t0;
      if (elapsed > 16.0) {
        this.bloomSlowFrameCount = (this.bloomSlowFrameCount || 0) + 1;
        if (this.bloomSlowFrameCount >= 2) {
          console.warn(`[graft viz] Archipelago bloom draw took ${elapsed.toFixed(1)}ms (>16ms budget). Auto-throttling blooms to preserve 60fps.`);
          this.setShowBlooms(false);
          if (this.onBloomsThrottled) this.onBloomsThrottled();
        }
      } else {
        this.bloomSlowFrameCount = 0;
      }
    }
  }
}
