/**
 * Overview Radar Minimap & Two-Degree Focus Halos (Lanum Ch. 6, Fig 6.4 & Fig 6.10).
 *
 * Implements:
 * 1. Global bounding-box radar projection of Cosmos node coordinates.
 * 2. Bidirectional mapping between minimap click/drag coordinates and camera center/pan.
 * 3. Draggable camera viewport indicator rectangle accurately reflecting visible world region.
 * 4. Two-degree focus halo computation (hop 0 seed, hop 1 direct, hop 2 transitive, and dimmed background).
 */

export interface MinimapPointInput {
  id: string;
  x: number;
  y: number;
  color?: string;
  radius?: number;
}

export interface MinimapCameraState {
  /** World-space camera center or pan offset */
  panX: number;
  panY: number;
  zoom: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface MinimapViewportRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MinimapProjectedPoint {
  id: string;
  x: number;
  y: number;
  color?: string;
  radius: number;
}

export interface MinimapProjection {
  width: number;
  height: number;
  padding: number;
  worldBounds: { minX: number; maxX: number; minY: number; maxY: number };
  scale: number;
  offsetX: number;
  offsetY: number;
  points: MinimapProjectedPoint[];
  viewportRect: MinimapViewportRect;
}

export interface FocusEdgeInput {
  source: string;
  target: string;
  type?: string;
}

export interface TwoDegreeFocusResult {
  seedId: string;
  hop0: Set<string>;
  hop1: Set<string>;
  hop2: Set<string>;
  primaryEdges: Set<string>;   // key "${source}->${target}"
  secondaryEdges: Set<string>; // key "${source}->${target}"
  getNodeFocus(nodeId: string): { hop: 0 | 1 | 2 | null; opacity: number };
  getEdgeFocus(source: string, target: string): { tier: 1 | 2 | null; opacity: number; dashed: boolean };
}

export interface MinimapOverlayOptions {
  container?: HTMLElement | any;
  canvas?: HTMLCanvasElement | any;
  width?: number;
  height?: number;
  padding?: number;
  className?: string;
  onPanTo?: (worldX: number, worldY: number, panX: number, panY: number) => void;
}

/**
 * Computes the minimap projection, scaling all world node coordinates uniformly to fit inside
 * the minimap canvas dimensions while preserving aspect ratio and centering the cluster bounds.
 *
 * Supports camera specified via world center (cx, cy) or Graft screen pan offsets (panX, panY).
 */
export function computeMinimapProjection(
  nodes: MinimapPointInput[],
  camera: {
    cx?: number;
    cy?: number;
    panX?: number;
    panY?: number;
    zoom: number;
    viewportWidth: number;
    viewportHeight: number;
  },
  width = 160,
  height = 110,
  padding = 10,
): MinimapProjection {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  if (nodes.length === 0) {
    minX = -100;
    maxX = 100;
    minY = -100;
    maxY = 100;
  } else {
    for (const n of nodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }
  }

  // Guard against point-clusters with zero span
  if (maxX - minX < 1e-4) {
    minX -= 50;
    maxX += 50;
  }
  if (maxY - minY < 1e-4) {
    minY -= 50;
    maxY += 50;
  }

  const worldSpanX = maxX - minX;
  const worldSpanY = maxY - minY;
  const usableWidth = Math.max(1, width - 2 * padding);
  const usableHeight = Math.max(1, height - 2 * padding);

  // Uniform scale preserving aspect ratio
  const scale = Math.min(usableWidth / worldSpanX, usableHeight / worldSpanY);

  const worldCenterX = (minX + maxX) / 2;
  const worldCenterY = (minY + maxY) / 2;
  const minimapCenterX = width / 2;
  const minimapCenterY = height / 2;

  const offsetX = minimapCenterX - worldCenterX * scale;
  const offsetY = minimapCenterY - worldCenterY * scale;

  const points: MinimapProjectedPoint[] = nodes.map((node) => ({
    id: node.id,
    x: node.x * scale + offsetX,
    y: node.y * scale + offsetY,
    color: node.color,
    radius: node.radius ?? 2.5,
  }));

  const zoom = camera.zoom > 0 ? camera.zoom : 1;
  const worldWidth = camera.viewportWidth / zoom;
  const worldHeight = camera.viewportHeight / zoom;

  let worldLeft: number;
  let worldTop: number;

  if (camera.cx !== undefined && camera.cy !== undefined) {
    worldLeft = camera.cx - (camera.viewportWidth / 2) / zoom;
    worldTop = camera.cy - (camera.viewportHeight / 2) / zoom;
  } else {
    const panX = camera.panX ?? 0;
    const panY = camera.panY ?? 0;
    worldLeft = (0 - panX) / zoom;
    worldTop = (0 - panY) / zoom;
  }

  const viewportRect: MinimapViewportRect = {
    x: worldLeft * scale + offsetX,
    y: worldTop * scale + offsetY,
    w: worldWidth * scale,
    h: worldHeight * scale,
  };

  return {
    width,
    height,
    padding,
    worldBounds: { minX, maxX, minY, maxY },
    scale,
    offsetX,
    offsetY,
    points,
    viewportRect,
  };
}

/**
 * Converts a minimap pixel coordinate back into world coordinates and computes
 * the corresponding Graft screen pan offset to center that point in the viewport.
 */
export function minimapPointToWorld(
  px: number,
  py: number,
  projection: MinimapProjection,
  camera?: { zoom: number; viewportWidth: number; viewportHeight: number },
): { worldX: number; worldY: number; panX: number; panY: number } {
  const worldX = (px - projection.offsetX) / projection.scale;
  const worldY = (py - projection.offsetY) / projection.scale;
  const zoom = camera?.zoom ?? 1;
  const vw = camera?.viewportWidth ?? 0;
  const vh = camera?.viewportHeight ?? 0;
  const panX = vw / 2 - worldX * zoom;
  const panY = vh / 2 - worldY * zoom;

  return { worldX, worldY, panX, panY };
}

/**
 * Computes two-degree focus neighborhoods according to Lanum Ch. 6, Fig 6.10:
 * - hop 0: seed node (1.0 opacity)
 * - hop 1: direct 1-hop neighbors (1.0 opacity, primary edge highlight)
 * - hop 2: transitive 2-hop neighbors (0.55 opacity, secondary edge highlight)
 * - >2 hops: background dimmed nodes (0.10 opacity, dimmed edge style)
 */
export function computeTwoDegreeFocus(
  seedId: string,
  edges: FocusEdgeInput[],
): TwoDegreeFocusResult {
  const hop0 = new Set<string>([seedId]);
  const hop1 = new Set<string>();
  const hop2 = new Set<string>();

  // 1-hop neighbors (undirected adjacency, excluding seedId)
  for (const e of edges) {
    if (e.source === seedId && e.target !== seedId) {
      hop1.add(e.target);
    } else if (e.target === seedId && e.source !== seedId) {
      hop1.add(e.source);
    }
  }

  // 2-hop neighbors (neighbors of hop1 nodes, excluding hop0 and hop1)
  for (const e of edges) {
    if (hop1.has(e.source)) {
      if (!hop0.has(e.target) && !hop1.has(e.target)) {
        hop2.add(e.target);
      }
    }
    if (hop1.has(e.target)) {
      if (!hop0.has(e.source) && !hop1.has(e.source)) {
        hop2.add(e.source);
      }
    }
  }

  const primaryEdges = new Set<string>();
  const secondaryEdges = new Set<string>();

  for (const e of edges) {
    const isHop0Source = hop0.has(e.source);
    const isHop0Target = hop0.has(e.target);
    const isHop1Source = hop1.has(e.source);
    const isHop1Target = hop1.has(e.target);
    const isHop2Source = hop2.has(e.source);
    const isHop2Target = hop2.has(e.target);

    // Primary: connecting hop0 to hop1
    if ((isHop0Source && isHop1Target) || (isHop0Target && isHop1Source)) {
      primaryEdges.add(`${e.source}->${e.target}`);
    } else if (
      (isHop1Source && isHop1Target) ||
      (isHop1Source && isHop2Target) ||
      (isHop2Source && isHop1Target)
    ) {
      secondaryEdges.add(`${e.source}->${e.target}`);
    }
  }

  function getNodeFocus(nodeId: string): { hop: 0 | 1 | 2 | null; opacity: number } {
    if (hop0.has(nodeId)) {
      return { hop: 0, opacity: 1.0 };
    }
    if (hop1.has(nodeId)) {
      return { hop: 1, opacity: 1.0 };
    }
    if (hop2.has(nodeId)) {
      return { hop: 2, opacity: 0.55 };
    }
    return { hop: null, opacity: 0.10 };
  }

  function getEdgeFocus(
    source: string,
    target: string,
  ): { tier: 1 | 2 | null; opacity: number; dashed: boolean } {
    const key = `${source}->${target}`;
    const revKey = `${target}->${source}`;
    if (primaryEdges.has(key) || primaryEdges.has(revKey)) {
      return { tier: 1, opacity: 0.9, dashed: false };
    }
    if (secondaryEdges.has(key) || secondaryEdges.has(revKey)) {
      return { tier: 2, opacity: 0.45, dashed: true };
    }
    return { tier: null, opacity: 0.05, dashed: false };
  }

  return {
    seedId,
    hop0,
    hop1,
    hop2,
    primaryEdges,
    secondaryEdges,
    getNodeFocus,
    getEdgeFocus,
  };
}

/**
 * Controller class that manages an HTML5 canvas overlay for the radar minimap,
 * renders projected node positions & viewport indicator, and handles click/drag navigation.
 */
export class MinimapOverlay {
  public canvas: HTMLCanvasElement | any = null;
  public ctx: CanvasRenderingContext2D | any = null;
  public width: number;
  public height: number;
  public padding: number;
  public projection: MinimapProjection | null = null;
  public cameraState?: {
    cx?: number;
    cy?: number;
    panX?: number;
    panY?: number;
    zoom: number;
    viewportWidth: number;
    viewportHeight: number;
  };
  public onPanTo?: (worldX: number, worldY: number, panX: number, panY: number) => void;
  public isDragging = false;

