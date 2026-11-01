import { classifyArtifactStage, type ArtifactStage } from "./sankey-engine.js";
import { cvar, isLightTheme } from "./data.js";

export type FishboneStage = ArtifactStage;

export interface FishboneNode {
  id: string;
  name?: string;
  type?: string;
  sources?: string[];
  relation?: string;
  stage?: FishboneStage;
}

export interface FishboneSubBone {
  id: string;
  node: FishboneNode;
  relation: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  labelX: number;
  labelY: number;
  width: number;
}

export interface FishboneRib {
  stage: FishboneStage;
  title: string;
  color: string;
  side: "top" | "bottom";
  junctionX: number;
  junctionY: number;
  tipX: number;
  tipY: number;
  subBones: FishboneSubBone[];
}

export interface FishboneModel {
  head: {
    id: string;
    name: string;
    type: string;
    stage: FishboneStage;
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
  };
  spine: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
  tail: {
    x: number;
    y: number;
  };
  ribs: FishboneRib[];
}

const STAGE_META: Record<FishboneStage, { title: string; color: string; defaultSide: "top" | "bottom" }> = {
  adrs: { title: "ADRs & Decisions", color: "#a855f7", defaultSide: "top" },
  features: { title: "Specs & Requirements", color: "#10b981", defaultSide: "top" },
  code: { title: "Code & Dependencies", color: "#fbbf24", defaultSide: "top" },
  tests: { title: "Tests & Verification", color: "#38bdf8", defaultSide: "bottom" },
  docs: { title: "Documentation & Guides", color: "#ec4899", defaultSide: "bottom" },
};

export function getFishboneStageColor(stage: FishboneStage): string {
  return cvar(`--stage-${stage}`) || STAGE_META[stage]?.color || "#38bdf8";
}

/**
 * Computes an Ishikawa Fishbone geometric layout model around a focal head node.
 * - Head is anchored on the left.
 * - Horizontal spine extends to the right toward a tail fin.
 * - Major ribs sweep backwards (+45 deg top, -45 deg bottom) grouped by Tripartite stages.
 * - Sub-bones branch horizontally to the right of each parent rib.
 */
