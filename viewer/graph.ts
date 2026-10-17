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
  forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide,
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
  private archCanvas: HTMLCanvasElement | null = null;
  private archCtx: CanvasRenderingContext2D | null = null;

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

    // Setup archipelago background bloom canvas (rendered behind Sigma WebGL)
    this.archCanvas = document.createElement("canvas");
    this.archCanvas.className = "archipelago-canvas";
    this.archCanvas.style.position = "absolute";
    this.archCanvas.style.top = "0";
    this.archCanvas.style.left = "0";
    this.archCanvas.style.width = "100%";
    this.archCanvas.style.height = "100%";
    this.archCanvas.style.pointerEvents = "none";
    this.archCanvas.style.zIndex = "0";
    this.container.appendChild(this.archCanvas);
    this.archCtx = this.archCanvas.getContext("2d");

    this.graph = new MultiDirectedGraph<NodeAttrs, EdgeAttrs>();

    this.sigma = new Sigma(this.graph, this.container, {
      settings: {
        renderLabels: true,
        renderEdgeLabels: false,
        enableNodeDrag: true,
        stagePadding: 50,
        labelRenderedSizeThreshold: 8.5,
        labelDensity: 0.8,
        labelGridCellSize: 120,
        itemSizesReference: "screen",
        zoomToSizeRatioFunction: Math.sqrt,
        autoRescale: "once",
        minEdgeThickness: 1,
      },
      nodeReducer: (nodeId, data) => this.reduceNode(nodeId, data),
      edgeReducer: (edgeId, data) => this.reduceEdge(edgeId, data),
    });

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
      this.resizeArchCanvas();
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
        x: p?.x ?? (Math.cos(angle) * Math.min(W, H) * 0.35),
        y: p?.y ?? (Math.sin(angle) * Math.min(W, H) * 0.35),
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
      .force("charge", forceManyBody().strength((n: any) => -300 - Math.min(350, (n.deg ?? 0) * 25)).distanceMax(1800))
      .force("link", forceLink(simLinks as any)
        .distance((l: any) => (REST[famOf(l.relation)] ?? 110) * 1.5)
        .strength(0.35))
      .force("center", forceCenter(0, 0).strength(0.08))
      .force("collide", forceCollide<SimNode>().radius((n) => n.r + 26).strength(0.85).iterations(2))
      .alpha(0.8)
      .alphaDecay(0.02);

    // Warm up the simulation synchronously with 45 fast ticks so nodes expand properly
    for (let i = 0; i < 45; i++) {
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
    this.resizeArchCanvas();
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
    const isLandmark = node.deg >= 6;

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
      } else if (isLandmark) {
        labelVisibility = "visible";
        labelSize = 11;
        opacity = Math.max(opacity, 0.85);
      } else {
        opacity = match ? 0.70 : 0.15;
        labelColor = cvar("--muted");
        labelSize = 10;
        labelVisibility = "auto";
      }
    } else if (isSearchHit) {
      labelVisibility = "visible";
      highlighted = true;
      labelBg = cvar("--chip");
      size = data.size + 2;
    } else if (isLandmark) {
      labelVisibility = "visible";
      labelSize = 11;
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
    camera.animate(
      { x: attrs.x, y: attrs.y, ratio: Math.min(camera.ratio, 0.4) },
      { duration: 400 },
    );
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
    camera.reset();
  }

  reheat(): void {
    this.sim?.alpha(0.6).restart();
  }

  destroy(): void {
    this.sim?.stop();
    this.archCanvas?.remove();
    this.archCanvas = null;
    this.archCtx = null;
    this.sigma.kill();
    this.graph.clear();
  }

  private resizeArchCanvas(): void {
    if (!this.archCanvas || !this.container) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 600;
    const targetW = Math.round(w * dpr);
    const targetH = Math.round(h * dpr);
    if (this.archCanvas.width !== targetW || this.archCanvas.height !== targetH) {
      this.archCanvas.width = targetW;
      this.archCanvas.height = targetH;
      this.archCanvas.style.width = `${w}px`;
      this.archCanvas.style.height = `${h}px`;
    }
  }

  private drawArchipelago(): void {
    if (!this.archCtx || !this.archCanvas || !this.container) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 600;
    const ctx = this.archCtx;

    this.resizeArchCanvas();

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (this.nodes.length === 0) {
      ctx.restore();
      return;
    }

    // Group all visible nodes by cluster
    const clusters = new Map<string, { key: string; name: string; scope: string; nodes: SimNode[] }>();
    for (const n of this.nodes) {
      if (!this.isNodeShown(n)) continue;
      const c = clusterKeyOfNode(n);
      let cl = clusters.get(c.key);
      if (!cl) {
        cl = { key: c.key, name: c.name, scope: n.scope, nodes: [] };
        clusters.set(c.key, cl);
      }
      cl.nodes.push(n);
    }

    const palette = ["#38bdf8", "#818cf8", "#c084fc", "#f472b6", "#34d399", "#fbbf24", "#2dd4bf", "#fb7185"];
    const hashColor = (str: string, scope: string) => {
      if (scope === "specs" || str.startsWith("features") || str.includes("test")) return "#10b981";
      if (scope === "docs" || str.startsWith("docs") || str.includes("adr")) return "#a855f7";
      let hash = 0;
      for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
      return palette[hash % palette.length];
    };

    for (const cl of clusters.values()) {
      if (cl.nodes.length < 2) continue;

      // Project node positions to viewport coordinates
      const pts = cl.nodes.map((n) => {
        const vp = this.sigma.graphToViewport({ x: n.x, y: n.y });
        return { x: vp.x, y: vp.y, r: n.r, id: n.id };
      });

      // Frustum check: bounding box
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      let sumX = 0, sumY = 0;
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
        sumX += p.x;
        sumY += p.y;
      }

      if (maxX < -300 || minX > w + 300 || maxY < -300 || minY > h + 300) {
        continue;
      }

      const cx = sumX / pts.length;
      const cy = sumY / pts.length;

      // Calculate 85th percentile distance from centroid to prevent outlier ballooning
      const dists = pts.map((p) => Math.hypot(p.x - cx, p.y - cy)).sort((a, b) => a - b);
      const p85Idx = Math.min(dists.length - 1, Math.floor((dists.length - 1) * 0.85));
      const p85 = dists[p85Idx];
      const maxDist = Math.max(25, p85);
      const bloomRadius = Math.max(50, maxDist + 35);

      const isHoveredCluster = Boolean(
        this.hovered && pts.some((p) => p.id === this.hovered || this.hoverNeighbors.has(p.id)),
      );
      const isSelectedCluster = Boolean(
        this.selected && pts.some((p) => p.id === this.selected || this.neighbors.has(p.id)),
      );
      const isHighlighted = isHoveredCluster || isSelectedCluster;

      const baseColor = hashColor(cl.key, cl.scope);

      // 1. Draw individual node sub-blooms for organic archipelago contour
      for (const p of pts) {
        const subR = Math.max(28, p.r + 26);
        const subGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, subR);
        subGrad.addColorStop(0, colorWithAlpha(baseColor, isHighlighted ? 0.22 : 0.08));
        subGrad.addColorStop(0.5, colorWithAlpha(baseColor, isHighlighted ? 0.10 : 0.035));
        subGrad.addColorStop(1, colorWithAlpha(baseColor, 0));
        ctx.fillStyle = subGrad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, subR, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2. Draw outer ambient cluster glow
      const grad = ctx.createRadialGradient(cx, cy, Math.max(10, maxDist * 0.25), cx, cy, bloomRadius);
      grad.addColorStop(0, colorWithAlpha(baseColor, isHighlighted ? 0.28 : 0.10));
      grad.addColorStop(0.5, colorWithAlpha(baseColor, isHighlighted ? 0.12 : 0.04));
      grad.addColorStop(1, colorWithAlpha(baseColor, 0));

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, bloomRadius, 0, Math.PI * 2);
      ctx.fill();

      // 3. Subtle archipelago boundary contour & watermark label
      if (maxDist > 25) {
        ctx.save();
        ctx.strokeStyle = colorWithAlpha(baseColor, isHighlighted ? 0.38 : 0.14);
        ctx.lineWidth = isHighlighted ? 1.5 : 1.0;
        ctx.setLineDash([5, 7]);
        ctx.beginPath();
        ctx.arc(cx, cy, maxDist + 22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Watermark badge label
        const labelText = `⬡ ${cl.name} (${cl.nodes.length})`;
        ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = colorWithAlpha(baseColor, isHighlighted ? 0.85 : 0.40);
        ctx.fillText(labelText, cx, cy - maxDist - 12);
      }
    }

    ctx.restore();
  }
}