  private boundOnPointerDown?: (e: any) => void;
  private boundOnPointerMove?: (e: any) => void;
  private boundOnPointerUp?: (e: any) => void;

  constructor(options: MinimapOverlayOptions = {}) {
    this.width = options.width ?? 160;
    this.height = options.height ?? 110;
    this.padding = options.padding ?? 10;
    this.onPanTo = options.onPanTo;

    const className = options.className ?? "cosmos-minimap";

    if (options.canvas) {
      this.canvas = options.canvas;
      this.canvas.width = this.width;
      this.canvas.height = this.height;
    } else if (options.container) {
      if (options.container.querySelector) {
        this.canvas = options.container.querySelector(`canvas.${className}`) || null;
      }
      if (!this.canvas && typeof document !== "undefined" && document.createElement) {
        this.canvas = document.createElement("canvas");
        this.canvas.className = className;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        options.container.appendChild(this.canvas);
      }
    } else if (typeof document !== "undefined" && document.createElement) {
      this.canvas = document.createElement("canvas");
      this.canvas.className = className;
      this.canvas.width = this.width;
      this.canvas.height = this.height;
    }

    if (this.canvas?.getContext) {
      this.ctx = this.canvas.getContext("2d");
    }

    this.attachEventListeners();
  }

  private attachEventListeners(): void {
    if (!this.canvas || !this.canvas.addEventListener) return;

    this.boundOnPointerDown = (e: any) => {
      this.isDragging = true;
      if (this.canvas.setPointerCapture && e.pointerId !== undefined) {
        try {
          this.canvas.setPointerCapture(e.pointerId);
        } catch {}
      }
      this.handlePointerEvent(e);
    };

    this.boundOnPointerMove = (e: any) => {
      if (!this.isDragging) return;
      this.handlePointerEvent(e);
    };

    this.boundOnPointerUp = (e: any) => {
      if (!this.isDragging) return;
      this.isDragging = false;
      if (this.canvas.releasePointerCapture && e.pointerId !== undefined) {
        try {
          this.canvas.releasePointerCapture(e.pointerId);
        } catch {}
      }
    };

    this.canvas.addEventListener("pointerdown", this.boundOnPointerDown);
    this.canvas.addEventListener("pointermove", this.boundOnPointerMove);
    this.canvas.addEventListener("pointerup", this.boundOnPointerUp);
    this.canvas.addEventListener("pointercancel", this.boundOnPointerUp);
  }

