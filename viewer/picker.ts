/**
 * Tree-View Picker Panel (ADR 0007).
 *
 * Provides a collapsible, resizable left sidebar with an interactive directory
 * and file hierarchy. Users can select and deselect specific subdirectories
 * and files to dynamically focus or prune the visualizer graph and outline.
 */
import { type VizGraph, type VizNode, colorToken, cvar, scopeOfPath, type TriState } from "./data.js";

export interface DirTreeNode {
  name: string;
  path: string;
  isDir: boolean;
  scope?: "code" | "docs" | "specs";
  nodeCount: number;
  children: DirTreeNode[];
  allFiles: string[];
}

function getFileForNode(node: VizNode): string | null {
  if (node.sources && node.sources.length > 0) {
    const p = node.sources[0].split(" · ")[0].trim().replace(/\\/g, "/");
    if (p) return p;
  }
  if (node.id && node.id.includes("/")) {
    const p = node.id.split("#")[0].trim().replace(/\\/g, "/");
    if (p) return p;
  }
  return null;
}

/** Build a hierarchical directory and file tree from a VizGraph's nodes. */
export function buildFileTree(graph: VizGraph): DirTreeNode {
  const fileNodes = new Map<string, { count: number; scope: "code" | "docs" | "specs" }>();

  for (const n of graph.nodes) {
    const f = getFileForNode(n);
    if (!f) continue;
    const existing = fileNodes.get(f);
    if (existing) {
      existing.count += 1;
    } else {
      fileNodes.set(f, { count: 1, scope: scopeOfPath(f) });
    }
  }

  interface IntermediateDir {
    name: string;
    path: string;
    dirs: Map<string, IntermediateDir>;
    files: Map<string, { name: string; path: string; count: number; scope: "code" | "docs" | "specs" }>;
  }

  const root: IntermediateDir = { name: "", path: "", dirs: new Map(), files: new Map() };

  for (const [filePath, info] of fileNodes) {
    const parts = filePath.split("/");
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      const curPath = parts.slice(0, i + 1).join("/");
      if (!cur.dirs.has(seg)) {
        cur.dirs.set(seg, { name: seg, path: curPath, dirs: new Map(), files: new Map() });
      }
      cur = cur.dirs.get(seg)!;
    }
    const fileName = parts[parts.length - 1];
    cur.files.set(fileName, { name: fileName, path: filePath, count: info.count, scope: info.scope });
  }

  function convert(inter: IntermediateDir): DirTreeNode {
    const children: DirTreeNode[] = [];
    const allFiles: string[] = [];

    // Sort subdirectories alphabetically
    const sortedDirs = [...inter.dirs.keys()].sort((a, b) => a.localeCompare(b));
    for (const d of sortedDirs) {
      const childNode = convert(inter.dirs.get(d)!);
      children.push(childNode);
      allFiles.push(...childNode.allFiles);
    }

    // Sort files alphabetically
    const sortedFiles = [...inter.files.keys()].sort((a, b) => a.localeCompare(b));
    for (const f of sortedFiles) {
      const fileData = inter.files.get(f)!;
      allFiles.push(fileData.path);
      children.push({
        name: fileData.name,
        path: fileData.path,
        isDir: false,
        scope: fileData.scope,
        nodeCount: fileData.count,
        children: [],
        allFiles: [fileData.path],
      });
    }

    const totalNodes = children.reduce((sum, c) => sum + c.nodeCount, 0);

    return {
      name: inter.name || "root",
      path: inter.path,
      isDir: true,
      nodeCount: totalNodes,
      children,
      allFiles,
    };
  }

  return convert(root);
}

export class TreePicker {
  private host: HTMLElement;
  private statsEl: HTMLElement | null;
  private rootNode: DirTreeNode | null = null;
  private allKnownFiles: string[] = [];
  private selectedFiles: Set<string> | null = null; // null = all selected
  private openDirs = new Set<string>();
  private filterQuery = "";
  private onChange: (selected: Set<string> | null) => void;

