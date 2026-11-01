import {
  ArtifactStage,
  STAGE_ORDER,
  STAGE_INDEX,
  SankeyBar,
  SankeyRibbon,
  SankeyColumn,
  SankeyGraph,
  BlastAttenuationNode,
  BlastAttenuationResult,
  computeBlastAttenuation,
  folderGroupKeyOfNode,
  classifyArtifactStage,
  computeSankeyColumns,
  orderBarsByBarycenter,
  SankeySortOrder,
  sortSankeyColumns,
  applyBlastScoresToRibbons,
} from "./sankey-engine.js";
import { cvar, isLightTheme } from "./data.js";

const STAGE_META: Record<ArtifactStage, { title: string; subtitle: string; color: string }> = {
  adrs: { title: "1. ADRs", subtitle: "Architecture Decisions", color: "#a855f7" },
  features: { title: "2. Specs", subtitle: "BDD Features & Contracts", color: "#10b981" },
  code: { title: "3. Code", subtitle: "Production Modules", color: "#38bdf8" },
  tests: { title: "4. Tests", subtitle: "Verification Suites", color: "#f59e0b" },
  docs: { title: "5. Docs", subtitle: "Guides & References", color: "#ec4899" },
};

export function getStageColor(stage: ArtifactStage): string {
  return cvar(`--stage-${stage}`) || STAGE_META[stage]?.color || "#38bdf8";
}

export interface LayoutBar extends SankeyBar {
  baseX: number;
  baseY: number;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  inLineage: boolean;
  minHop: number;
  maxEnergy: number;
  blastRole: BlastAttenuationNode["role"] | "none";
}

/**
 * Interactive 5-Column Stacked Miller-Sankey Flow Chart Canvas Base (`SankeyView`).
 * Supports progressive hierarchical drill-down, click/dblclick disambiguation,
 * contiguous child placement, scrollable stage columns, barycenter crossing minimization,
 * energized hop-attenuated blast highlighting, and interactive bar/column dragging.
 */
export class SankeyView {
  private container: HTMLElement;
  private nodes: Array<{ id: string; name?: string; type?: string; sources?: string[]; childCount?: number }> = [];
  private edges: Array<{ source: string; target: string; relation?: string }> = [];
  public collapsedDirs = new Set<string>();
  public expandedDirs = new Set<string>();
  public hiddenDirs = new Set<string>();
  public dirFilterQuery = "";
  public minCouplingWeight = 1;
  public hopDecay = 0.65;
  public onlyGaps = false;
  public selectedId: string | null = null;
  public selectedBarIds: string[] | null = null;
  public hoveredBarId: string | null = null;
  public onSelect: (id: string | null) => void = () => {};
  public sortOrder: SankeySortOrder = "barycenter";

  scheduleRender(): void {
    this.render();
  }

  rebuild(): void {
    this.render();
  }

  recomputeBlastScores(): void {
    // Blast scores are recomputed in render()
  }

  toggleDirExpand(dirPath: string): void {
    this.toggleFolder(dirPath);
  }

  /** Persistent user-dragged coordinate overrides per bar ID (`{ dx, dy }`). */
  public barOffsets = new Map<string, { dx: number; dy: number }>();
  /** Persistent user-dragged coordinate overrides per stage column (`{ dx, dy }`). */
  public colOffsets = new Map<ArtifactStage, { dx: number; dy: number }>();
  /** Viewport pan & zoom state for the Stacked Flow canvas. */
  public panX = 0;
  public panY = 0;
  public zoom = 1.0;

  private lastLaidOutBars = new Map<string, LayoutBar>();
  private lastComputedContentHeight = 680;
  private activeContextMenuEl: any = null;
  private lastClickTime = 0;
  private lastClickBarId = "";

  constructor(container: HTMLElement) {
    this.container = container;
  }

  isFolderExpanded(folderPath: string): boolean {
    if (this.collapsedDirs.has(folderPath)) return false;
    if (this.expandedDirs.has(folderPath)) return true;
    return false;
  }

  getBarLayout(): Map<string, LayoutBar> {
    return this.lastLaidOutBars;
  }

  getComputedContentHeight(): number {
    return this.lastComputedContentHeight;
  }

  setData(
    nodes: Array<{ id: string; name?: string; type?: string; sources?: string[]; childCount?: number }>,
    edges: Array<{ source: string; target: string; relation?: string }>,
    autoCollapseTopDirs = false,
  ): void {
    this.nodes = nodes;
    this.edges = edges;
    if (autoCollapseTopDirs && this.collapsedDirs.size === 0 && nodes.length > 45) {
      for (const n of nodes) {
        const key = folderGroupKeyOfNode(n);
        if (key) this.collapsedDirs.add(key);
      }
    }
    this.render();
  }

  select(id: string | null): void {
    this.selectedId = id;
    if (!id) {
      this.selectedBarIds = null;
      this.recomputeBlastScores();
      this.scheduleRender();
      return;
    }

    let foundBar: SankeyBar | LayoutBar | undefined = this.lastLaidOutBars.get(id);
    if (!foundBar) {
      for (const bar of this.lastLaidOutBars.values()) {
        if (bar.id === id || bar.dirPath === id) {
          foundBar = bar;
          break;
        }
      }
    }

    if (foundBar && (foundBar.id === id || foundBar.dirPath === id)) {
      this.selectedBarIds = [...foundBar.memberIds];
    } else {
      this.selectedBarIds = [id];
    }

    this.recomputeBlastScores();
    this.scheduleRender();
  }

  reset(): void {
    this.closeContextMenu();
    this.collapsedDirs.clear();
    this.expandedDirs.clear();
    this.hiddenDirs.clear();
    this.barOffsets.clear();
    this.colOffsets.clear();
    this.selectedId = null;
    this.selectedBarIds = null;
    this.hoveredBarId = null;
    this.lastClickTime = 0;
    this.lastClickBarId = "";
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1.0;
    this.dirFilterQuery = "";
    this.onlyGaps = false;
    this.render();
  }

  resetLayout(): void {
    this.barOffsets.clear();
    this.colOffsets.clear();
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1.0;
    this.render();
  }

  collapseAllFolders(): void {
    this.expandedDirs.clear();
    for (const n of this.nodes) {
      const key = folderGroupKeyOfNode(n);
      if (key) {
        this.collapsedDirs.add(key);
      }
    }
    this.render();
  }

