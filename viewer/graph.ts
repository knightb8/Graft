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
import Sigma from "sigma";
import { MultiDirectedGraph } from "graphology";
import {
  forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide, forceX, forceY,
  type Simulation, type SimulationNodeDatum,
} from "d3-force";
import {
  type VizGraph, type NodeOwner, type TripartiteScope, type ConcreteScope,
  famOf, REST, chipKey, colorToken, cvar, matchNodeFilter, scopeOfNode,
  generateTransitiveEdges,
} from "./data.js";

export interface SimNode extends SimulationNodeDatum {
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
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
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
}

export interface EdgeAttrs {
  relation: string;
  description?: string;
  confidence?: string;
  transitive?: boolean;
  via?: string[];
  size: number;
  color: string;
  hidden?: boolean;
  visibility?: "visible" | "hidden";
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

function clusterKeyOfNode(node: SimNode): { key: string; name: string } {
  if (node.sources && node.sources.length > 0) {
    const rawPath = node.sources[0].split(" · ")[0].trim();
    const parts = rawPath.replace(/\\/g, "/").split("/");
    if (parts.length > 1) {
      const dir = parts.slice(0, parts.length > 2 ? 2 : 1).join("/");
      return { key: dir, name: dir };
    }
  }
  if (node.id.includes("/")) {
    const parts = node.id.split("#")[0].replace(/\\/g, "/").split("/");
    if (parts.length > 1) {
      const dir = parts.slice(0, parts.length > 2 ? 2 : 1).join("/");
      return { key: dir, name: dir };
    }
  }
  return { key: node.scope, name: node.scope.toUpperCase() };
}

export class GraphView {
  private container: HTMLElement;
  private graph: MultiDirectedGraph<NodeAttrs, EdgeAttrs>;
  private sigma: Sigma<NodeAttrs, EdgeAttrs>;
  private sim: Simulation<SimNode, undefined> | null = null;
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
  onSelect: (id: string | null) => void = () => {};
  cachedVisibleCount = 0;
  cachedMaxDeg = 0;
  landmarkSet = new Set<string>();

  constructor(container: HTMLElement | SVGElement) {
    if (container instanceof SVGElement) {
      const div = document.createElement("div");
      div.className = container.getAttribute("class") || "graph";
      div.id = container.id || "graphContainer";
      container.replaceWith(div);
      this.container = div;
    } else {
      this.container = container;
    }
    this.container.style.position = "relative";

    this.graph = new MultiDirectedGraph<NodeAttrs, EdgeAttrs>();

    this.sigma = new Sigma(this.graph, this.container, {
      settings: {
        renderLabels: true,
        renderEdgeLabels: false,
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
      nodeReducer: (nodeId, data) => this.reduceNode(nodeId, data),
      edgeReducer: (edgeId, data) => this.reduceEdge(edgeId, data),
    });

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
      this.sigma.refresh();
      this.drawArchipelago();
    });

    this.sigma.on("leaveNode", () => {
      this.hovered = null;
      this.hoverNeighbors.clear();
      this.sigma.refresh();
      this.drawArchipelago();
    });

    this.sigma.getCamera().on("updated", () => {
      this.drawArchipelago();
    });

    window.addEventListener("resize", () => {
      this.drawArchipelago();
    });

    this.sigma.on("nodeDragStart", (e) => {
      const node = this.nodeMap.get(e.node);
      if (node) {
        node.fx = node.x;
        node.fy = node.y;
        this.sim?.alphaTarget(0.3).restart();
      }
    });

    this.sigma.on("nodeDrag", (e) => {
      const node = this.nodeMap.get(e.node);
      if (node) {
        const coords = this.sigma.viewportToGraph(e.event);
        node.fx = coords.x;
        node.fy = coords.y;
        this.sim?.alphaTarget(0.3).restart();
      }
    });

    this.sigma.on("nodeDragEnd", (e) => {
      const node = this.nodeMap.get(e.node);
      if (node) {
        node.fx = null;
        node.fy = null;
        this.sim?.alphaTarget(0);
      }
    });
  }