export function computeFishboneModel(
  headId: string,
  nodes: Array<{ id: string; name?: string; type?: string; sources?: string[] }>,
  edges: Array<{ source: string; target: string; relation?: string }>,
  options: { width?: number; height?: number } = {},
): FishboneModel {
  const width = Math.max(1200, options.width || 1200);
  const height = Math.max(800, options.height || 800);
  const cy = Math.round(height / 2);

  const nodeMap = new Map<string, { id: string; name?: string; type?: string; sources?: string[] }>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  const rawHead = nodeMap.get(headId) || {
    id: headId,
    name: headId.split("/").pop() || headId,
    type: "file",
  };
  const headStage = classifyArtifactStage(rawHead);

  // Identify upstream causal nodes and their direct/transitive edge relation to head
  const causalMap = new Map<string, { node: FishboneNode; relation: string }>();

  // 1. Direct incoming edges (e.g. ADR governs head, Spec covers head, Test verifies head)
  for (const e of edges) {
    if (e.target === headId && e.source !== headId) {
      const srcNode = nodeMap.get(e.source) || { id: e.source, name: e.source.split("/").pop() };
      causalMap.set(e.source, {
        node: { ...srcNode, relation: e.relation || "influences" },
        relation: e.relation || "influences",
      });
    } else if (e.source === headId && e.target !== headId) {
      // Direct outgoing dependencies (e.g. head uses dep, head calls helper)
      const tgtNode = nodeMap.get(e.target) || { id: e.target, name: e.target.split("/").pop() };
      causalMap.set(e.target, {
        node: { ...tgtNode, relation: e.relation || "uses" },
        relation: e.relation || "uses",
      });
    }
  }

  // 2. Transitive 2-hop ancestry: if immediate dependencies have governing ADRs or Specs, pull them in
  const immediateIds = Array.from(causalMap.keys());
  for (const immId of immediateIds) {
    for (const e of edges) {
      if (e.target === immId && e.source !== headId && !causalMap.has(e.source)) {
        const candidate = nodeMap.get(e.source);
        if (candidate) {
          const st = classifyArtifactStage(candidate);
          if (st === "adrs" || st === "features") {
            causalMap.set(e.source, {
              node: { ...candidate, relation: e.relation || "governs" },
              relation: e.relation || "governs",
            });
          }
        }
      }
    }
  }

  // Group causal nodes by Tripartite stage
  const stageBuckets: Record<FishboneStage, Array<{ node: FishboneNode; relation: string }>> = {
    adrs: [],
    features: [],
    code: [],
    tests: [],
    docs: [],
  };

  for (const [id, item] of causalMap.entries()) {
    const st = classifyArtifactStage(item.node);
    item.node.stage = st;
    stageBuckets[st].push(item);
  }

  const headWidth = 180;
  const headHeight = 54;
  const headX = 120;
  const headY = cy;

  const spineStartX = headX + Math.round(headWidth / 2);

  // Group stages by side
  // Top side: adrs, features, code
  // Bottom side: tests, docs
  const topStages: FishboneStage[] = ["adrs", "features", "code"];
  const bottomStages: FishboneStage[] = ["tests", "docs"];

  // Compute required height and deltaX for each stage based on its sub-bone count
  // To avoid vertical overlap of 24px cards, allocate at least 38px vertical pitch per sub-bone
  const getStageGeometry = (count: number) => {
    const deltaY = Math.max(160, (count + 1) * 38);
    const deltaX = deltaY; // 45 degree angle
    return { deltaY, deltaX };
  };

  const ribs: FishboneRib[] = [];
  const boneWidth = 175;

  // Lay out top ribs sequentially
  let currentTopX = spineStartX + 90;
  for (const stage of topStages) {
    const stageItems = stageBuckets[stage];
    const meta = STAGE_META[stage];
    const count = stageItems.length;
    const { deltaX, deltaY } = getStageGeometry(count);

    const jx = currentTopX;
    const jy = cy;
    const tipX = jx + deltaX;
    const tipY = jy - deltaY;

    const subBones: FishboneSubBone[] = [];
    for (let i = 0; i < count; i++) {
      const item = stageItems[i];
      const t = (i + 1) / (count + 1);
      const bx = Math.round(jx + deltaX * t);
      const by = Math.round(jy - deltaY * t);

      subBones.push({
        id: `bone_${stage}_${i}`,
        node: item.node,
        relation: item.relation,
        x1: bx,
        y1: by,
        x2: bx + boneWidth,
        y2: by,
        labelX: bx + 8,
        labelY: by - 4,
        width: boneWidth,
      });
    }

    ribs.push({
      stage,
      title: meta.title,
      color: getFishboneStageColor(stage),
      side: "top",
      junctionX: jx,
      junctionY: jy,
      tipX,
      tipY,
      subBones,
    });

    currentTopX += Math.max(220, deltaX + 70);
  }

  // Lay out bottom ribs sequentially (staggered initial offset)
  let currentBottomX = spineStartX + 190;
  for (const stage of bottomStages) {
    const stageItems = stageBuckets[stage];
    const meta = STAGE_META[stage];
    const count = stageItems.length;
    const { deltaX, deltaY } = getStageGeometry(count);

    const jx = currentBottomX;
    const jy = cy;
    const tipX = jx + deltaX;
    const tipY = jy + deltaY;

    const subBones: FishboneSubBone[] = [];
    for (let i = 0; i < count; i++) {
      const item = stageItems[i];
      const t = (i + 1) / (count + 1);
      const bx = Math.round(jx + deltaX * t);
      const by = Math.round(jy + deltaY * t);

      subBones.push({
        id: `bone_${stage}_${i}`,
        node: item.node,
        relation: item.relation,
        x1: bx,
        y1: by,
        x2: bx + boneWidth,
        y2: by,
        labelX: bx + 8,
        labelY: by - 4,
        width: boneWidth,
      });
    }

    ribs.push({
      stage,
      title: meta.title,
      color: getFishboneStageColor(stage),
      side: "bottom",
      junctionX: jx,
      junctionY: jy,
      tipX,
      tipY,
      subBones,
    });

    currentBottomX += Math.max(220, deltaX + 70);
  }

  // Determine total spine extent
  let maxExtentX = spineStartX + 800;
  for (const r of ribs) {
    if (r.tipX + 160 > maxExtentX) {
      maxExtentX = r.tipX + 160;
    }
    for (const b of r.subBones) {
      if (b.x2 + 40 > maxExtentX) {
        maxExtentX = b.x2 + 40;
      }
    }
  }

  const spineEndX = Math.round(maxExtentX + 60);

  return {
    head: {
      id: rawHead.id,
      name: rawHead.name || rawHead.id.split("/").pop() || rawHead.id,
      type: rawHead.type || "file",
      stage: headStage,
      x: headX,
      y: headY,
      width: headWidth,
      height: headHeight,
      color: getFishboneStageColor(headStage),
    },
    spine: {
      x1: spineStartX,
      y1: cy,
      x2: spineEndX,
      y2: cy,
    },
    tail: {
      x: spineEndX,
      y: cy,
    },
    ribs,
  };
}