  expandAllFolders(): void {
    this.collapsedDirs.clear();
    for (const n of this.nodes) {
      const raw = n.sources?.[0]?.split(" · ")[0]?.trim() || n.id.split("#")[0] || "";
      const parts = raw.replace(/\\/g, "/").split("/").filter(Boolean);
      let cur = "";
      for (let i = 0; i < parts.length - 1; i++) {
        cur = cur ? `${cur}/${parts[i]}` : parts[i];
        this.expandedDirs.add(cur);
      }
    }
    this.render();
  }

  pruneStaleState(): void {
    const validIds = new Set(this.lastLaidOutBars.keys());
    for (const id of Array.from(this.barOffsets.keys())) {
      if (!validIds.has(id)) {
        this.barOffsets.delete(id);
      }
    }
    if (this.hoveredBarId && !validIds.has(this.hoveredBarId)) {
      this.hoveredBarId = null;
    }
  }

  handleBarClick(barId: string): void {
    const lb = this.lastLaidOutBars.get(barId);
    if (!lb) return;

    const alreadySelected =
      this.selectedId === lb.id ||
      (this.selectedId === lb.memberIds[0] && this.selectedBarIds?.length === lb.memberIds.length);

    if (alreadySelected) {
      this.select(null);
      this.onSelect(null);
    } else {
      const selectTarget = lb.isGroup ? lb.id : (lb.memberIds[0] || lb.id);
      this.select(selectTarget);
      this.onSelect(this.selectedId);
    }
  }

  toggleFolder(folderPath: string): void {
    const expanded = this.isFolderExpanded(folderPath);
    if (expanded) {
      this.expandedDirs.delete(folderPath);
      this.collapsedDirs.add(folderPath);
    } else {
      this.collapsedDirs.delete(folderPath);
      this.expandedDirs.add(folderPath);
    }
    this.render();
  }

  expandStageFolders(stage: ArtifactStage): void {
    for (const n of this.nodes) {
      const st = classifyArtifactStage(n);
      if (st === stage) {
        const raw = n.sources?.[0]?.split(" · ")[0]?.trim() || n.id.split("#")[0] || "";
        const parts = raw.replace(/\\/g, "/").split("/").filter(Boolean);
        let cur = "";
        for (let i = 0; i < parts.length - 1; i++) {
          cur = cur ? `${cur}/${parts[i]}` : parts[i];
          this.expandedDirs.add(cur);
          this.collapsedDirs.delete(cur);
        }
      }
    }
    this.render();
  }

  collapseStageFolders(stage: ArtifactStage): void {
    for (const n of this.nodes) {
      const st = classifyArtifactStage(n);
      if (st === stage) {
        const raw = n.sources?.[0]?.split(" · ")[0]?.trim() || n.id.split("#")[0] || "";
        const parts = raw.replace(/\\/g, "/").split("/").filter(Boolean);
        let cur = "";
        for (let i = 0; i < parts.length - 1; i++) {
          cur = cur ? `${cur}/${parts[i]}` : parts[i];
          this.collapsedDirs.add(cur);
          this.expandedDirs.delete(cur);
        }
      }
    }
    this.render();
  }

  getContextMenuItems(barId: string): Array<{ id: string; label: string; icon: string; color?: string; action: () => void }> {
    const lb = this.lastLaidOutBars.get(barId);
    const isGroup = lb ? (lb.isGroup || barId.startsWith("dir:")) : barId.startsWith("dir:");
    if (!lb && !barId.startsWith("dir:")) return [];

    let folderPath = "";
    if (barId.startsWith("dir:")) {
      folderPath = barId.split(":").slice(2).join(":");
    } else if (lb?.isGroup) {
      folderPath = lb.label;
    }

    const isExpanded = isGroup ? this.isFolderExpanded(folderPath) : false;
    const stage = lb?.stage || (barId.startsWith("dir:") ? (barId.split(":")[1] as ArtifactStage) : "code");
    const label = lb?.label || folderPath;

    const items: Array<{ id: string; label: string; icon: string; color?: string; action: () => void }> = [];

    if (isGroup) {
      items.push({
        id: isExpanded ? "collapse-folder" : "expand-folder",
        label: isExpanded ? `Collapse "${label}"` : `Expand "${label}"`,
        icon: isExpanded ? "📁" : "📂",
        action: () => this.toggleFolder(folderPath),
      });
      items.push({
        id: "trace-blast",
        label: "Trace Lineage Blast",
        icon: "⚡",
        color: "#fde047",
        action: () => this.handleBarClick(barId),
      });
      items.push({
        id: "expand-stage",
        label: `Expand All in ${STAGE_META[stage]?.title || stage}`,
        icon: "📂",
        action: () => this.expandStageFolders(stage),
      });
      items.push({
        id: "collapse-stage",
        label: `Collapse All in ${STAGE_META[stage]?.title || stage}`,
        icon: "📁",
        action: () => this.collapseStageFolders(stage),
      });
      items.push({
        id: "hide-bar",
        label: "Hide Folder",
        icon: "👁",
        color: "#f87171",
        action: () => {
          const dirKey = barId.startsWith("dir:") ? barId.split(":").slice(2).join(":") : (lb?.id || barId);
          this.hiddenDirs.add(dirKey);
          this.render();
        },
      });
    } else if (lb) {
      items.push({
        id: "trace-blast",
        label: "Trace Lineage Blast",
        icon: "⚡",
        color: "#fde047",
        action: () => this.handleBarClick(barId),
      });
      items.push({
        id: "focus-inspector",
        label: "Focus in Detail Inspector",
        icon: "📄",
        action: () => this.onSelect(lb.memberIds[0] || lb.id),
      });

      // If child belongs to an expanded folder, offer collapsing parent folder
      const raw = lb.memberIds[0] || lb.id;
      const parts = raw.split("#")[0].replace(/\\/g, "/").split("/").filter(Boolean);
      if (parts.length > 1) {
        const parentDir = parts.slice(0, parts.length - 1).join("/");
        if (this.isFolderExpanded(parentDir)) {
          items.push({
            id: "collapse-parent-folder",
            label: `Collapse Parent Folder "${parentDir}"`,
            icon: "📁",
            action: () => this.toggleFolder(parentDir),
          });
        }
      }

      items.push({
        id: "hide-bar",
        label: "Hide Bar",
        icon: "👁",
        color: "#f87171",
        action: () => {
          this.hiddenDirs.add(lb.id);
          this.render();
        },
      });
    }

    return items;
  }

