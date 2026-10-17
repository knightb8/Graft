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
import forceAtlas2 from "graphology-layout-forceatlas2";
import {
  type VizGraph, type NodeOwner, type TripartiteScope, type ConcreteScope,
  famOf, chipKey, colorToken, cvar, matchNodeFilter, scopeOfNode,
  generateTransitiveEdges,
} from "./data.js";

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

    this.graph = new MultiDirectedGraph<NodeAttrs, EdgeAttrs>();

    this.sigma = new Sigma(this.graph, this.container, {
      settings: {
        renderLabels: true,
        renderEdgeLabels: false,
        enableNodeDrag: true,
        stagePadding: 30,
        labelRenderedSizeThreshold: 6,
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
        r: 7 + Math.min(11, d * 1.8),
        x: p?.x ?? (Math.cos(angle) * Math.min(W, H) * 0.4),
        y: p?.y ?? (Math.sin(angle) * Math.min(W, H) * 0.4),
      };
    });

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
          size: 1.6,
          color: cvar("--edge"),
        });
      }
    }

    // Run ForceAtlas2 layout
    if (this.nodes.length > 0) {
      try {
        const settings = forceAtlas2.inferSettings(this.graph);
        forceAtlas2.assign(this.graph, {
          iterations: Math.min(80, Math.max(25, Math.floor(800 / Math.max(1, this.nodes.length)))),
          settings: {
            ...settings,
            barnesHutOptimize: true,
            gravity: 1.2,
            scalingRatio: 3,
          },
        });
      } catch {
        // Fallback: circular layout already assigned
      }
    }

    this.restyle();
    this.resetView();
  }

  private reduceNode(nodeId: string, data: any): any {
    const node = this.nodeMap.get(nodeId);
    if (!node) return data;

    const shown = this.isNodeShown(node);
    if (!shown) {
      return {
        ...data,
        hidden: true,
        label: null,
      };
    }

    const q = this.query.toLowerCase();
    const match = !q || node.name.toLowerCase().includes(q);

    let opacity = match ? 0.95 : 0.2;
    let highlighted = false;

    if (this.selected) {
      if (nodeId === this.selected) {
        opacity = 1.0;
        highlighted = true;
      } else if (this.neighbors.has(nodeId)) {
        opacity = 0.95;
      } else {
        opacity = Math.min(opacity, 0.15);
      }
    }

    const color = cvar(colorToken(this.tab, node.type, node.scope));

    return {
      ...data,
      color,
      opacity,
      hidden: false,
      highlighted,
      label: shown ? node.name : null,
    };
  }

  private reduceEdge(edgeId: string, data: any): any {
    const attrs = this.graph.getEdgeAttributes(edgeId);
    const source = this.graph.source(edgeId);
    const target = this.graph.target(edgeId);

    const sourceNode = this.nodeMap.get(source);
    const targetNode = this.nodeMap.get(target);
    if (!sourceNode || !targetNode) return { ...data, hidden: true };

    const sourceShown = this.isNodeShown(sourceNode);
    const targetShown = this.isNodeShown(targetNode);
    if (!sourceShown || !targetShown) {
      return { ...data, hidden: true };
    }

    if (attrs.transitive) {
      if (!this.showTransitive) return { ...data, hidden: true };
    } else if (this.hiddenRels[chipKey(attrs.relation)]) {
      return { ...data, hidden: true };
    }

    const q = this.query.toLowerCase();
    const matchA = !q || sourceNode.name.toLowerCase().includes(q);
    const matchB = !q || targetNode.name.toLowerCase().includes(q);

    const role = this.selected
      ? (source === this.selected ? "out" : target === this.selected ? "in" : "far")
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
      opacity = 0.06;
    } else if (q && !matchA && !matchB) {
      opacity = 0.15;
    }

    return {
      ...data,
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
    if (this.nodes.length > 0) {
      try {
        const settings = forceAtlas2.inferSettings(this.graph);
        forceAtlas2.assign(this.graph, {
          iterations: 35,
          settings: {
            ...settings,
            barnesHutOptimize: true,
            gravity: 1.2,
            scalingRatio: 3,
          },
        });
        this.sigma.refresh();
      } catch {
        // ignore
      }
    }
  }

  destroy(): void {
    this.sigma.kill();
    this.graph.clear();
  }
}