/**
 * Interactive SVG Fishbone Canvas Renderer.
 */
export class FishboneView {
  private container: HTMLElement;
  private nodes: Array<{ id: string; name?: string; type?: string; sources?: string[] }> = [];
  private edges: Array<{ source: string; target: string; relation?: string }> = [];
  public selectedNodeId: string | null = null;
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
    selectedNodeId: string | null = null,
  ): void {
    this.nodes = nodes;
    this.edges = edges;
    this.selectedNodeId = selectedNodeId;
    this.render();
  }

  setSelectedNode(id: string | null): void {
    if (this.selectedNodeId === id) return;
    this.selectedNodeId = id;
    this.render();
  }

  selectNode(id: string): void {
    this.selectedNodeId = id;
    this.onSelect(id);
    this.render();
  }

  resetView(): void {
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1.0;
    const stage = this.container.querySelector<SVGGElement>(".fishbone-stage");
    if (stage) {
      stage.setAttribute("transform", `translate(${this.panX}, ${this.panY}) scale(${this.zoom})`);
    } else {
      this.render();
    }
  }

  render(): void {
    const w = this.container.clientWidth || 1200;
    const h = this.container.clientHeight || 800;

    if (!this.selectedNodeId) {
      this.container.innerHTML = `
        <div class="fishbone-empty" style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:var(--muted, #8b9298); text-align:center; padding:24px;">
          <div style="font-size:36px; margin-bottom:12px;">🐟</div>
          <div style="font-size:16px; font-weight:600; color:var(--ink, #e7e9ea); margin-bottom:6px;">Ishikawa Cause-and-Effect Fishbone</div>
          <div style="font-size:13px; max-width:440px; line-height:1.5;">Select any file or symbol in the graph to inspect its governing ADRs, covering specifications, dependencies, and test verification suites.</div>
        </div>
      `;
      return;
    }

    const model = computeFishboneModel(this.selectedNodeId, this.nodes, this.edges, {
      width: w,
      height: h,
    });

    const svgWidth = Math.max(w, model.tail.x + 160);
    const maxTipOffset = Math.max(200, ...model.ribs.map((r) => Math.abs(r.tipY - (h / 2))));
    const svgHeight = Math.max(h, Math.round((h / 2) + maxTipOffset + 90));

    const isLight = isLightTheme();
    let html = `
      <div class="fishbone-wrap" style="position:relative; width:100%; height:100%; overflow:hidden; user-select:none; background:var(--bg);">
        <div class="fishbone-toolbar" style="position:absolute; top:12px; right:16px; z-index:10; display:flex; gap:8px;">
          <button type="button" class="ptool-btn" id="fishboneResetBtn" style="font-size:11px; padding:3px 8px; background:var(--panel, #15181b); color:var(--ink, #e7e9ea); border:1px solid var(--border, #242b30); border-radius:6px; cursor:pointer;">↺ Reset View</button>
        </div>
        <svg class="fishbone-svg" width="100%" height="100%" viewBox="0 0 ${svgWidth} ${svgHeight}" style="display:block; cursor:grab;">
          <defs>
            <linearGradient id="fishHeadGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="${model.head.color}" stop-opacity="${isLight ? "0.18" : "0.32"}" />
              <stop offset="100%" stop-color="var(--panel, #15181b)" stop-opacity="0.85" />
            </linearGradient>
            <filter id="boneGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1" stdDeviation="${isLight ? "1.5" : "3"}" flood-color="${isLight ? "rgba(0,0,0,0.06)" : "rgba(0,0,0,0.45)"}" />
            </filter>
          </defs>
          <g class="fishbone-stage" transform="translate(${this.panX}, ${this.panY}) scale(${this.zoom})">
            
            <!-- Central Spine -->
            <line x1="${model.spine.x1}" y1="${model.spine.y1}" x2="${model.spine.x2}" y2="${model.spine.y2}" stroke="var(--border, #38424b)" stroke-width="4" stroke-linecap="round" />
            
            <!-- Tail Fin -->
            <path d="M ${model.tail.x} ${model.tail.y} L ${model.tail.x + 28} ${model.tail.y - 28} L ${model.tail.x + 16} ${model.tail.y} L ${model.tail.x + 28} ${model.tail.y + 28} Z" fill="var(--border, #38424b)" />

            <!-- Major Ribs & Sub-bones -->
    `;

    for (const rib of model.ribs) {
      html += `
        <!-- Main Rib: ${rib.title} -->
        <g class="fishbone-rib" data-stage="${rib.stage}">
          <line x1="${rib.junctionX}" y1="${rib.junctionY}" x2="${rib.tipX}" y2="${rib.tipY}" stroke="${rib.color}" stroke-width="2.5" stroke-linecap="round" opacity="0.85" />
          
          <!-- Category Badge at Tip -->
          <g transform="translate(${rib.tipX}, ${rib.tipY})">
            <rect x="0" y="${rib.side === "top" ? -24 : 6}" width="140" height="22" rx="11" fill="var(--panel, #15181b)" stroke="${rib.color}" stroke-width="1.5" />
            <text x="12" y="${rib.side === "top" ? -9 : 21}" fill="${rib.color}" font-size="10.5" font-weight="600" font-family="system-ui, sans-serif">${rib.title} (${rib.subBones.length})</text>
          </g>
      `;

      // Sub-bones extending horizontally to the right
      for (const bone of rib.subBones) {
        const shortName = bone.node.name || bone.node.id.split("/").pop() || bone.node.id;
        const verb = bone.relation;
        const displayLabel = shortName.length > 17 ? shortName.slice(0, 15) + "…" : shortName;
        html += `
          <!-- Sub-bone: ${bone.node.id} -->
          <g class="fishbone-subbone" data-node-id="${bone.node.id}" style="cursor:pointer;">
            <title>${bone.node.id} (${verb})</title>
            <line x1="${bone.x1}" y1="${bone.y1}" x2="${bone.x2}" y2="${bone.y2}" stroke="var(--border, #38424b)" stroke-width="1.5" stroke-dasharray="2 2" />
            <g transform="translate(${bone.labelX}, ${bone.labelY - 14})" filter="url(#boneGlow)">
              <rect x="0" y="0" width="${bone.width - 12}" height="24" rx="6" fill="var(--panel, #15181b)" stroke="var(--panel2, #2a3439)" stroke-width="1" class="bone-card-bg" />
              <text x="8" y="16" fill="var(--accent, #38bdf8)" font-size="9.5" font-weight="700" font-family="system-ui, sans-serif">${verb}</text>
              <text x="56" y="16" fill="var(--ink, #e7e9ea)" font-size="11" font-weight="500" font-family="system-ui, sans-serif">${displayLabel}</text>
            </g>
          </g>
        `;
      }

      html += `</g>`;
    }

    // Render the Head on the left
    const hx = model.head.x - Math.round(model.head.width / 2);
    const hy = model.head.y - Math.round(model.head.height / 2);

    html += `
            <!-- Focal Head -->
            <g class="fishbone-head" transform="translate(${hx}, ${hy})" filter="url(#boneGlow)" style="cursor:default;">
              <!-- Fish head capsule with nose pointing left -->
              <rect x="0" y="0" width="${model.head.width}" height="${model.head.height}" rx="14" fill="url(#fishHeadGrad)" stroke="${model.head.color}" stroke-width="2" />
              <text x="16" y="22" fill="${model.head.color}" font-size="10" font-weight="700" text-transform="uppercase" letter-spacing="0.5">${model.head.stage.toUpperCase()}</text>
              <text x="16" y="40" fill="var(--ink, #e7e9ea)" font-size="13" font-weight="700" font-family="system-ui, sans-serif">${model.head.name}</text>
            </g>

          </g>
        </svg>
      </div>
    `;

    this.container.innerHTML = html;
    this.bindEvents();
  }

  private bindEvents(): void {
    const wrap = this.container.querySelector<HTMLElement>(".fishbone-wrap");
    const svg = this.container.querySelector<SVGElement>(".fishbone-svg");
    const resetBtn = this.container.querySelector<HTMLButtonElement>("#fishboneResetBtn");

    resetBtn?.addEventListener("click", () => {
      this.resetView();
    });

    // Sub-bone click listeners
    const boneEls = this.container.querySelectorAll<SVGGElement>(".fishbone-subbone");
    boneEls.forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = el.getAttribute("data-node-id");
        if (id) {
          this.selectNode(id);
        }
      });
    });

    if (!wrap || !svg) return;

    // Pan & Zoom
    svg.addEventListener(
      "wheel",
      (e: any) => {
        if (typeof e.preventDefault === "function") e.preventDefault();
        const factor = (e.deltaY || 0) < 0 ? 1.12 : 0.88;
        const nextZoom = Math.min(3.5, Math.max(0.35, Number((this.zoom * factor).toFixed(3))));
        const rect = typeof svg.getBoundingClientRect === "function" ? svg.getBoundingClientRect() : { left: 0, top: 0 };
        const mx = (e.clientX || 0) - rect.left;
        const my = (e.clientY || 0) - rect.top;
        this.panX = Math.round(mx - ((mx - this.panX) / this.zoom) * nextZoom);
        this.panY = Math.round(my - ((my - this.panY) / this.zoom) * nextZoom);
        this.zoom = nextZoom;
        const stage = svg.querySelector<SVGGElement>(".fishbone-stage");
        if (stage) {
          stage.setAttribute("transform", `translate(${this.panX}, ${this.panY}) scale(${this.zoom})`);
        }
      },
      { passive: false } as any,
    );

    svg.addEventListener("pointerdown", (e: any) => {
      if (e.target?.closest(".fishbone-subbone")) return;
      this.isDragging = true;
      this.dragStartX = (e.clientX || 0) - this.panX;
      this.dragStartY = (e.clientY || 0) - this.panY;
      svg.style.cursor = "grabbing";
    });

    svg.addEventListener("pointermove", (e: any) => {
      if (!this.isDragging) return;
      this.panX = (e.clientX || 0) - this.dragStartX;
      this.panY = (e.clientY || 0) - this.dragStartY;
      const stage = svg.querySelector<SVGGElement>(".fishbone-stage");
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