  public fileStates = new Map<string, TriState>();
  public activeReducePath: string | null = null;
  public circletracePath: string | null = null;
  public onTriStateChange?: (state: {
    fileStates: Map<string, TriState>;
    activeReducePath: string | null;
    circletracePath: string | null;
  }) => void;

  constructor(
    host: HTMLElement,
    statsEl: HTMLElement | null,
    onChange: (selected: Set<string> | null) => void,
  ) {
    this.host = host;
    this.statsEl = statsEl;
    this.onChange = onChange;
  }

  setGraph(graph: VizGraph): void {
    this.rootNode = buildFileTree(graph);
    this.allKnownFiles = [...this.rootNode.allFiles];
    // Default open top-level directories
    for (const c of this.rootNode.children) {
      if (c.isDir) this.openDirs.add(c.path);
    }
    this.render();
  }

  getSelectedFiles(): Set<string> | null {
    return this.selectedFiles;
  }

  getActiveState(): {
    fileStates: Map<string, TriState>;
    activeReducePath: string | null;
    circletracePath: string | null;
  } {
    return {
      fileStates: this.fileStates,
      activeReducePath: this.activeReducePath,
      circletracePath: this.circletracePath,
    };
  }

  private notifyTriStateChange(): void {
    const excluded = new Set<string>();
    for (const [f, st] of this.fileStates) {
      if (st === "excluded") excluded.add(f);
    }
    if (excluded.size === 0) {
      this.selectedFiles = null;
    } else {
      this.selectedFiles = new Set(this.allKnownFiles.filter((f) => !excluded.has(f)));
    }

    this.onChange(this.selectedFiles);
    if (this.onTriStateChange) {
      this.onTriStateChange({
        fileStates: this.fileStates,
        activeReducePath: this.activeReducePath,
        circletracePath: this.circletracePath,
      });
    }
  }

  selectAll(): void {
    this.fileStates.clear();
    this.activeReducePath = null;
    this.circletracePath = null;
    this.selectedFiles = null;
    this.render();
    this.notifyTriStateChange();
  }

  selectNone(): void {
    this.fileStates.clear();
    for (const f of this.allKnownFiles) {
      this.fileStates.set(f, "excluded");
    }
    this.activeReducePath = null;
    this.circletracePath = null;
    this.selectedFiles = new Set();
    this.render();
    this.notifyTriStateChange();
  }

  setFilterQuery(q: string): void {
    this.filterQuery = q.trim().toLowerCase();
    this.render();
  }

  isFileSelected(path: string): boolean {
    const st = this.fileStates.get(path) ?? "neutral";
    return st !== "excluded";
  }

  getDirState(dirNode: DirTreeNode): TriState | "mixed" {
    if (dirNode.allFiles.length === 0) return "neutral";
    let pinnedCount = 0;
    let excludedCount = 0;
    let neutralCount = 0;
    for (const f of dirNode.allFiles) {
      const st = this.fileStates.get(f) ?? "neutral";
      if (st === "pinned") pinnedCount++;
      else if (st === "excluded") excludedCount++;
      else neutralCount++;
    }
    if (pinnedCount === dirNode.allFiles.length) return "pinned";
    if (excludedCount === dirNode.allFiles.length) return "excluded";
    if (neutralCount === dirNode.allFiles.length) return "neutral";
    return "mixed";
  }

  cycleFileState(filePath: string): void {
    const current = this.fileStates.get(filePath) ?? "neutral";
    let next: TriState = "neutral";
    if (current === "neutral") next = "pinned";
    else if (current === "pinned") next = "excluded";
    else next = "neutral";

    if (next === "neutral") {
      this.fileStates.delete(filePath);
    } else {
      this.fileStates.set(filePath, next);
    }
    this.render();
    this.notifyTriStateChange();
  }

  cycleDirState(dirNode: DirTreeNode): void {
    const current = this.getDirState(dirNode);
    let next: TriState = "neutral";
    if (current === "neutral") next = "pinned";
    else if (current === "pinned") next = "excluded";
    else if (current === "excluded") next = "neutral";
    else next = "pinned";

    for (const f of dirNode.allFiles) {
      if (next === "neutral") {
        this.fileStates.delete(f);
      } else {
        this.fileStates.set(f, next);
      }
    }
    this.render();
    this.notifyTriStateChange();
  }

