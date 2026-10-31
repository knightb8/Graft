import { classifyArtifactStage, type ArtifactStage } from "./sankey-engine.js";

export type WheelStage = ArtifactStage;

export interface WheelNode {
  id: string;
  name?: string;
  type?: string;
  sources?: string[];
  stage?: WheelStage;
  angle?: number;
  x?: number;
  y?: number;
  labelX?: number;
  labelY?: number;
}

export interface WheelSector {
  stage: WheelStage;
  title: string;
  color: string;
  startAngle: number;
  endAngle: number;
  nodes: WheelNode[];
  pathD: string;
}

export interface WheelChord {
  id: string;
  sourceNode: WheelNode;
  targetNode: WheelNode;
  relation: string;
  color: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cpx: number;
  cpy: number;
  pathD: string;
}

export interface WheelModel {
  cx: number;
  cy: number;
  innerRadius: number;
  outerRadius: number;
  sectors: WheelSector[];
  chords: WheelChord[];
}

const STAGE_CONFIG: Record<WheelStage, { title: string; color: string; order: number }> = {
  adrs: { title: "ADRs", color: "#a855f7", order: 0 },
  features: { title: "Specs", color: "#10b981", order: 1 },
  code: { title: "Code", color: "#38bdf8", order: 2 },
  tests: { title: "Tests", color: "#f59e0b", order: 3 },
  docs: { title: "Docs", color: "#ec4899", order: 4 },
};

const RELATION_COLORS: Record<string, string> = {
  structure: "#38bdf8",
  dependency: "#fbbf24",
  contract: "#10b981",
  association: "#ec4899",
};

function relationFamilyColor(rel?: string): string {
  if (!rel) return "#94a3b8";
  const r = rel.toLowerCase();
  if (r === "part_of" || r === "contains") return RELATION_COLORS.structure;
  if (r === "implements" || r === "extends" || r === "covers") return RELATION_COLORS.contract;
  if (r === "governs" || r === "documents" || r === "references") return RELATION_COLORS.association;
  return RELATION_COLORS.dependency;
}

/**
 * Computes the circular chord dependency wheel model.
 * Partitions circumference into 5 Tripartite sectors with smooth quadratic Bézier chords.
 */