  private detachEventListeners(): void {
    if (!this.canvas || !this.canvas.removeEventListener) return;
    if (this.boundOnPointerDown) this.canvas.removeEventListener("pointerdown", this.boundOnPointerDown);
    if (this.boundOnPointerMove) this.canvas.removeEventListener("pointermove", this.boundOnPointerMove);
    if (this.boundOnPointerUp) {
      this.canvas.removeEventListener("pointerup", this.boundOnPointerUp);
      this.canvas.removeEventListener("pointercancel", this.boundOnPointerUp);
    }
  }

  private handlePointerEvent(e: any): { worldX: number; worldY: number; panX: number; panY: number } | null {
    let px = 0;
    let py = 0;
    if (this.canvas?.getBoundingClientRect) {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = (this.canvas.width || this.width) / (rect.width || 1);
      const scaleY = (this.canvas.height || this.height) / (rect.height || 1);
      px = ((e.clientX ?? 0) - rect.left) * scaleX;
      py = ((e.clientY ?? 0) - rect.top) * scaleY;
    } else {
      px = e.offsetX ?? e.clientX ?? 0;
      py = e.offsetY ?? e.clientY ?? 0;
    }
    return this.triggerPanAt(px, py);
  }

  public triggerPanAt(px: number, py: number): { worldX: number; worldY: number; panX: number; panY: number } | null {
    if (!this.projection) return null;
    const res = minimapPointToWorld(px, py, this.projection, this.cameraState);
    if (this.onPanTo) {
      this.onPanTo(res.worldX, res.worldY, res.panX, res.panY);
    }
    return res;
  }

