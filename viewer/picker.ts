/**
 * Tree-View Picker Panel (ADR 0007).
 *
 * Provides a collapsible, resizable left sidebar with an interactive directory
 * and file hierarchy. Users can select and deselect specific subdirectories
 * and files to dynamically focus or prune the visualizer graph and outline.
 */
import { type VizGraph, type VizNode, colorToken, cvar, scopeOfPath } from "./data.js";

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

  selectAll(): void {
    this.selectedFiles = null;
    this.render();
    this.onChange(null);
  }

  selectNone(): void {
    this.selectedFiles = new Set();
    this.render();
    this.onChange(this.selectedFiles);
  }

  setFilterQuery(q: string): void {
    this.filterQuery = q.trim().toLowerCase();
    this.render();
  }

  private isFileSelected(path: string): boolean {
    if (this.selectedFiles === null) return true;
    return this.selectedFiles.has(path);
  }

  private toggleDir(dirNode: DirTreeNode, shouldSelect: boolean): void {
    if (this.selectedFiles === null) {
      this.selectedFiles = new Set(this.allKnownFiles);
    }
    for (const f of dirNode.allFiles) {
      if (shouldSelect) {
        this.selectedFiles.add(f);
      } else {
        this.selectedFiles.delete(f);
      }
    }
    if (this.selectedFiles.size === this.allKnownFiles.length) {
      this.selectedFiles = null;
    }
    this.render();
    this.onChange(this.selectedFiles);
  }

  private toggleFile(filePath: string, shouldSelect: boolean): void {
    if (this.selectedFiles === null) {
      this.selectedFiles = new Set(this.allKnownFiles);
    }
    if (shouldSelect) {
      this.selectedFiles.add(filePath);
    } else {
      this.selectedFiles.delete(filePath);
    }
    if (this.selectedFiles.size === this.allKnownFiles.length) {
      this.selectedFiles = null;
    }
    this.render();
    this.onChange(this.selectedFiles);
  }

  render(): void {
    if (!this.rootNode) {
      this.host.innerHTML = '<div style="padding:10px;color:var(--muted);font-size:12px">No files</div>';
      return;
    }

    const total = this.allKnownFiles.length;
    const selectedCount = this.selectedFiles === null ? total : this.selectedFiles.size;
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

      // Checkbox
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "p-cb";

      if (node.isDir) {
        const selectedDescendants = node.allFiles.filter((f) => this.isFileSelected(f)).length;
        if (selectedDescendants === node.allFiles.length) {
          cb.checked = true;
          cb.indeterminate = false;
        } else if (selectedDescendants === 0) {
          cb.checked = false;
          cb.indeterminate = false;
        } else {
          cb.checked = false;
          cb.indeterminate = true;
        }

        cb.addEventListener("click", (ev) => {
          ev.stopPropagation();
          this.toggleDir(node, cb.checked);
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

        row.append(chev, cb, label, badge);

        row.addEventListener("click", () => {
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
        cb.checked = this.isFileSelected(node.path);
        cb.addEventListener("click", (ev) => {
          ev.stopPropagation();
          this.toggleFile(node.path, cb.checked);
        });

        // Scope color dot
        const dot = document.createElement("span");
        dot.className = "p-dot";
        dot.style.background = `var(${colorToken("code", "file", node.scope)})`;

        // File label
        const label = document.createElement("span");
        label.className = "p-label mono";
        label.textContent = node.name;
        label.title = node.path;

        // Node count badge
        const badge = document.createElement("span");
        badge.className = "p-badge";
        badge.textContent = `${node.nodeCount}`;

        // Indent placeholder for chevron
        const spacer = document.createElement("span");
        spacer.style.width = "12px";
        spacer.style.flex = "none";

        row.append(spacer, cb, dot, label, badge);
        row.addEventListener("click", () => {
          cb.checked = !cb.checked;
          this.toggleFile(node.path, cb.checked);
        });

        container.appendChild(row);
      }

      return container;
    };

    for (const child of this.rootNode.children) {
      const el = renderNode(child, 0);
      if (el) fragment.appendChild(el);
    }

    this.host.appendChild(fragment);
  }
}