export function computeWheelModel(
  nodes: Array<{ id: string; name?: string; type?: string; sources?: string[] }>,
  edges: Array<{ source: string; target: string; relation?: string }>,
  options: { width?: number; height?: number } = {},
): WheelModel {
  const width = Math.max(800, options.width || 1000);
  const height = Math.max(600, options.height || 800);
  const cx = Math.round(width / 2);
  const cy = Math.round(height / 2);

  const outerRadius = Math.max(180, Math.min(cx, cy) - 80);
  const innerRadius = outerRadius - 20;

  const stageBuckets: Record<WheelStage, WheelNode[]> = {
    adrs: [],
    features: [],
    code: [],
    tests: [],
    docs: [],
  };

  const nodeMap = new Map<string, WheelNode>();
  for (const n of nodes) {
    const st = classifyArtifactStage(n);
    const wNode: WheelNode = { ...n, stage: st };
    nodeMap.set(n.id, wNode);
    stageBuckets[st].push(wNode);
  }

  const stageOrder: WheelStage[] = ["adrs", "features", "code", "tests", "docs"];
  const sectorGap = 0.06; // radians gap between sectors (~3.4 deg)
  const totalGap = sectorGap * stageOrder.length;
  const availableAngle = 2 * Math.PI - totalGap;

  const totalNodeCount = Math.max(1, nodes.length);
  const sectors: WheelSector[] = [];
  let currentAngle = -Math.PI / 2; // Start at 12 o'clock

  for (const stage of stageOrder) {
    const bucket = stageBuckets[stage];
    const meta = STAGE_CONFIG[stage];
    const weightFraction = Math.max(0.12, bucket.length / totalNodeCount);
    const sectorAngle = (weightFraction / stageOrder.reduce((acc, st) => acc + Math.max(0.12, stageBuckets[st].length / totalNodeCount), 0)) * availableAngle;

    const startAngle = currentAngle;
    const endAngle = startAngle + sectorAngle;
    currentAngle = endAngle + sectorGap;

    // Distribute nodes along inner circumference
    const bCount = bucket.length;
    for (let i = 0; i < bCount; i++) {
      const node = bucket[i];
      const theta = startAngle + ((i + 0.5) / Math.max(1, bCount)) * (endAngle - startAngle);
      node.angle = theta;
      node.x = Math.round(cx + innerRadius * Math.cos(theta));
      node.y = Math.round(cy + innerRadius * Math.sin(theta));
      node.labelX = Math.round(cx + (outerRadius + 14) * Math.cos(theta));
      node.labelY = Math.round(cy + (outerRadius + 14) * Math.sin(theta));
    }

    // Generate annular sector path
    const cos1 = Math.cos(startAngle);
    const sin1 = Math.sin(startAngle);
    const cos2 = Math.cos(endAngle);
    const sin2 = Math.sin(endAngle);
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

    const pOut1 = `${cx + outerRadius * cos1},${cy + outerRadius * sin1}`;
    const pOut2 = `${cx + outerRadius * cos2},${cy + outerRadius * sin2}`;
    const pIn2 = `${cx + innerRadius * cos2},${cy + innerRadius * sin2}`;
    const pIn1 = `${cx + innerRadius * cos1},${cy + innerRadius * sin1}`;

    const pathD = `M ${pOut1} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${pOut2} L ${pIn2} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${pIn1} Z`;

    sectors.push({
      stage,
      title: meta.title,
      color: meta.color,
      startAngle,
      endAngle,
      nodes: bucket,
      pathD,
    });
  }

  // Generate interior Bézier chords for all connected edges
  const chords: WheelChord[] = [];
  let chordIdx = 0;

  for (const e of edges) {
    const sNode = nodeMap.get(e.source);
    const tNode = nodeMap.get(e.target);
    if (!sNode || !tNode || sNode === tNode) continue;
    if (sNode.x === undefined || sNode.y === undefined || tNode.x === undefined || tNode.y === undefined) continue;

    // Control point pulled toward center origin (cx, cy)
    const midX = (sNode.x + tNode.x) / 2;
    const midY = (sNode.y + tNode.y) / 2;
    const pullTension = 0.32;
    const cpx = Math.round(cx + (midX - cx) * pullTension);
    const cpy = Math.round(cy + (midY - cy) * pullTension);

    const pathD = `M ${sNode.x},${sNode.y} Q ${cpx},${cpy} ${tNode.x},${tNode.y}`;
    const color = relationFamilyColor(e.relation);

    chords.push({
      id: `chord_${chordIdx++}`,
      sourceNode: sNode,
      targetNode: tNode,
      relation: e.relation || "uses",
      color,
      x1: sNode.x,
      y1: sNode.y,
      x2: tNode.x,
      y2: tNode.y,
      cpx,
      cpy,
      pathD,
    });
  }

  return {
    cx,
    cy,
    innerRadius,
    outerRadius,
    sectors,
    chords,
  };
}

/**
 * Interactive SVG Dependency Wheel (Circular Chord Diagram) Canvas Renderer.
 */
export class WheelView {
  private container: HTMLElement;
  private nodes: Array<{ id: string; name?: string; type?: string; sources?: string[] }> = [];
  private edges: Array<{ source: string; target: string; relation?: string }> = [];
  public selectedNodeId: string | null = null;
  public hoveredNodeId: string | null = null;
  public onSelect: (id: string | null) => void = () => {};

  public panX = 0;
  public panY = 0;
  public zoom = 1.0;

  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  setData(
    nodes: Array<{ id: string; name?: string; type?: string; sources?: string[] }>,
    edges: Array<{ source: string; target: string; relation?: string }>,
  ): void {
    this.nodes = nodes;
    this.edges = edges;
    this.render();
  }

  selectNode(id: string | null): void {
    this.selectedNodeId = id;
    this.onSelect(id);
    this.render();
  }

