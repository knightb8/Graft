import { classifyArtifactStage, type ArtifactStage } from "./sankey-engine.js";

export type WheelStage = ArtifactStage;
export type WheelDepth = "module" | "file" | "symbol";

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
  childCount?: number;
  memberIds?: string[];
  isModule?: boolean;
  moduleKey?: string;
  isDrilldownChild?: boolean;
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
  weight: number;
  bundled: boolean;
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
  depth: WheelDepth;
  drilldownModule: string | null;
  bundleChords: boolean;
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

export function relationFamilyColor(rel?: string): string {
  if (!rel) return "#94a3b8";
  const r = rel.toLowerCase();
  if (r === "part_of" || r === "contains") return RELATION_COLORS.structure;
  if (r === "implements" || r === "extends" || r === "covers") return RELATION_COLORS.contract;
  if (r === "governs" || r === "documents" || r === "references") return RELATION_COLORS.association;
  return RELATION_COLORS.dependency;
}

export function moduleKeyOfNode(n: { id: string; sources?: string[] }): string {
  const raw = n.sources?.[0]?.split(" · ")[0]?.trim() || n.id.split("#")[0] || n.id;
  const parts = raw.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length <= 1) return parts[0] || n.id;
  if (parts[0] === "src" || parts[0] === "features" || parts[0] === "docs" || parts[0] === "test") {
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
  }
  return parts.slice(0, 2).join("/");
}

export function fileKeyOfNode(n: { id: string; sources?: string[] }): string {
  return n.sources?.[0]?.split(" · ")[0]?.trim() || n.id.split("#")[0] || n.id;
}

/**
 * Computes the circular chord dependency wheel model.
 * Partitions circumference into 5 Tripartite sectors with smooth Bézier chords.
 * Supports Module, File, and Symbol depths, in-place arc drill-down, and Hierarchical Edge Bundling.
 */