  public update(
    nodes: MinimapPointInput[],
    camera: {
      cx?: number;
      cy?: number;
      panX?: number;
      panY?: number;
      zoom: number;
      viewportWidth: number;
      viewportHeight: number;
    },
  ): MinimapProjection {
    this.cameraState = camera;
    this.projection = computeMinimapProjection(nodes, camera, this.width, this.height, this.padding);
    this.render();
    return this.projection;
  }

  public render(): void {
    if (!this.ctx || !this.projection) return;
    const { width, height } = this;

    this.ctx.clearRect(0, 0, width, height);

    // Radar canvas background
    this.ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    this.ctx.fillRect(0, 0, width, height);

    // Border
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(0, 0, width, height);

    // Render nodes
    for (const pt of this.projection.points) {
      this.ctx.beginPath();
      this.ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = pt.color || "rgba(148, 163, 184, 0.8)";
      this.ctx.fill();
    }

    // Render viewport rect
    const vp = this.projection.viewportRect;
    this.ctx.fillStyle = "rgba(56, 189, 248, 0.15)";
    this.ctx.fillRect(vp.x, vp.y, vp.w, vp.h);
    this.ctx.strokeStyle = "rgba(56, 189, 248, 0.9)";
    this.ctx.lineWidth = 1.5;
    this.ctx.strokeRect(vp.x, vp.y, vp.w, vp.h);
  }

  public destroy(): void {
    this.detachEventListeners();
    if (this.canvas?.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
  }
}