  resetView(): void {
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1.0;
    this.render();
  }

  render(): void {
    const w = this.container.clientWidth || 1000;
    const h = this.container.clientHeight || 800;

    if (this.nodes.length === 0) {
      this.container.innerHTML = `
        <div class="wheel-empty" style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:var(--muted, #8b9298); text-align:center;">
          <div style="font-size:36px; margin-bottom:12px;">🎡</div>
          <div style="font-size:16px; font-weight:600; color:var(--ink, #e7e9ea); margin-bottom:6px;">Circular Dependency Wheel</div>
          <div style="font-size:13px; max-width:400px; line-height:1.5;">No active nodes match the current filter selection.</div>
        </div>
      `;
      return;
    }

    const model = computeWheelModel(this.nodes, this.edges, { width: w, height: h });
    const activeId = this.hoveredNodeId || this.selectedNodeId;

    let html = `
      <div class="wheel-wrap" style="position:relative; width:100%; height:100%; overflow:hidden; user-select:none; background:var(--bg, #0d1012);">
        <div class="wheel-toolbar" style="position:absolute; top:12px; right:16px; z-index:10; display:flex; gap:8px;">
          ${activeId ? `<button type="button" class="ptool-btn" id="wheelClearBtn" style="font-size:11px; padding:3px 8px; background:var(--panel, #15181b); color:#fde047; border:1px solid var(--border, #242b30); border-radius:6px; cursor:pointer;">✕ Clear Focus</button>` : ""}
          <button type="button" class="ptool-btn" id="wheelResetBtn" style="font-size:11px; padding:3px 8px; background:var(--panel, #15181b); color:var(--ink, #e7e9ea); border:1px solid var(--border, #242b30); border-radius:6px; cursor:pointer;">↺ Reset View</button>
        </div>
        <svg class="wheel-svg" width="100%" height="100%" viewBox="0 0 ${w} ${h}" style="display:block; cursor:grab;">
          <defs>
            <filter id="chordGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="rgba(56, 189, 248, 0.65)" />
            </filter>
          </defs>
          <g class="wheel-stage" transform="translate(${this.panX}, ${this.panY}) scale(${this.zoom})">
            
            <!-- Interior Chords -->
            <g class="wheel-chords-layer">
    `;

    for (const chord of model.chords) {
      const isConnected = activeId
        ? chord.sourceNode.id === activeId || chord.targetNode.id === activeId
        : true;
      const cls = activeId ? (isConnected ? "wheel-chord chord-illuminated" : "wheel-chord chord-dimmed") : "wheel-chord";
      const opacity = activeId ? (isConnected ? "0.92" : "0.05") : "0.32";
      const strokeWidth = isConnected && activeId ? "2.6" : "1.4";
      const filter = isConnected && activeId ? 'filter="url(#chordGlow)"' : "";

      html += `
        <path d="${chord.pathD}" fill="none" stroke="${chord.color}" stroke-width="${strokeWidth}" opacity="${opacity}" class="${cls}" data-source="${chord.sourceNode.id}" data-target="${chord.targetNode.id}" ${filter} style="transition:opacity 0.15s ease;" />
      `;
    }

    html += `
            </g>

            <!-- Outer Sectors & Node Ticks -->
            <g class="wheel-sectors-layer">
    `;

    for (const sec of model.sectors) {
      html += `
        <!-- Sector: ${sec.title} -->
        <path d="${sec.pathD}" fill="${sec.color}" fill-opacity="0.22" stroke="${sec.color}" stroke-width="1.8" class="wheel-sector" data-stage="${sec.stage}" style="cursor:pointer;" />
      `;

      // Sector title label along arc midpoint
      const midAngle = (sec.startAngle + sec.endAngle) / 2;
      const titleR = model.outerRadius + 22;
      const tx = Math.round(model.cx + titleR * Math.cos(midAngle));
      const ty = Math.round(model.cy + titleR * Math.sin(midAngle));
      const anchor = Math.cos(midAngle) > 0.3 ? "start" : Math.cos(midAngle) < -0.3 ? "end" : "middle";

      html += `
        <text x="${tx}" y="${ty}" fill="${sec.color}" font-size="11.5" font-weight="700" text-anchor="${anchor}" dominant-baseline="central" font-family="system-ui, sans-serif">${sec.title} (${sec.nodes.length})</text>
      `;

      // Individual Node Markers
      for (const n of sec.nodes) {
        if (n.x === undefined || n.y === undefined) continue;
        const isSelected = n.id === this.selectedNodeId;
        const isHovered = n.id === this.hoveredNodeId;
        const r = isSelected || isHovered ? 4.5 : 2.5;
        const dotColor = isSelected ? "#ffffff" : isHovered ? "#38bdf8" : sec.color;

        html += `
          <circle cx="${n.x}" cy="${n.y}" r="${r}" fill="${dotColor}" stroke="var(--bg, #0d1012)" stroke-width="1" class="wheel-node" data-node-id="${n.id}" style="cursor:pointer;" />
        `;
      }
    }

    // Center Hub summary badge
    html += `
            </g>
            <g class="wheel-center-hub" transform="translate(${model.cx}, ${model.cy})">
              <circle r="42" fill="var(--panel, #15181b)" stroke="var(--panel2, #2a3439)" stroke-width="1.5" />
              <text y="-6" fill="var(--ink, #e7e9ea)" font-size="12" font-weight="700" text-anchor="middle" font-family="system-ui, sans-serif">${model.chords.length}</text>
              <text y="12" fill="var(--muted, #8b9298)" font-size="9" font-weight="600" text-anchor="middle" text-transform="uppercase" letter-spacing="0.5">Couplings</text>
            </g>
          </g>
        </svg>
      </div>
    `;

    this.container.innerHTML = html;
    this.bindEvents();
  }