export function computeWheelModel(
  nodes: Array<{ id: string; name?: string; type?: string; sources?: string[] }>,
  edges: Array<{ source: string; target: string; relation?: string }>,
  options: {
    width?: number;
    height?: number;
    depth?: WheelDepth;
    drilldownModule?: string | null;
    bundleChords?: boolean;
  } = {},
): WheelModel {
  const width = Math.max(800, options.width || 1000);
  const height = Math.max(600, options.height || 800);
  const depth: WheelDepth = options.depth || "file";
  const drilldownModule = options.drilldownModule || null;
  const bundleChords = options.bundleChords !== false;

  const cx = Math.round(width / 2);
  const cy = Math.round(height / 2);

  const outerRadius = Math.max(180, Math.min(cx, cy) - 80);
  const innerRadius = outerRadius - 20;

  // 1. Group / aggregate nodes according to chosen depth
  const symbolToDisplayedId = new Map<string, string>();
  const displayedNodes: WheelNode[] = [];

  if (depth === "symbol") {
    for (const n of nodes) {
      const st = classifyArtifactStage(n);
      const wNode: WheelNode = { ...n, stage: st, memberIds: [n.id] };
      symbolToDisplayedId.set(n.id, n.id);
      displayedNodes.push(wNode);
    }
  } else if (depth === "file") {
    const fileGroups = new Map<string, Array<{ id: string; name?: string; type?: string; sources?: string[] }>>();
    for (const n of nodes) {
      const fKey = fileKeyOfNode(n);
      let group = fileGroups.get(fKey);
      if (!group) {
        group = [];
        fileGroups.set(fKey, group);
      }
      group.push(n);
    }

    for (const [fKey, members] of fileGroups) {
      const rep = members.find((m) => m.id === fKey) || members[0];
      const st = classifyArtifactStage(rep);
      const fileName = fKey.replace(/\\/g, "/").split("/").pop() || fKey;
      const wNode: WheelNode = {
        id: fKey,
        name: fileName,
        type: "file",
        sources: [fKey],
        stage: st,
        childCount: members.length,
        memberIds: members.map((m) => m.id),
      };
      displayedNodes.push(wNode);
      for (const m of members) {
        symbolToDisplayedId.set(m.id, fKey);
      }
    }
  } else {
    // depth === "module"
    const modGroups = new Map<string, Array<{ id: string; name?: string; type?: string; sources?: string[] }>>();
    for (const n of nodes) {
      const mKey = moduleKeyOfNode(n);
      let group = modGroups.get(mKey);
      if (!group) {
        group = [];
        modGroups.set(mKey, group);
      }
      group.push(n);
    }

    for (const [mKey, members] of modGroups) {
      const rep = members[0];
      const st = classifyArtifactStage(rep);

      if (drilldownModule === mKey) {
        // Drilled-down module: expand into child files inside this module
        const subFiles = new Map<string, Array<{ id: string; name?: string; type?: string; sources?: string[] }>>();
        for (const m of members) {
          const fKey = fileKeyOfNode(m);
          let fg = subFiles.get(fKey);
          if (!fg) {
            fg = [];
            subFiles.set(fKey, fg);
          }
          fg.push(m);
        }

        for (const [fKey, fMembers] of subFiles) {
          const fRep = fMembers.find((m) => m.id === fKey) || fMembers[0];
          const fileName = fKey.replace(/\\/g, "/").split("/").pop() || fKey;
          const wNode: WheelNode = {
            id: fKey,
            name: `${mKey}/${fileName}`,
            type: "file",
            sources: [fKey],
            stage: st,
            childCount: fMembers.length,
            memberIds: fMembers.map((m) => m.id),
            isDrilldownChild: true,
            moduleKey: mKey,
          };
          displayedNodes.push(wNode);
          for (const m of fMembers) {
            symbolToDisplayedId.set(m.id, fKey);
          }
        }
      } else {
        // Macro module node
        const modId = `mod:${mKey}`;
        const wNode: WheelNode = {
          id: modId,
          name: mKey,
          type: "module",
          sources: [mKey],
          stage: st,
          childCount: members.length,
          memberIds: members.map((m) => m.id),
          isModule: true,
          moduleKey: mKey,
        };
        displayedNodes.push(wNode);
        for (const m of members) {
          symbolToDisplayedId.set(m.id, modId);
        }
      }
    }
  }

  // 2. Partition into 5 Tripartite sectors
  const stageBuckets: Record<WheelStage, WheelNode[]> = {
    adrs: [],
    features: [],
    code: [],
    tests: [],
    docs: [],
  };

  const nodeMap = new Map<string, WheelNode>();
  for (const wNode of displayedNodes) {
    const st = wNode.stage || "code";
    stageBuckets[st].push(wNode);
    nodeMap.set(wNode.id, wNode);
  }

  const stageOrder: WheelStage[] = ["adrs", "features", "code", "tests", "docs"];
  const sectorGap = 0.06; // radians gap between sectors (~3.4 deg)
  const totalGap = sectorGap * stageOrder.length;
  const availableAngle = 2 * Math.PI - totalGap;

  const totalNodeCount = Math.max(1, displayedNodes.length);
  const sectors: WheelSector[] = [];
  let currentAngle = -Math.PI / 2; // Start at 12 o'clock

  for (const stage of stageOrder) {
    const bucket = stageBuckets[stage];
    const meta = STAGE_CONFIG[stage];
    const weightFraction = Math.max(0.12, bucket.length / totalNodeCount);
    const sectorAngle =
      (weightFraction /
        stageOrder.reduce((acc, st) => acc + Math.max(0.12, stageBuckets[st].length / totalNodeCount), 0)) *
      availableAngle;

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

  // 3. Aggregate inter-node chords
  interface AggregatedChordEntry {
    sourceId: string;
    targetId: string;
    relation: string;
    weight: number;
  }
  const chordAggMap = new Map<string, AggregatedChordEntry>();

  for (const e of edges) {
    const sId = symbolToDisplayedId.get(e.source) || e.source;
    const tId = symbolToDisplayedId.get(e.target) || e.target;
    if (!sId || !tId || sId === tId) continue;

    const key = `${sId}->${tId}:${e.relation || "uses"}`;
    const existing = chordAggMap.get(key);
    if (existing) {
      existing.weight += 1;
    } else {
      chordAggMap.set(key, {
        sourceId: sId,
        targetId: tId,
        relation: e.relation || "uses",
        weight: 1,
      });
    }
  }

  // 4. Generate chords with optional Hierarchical Edge Bundling
  const chords: WheelChord[] = [];
  let chordIdx = 0;

  for (const entry of chordAggMap.values()) {
    const sNode = nodeMap.get(entry.sourceId);
    const tNode = nodeMap.get(entry.targetId);
    if (!sNode || !tNode || sNode === tNode) continue;
    if (
      sNode.x === undefined ||
      sNode.y === undefined ||
      sNode.angle === undefined ||
      tNode.x === undefined ||
      tNode.y === undefined ||
      tNode.angle === undefined
    ) {
      continue;
    }

    const midX = (sNode.x + tNode.x) / 2;
    const midY = (sNode.y + tNode.y) / 2;
    const pullTension = 0.32;
    const cpx = Math.round(cx + (midX - cx) * pullTension);
    const cpy = Math.round(cy + (midY - cy) * pullTension);

    let pathD = "";
    if (bundleChords) {
      // Hierarchical Edge Bundling: route through shared radial corridor waypoints
      const bundleFactor = 0.55;
      const cp1x = Math.round(cx + innerRadius * bundleFactor * Math.cos(sNode.angle));
      const cp1y = Math.round(cy + innerRadius * bundleFactor * Math.sin(sNode.angle));
      const cp2x = Math.round(cx + innerRadius * bundleFactor * Math.cos(tNode.angle));
      const cp2y = Math.round(cy + innerRadius * bundleFactor * Math.sin(tNode.angle));
      pathD = `M ${sNode.x},${sNode.y} C ${cp1x},${cp1y} ${cp2x},${cp2y} ${tNode.x},${tNode.y}`;
    } else {
      // Direct Quadratic Bézier
      pathD = `M ${sNode.x},${sNode.y} Q ${cpx},${cpy} ${tNode.x},${tNode.y}`;
    }

    const color = relationFamilyColor(entry.relation);

    chords.push({
      id: `chord_${chordIdx++}`,
      sourceNode: sNode,
      targetNode: tNode,
      relation: entry.relation,
      color,
      weight: entry.weight,
      bundled: bundleChords,
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
    depth,
    drilldownModule,
    bundleChords,
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
  public depth: WheelDepth = "file";
  public drilldownModule: string | null = null;
  public bundleChords = true;
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

  setDepth(depth: WheelDepth): void {
    if (this.depth === depth) return;
    this.depth = depth;
    this.drilldownModule = null;
    this.render();
  }

  toggleBundle(): void {
    this.bundleChords = !this.bundleChords;
    this.render();
  }

  setDrilldown(moduleKey: string | null): void {
    this.drilldownModule = moduleKey;
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
    this.drilldownModule = null;
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

    const model = computeWheelModel(this.nodes, this.edges, {
      width: w,
      height: h,
      depth: this.depth,
      drilldownModule: this.drilldownModule,
      bundleChords: this.bundleChords,
    });

    const activeId = this.hoveredNodeId || this.selectedNodeId;

    let html = `
      <div class="wheel-wrap" style="position:relative; width:100%; height:100%; overflow:hidden; user-select:none; background:var(--bg, #0d1012);">
        <div class="wheel-toolbar" style="position:absolute; top:12px; left:16px; right:16px; z-index:10; display:flex; justify-content:space-between; align-items:center; pointer-events:none;">
          <div style="display:flex; gap:8px; align-items:center; pointer-events:auto;">
            <div class="ptool-group" style="display:flex; align-items:center; gap:2px; background:var(--panel, #15181b); border:1px solid var(--border, #242b30); border-radius:6px; padding:2px 4px;">
              <span style="font-size:10px; color:var(--muted, #8b9298); padding:0 4px; text-transform:uppercase; font-weight:700;">Depth</span>
              <button type="button" class="ptool-btn ${this.depth === "module" ? "active" : ""}" id="wheelDepthModule" style="font-size:11px; padding:2px 7px; border:none; border-radius:4px; cursor:pointer; background:${this.depth === "module" ? "var(--accent, #38bdf8)" : "transparent"}; color:${this.depth === "module" ? "#0b0e11" : "var(--ink, #e7e9ea)"}; font-weight:${this.depth === "module" ? "600" : "normal"};">📦 Module</button>
              <button type="button" class="ptool-btn ${this.depth === "file" ? "active" : ""}" id="wheelDepthFile" style="font-size:11px; padding:2px 7px; border:none; border-radius:4px; cursor:pointer; background:${this.depth === "file" ? "var(--accent, #38bdf8)" : "transparent"}; color:${this.depth === "file" ? "#0b0e11" : "var(--ink, #e7e9ea)"}; font-weight:${this.depth === "file" ? "600" : "normal"};">📄 File</button>
              <button type="button" class="ptool-btn ${this.depth === "symbol" ? "active" : ""}" id="wheelDepthSymbol" style="font-size:11px; padding:2px 7px; border:none; border-radius:4px; cursor:pointer; background:${this.depth === "symbol" ? "var(--accent, #38bdf8)" : "transparent"}; color:${this.depth === "symbol" ? "#0b0e11" : "var(--ink, #e7e9ea)"}; font-weight:${this.depth === "symbol" ? "600" : "normal"};">⚡ Symbol</button>
            </div>
            <button type="button" class="ptool-btn ${this.bundleChords ? "active" : ""}" id="wheelBundleToggle" style="font-size:11px; padding:3px 8px; border:1px solid var(--border, #242b30); border-radius:6px; cursor:pointer; background:${this.bundleChords ? "#064e3b" : "var(--panel, #15181b)"}; color:${this.bundleChords ? "#34d399" : "var(--ink, #e7e9ea)"}; font-weight:600;" title="Hierarchical Edge Bundling: route chords through shared radial corridors">🌿 Bundle Chords</button>
            ${
              this.drilldownModule
                ? `
              <div class="wheel-breadcrumb" style="display:flex; align-items:center; gap:6px; background:var(--panel, #15181b); border:1px solid #38bdf8; border-radius:6px; padding:2px 8px; font-size:11px; color:#38bdf8;">
                <span>Zoom: <strong>${this.drilldownModule}</strong></span>
                <button type="button" id="wheelBreadcrumbReset" style="background:transparent; border:none; color:#f87171; cursor:pointer; font-size:12px; font-weight:bold; padding:0 2px;" title="Reset zoom">✕</button>
              </div>
            `
                : ""
            }
          </div>
          <div style="display:flex; gap:8px; pointer-events:auto;">
            ${activeId ? `<button type="button" class="ptool-btn" id="wheelClearBtn" style="font-size:11px; padding:3px 8px; background:var(--panel, #15181b); color:#fde047; border:1px solid var(--border, #242b30); border-radius:6px; cursor:pointer;">✕ Clear Focus</button>` : ""}
            <button type="button" class="ptool-btn" id="wheelResetBtn" style="font-size:11px; padding:3px 8px; background:var(--panel, #15181b); color:var(--ink, #e7e9ea); border:1px solid var(--border, #242b30); border-radius:6px; cursor:pointer;">↺ Reset View</button>
          </div>
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
        ? chord.sourceNode.id === activeId ||
          chord.targetNode.id === activeId ||
          Boolean(chord.sourceNode.memberIds?.includes(activeId)) ||
          Boolean(chord.targetNode.memberIds?.includes(activeId))
        : true;
      const cls = activeId ? (isConnected ? "wheel-chord chord-illuminated" : "wheel-chord chord-dimmed") : "wheel-chord";
      const opacity = activeId ? (isConnected ? "0.92" : "0.05") : "0.32";
      const baseWidth = Math.min(8, Math.max(1.2, 1.2 + Math.sqrt(chord.weight) * 0.8));
      const strokeWidth = isConnected && activeId ? (baseWidth * 1.5).toFixed(1) : baseWidth.toFixed(1);
      const filter = isConnected && activeId ? 'filter="url(#chordGlow)"' : "";

      html += `
        <path d="${chord.pathD}" fill="none" stroke="${chord.color}" stroke-width="${strokeWidth}" opacity="${opacity}" class="${cls}" data-source="${chord.sourceNode.id}" data-target="${chord.targetNode.id}" ${filter} style="transition:opacity 0.15s ease;"><title>${chord.sourceNode.name || chord.sourceNode.id} → ${chord.targetNode.name || chord.targetNode.id} (${chord.weight} connection${chord.weight === 1 ? "" : "s"}${chord.bundled ? " · bundled" : ""})</title></path>
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
        const isSelected = n.id === this.selectedNodeId || Boolean(n.memberIds?.includes(this.selectedNodeId || ""));
        const isHovered = n.id === this.hoveredNodeId || Boolean(n.memberIds?.includes(this.hoveredNodeId || ""));
        const r = isSelected || isHovered ? (n.isModule ? 6.5 : 4.5) : n.isModule ? 4.5 : 2.5;
        const dotColor = isSelected ? "#ffffff" : isHovered ? "#38bdf8" : sec.color;

        const tip = n.isModule
          ? `Module: ${n.name} (${n.childCount} files)\n• Click: Select\n• Double-click: In-place drill-down`
          : `${n.name || n.id}${n.childCount ? ` (${n.childCount} symbols)` : ""}\n• Click: Select`;

        html += `
          <circle cx="${n.x}" cy="${n.y}" r="${r}" fill="${dotColor}" stroke="var(--bg, #0d1012)" stroke-width="1" class="wheel-node" data-node-id="${n.id}" data-is-module="${n.isModule ? "1" : "0"}" data-module-key="${n.moduleKey || ""}" style="cursor:pointer;"><title>${tip}</title></circle>
        `;
      }
    }

    // Center Hub summary badge
    html += `
            </g>
            <g class="wheel-center-hub" transform="translate(${model.cx}, ${model.cy})">
              <circle r="42" fill="var(--panel, #15181b)" stroke="var(--panel2, #2a3439)" stroke-width="1.5" />
              <text y="-6" fill="var(--ink, #e7e9ea)" font-size="12" font-weight="700" text-anchor="middle" font-family="system-ui, sans-serif">${model.chords.length}</text>
              <text y="12" fill="var(--muted, #8b9298)" font-size="9" font-weight="600" text-anchor="middle" text-transform="uppercase" letter-spacing="0.5">${model.bundleChords ? "Bundles" : "Couplings"}</text>
            </g>
          </g>
        </svg>
      </div>
    `;

    this.container.innerHTML = html;
    this.bindEvents();
  }

  private bindEvents(): void {
    const svg = this.container.querySelector<SVGElement>(".wheel-svg");
    const resetBtn = this.container.querySelector<HTMLButtonElement>("#wheelResetBtn");
    const clearBtn = this.container.querySelector<HTMLButtonElement>("#wheelClearBtn");

    resetBtn?.addEventListener("click", () => this.resetView());
    clearBtn?.addEventListener("click", () => this.selectNode(null));

    // Toolbar depth controls
    this.container.querySelector("#wheelDepthModule")?.addEventListener("click", () => this.setDepth("module"));
    this.container.querySelector("#wheelDepthFile")?.addEventListener("click", () => this.setDepth("file"));
    this.container.querySelector("#wheelDepthSymbol")?.addEventListener("click", () => this.setDepth("symbol"));

    // Toolbar bundle toggle
    this.container.querySelector("#wheelBundleToggle")?.addEventListener("click", () => this.toggleBundle());

    // Breadcrumb reset
    this.container.querySelector("#wheelBreadcrumbReset")?.addEventListener("click", () => this.setDrilldown(null));

    // Node click, double-click (drill-down), and hover
    const nodeEls = this.container.querySelectorAll<SVGCircleElement>(".wheel-node");
    nodeEls.forEach((el) => {
      const id = el.getAttribute("data-node-id");
      const isModule = el.getAttribute("data-is-module") === "1";
      const moduleKey = el.getAttribute("data-module-key") || "";
      if (!id) return;

      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this.selectNode(id);
      });

      if (isModule && moduleKey) {
        el.addEventListener("dblclick", (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.setDrilldown(this.drilldownModule === moduleKey ? null : moduleKey);
        });
      }

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

    // Pan & Zoom (zooms smoothly anchored at the mouse cursor)
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
        const stage = svg.querySelector<SVGGElement>(".wheel-stage");
        if (stage) {
          stage.setAttribute("transform", `translate(${this.panX}, ${this.panY}) scale(${this.zoom})`);
        }
      },
      { passive: false } as any,
    );

    svg.addEventListener("pointerdown", (e: any) => {
      if (e.target?.closest(".wheel-node") || e.target?.closest(".wheel-sector")) return;
      this.isDragging = true;
      this.dragStartX = (e.clientX || 0) - this.panX;
      this.dragStartY = (e.clientY || 0) - this.panY;
      svg.style.cursor = "grabbing";
    });

    svg.addEventListener("pointermove", (e: any) => {
      if (!this.isDragging) return;
      this.panX = (e.clientX || 0) - this.dragStartX;
      this.panY = (e.clientY || 0) - this.dragStartY;
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