  /** Load (or morph into) a new dataset. */
  setData(graph: VizGraph, tab: "context" | "code"): void {
    this.tab = tab;
    this.rawGraph = graph;

    const deg: Record<string, number> = {};
    for (const e of graph.edges) {
      deg[e.source] = (deg[e.source] ?? 0) + 1;
      deg[e.target] = (deg[e.target] ?? 0) + 1;
    }

    const prevPositions = new Map<string, { x: number; y: number }>();
    if (this.graph.order > 0) {
      this.graph.forEachNode((id, attrs) => {
        prevPositions.set(id, { x: attrs.x, y: attrs.y });
      });
    }

    this.graph.clear();
    this.nodeMap.clear();

    const W = this.container.clientWidth || 800;
    const H = this.container.clientHeight || 600;

    const initialR = graph.nodes.length <= 25 ? 90 : Math.min(W, H) * 0.20;
    this.nodes = graph.nodes.map((n, i) => {
      const p = prevPositions.get(n.id);
      const angle = (i / Math.max(1, graph.nodes.length)) * Math.PI * 2;
      const d = deg[n.id] ?? 0;
      const scope = scopeOfNode(n);
      return {
        id: n.id,
        name: n.name,
        type: n.type,
        sources: n.sources,
        owners: n.owners,
        scope,
        deg: d,
        r: 4 + Math.min(10, Math.sqrt(d) * 2),
        x: p?.x ?? (Math.cos(angle) * initialR),
        y: p?.y ?? (Math.sin(angle) * initialR),
      };
    });

    const byId = new Map(this.nodes.map((n) => [n.id, n]));
    const simLinks = graph.edges
      .map((e) => ({
        source: byId.get(e.source)!,
        target: byId.get(e.target)!,
        relation: e.relation,
      }))
      .filter((e) => e.source && e.target);

    // Stop previous simulation
    this.sim?.stop();

    this.sim = forceSimulation(this.nodes)
      .force(
        "charge",
        forceManyBody()
          .strength((n: any) => {
            const d = n.deg ?? 0;
            return d === 0 ? -40 : -80 - Math.min(220, d * 18);
          })
          .distanceMax(800),
      )
      .force(
        "link",
        forceLink(simLinks as any)
          .distance((l: any) => (REST[famOf(l.relation)] ?? 90) * 1.1)
          .strength(0.4),
      )
      .force("x", forceX(0).strength((n: any) => (n.deg === 0 ? 0.09 : 0.035)))
      .force("y", forceY(0).strength((n: any) => (n.deg === 0 ? 0.09 : 0.035)))
      .force("center", forceCenter(0, 0).strength(0.25))
      .force("collide", forceCollide<SimNode>().radius((n) => n.r + 20).strength(0.85).iterations(2))
      .alpha(0.8)
      .alphaDecay(0.02);

    // Warm up the simulation synchronously with 60 fast ticks so nodes expand properly
    for (let i = 0; i < 60; i++) {
      this.sim.tick();
    }

    for (const node of this.nodes) {
      this.nodeMap.set(node.id, node);
      const color = cvar(colorToken(this.tab, node.type, node.scope));
      this.graph.addNode(node.id, {
        x: node.x,
        y: node.y,
        size: node.r,
        color,
        label: node.name,
        nodeType: node.type,
        scope: node.scope,
        labelPosition: "below",
        labelSize: 11,
        labelColor: cvar("--ink"),
        labelBackgroundColor: cvar("--panel"),
        labelBackgroundPadding: 2,
      });
    }

    let edgeIdx = 0;
    for (const e of graph.edges) {
      if (this.graph.hasNode(e.source) && this.graph.hasNode(e.target)) {
        const key = `${e.source}->${e.target}:${e.relation}:${edgeIdx++}`;
        this.graph.addEdgeWithKey(key, e.source, e.target, {
          relation: e.relation,
          description: e.description,
          confidence: e.confidence,
          transitive: false,
          size: 1.5,
          color: cvar("--edge"),
        });
      }
    }

    // Connect live simulation ticks to graphology and sigma
    this.sim.on("tick", () => {
      for (const n of this.nodes) {
        this.graph.mergeNodeAttributes(n.id, { x: n.x, y: n.y });
      }
      this.sigma.scheduleRefresh();
      this.drawArchipelago();
    });

    // Resume simulation to let it wobble and relax into equilibrium
    this.sim.restart();

    this.restyle();
    this.resetView();
    this.drawArchipelago();
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
    let labelColor = cvar("--ink");
    let labelBg = cvar("--panel");
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
        labelBg = cvar("--chip");
        labelVisibility = "visible";
      } else if (isSelectedNeighbor) {
        size = data.size + 1.5;
        opacity = 0.95;
        labelSize = 11.5;
        labelVisibility = "visible";
      } else {
        opacity = Math.min(opacity, 0.12);
        labelColor = cvar("--muted");
        labelSize = 10;
        labelVisibility = "hidden";
      }
    } else if (this.hovered) {
      if (isHovered) {
        size = data.size + 3.5;
        opacity = 1.0;
        highlighted = true;
        labelSize = 13;
        labelBg = cvar("--chip");
        labelVisibility = "visible";
      } else if (isHoverNeighbor) {
        size = data.size + 1.5;
        opacity = 0.95;
        labelSize = 11.5;
        labelVisibility = "visible";
      } else if (isSearchHit) {
        labelVisibility = "visible";
        highlighted = true;
        labelBg = cvar("--chip");
        size = data.size + 2;
      } else {
        opacity = match ? 0.35 : 0.12;
        labelColor = cvar("--muted");
        labelSize = 10;
        labelVisibility = "hidden";
      }
    } else if (isSearchHit) {
      labelVisibility = "visible";
      highlighted = true;
      labelBg = cvar("--chip");
      size = data.size + 2;
    } else if (isLandmark) {
      labelVisibility = "visible";
      labelSize = 11;
      opacity = Math.max(opacity, 0.95);
    } else {
      labelColor = cvar("--muted");
      labelSize = 10.5;
      labelVisibility = "auto";
    }

    const color = cvar(colorToken(this.tab, node.type, node.scope));

    return {
      ...data,
      visibility: "visible",
      size,
      color,
      opacity,
      hidden: false,
      highlighted,
      label: node.name,
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
    if (!sourceNode || !targetNode) {
      return { ...data, visibility: "hidden", hidden: true, size: 0, opacity: 0, color: "transparent" };
    }

    const sourceShown = this.isNodeShown(sourceNode);
    const targetShown = this.isNodeShown(targetNode);
    if (!sourceShown || !targetShown) {
      return { ...data, visibility: "hidden", hidden: true, size: 0, opacity: 0, color: "transparent" };
    }

    if (attrs.transitive) {
      if (!this.showTransitive) {
        return { ...data, visibility: "hidden", hidden: true, size: 0, opacity: 0, color: "transparent" };
      }
    } else if (this.hiddenRels[chipKey(attrs.relation)]) {
      return { ...data, visibility: "hidden", hidden: true, size: 0, opacity: 0, color: "transparent" };
    }

    const q = this.query.toLowerCase();
    const matchA = !q || sourceNode.name.toLowerCase().includes(q);
    const matchB = !q || targetNode.name.toLowerCase().includes(q);

    const isHoverActive = !this.selected && Boolean(this.hovered);
    const activeFocusId = this.selected ?? (isHoverActive ? this.hovered : null);

    const role = activeFocusId
      ? (source === activeFocusId ? "out" : target === activeFocusId ? "in" : "far")
      : "none";

    let color = cvar("--edge");
    let size = 1.6;
    let opacity = 0.72;

    if (attrs.transitive) {
      color = cvar("--scope-transitive");
      opacity = 0.75;
    } else {
      const fam = famOf(attrs.relation);
      if (fam === "structure") {
        size = 2.4;
        opacity = 0.45;
      } else if (fam === "dependency") {
        size = 1.8;
        opacity = 0.75;
      } else if (fam === "contract") {
        size = 1.8;
        opacity = 0.75;
      } else {
        size = 1.3;
        opacity = 0.38;
      }
    }

    if (role === "out") {
      color = cvar("--fil");
      opacity = 0.95;
      size += 0.8;
    } else if (role === "in") {
      color = cvar("--accent");
      opacity = 0.95;
      size += 0.8;
    } else if (role === "far") {
      opacity = isHoverActive ? 0.15 : 0.06;
    } else if (q && !matchA && !matchB) {
      opacity = 0.15;
    }

    return {
      ...data,
      visibility: "visible",
      color,
      size,
      opacity,
      hidden: false,
    };
  }

  /** Re-apply all style attributes (theme, filters, focus, search). */
  restyle(): void {
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

    this.landmarkSet.clear();
    if (visCount <= 25) {
      for (const n of visibleNodes) {
        this.landmarkSet.add(n.id);
      }
    } else {
      const minHubDeg = Math.max(3, Math.min(6, Math.round(maxD * 0.4)));
      const sortedByDeg = [...visibleNodes]
        .filter((n) => n.deg >= minHubDeg)
        .sort((a, b) => b.deg - a.deg);
      const topCount = Math.min(12, sortedByDeg.length);
      for (let i = 0; i < topCount; i++) {
        this.landmarkSet.add(sortedByDeg[i].id);
      }
    }

    this.neighbors.clear();
    if (this.selected && this.graph.hasNode(this.selected)) {
      this.graph.forEachNeighbor(this.selected, (neighbor) => {
        this.neighbors.add(neighbor);
      });
    }

    // Dynamic transitive shortcut edges between visible nodes across hidden intermediaries
    const edgesToRemove: string[] = [];
    this.graph.forEachEdge((edgeKey, attrs) => {
      if (attrs.transitive) edgesToRemove.push(edgeKey);
    });
    for (const k of edgesToRemove) this.graph.dropEdge(k);

    if (this.showTransitive && this.rawGraph) {
      const isVisible = (id: string) => {
        const node = this.nodeMap.get(id);
        return node ? this.isNodeShown(node) : false;
      };

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
              color: cvar("--scope-transitive"),
            });
            if (this.selected && te.source === this.selected) this.neighbors.add(te.target);
            if (this.selected && te.target === this.selected) this.neighbors.add(te.source);
          }
        }
      }
    }

    this.sigma.refresh();
    this.drawArchipelago();
  }

  select(id: string | null): void {
    this.selected = id;
    this.restyle();
    this.onSelect(id);
  }

  /** Center the view on a node and select it (used by search). */
  focus(id: string): void {
    if (!this.graph.hasNode(id)) return;
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

  isNodeShown(n: SimNode): boolean {
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
    const camera = this.sigma.getCamera();
    if (factor > 1) {
      camera.zoomIn({ factor });
    } else {
      camera.zoomOut({ factor: 1 / factor });
    }
  }

  resetView(): void {
    const camera = this.sigma.getCamera();
    const visibleNodes = this.nodes.filter((n) => this.isNodeShown(n));
    if (visibleNodes.length === 0 || !this.container) {
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
      const spanW = Math.max(80, maxX - minX);
      const spanH = Math.max(80, maxY - minY);

      const W = this.container.clientWidth || 800;
      const H = this.container.clientHeight || 600;

      // Desired coverage is 75% of center real estate
      const targetW = W * 0.75;
      const targetH = H * 0.75;
      const targetRatio = Math.max(0.2, Math.min(2.5, Math.max(spanW / targetW, spanH / targetH)));

      camera.setState({
        x: midX,
        y: midY,
        ratio: targetRatio,
        angle: 0,
      });
    } catch {
      camera.reset();
    }
  }

  reheat(): void {
    this.sim?.alpha(0.6).restart();
  }

  destroy(): void {
    this.sim?.stop();
    if (this.archGL) {
      if (this.archProgram) this.archGL.deleteProgram(this.archProgram);
      if (this.archQuadBuffer) this.archGL.deleteBuffer(this.archQuadBuffer);
      if (this.archInstanceBuffer) this.archGL.deleteBuffer(this.archInstanceBuffer);
      this.archGL = null;
      this.archProgram = null;
    }
    this.archBadgeCanvas = null;
    this.archBadgeCtx = null;
    this.sigma.kill();
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
    if (!gl || !this.archProgram || !this.container) return;
    const canvas = gl.canvas as HTMLCanvasElement;
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 600;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const visibleNodes = this.nodes.filter((n) => this.isNodeShown(n));
    const N = visibleNodes.length;

    // Clear badge canvas if available
    if (this.archBadgeCtx && this.archBadgeCanvas) {
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      this.archBadgeCtx.save();
      this.archBadgeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.archBadgeCtx.clearRect(0, 0, w, h);
    }

    if (N === 0) {
      if (this.archBadgeCtx) this.archBadgeCtx.restore();
      return;
    }

    // 1. Project visible nodes to screen coordinates
    const pts = visibleNodes.map((n) => {
      const vp = this.sigma.graphToViewport({ x: n.x, y: n.y });
      return {
        node: n,
        x: vp.x,
        y: vp.y,
        r: n.r,
        cluster: clusterKeyOfNode(n),
      };
    });

    // 2. Adaptive neighborhood distance & target cohesion
    // Dynamic scaling based on graph size: denser graphs use tighter radius
    const densityScale = Math.pow(100 / Math.max(20, N), 0.25);
    const R_nbr = Math.max(50, Math.min(180, 110 * densityScale));
    const R_nbr_sq = R_nbr * R_nbr;
    const targetNeighbors = Math.max(2.5, Math.min(10, Math.sqrt(N) * 0.45));

    // 3. Compute continuous neighborhood cohesion per node
    const instances: number[] = [];
    const clusterCentroids = new Map<string, { sumX: number; sumY: number; count: number; name: string; scope: string; totalCohesion: number }>();

    const palette = ["#38bdf8", "#818cf8", "#c084fc", "#f472b6", "#34d399", "#fbbf24", "#2dd4bf", "#fb7185"];
    const hashColor = (str: string, scope: string) => {
      if (scope === "specs" || str.startsWith("features") || str.includes("test")) return "#10b981";
      if (scope === "docs" || str.startsWith("docs") || str.includes("adr")) return "#a855f7";
      let hash = 0;
      for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
      return palette[hash % palette.length];
    };

    const pixelRatio = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];

      // Screen bounds culling (with padding for large blooms)
      if (p.x < -200 || p.x > w + 200 || p.y < -200 || p.y > h + 200) {
        continue;
      }

      let clusterNeighborCount = 0;
      let closenessSum = 0;

      for (let j = 0; j < pts.length; j++) {
        if (i === j) continue;
        const dx = pts[j].x - p.x;
        const dy = pts[j].y - p.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > R_nbr_sq) continue;

        const dist = Math.sqrt(distSq);
        const closeness = 1.0 - dist / R_nbr;
        const sameCluster = pts[j].cluster.key === p.cluster.key;

        if (sameCluster) {
          clusterNeighborCount++;
          closenessSum += closeness * 1.6;
        } else {
          closenessSum += closeness * 0.25;
        }
      }

      // Check focus (hover or selected)
      const isHovered = Boolean(this.hovered && (p.node.id === this.hovered || this.hoverNeighbors.has(p.node.id)));
      const isSelected = Boolean(this.selected && (p.node.id === this.selected || this.neighbors.has(p.node.id)));
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
      const bloomRadius = Math.max(30, (p.r + 28) * densityScale + Math.min(40, clusterNeighborCount * 5) + (isFocus ? 18 : 0));

      const baseHex = hashColor(p.cluster.key, p.node.scope);
      const alpha = isFocus ? 0.38 : 0.16;
      const [r, g, b, a] = parseColorToRgba(baseHex, alpha);

      // Store cluster centroid stats for badge rendering
      let cc = clusterCentroids.get(p.cluster.key);
      if (!cc) {
        cc = { sumX: 0, sumY: 0, count: 0, name: p.cluster.name, scope: p.node.scope, totalCohesion: 0 };
        clusterCentroids.set(p.cluster.key, cc);
      }
      cc.sumX += p.x;
      cc.sumY += p.y;
      cc.count += 1;
      cc.totalCohesion += cohesion;

      // Layout per instance (8 floats):
      // a_center.x, a_center.y, a_radius, a_color.r, a_color.g, a_color.b, a_color.a, a_cohesion
      instances.push(
        p.x * pixelRatio,
        p.y * pixelRatio,
        bloomRadius * pixelRatio,
        r, g, b, a,
        cohesion,
      );
    }

    // 4. Render WebGL instanced blooms
    const instanceCount = instances.length / 8;
    if (instanceCount > 0 && this.archInstanceBuffer) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(this.archProgram);
      const uResLoc = gl.getUniformLocation(this.archProgram, "u_resolution");
      gl.uniform2f(uResLoc, canvas.width, canvas.height);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.archQuadBuffer);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      const data = new Float32Array(instances);
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
            (this.hovered && pts.some((p) => p.cluster.key === key && (p.node.id === this.hovered || this.hoverNeighbors.has(p.node.id)))) ||
            (this.selected && pts.some((p) => p.cluster.key === key && (p.node.id === this.selected || this.neighbors.has(p.node.id))))
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
  }
}