  private bindEvents(): void {
    const wrap = this.container.querySelector<HTMLElement>("..wheel-wrap");
    const svg = this.container.querySelector<SVGElement>(".wheel-svg");
    const resetBtn = this.container.querySelector<HTMLButtonElement>("#wheelResetBtn");
    const clearBtn = this.container.querySelector<HTMLButtonElement>("#wheelClearBtn");

    resetBtn?.addEventListener("click", () => this.resetView());
    clearBtn?.addEventListener("click", () => this.selectNode(null));

    // Node click and hover
    const nodeEls = this.container.querySelectorAll<SVGCircleElement>(".wheel-node");
    nodeEls.forEach((el) => {
      const id = el.getAttribute("data-node-id");
      if (!id) return;

      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this.selectNode(id);
      });

      el.addEventListener("pointerenter", () => {
        this.hoveredNodeId = id;
        this.render();
      });

      el.addEventListener("pointerleave", () => {
        this.hoveredNodeId = null;
        this.render();
      });
    });

    if (!svg) return;

    // Pan & Zoom
    svg.addEventListener("wheel", (e: any) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      this.zoom = Math.min(2.5, Math.max(0.4, this.zoom * zoomFactor));
      this.render();
    });

    svg.addEventListener("pointerdown", (e: any) => {
      if (e.target?.closest(".wheel-node") || e.target?.closest(".wheel-sector")) return;
      this.isDragging = true;
      this.dragStartX = e.clientX - this.panX;
      this.dragStartY = e.clientY - this.panY;
      svg.style.cursor = "grabbing";
    });

    svg.addEventListener("pointermove", (e: any) => {
      if (!this.isDragging) return;
      this.panX = e.clientX - this.dragStartX;
      this.panY = e.clientY - this.dragStartY;
      const stage = svg.querySelector<SVGGElement>(".wheel-stage");
      if (stage) {
        stage.setAttribute("transform", `translate(${this.panX}, ${this.panY}) scale(${this.zoom})`);
      }
    });

    const stopDrag = () => {
      if (this.isDragging) {
        this.isDragging = false;
        svg.style.cursor = "grab";
      }
    };

    svg.addEventListener("pointerup", stopDrag);
    svg.addEventListener("pointerleave", stopDrag);
  }
}