  closeContextMenu(): void {
    if (this.activeContextMenuEl) {
      try {
        this.activeContextMenuEl.remove();
      } catch {
        // ignore
      }
      this.activeContextMenuEl = null;
    }
  }

  openContextMenu(barId: string, clientX: number, clientY: number): void {
    this.closeContextMenu();
    if (typeof document === "undefined") return;

    const items = this.getContextMenuItems(barId);
    if (items.length === 0) return;

    const menu = document.createElement("div");
    menu.className = "sankey-context-menu";
    menu.style.cssText = `
      position: fixed;
      left: ${clientX}px;
      top: ${clientY}px;
      z-index: 99999;
      background: var(--panel, #181c20);
      border: 1px solid var(--border, #2d3748);
      border-radius: 7px;
      padding: 5px 0;
      box-shadow: 0 12px 30px rgba(0,0,0,0.7);
      font-size: 11.5px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: var(--ink, #e7e9ea);
      min-width: 180px;
      user-select: none;
    `;

    for (const it of items) {
      if (it.id === "expand-stage" || it.id === "hide-bar") {
        const divider = document.createElement("div");
        divider.style.cssText = "height: 1px; background: var(--border, #242b30); margin: 4px 0;";
        menu.appendChild(divider);
      }
      const row = document.createElement("div");
      row.className = "sankey-menu-item";
      row.style.cssText = `
        padding: 6px 14px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 9px;
        color: ${it.color || "var(--ink, #e7e9ea)"};
        font-weight: 500;
      `;
      row.innerHTML = `<span style="font-size: 13px;">${it.icon}</span> <span>${this.esc(it.label)}</span>`;
      row.addEventListener("mouseenter", () => {
        row.style.background = "var(--panel2, #242b30)";
      });
      row.addEventListener("mouseleave", () => {
        row.style.background = "transparent";
      });
      row.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.closeContextMenu();
        it.action();
      });
      menu.appendChild(row);
    }

    document.body.appendChild(menu);

    try {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        menu.style.left = `${Math.max(10, window.innerWidth - rect.width - 12)}px`;
      }
      if (rect.bottom > window.innerHeight) {
        menu.style.top = `${Math.max(10, window.innerHeight - rect.height - 12)}px`;
      }
    } catch {
      // ignore
    }

    this.activeContextMenuEl = menu;

    const onDocDown = (ev: MouseEvent) => {
      if (!menu.contains(ev.target as Node)) {
        this.closeContextMenu();
        document.removeEventListener("pointerdown", onDocDown);
        document.removeEventListener("keydown", onDocKey);
      }
    };
    const onDocKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        this.closeContextMenu();
        document.removeEventListener("pointerdown", onDocDown);
        document.removeEventListener("keydown", onDocKey);
      }
    };
    setTimeout(() => {
      document.addEventListener("pointerdown", onDocDown);
      document.addEventListener("keydown", onDocKey);
    }, 10);
  }

  handleBarDoubleClick(barId: string): void {
    const lb = this.lastLaidOutBars.get(barId);
    if (!lb && barId.startsWith("dir:")) {
      const folderPath = barId.split(":").slice(2).join(":");
      this.toggleFolder(folderPath);
      return;
    }
    if (!lb) return;

    if (lb.isGroup || barId.startsWith("dir:")) {
      const folderPath = barId.startsWith("dir:")
        ? barId.split(":").slice(2).join(":")
        : lb.label;
      this.toggleFolder(folderPath);
    }
  }

  moveBar(barId: string, dx: number, dy: number, reRender = false): void {
    const prev = this.barOffsets.get(barId) ?? { dx: 0, dy: 0 };
    this.barOffsets.set(barId, { dx: prev.dx + dx, dy: prev.dy + dy });
    if (reRender) this.render();
  }

  moveColumn(stage: ArtifactStage, dx: number, dy: number, reRender = false): void {
    const prev = this.colOffsets.get(stage) ?? { dx: 0, dy: 0 };
    this.colOffsets.set(stage, { dx: prev.dx + dx, dy: prev.dy + dy });
    if (reRender) this.render();
  }

  render(): void {
    if (!this.container) return;

    // 1. Directory and text filtering
    const q = this.dirFilterQuery.trim().toLowerCase();
    const filteredNodes = this.nodes.filter((n) => {
      const raw = (n.sources?.[0]?.split(" · ")[0]?.trim() || n.id.split("#")[0] || "").replace(/\\/g, "/");
      const groupKey = folderGroupKeyOfNode(n) || "";
      for (const h of this.hiddenDirs) {
        if (raw === h || raw.startsWith(h + "/") || groupKey === h || n.id === h) {
          return false;
        }
      }
      if (q) {
        const hay = `${raw} ${groupKey} ${n.name || ""} ${n.id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const allowedSet = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = this.edges.filter((e) => allowedSet.has(e.source) && allowedSet.has(e.target));

    // Hierarchical or flat column computation
    const hierarchicalExpanded = this.expandedDirs.size > 0 ? this.expandedDirs : undefined;
    const sankey = computeSankeyColumns(
      filteredNodes,
      filteredEdges,
      this.collapsedDirs,
      this.minCouplingWeight,
      hierarchicalExpanded,
      this.sortOrder,
    );

    // Blast attenuation
    const focusSeeds =
      this.selectedBarIds && this.selectedBarIds.length > 0
        ? this.selectedBarIds
        : this.selectedId
          ? [this.selectedId]
          : null;
    const blastResult = focusSeeds
      ? computeBlastAttenuation(focusSeeds, filteredNodes, filteredEdges, this.hopDecay)
      : null;

    const W = Math.max(860, this.container.clientWidth || 1100);
    const H = Math.max(580, this.container.clientHeight || 720);

    const headerY = 24;
    const padTop = 84;
    const padBottom = 64;
    const padX = 28;
    const usableW = W - padX * 2;
    const colCount = STAGE_ORDER.length;
    const colWidth = Math.min(185, Math.max(120, Math.floor(usableW * 0.14)));
    const colStep = colCount > 1 ? (usableW - colWidth) / (colCount - 1) : 0;

    const barLayout = new Map<string, LayoutBar>();
    const stageColumns: Array<{
      stage: ArtifactStage;
      baseX: number;
      baseHeaderY: number;
      x: number;
      headerY: number;
      bars: LayoutBar[];
      total: number;
    }> = [];

    let maxColY = H;

    STAGE_ORDER.forEach((stage, colIdx) => {
      const col = sankey.columns[stage];
      const meta = STAGE_META[stage];
      const colOff = this.colOffsets.get(stage) ?? { dx: 0, dy: 0 };
      const baseX = Math.round(padX + colIdx * colStep);
      const colX = baseX + colOff.dx;

      let bars = [...col.bars];
      if (this.onlyGaps && stage === "code") {
        bars = bars.filter((b) => b.hasGap);
      }

      const gapPx = 5;
      let curY = padTop;
      const laidOut: LayoutBar[] = [];

      for (const b of bars) {
        // Enforce minimum bar height >= 20px so labels and badges are always readable
        const h = Math.max(20, Math.min(42, Math.round(20 + Math.sqrt(b.weight) * 2.5)));

        let inLineage = true;
        let minHop = 99;
        let maxEnergy = 0;
        let blastRole: LayoutBar["blastRole"] = "none";

        if (blastResult) {
          inLineage = false;
          for (const id of b.memberIds) {
            const info = blastResult.nodes.get(id);
            if (info) {
              inLineage = true;
              if (info.hop < minHop) {
                minHop = info.hop;
                blastRole = info.role;
              }
              if (info.energy > maxEnergy) {
                maxEnergy = info.energy;
              }
            }
          }
        }

        const barOff = this.barOffsets.get(b.id) ?? { dx: 0, dy: 0 };
        const lb: LayoutBar = {
          ...b,
          baseX,
          baseY: curY,
          x: colX + barOff.dx,
          y: curY + colOff.dy + barOff.dy,
          w: colWidth,
          h,
          color: getStageColor(stage),
          inLineage,
          minHop,
          maxEnergy,
          blastRole,
        };
        barLayout.set(b.id, lb);
        laidOut.push(lb);
        curY += h + gapPx;
      }

      if (curY > maxColY) {
        maxColY = curY;
      }

      stageColumns.push({
        stage,
        baseX,
        baseHeaderY: headerY,
        x: colX,
        headerY: headerY + colOff.dy,
        bars: laidOut,
        total: col.totalWeight,
      });
    });

    this.lastLaidOutBars = barLayout;
    this.lastComputedContentHeight = Math.max(H, maxColY + padBottom);
    this.pruneStaleState();

    const gapCount = sankey.gaps.length;
    const collapsedCount = this.collapsedDirs.size;
    const hiddenDirCount = this.hiddenDirs.size;
    const hasCustomLayout =
      this.barOffsets.size > 0 ||
      this.colOffsets.size > 0 ||
      this.panX !== 0 ||
      this.panY !== 0 ||
      this.zoom !== 1.0;

    // Calculate Bézier ribbon paths
    const computeAllRibbonPaths = (): Map<string, string> => {
      const leftPorts = new Map<string, Array<{ key: string; partnerY: number; weight: number }>>();
      const rightPorts = new Map<string, Array<{ key: string; partnerY: number; weight: number }>>();

      const addPort = (
        map: Map<string, Array<{ key: string; partnerY: number; weight: number }>>,
        barId: string,
        key: string,
        partnerY: number,
        weight: number,
      ) => {
        let list = map.get(barId);
        if (!list) {
          list = [];
          map.set(barId, list);
        }
        list.push({ key, partnerY, weight });
      };

      for (const r of sankey.ribbons) {
        const src = barLayout.get(r.sourceBarId);
        const tgt = barLayout.get(r.targetBarId);
        if (!src || !tgt) continue;
        const rKey = `${r.sourceBarId}->${r.targetBarId}`;
        const srcCx = src.x + src.w / 2;
        const tgtCx = tgt.x + tgt.w / 2;
        const srcCy = src.y + src.h / 2;
        const tgtCy = tgt.y + tgt.h / 2;

        if (srcCx <= tgtCx) {
          addPort(rightPorts, src.id, rKey, tgtCy, r.weight);
          addPort(leftPorts, tgt.id, rKey, srcCy, r.weight);
        } else {
          addPort(leftPorts, src.id, rKey, tgtCy, r.weight);
          addPort(rightPorts, tgt.id, rKey, srcCy, r.weight);
        }
      }

      const portY = new Map<string, number>();
      const assignSideSlotYs = (
        side: "L" | "R",
        map: Map<string, Array<{ key: string; partnerY: number; weight: number }>>,
      ) => {
        for (const [barId, list] of map.entries()) {
          const bar = barLayout.get(barId);
          if (!bar) continue;
          list.sort((a, b) => a.partnerY - b.partnerY || a.key.localeCompare(b.key));
          const n = list.length;
          const pad = Math.min(5, Math.max(2, bar.h * 0.15));
          const avail = Math.max(2, bar.h - pad * 2);

          if (n === 1) {
            const partnerY = list[0].partnerY;
            const rel = Math.max(-1, Math.min(1, (partnerY - (bar.y + bar.h / 2)) / 240));
            const y = bar.y + bar.h / 2 + rel * (avail * 0.38);
            portY.set(`${barId}:${side}:${list[0].key}`, Number(y.toFixed(1)));
          } else {
            const totalW = list.reduce((s, item) => s + Math.sqrt(item.weight), 0) || 1;
            let acc = 0;
            for (let i = 0; i < n; i++) {
              const w = Math.sqrt(list[i].weight);
              const frac = (acc + w / 2) / totalW;
              acc += w;
              const y = bar.y + pad + frac * avail;
              portY.set(`${barId}:${side}:${list[i].key}`, Number(y.toFixed(1)));
            }
          }
        }
      };

      assignSideSlotYs("L", leftPorts);
      assignSideSlotYs("R", rightPorts);

      const pathMap = new Map<string, string>();
      for (const r of sankey.ribbons) {
        const src = barLayout.get(r.sourceBarId);
        const tgt = barLayout.get(r.targetBarId);
        if (!src || !tgt) continue;
        const rKey = `${r.sourceBarId}->${r.targetBarId}`;
        const srcCx = src.x + src.w / 2;
        const tgtCx = tgt.x + tgt.w / 2;

        const normalOrder = srcCx <= tgtCx;
        const x0 = normalOrder ? src.x + src.w : src.x;
        const x1 = normalOrder ? tgt.x : tgt.x + tgt.w;
        const y0 = portY.get(`${src.id}:${normalOrder ? "R" : "L"}:${rKey}`) ?? src.y + src.h / 2;
        const y1 = portY.get(`${tgt.id}:${normalOrder ? "L" : "R"}:${rKey}`) ?? tgt.y + tgt.h / 2;

        const dx = x1 - x0;
        const sign = dx >= 0 ? 1 : -1;
        const tension = Math.max(28, Math.abs(dx) * 0.45);
        const cx0 = Number((x0 + sign * tension).toFixed(1));
        const cx1 = Number((x1 - sign * tension).toFixed(1));

        pathMap.set(rKey, `M${x0},${y0} C${cx0},${y0} ${cx1},${y1} ${x1},${y1}`);
      }
      return pathMap;
    };

    const initialRibbonPaths = computeAllRibbonPaths();
    const isLight = isLightTheme();

    let svgDefs = `<defs>
      ${!isLight ? `<filter id="sankey-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3.5" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>` : ""}`;
    for (const sA of STAGE_ORDER) {
      for (const sB of STAGE_ORDER) {
        const colA = getStageColor(sA);
        const colB = getStageColor(sB);
        svgDefs += `<linearGradient id="sankey-grad-${sA}-${sB}" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="${colA}"/><stop offset="100%" stop-color="${colB}"/></linearGradient>`;
      }
    }
    svgDefs += "</defs>";

    let svgRibbons = "";
    for (const r of sankey.ribbons) {
      const src = barLayout.get(r.sourceBarId);
      const tgt = barLayout.get(r.targetBarId);
      if (!src || !tgt) continue;
      const rKey = `${r.sourceBarId}->${r.targetBarId}`;
      const d = initialRibbonPaths.get(rKey) || "";

      let hasActiveBlastEdge = false;
      if (blastResult && blastResult.activeEdges) {
        for (const u of src.memberIds) {
          for (const v of tgt.memberIds) {
            if (blastResult.activeEdges.has(`${u}->${v}`) || blastResult.activeEdges.has(`${v}->${u}`)) {
              hasActiveBlastEdge = true;
              break;
            }
          }
          if (hasActiveBlastEdge) break;
        }
      }
      r.inLineage = hasActiveBlastEdge;
      const isActiveBlast = blastResult !== null && hasActiveBlastEdge;
      const isDimmed = blastResult !== null && !isActiveBlast;
      const ribbonEnergy = isActiveBlast ? Math.min(src.maxEnergy, tgt.maxEnergy) : 0;

      const baseStrokeW = Math.min(24, Math.max(2, 1.8 + Math.sqrt(r.weight) * 2.4));
      const strokeW = isActiveBlast
        ? baseStrokeW * (0.95 + 0.45 * ribbonEnergy)
        : isDimmed
          ? Math.max(1.2, baseStrokeW * 0.65)
          : baseStrokeW;
      const opacity = isDimmed
        ? 0.035
        : isActiveBlast
          ? Number((0.32 + 0.65 * ribbonEnergy).toFixed(2))
          : 0.28;
      const gradId = `sankey-grad-${src.stage}-${tgt.stage}`;
      const filterAttr = (!isLight && isActiveBlast && ribbonEnergy >= 0.7) ? ` filter="url(#sankey-glow)"` : "";
      const ribbonStyle = isLight ? "mix-blend-mode:multiply;" : "";

      svgRibbons += `<path class="sankey-ribbon" data-ribbon-key="${this.esc(rKey)}" data-src="${this.esc(src.id)}" data-tgt="${this.esc(tgt.id)}" d="${d}" fill="none" stroke="url(#${gradId})" stroke-width="${strokeW.toFixed(1)}" stroke-linecap="round" opacity="${opacity}"${filterAttr} style="${ribbonStyle}"><title>${this.esc(src.label)} → ${this.esc(tgt.label)} (${r.weight} links${isActiveBlast ? ` · ${Math.round(ribbonEnergy * 100)}% blast energy` : ""})</title></path>`;
    }

    let svgColumns = "";
    for (const col of stageColumns) {
      const meta = STAGE_META[col.stage];
      const metaColor = getStageColor(col.stage);
      svgColumns += `<g class="sankey-col" data-stage="${col.stage}">`;
      svgColumns += `<g class="sankey-col-header" data-stage="${col.stage}" transform="translate(${col.x}, ${col.headerY})" style="cursor:default;">`;
      svgColumns += `<rect x="0" y="0" width="${colWidth}" height="46" rx="7" fill="var(--panel, #15181b)" stroke="${metaColor}66" stroke-width="1.2"/>`;
      svgColumns += `<text x="10" y="19" fill="${metaColor}" font-size="12" font-weight="700">⠿ ${this.esc(meta.title)}</text>`;
      svgColumns += `<text x="${colWidth - 10}" y="19" text-anchor="end" fill="var(--ink, #e7e9ea)" font-size="11" font-weight="600">${col.total}</text>`;
      svgColumns += `<text x="10" y="36" fill="var(--muted, #8b9298)" font-size="10">${this.esc(meta.subtitle)}</text>`;
      svgColumns += `<title>${this.esc(meta.title)}: ${col.total} items</title>`;
      svgColumns += `</g>`;

      if (col.bars.length === 0) {
        svgColumns += `<rect x="${col.x}" y="${padTop}" width="${colWidth}" height="80" rx="6" fill="var(--panel, #15181b)" stroke="var(--panel2, #242b30)" stroke-dasharray="4 4"/>`;
        svgColumns += `<text x="${col.x + colWidth / 2}" y="${padTop + 44}" text-anchor="middle" fill="var(--muted, #8b9298)" font-size="11">No items in stage</text>`;
      }

      for (const b of col.bars) {
        const isSeed = blastResult !== null && b.minHop === 0;
        const isAffected = blastResult !== null && b.inLineage;
        const isDimmed = blastResult !== null && !b.inLineage;

        const fillOpacity = isDimmed
          ? 0.13
          : isSeed
            ? 1.0
            : isAffected
              ? Number((0.55 + 0.45 * b.maxEnergy).toFixed(2))
              : 0.82;
        const strokeColor = b.hasGap
          ? "var(--red, #ef4444)"
          : isSeed
            ? "var(--accent, #38bdf8)"
            : isAffected && b.minHop === 1
              ? "var(--amber, #fde047)"
              : metaColor;
        const strokeW = isSeed ? (isLight ? 2.8 : 2.6) : isAffected ? Number((1.2 + 1.2 * b.maxEnergy).toFixed(1)) : b.hasGap ? 2.0 : 1.0;
        const glowAttr = (!isLight && (isSeed || (isAffected && b.maxEnergy >= 0.78))) ? ` filter="url(#sankey-glow)"` : "";

        const maxChars = Math.max(10, Math.floor((colWidth - 46) / 6.2));
        const rawLabel = b.isGroup ? `📁 ${b.label}` : b.label;
        const shortLabel = rawLabel.length > maxChars ? rawLabel.slice(0, maxChars - 1) + "…" : rawLabel;

        let badgeText = "";
        let badgeColor = metaColor;
        if (isSeed) {
          badgeText = "⚡ SEED";
          badgeColor = "var(--amber, #fde047)";
        } else if (isAffected) {
          badgeText = `${b.minHop}h · ${Math.round(b.maxEnergy * 100)}%`;
          badgeColor = b.minHop === 1 ? "var(--amber, #fde047)" : metaColor;
        } else if (b.isGroup) {
          badgeText = `${b.memberCount}`;
        } else if (b.hasGap) {
          badgeText = "⚠ 0 tests";
          badgeColor = "var(--red, #f87171)";
        }

        const dirOrNodeKey = b.isGroup && b.id.startsWith("dir:") ? b.id.split(":").slice(2).join(":") : b.id;
        const isExpanded = this.isFolderExpanded(dirOrNodeKey);

        const chevronHitW = 24;
        const depth = b.depth ?? 0;
        const indentPx = b.isGroup ? 0 : Math.min(24, Math.max(0, (depth - 1) * 8));

        svgColumns += `<g class="sankey-bar" data-bar-id="${this.esc(b.id)}" data-dir-key="${this.esc(dirOrNodeKey)}" data-stage="${col.stage}" data-is-group="${b.isGroup ? "1" : "0"}" data-first-node="${this.esc(b.memberIds[0] || "")}" transform="translate(${b.x}, ${b.y})" opacity="${fillOpacity}">`;
        svgColumns += `<rect class="sankey-bar-bg" x="0" y="0" width="${b.w}" height="${b.h}" rx="5" fill="${isSeed ? `${metaColor}25` : "var(--panel, #181c20)"}" stroke="${strokeColor}" stroke-width="${strokeW}"${glowAttr}/>`;
        svgColumns += `<rect class="sankey-bar-stripe" x="0" y="0" width="${isSeed ? 7 : 5}" height="${b.h}" rx="2" fill="${isSeed ? "var(--amber, #fde047)" : metaColor}"/>`;

        if (b.isGroup) {
          svgColumns += `<g class="sankey-chevron-hit" data-bar-id="${this.esc(b.id)}" title="${isExpanded ? "Collapse folder" : "Expand folder"}">`;
          svgColumns += `<rect x="2" y="2" width="${chevronHitW}" height="${Math.max(14, b.h - 4)}" rx="3" fill="transparent"/>`;
          svgColumns += `<text class="sankey-chevron" data-bar-id="${this.esc(b.id)}" x="10" y="${Math.min(b.h / 2 + 4, 18)}" fill="${metaColor}" font-size="11" font-weight="700">${isExpanded ? "▾" : "▸"}</text>`;
          svgColumns += `</g>`;
          svgColumns += `<text x="${chevronHitW + 4}" y="${Math.min(b.h / 2 + 4, 18)}" fill="var(--ink, #e7e9ea)" font-size="11" font-weight="700">${this.esc(shortLabel)}</text>`;
        } else {
          svgColumns += `<text x="${11 + indentPx}" y="${Math.min(b.h / 2 + 4, 18)}" fill="var(--ink, #e7e9ea)" font-size="11" font-weight="${isSeed ? "700" : isAffected ? "600" : "400"}">${this.esc(shortLabel)}</text>`;
        }

        if (badgeText) {
          svgColumns += `<text class="sankey-bar-badge" x="${b.w - 8}" y="${Math.min(b.h / 2 + 4, 18)}" text-anchor="end" fill="${badgeColor}" font-size="9.5" font-weight="700">${this.esc(badgeText)}</text>`;
        }
        svgColumns += `<title>${this.esc(b.label)} (${b.memberCount} node${b.memberCount === 1 ? "" : "s"}${isAffected ? ` · Hop ${b.minHop} · Blast Energy ${Math.round(b.maxEnergy * 100)}%` : ""}${b.hasGap ? " — GAP: 0 linked tests/docs" : ""})\n• Click anywhere on bubble: Select & trace lineage blast\n• Right-click or Ctrl+click: Open menu (expand, collapse, hide)\n• Chevron ▸/▾ or Double-click: Toggle folder expansion</title>`;
        svgColumns += `</g>`;
      }
      svgColumns += `</g>`;
    }

    const totalSvgH = this.lastComputedContentHeight;

    this.container.innerHTML = `
      <div class="sankey-root" style="display:flex; flex-direction:column; width:100%; height:100%; overflow:hidden; position:relative;">
        <style>
          .sankey-bar {
            cursor: pointer;
            user-select: none;
            -webkit-user-select: none;
            transition: opacity 0.12s ease;
          }
          .sankey-bar rect.sankey-bar-bg {
            transition: fill 0.12s ease, stroke 0.12s ease, stroke-width 0.12s ease;
          }
          .sankey-bar:hover {
            opacity: 1 !important;
          }
          .sankey-bar:hover rect.sankey-bar-bg {
            fill: var(--panel2, #232930);
            stroke: var(--accent, #38bdf8);
            stroke-width: 1.6px;
          }
          .sankey-bar.is-dragging {
            cursor: grabbing !important;
          }
          .sankey-bar text {
            pointer-events: none;
            user-select: none;
            -webkit-user-select: none;
          }
          .sankey-chevron-hit {
            cursor: pointer;
            pointer-events: all;
          }
          .sankey-chevron-hit rect {
            fill: transparent;
            transition: fill 0.12s ease;
          }
          .sankey-chevron-hit:hover rect {
            fill: rgba(255, 255, 255, 0.16);
          }
        </style>
        <div class="sankey-toolbar" style="display:flex; flex-wrap:wrap; align-items:center; gap:8px; background:var(--panel, #15181b); border:1px solid var(--border, #242b30); border-radius:7px; padding:6px 12px; margin:62px 14px 4px 14px; font-size:11px; color:var(--ink, #e7e9ea); z-index:2; flex-shrink:0;">
          <span style="font-weight:600; color:var(--accent, #38bdf8);">Stacked Lifecycle Flow</span>
          <button type="button" class="ptool-btn" id="sankeyGroupFolders" title="Roll up files & test suites into directory/domain bars">${collapsedCount > 0 ? `📁 Folders Grouped (${collapsedCount})` : "📁 Group by Folder"}</button>
          <button type="button" class="ptool-btn" id="sankeyExpandFiles" title="Expand all folders into individual files">📄 Expand All Files</button>
          <select id="sankeySortOrder" class="ptool-select" style="background:var(--bg); color:var(--ink); border:1px solid var(--border); border-radius:5px; padding:2px 7px; font-size:11px; cursor:pointer;" title="Sort order for column bars">
            <option value="barycenter" ${this.sortOrder === "barycenter" ? "selected" : ""}>Sort: Barycenter</option>
            <option value="hierarchy" ${this.sortOrder === "hierarchy" ? "selected" : ""}>Sort: Directory Tree</option>
            <option value="name" ${this.sortOrder === "name" ? "selected" : ""}>Sort: Name (A–Z)</option>
            <option value="weight" ${this.sortOrder === "weight" ? "selected" : ""}>Sort: Coupling Weight</option>
          </select>
          <input type="search" id="sankeyDirFilter" value="${this.esc(this.dirFilterQuery)}" placeholder="Filter folders/files (e.g. test/viz, src/graph)…" style="width:190px; background:var(--bg); color:var(--ink); border:1px solid var(--border); border-radius:5px; padding:2px 7px; font-size:11px;" title="Filter columns by directory or file substring (or use the left Files tree panel)">
          ${hiddenDirCount > 0 ? `<button type="button" class="ptool-btn" id="sankeyRestoreHidden" style="color:var(--accent);" title="Restore right-clicked hidden folders/bars">👁 Restore Hidden (${hiddenDirCount})</button>` : ""}
          <label style="display:flex; align-items:center; gap:4px; cursor:pointer; margin-left:2px;" title="Highlight code modules with 0 linked tests or docs">
            <input type="checkbox" id="sankeyOnlyGaps" ${this.onlyGaps ? "checked" : ""}>
            <span style="color:${gapCount > 0 ? "var(--red, #f87171)" : "var(--muted)"}; font-weight:600;">⚠ Gaps (${gapCount})</span>
          </label>
          <label style="display:flex; align-items:center; gap:4px; margin-left:4px;" title="Minimum link count to draw a ribbon">
            <span style="color:var(--muted);">Min Flow: <b>${this.minCouplingWeight}</b></span>
            <input type="range" id="sankeyMinWeight" min="1" max="10" step="1" value="${this.minCouplingWeight}" style="width:55px; cursor:pointer;">
          </label>
          <label style="display:flex; align-items:center; gap:4px; margin-left:4px;" title="Effect attenuation per hop (γ): controls how quickly blast energy decays across 2+ hops">
            <span style="color:var(--muted);">Hop Decay: <b>${Math.round(this.hopDecay * 100)}%</b></span>
            <input type="range" id="sankeyHopDecay" min="0.3" max="1.0" step="0.05" value="${this.hopDecay}" style="width:55px; cursor:pointer;">
          </label>
          ${hasCustomLayout ? `<button type="button" class="ptool-btn" id="sankeyResetLayout" title="Reset dragged bars, columns, and pan/zoom">↺ Reset Layout</button>` : ""}
          ${focusSeeds ? `<button type="button" class="ptool-btn" id="sankeyClearTrace" style="color:var(--amber); font-weight:600;">✕ Clear Blast Trace</button>` : ""}
          <span style="color:var(--muted, #8b9298); font-size:10px; margin-left:auto;">💡 Click bubble: Blast Trace · Dbl-click / ▸: Expand · Right-click: Menu · Canvas: Pan & Zoom</span>
        </div>
        <div class="sankey-canvas-wrap" style="flex:1; width:100%; height:100%; overflow:auto; position:relative;">
          <svg class="sankey-svg" width="${W}" height="${totalSvgH}" viewBox="0 0 ${W} ${totalSvgH}" style="min-width:${W}px; min-height:${totalSvgH}px; overflow:visible; display:block; user-select:none; cursor:grab;">
            ${svgDefs}
            <g class="sankey-viewport" transform="translate(${this.panX}, ${this.panY}) scale(${this.zoom})">
              <g class="sankey-ribbons">${svgRibbons}</g>
              <g class="sankey-columns">${svgColumns}</g>
            </g>
          </svg>
        </div>
      </div>
    `;

    // Toolbar event listeners
    this.container.querySelector("#sankeyGroupFolders")?.addEventListener("click", () => {
      this.collapseAllFolders();
    });
    this.container.querySelector("#sankeyExpandFiles")?.addEventListener("click", () => {
      this.expandAllFolders();
    });
    const sortSelect = this.container.querySelector<HTMLSelectElement>("#sankeySortOrder");
    sortSelect?.addEventListener("change", (ev) => {
      this.sortOrder = (ev.target as HTMLSelectElement).value as SankeySortOrder;
      this.rebuild();
      this.scheduleRender();
    });
    const filterInput = this.container.querySelector<HTMLInputElement>("#sankeyDirFilter");
    filterInput?.addEventListener("input", () => {
      const selStart = filterInput.selectionStart;
      this.dirFilterQuery = filterInput.value;
      this.render();
      const nextInput = this.container.querySelector<HTMLInputElement>("#sankeyDirFilter");
      if (nextInput) {
        nextInput.focus();
        if (selStart !== null) nextInput.setSelectionRange(selStart, selStart);
      }
    });
    this.container.querySelector("#sankeyRestoreHidden")?.addEventListener("click", () => {
      this.hiddenDirs.clear();
      this.render();
    });
    this.container.querySelector("#sankeyOnlyGaps")?.addEventListener("change", (ev) => {
      this.onlyGaps = (ev.target as HTMLInputElement).checked;
      this.render();
    });
    this.container.querySelector("#sankeyMinWeight")?.addEventListener("input", (ev) => {
      this.minCouplingWeight = parseInt((ev.target as HTMLInputElement).value, 10) || 1;
      this.render();
    });
    this.container.querySelector("#sankeyHopDecay")?.addEventListener("input", (ev) => {
      this.hopDecay = parseFloat((ev.target as HTMLInputElement).value) || 0.65;
      this.render();
    });
    this.container.querySelector("#sankeyResetLayout")?.addEventListener("click", () => {
      this.resetLayout();
    });
    const clearBtn = this.container.querySelector("#sankeyClearTrace");
    if (clearBtn) {
      let clearHandled = false;
      const doClear = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
        if (clearHandled) return;
        clearHandled = true;
        this.selectedId = null;
        this.selectedBarIds = null;
        this.onSelect(null);
        this.render();
      };
      clearBtn.addEventListener("pointerdown", doClear);
      clearBtn.addEventListener("click", doClear);
    }

    // Dynamic live ribbon refresh
    const ribbonEls = Array.from(this.container.querySelectorAll<SVGPathElement>(".sankey-ribbon"));
    const refreshLiveRibbons = () => {
      const updatedPaths = computeAllRibbonPaths();
      for (const pathEl of ribbonEls) {
        const rKey = pathEl.getAttribute("data-ribbon-key") || "";
        const d = updatedPaths.get(rKey);
        if (d) {
          pathEl.setAttribute("d", d);
        }
      }
    };

    const svgEl = this.container.querySelector<SVGSVGElement>(".sankey-svg");
    const viewportEl = this.container.querySelector<SVGGElement>(".sankey-viewport");

    // Chevron hit-area click handler
    this.container.querySelectorAll<SVGGElement | SVGTextElement>(".sankey-chevron-hit, .sankey-chevron").forEach((chEl) => {
      chEl.addEventListener("pointerdown", (ev: Event) => {
        ev.stopPropagation();
      });
      chEl.addEventListener("click", (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
        const barId = chEl.getAttribute("data-bar-id") || "";
        this.handleBarDoubleClick(barId);
      });
    });

    // Bar immediate click, double-click, and context menu (no drag-timer delays)
    this.container.querySelectorAll<SVGGElement>(".sankey-bar").forEach((el) => {
      const barId = el.getAttribute("data-bar-id") || "";
      const lb = barLayout.get(barId);
      if (!lb) return;

      const handleContext = (ev: MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.openContextMenu(barId, ev.clientX, ev.clientY);
      };

      el.addEventListener("contextmenu", handleContext);

      let lastHandledTime = 0;
      const doClick = (ev: Event) => {
        ev.stopPropagation();
        if ((ev as MouseEvent).ctrlKey || (ev as MouseEvent).metaKey) {
          handleContext(ev as MouseEvent);
          return;
        }
        const now = Date.now();
        if (now - lastHandledTime < 50) return;
        lastHandledTime = now;

        if (now - this.lastClickTime < 320 && this.lastClickBarId === barId) {
          this.lastClickTime = 0;
          this.lastClickBarId = "";
          this.handleBarDoubleClick(barId);
        } else {
          this.lastClickTime = now;
          this.lastClickBarId = barId;
          this.handleBarClick(barId);
        }
      };

      el.addEventListener("pointerdown", (ev: PointerEvent) => {
        if (ev.button !== undefined && ev.button !== 0) return;
        ev.stopPropagation();
      });

      el.addEventListener("pointerup", (ev: PointerEvent) => {
        if (ev.button !== undefined && ev.button !== 0) return;
        doClick(ev);
      });

      el.addEventListener("click", doClick);

      el.addEventListener("dblclick", (ev: MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.handleBarDoubleClick(barId);
      });
    });

    // Background Pan & Wheel Zoom
    if (svgEl && viewportEl) {
      let panning = false;
      let panMoved = false;
      let panStartX = 0;
      let panStartY = 0;
      let initialPanX = 0;
      let initialPanY = 0;

      svgEl.addEventListener("pointerdown", (ev: PointerEvent) => {
        if (ev.button !== 0) return;
        const target = ev.target as Element | null;
        if (target?.closest(".sankey-bar") || target?.closest(".sankey-col-header")) return;
        panning = true;
        panMoved = false;
        panStartX = ev.clientX;
        panStartY = ev.clientY;
        initialPanX = this.panX;
        initialPanY = this.panY;
        svgEl.style.cursor = "grabbing";
        try {
          svgEl.setPointerCapture(ev.pointerId);
        } catch {
          // ignore
        }
      });

      svgEl.addEventListener("pointermove", (ev: PointerEvent) => {
        if (!panning) return;
        const dx = ev.clientX - panStartX;
        const dy = ev.clientY - panStartY;
        if (Math.hypot(dx, dy) > 3) panMoved = true;
        this.panX = Math.round(initialPanX + dx);
        this.panY = Math.round(initialPanY + dy);
        viewportEl.setAttribute("transform", `translate(${this.panX}, ${this.panY}) scale(${this.zoom})`);
      });

      const endPan = (ev: PointerEvent) => {
        if (!panning) return;
        panning = false;
        svgEl.style.cursor = "grab";
        try {
          svgEl.releasePointerCapture(ev.pointerId);
        } catch {
          // ignore
        }
        if (!panMoved && (this.selectedId || this.selectedBarIds)) {
          this.selectedId = null;
          this.selectedBarIds = null;
          this.onSelect(null);
          this.render();
        }
      };

      svgEl.addEventListener("pointerup", endPan);
      svgEl.addEventListener("pointercancel", endPan);

      svgEl.addEventListener(
        "wheel",
        (ev: WheelEvent) => {
          ev.preventDefault();
          const factor = ev.deltaY < 0 ? 1.1 : 0.9;
          const nextZoom = Math.min(3.5, Math.max(0.35, Number((this.zoom * factor).toFixed(3))));
          const rect = svgEl.getBoundingClientRect();
          const mx = ev.clientX - rect.left;
          const my = ev.clientY - rect.top;
          this.panX = Math.round(mx - ((mx - this.panX) / this.zoom) * nextZoom);
          this.panY = Math.round(my - ((my - this.panY) / this.zoom) * nextZoom);
          this.zoom = nextZoom;
          viewportEl.setAttribute("transform", `translate(${this.panX}, ${this.panY}) scale(${this.zoom})`);
        },
        { passive: false },
      );
    }
  }

  private esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
}