  toggleDir(dirNode: DirTreeNode, shouldSelect: boolean): void {
    for (const f of dirNode.allFiles) {
      if (shouldSelect) {
        this.fileStates.delete(f);
      } else {
        this.fileStates.set(f, "excluded");
      }
    }
    this.render();
    this.notifyTriStateChange();
  }

  toggleFile(filePath: string, shouldSelect: boolean): void {
    if (shouldSelect) {
      this.fileStates.delete(filePath);
    } else {
      this.fileStates.set(filePath, "excluded");
    }
    this.render();
    this.notifyTriStateChange();
  }

  render(): void {
    if (!this.rootNode) {
      this.host.innerHTML = '<div style="padding:10px;color:var(--muted);font-size:12px">No files</div>';
      return;
    }

    const total = this.allKnownFiles.length;
    const excludedCount = [...this.fileStates.values()].filter((s) => s === "excluded").length;
    const selectedCount = total - excludedCount;
    if (this.statsEl) {
      this.statsEl.textContent = `${selectedCount}/${total}`;
    }

    this.host.innerHTML = "";
    const fragment = document.createDocumentFragment();

    const matchesFilter = (node: DirTreeNode): boolean => {
      if (!this.filterQuery) return true;
      if (node.path.toLowerCase().includes(this.filterQuery)) return true;
      if (node.isDir) {
        return node.children.some(matchesFilter);
      }
      return false;
    };

    const renderNode = (node: DirTreeNode, depth: number): HTMLElement | null => {
      if (!matchesFilter(node)) return null;

      const container = document.createElement("div");
      container.className = "p-item";

      const row = document.createElement("div");
      row.className = "p-row";
      row.style.paddingLeft = `${depth * 14 + 4}px`;

      if (node.isDir) {
        const dirSt = this.getDirState(node);
        if (dirSt === "pinned") row.classList.add("p-row-pinned");
        else if (dirSt === "excluded") row.classList.add("p-row-excluded");

        if (this.activeReducePath === node.path) row.classList.add("p-row-reduce");
        if (this.circletracePath === node.path) row.classList.add("p-row-circle");

        // Tri-state button
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "p-tristate";
        if (dirSt === "pinned") {
          btn.classList.add("p-tri-pinned");
          btn.textContent = "✓";
          btn.title = "All pinned — click to exclude directory";
        } else if (dirSt === "excluded") {
          btn.classList.add("p-tri-excluded");
          btn.textContent = "×";
          btn.title = "All excluded — click to clear";
        } else if (dirSt === "mixed") {
          btn.classList.add("p-tri-mixed");
          btn.textContent = "−";
          btn.title = "Partially filtered — click to pin all";
        } else {
          btn.classList.add("p-tri-neutral");
          btn.textContent = "";
          btn.title = "Neutral — click to pin all";
        }

        btn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          this.cycleDirState(node);
        });

        // Chevron
        const isOpen = this.openDirs.has(node.path) || Boolean(this.filterQuery);
        const chev = document.createElement("span");
        chev.className = `p-chev${isOpen ? " open" : ""}`;
        chev.textContent = "▶";

        // Label
        const label = document.createElement("span");
        label.className = "p-label mono";
        label.textContent = node.name;
        label.title = node.path;

        // Badge
        const badge = document.createElement("span");
        badge.className = "p-badge";
        badge.textContent = `${node.allFiles.length}f`;

        row.append(chev, btn, label, badge);

        row.addEventListener("click", (ev) => {
          if (ev.shiftKey) {
            this.circletracePath = this.circletracePath === node.path ? null : node.path;
            this.activeReducePath = null;
            this.render();
            this.notifyTriStateChange();
            return;
          }
          if (this.openDirs.has(node.path)) {
            this.openDirs.delete(node.path);
          } else {
            this.openDirs.add(node.path);
          }
          this.render();
        });

        container.appendChild(row);

        if (isOpen) {
          const kids = document.createElement("div");
          kids.className = "p-children";
          for (const c of node.children) {
            const el = renderNode(c, depth + 1);
            if (el) kids.appendChild(el);
          }
          container.appendChild(kids);
        }
      } else {
        const fileSt = this.fileStates.get(node.path) ?? "neutral";
        if (fileSt === "pinned") row.classList.add("p-row-pinned");
        else if (fileSt === "excluded") row.classList.add("p-row-excluded");

        if (this.activeReducePath === node.path) row.classList.add("p-row-reduce");
        if (this.circletracePath === node.path) row.classList.add("p-row-circle");

        // Tri-state button
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "p-tristate";
        if (fileSt === "pinned") {
          btn.classList.add("p-tri-pinned");
          btn.textContent = "✓";
          btn.title = "Pinned (in focus lineage) — click to exclude";
        } else if (fileSt === "excluded") {
          btn.classList.add("p-tri-excluded");
          btn.textContent = "×";
          btn.title = "Excluded (hidden) — click to clear";
        } else {
          btn.classList.add("p-tri-neutral");
          btn.textContent = "";
          btn.title = "Neutral — click to pin";
        }

        btn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          this.cycleFileState(node.path);
        });

        // Scope color dot
        const dot = document.createElement("span");
        dot.className = "p-dot";
        dot.style.background = `var(${colorToken("code", "file", node.scope)})`;

        // File label
        const label = document.createElement("span");
        label.className = "p-label mono";
        label.textContent = node.name;
        label.title = `${node.path} (Click to reduce, Shift+Click for Circletrace)`;

        // Circletrace action button
        const circleBtn = document.createElement("button");
        circleBtn.type = "button";
        circleBtn.className = "p-circle-btn" + (this.circletracePath === node.path ? " active" : "");
        circleBtn.textContent = "◎";
        circleBtn.title = "Circletrace blast radius (or Shift+Click)";
        circleBtn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          this.circletracePath = this.circletracePath === node.path ? null : node.path;
          this.activeReducePath = null;
          this.render();
          this.notifyTriStateChange();
        });

        // Node count badge
        const badge = document.createElement("span");
        badge.className = "p-badge";
        badge.textContent = `${node.nodeCount}`;

        // Indent placeholder for chevron
        const spacer = document.createElement("span");
        spacer.style.width = "12px";
        spacer.style.flex = "none";

        row.append(spacer, btn, dot, label, circleBtn, badge);

        row.addEventListener("click", (ev) => {
          if (ev.shiftKey) {
            this.circletracePath = this.circletracePath === node.path ? null : node.path;
            this.activeReducePath = null;
          } else {
            this.activeReducePath = this.activeReducePath === node.path ? null : node.path;
            this.circletracePath = null;
          }
          this.render();
          this.notifyTriStateChange();
        });

        container.appendChild(row);
      }

      return container;
    };

    for (const child of this.rootNode.children) {
      const el = renderNode(child, 0);
      if (el) fragment.appendChild(el);
    }

    const hasActiveFilter = Boolean(this.activeReducePath || this.circletracePath || this.fileStates.size > 0);
    if (hasActiveFilter) {
      const ghostBar = document.createElement("div");
      ghostBar.className = "p-ghost-stub";
      let msg = "";
      if (this.circletracePath) {
        const name = this.circletracePath.split("/").pop();
        msg = `Circletrace: ${name}`;
      } else if (this.activeReducePath) {
        const name = this.activeReducePath.split("/").pop();
        msg = `Reduced to: ${name}`;
      } else {
        const exc = [...this.fileStates.values()].filter((s) => s === "excluded").length;
        const pin = [...this.fileStates.values()].filter((s) => s === "pinned").length;
        msg = `${exc + pin} items filtered`;
      }
      ghostBar.innerHTML = `<span style="font-weight:600">⚡ ${msg}</span><span style="opacity:0.75;margin-left:6px;font-size:10.5px">click to reset</span>`;
      ghostBar.addEventListener("click", () => {
        this.selectAll();
      });
      fragment.appendChild(ghostBar);
    }

    this.host.appendChild(fragment);
  }
}
