/**
 * graft viz — viewer entry point. Wires tabs, chips, legend, search, theme,
 * SSE live reload, and the three views (Context graph / Code graph / Outline).
 */
import {
  loadContextGraph, loadCodeGraph, onServerChange, chipKey, CHIP_HINT,
  colorToken, cvar, famOf, type VizGraph, type TripartiteScope, type ConcreteScope, matchNodeFilter,
  scopeOfNode, relationColor, clusterKeyOfNode, galaxyColorOfCluster, parentIdOfNode,
  evaluateTriStateFilter, type EdgeContractionMode, COSMOS_PRESETS, SankeyView,
} from "./data.js";
import { GraphView } from "./graph.js";
import { renderDetail } from "./detail.js";
import { renderOutline } from "./tree.js";
import { TreePicker } from "./picker.js";

type Tab = "context" | "code" | "outline";
type CanvasBase = "galaxy" | "sankey";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const rootEl = document.documentElement;

const state = {
  tab: "context" as Tab,
  canvasBase: "galaxy" as CanvasBase,
  context: null as VizGraph | null,
  code: null as VizGraph | null,
  outlineOpen: {} as Record<string, boolean>,
  selectedScopes: new Set<ConcreteScope>(["code", "docs", "specs"]),
  excludeDirs: [] as string[],
  selectedFiles: null as Set<string> | null,
};

function currentFilter() {
  return {
    scopes: state.selectedScopes,
    excludeDirs: state.excludeDirs,
    selectedFiles: state.selectedFiles ?? undefined,
  };
}

const view = new GraphView(($("graphContainer") || $("graphSvg")) as HTMLElement);
const sankeyView = new SankeyView($("sankeyContainer"));

const picker = new TreePicker(
  $("pickerTree"),
  $("pickerStats"),
  (selected) => {
    state.selectedFiles = selected;
    view.selectedFiles = selected ?? undefined;
    applyFilters();
  },
);

function tabSourceGraph(tab: Tab = state.tab): VizGraph | null {
  return tab === "context" ? state.context : state.code;
}

function activeGraph(): VizGraph | null {
  if (state.tab === "outline") return state.code;
  if (view.currentGraph && view.currentTab === graphTab()) {
    return view.currentGraph;
  }
  return tabSourceGraph();
}

function graphTab(): "context" | "code" {
  return state.tab === "code" || state.tab === "outline" ? "code" : "context";
}

function syncTriStateFilter(): void {
  const g = activeGraph();
  const tState = picker.getActiveState();
  if (g && (tState.activeReducePath || tState.circletracePath || tState.fileStates.size > 0)) {
    const filterResult = evaluateTriStateFilter({
      allNodeIds: g.nodes.map((n) => n.id),
      edges: g.edges,
      nodeStates: tState.fileStates,
      activeReduceId: tState.activeReducePath,
      circletraceId: tState.circletracePath,
      nodeMap: new Map(g.nodes.map((n) => [n.id, n])),
    });
    view.setTriStateFilter(filterResult);
  } else {
    view.setTriStateFilter(null);
  }
}

picker.onTriStateChange = () => {
  syncTriStateFilter();
  applyFilters();
};

/* ---------- chips: verbs actually present, grouped only where obvious ---------- */
function renderChips(): void {
  const host = $("edgeChips");
  host.innerHTML = '<span class="cap">Edges</span>';
  const graph = activeGraph();
  if (!graph) return;
  const counts = new Map<string, number>();
  for (const e of graph.edges) {
    const key = chipKey(e.relation);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const keys = [...counts.keys()].sort((a, b) => {
    const rank = (k: string) => (k === "part of" ? 0 : k === "uses" ? 1 : 2);
    return rank(a) - rank(b) || a.localeCompare(b);
  });
  for (const key of keys) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "echip" + (view.hiddenRels[key] ? "" : " on");
    btn.innerHTML = `${glyphFor(key)} ${key} <span style="opacity:.55">${counts.get(key)}</span>`;
    btn.title = (CHIP_HINT[key] ?? `"${key}" edges`) + " — click to " + (view.hiddenRels[key] ? "show" : "hide");
    if (!view.hiddenRels[key]) {
      btn.style.borderColor = (view.rainbowEdges ? relationColor(key) : (cvar("--edge") || "#3b4d54")) + "66";
    }
    btn.addEventListener("click", () => {
      view.hiddenRels[key] = !view.hiddenRels[key];
      renderChips();
      view.restyle();
      if (view.autoRebounce) {
        view.rebounceVisible();
      }
      if (state.canvasBase === "sankey") {
        syncSankeyView(false);
      }
      updateShownCount();
    });
    host.appendChild(btn);
  }
}

function glyphFor(key: string): string {
  const fam = key === "part of" ? "structure" : key === "uses" ? "dependency" : famOf(key.replace(/ /g, "_"));
  const color = view.rainbowEdges ? relationColor(key) : (cvar("--edge") || "#71828a");
  const glyphs: Record<string, string> = {
    structure: `<svg width="20" height="8" aria-hidden="true"><line x1="1" y1="4" x2="19" y2="4" stroke="${color}" stroke-width="3" opacity=".95"/></svg>`,
    dependency: `<svg width="20" height="8" aria-hidden="true"><line x1="1" y1="4" x2="14" y2="4" stroke="${color}" stroke-width="1.8"/><path d="M14,1 L19,4 L14,7 z" fill="${color}"/></svg>`,
    contract: `<svg width="20" height="8" aria-hidden="true"><line x1="1" y1="4" x2="13" y2="4" stroke="${color}" stroke-width="1.8"/><path d="M13,1 L19,4 L13,7 z" fill="${color}"/></svg>`,
    association: `<svg width="20" height="8" aria-hidden="true"><line x1="1" y1="4" x2="19" y2="4" stroke="${color}" stroke-width="1.8" stroke-dasharray="2 3"/></svg>`,
  };
  return glyphs[fam] ?? glyphs.association;
}

/* ---------- node-type legend ---------- */
function renderLegend(): void {
  const host = $("legend");
  host.innerHTML = "";
  const graph = activeGraph();
  if (!graph) return;
  const counts = new Map<string, number>();
  for (const n of graph.nodes) counts.set(n.type, (counts.get(n.type) ?? 0) + 1);
  for (const [type, count] of counts) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "lchip" + (view.hiddenTypes[type] ? " off" : "");
    const sample = graph.nodes.find((n) => n.type === type);
    const sampleScope = sample ? scopeOfNode(sample) : undefined;
    chip.innerHTML = `<span class="sw" style="background:${cvar(colorToken(graphTab(), type, sampleScope))}"></span>${type} <span style="color:var(--muted);font-weight:500">${count}</span>`;
    chip.addEventListener("click", () => {
      view.hiddenTypes[type] = !view.hiddenTypes[type];
      renderLegend();
      view.restyle();
      if (view.autoRebounce) {
        view.rebounceVisible();
      }
      if (state.canvasBase === "sankey") {
        syncSankeyView(false);
      }
      updateShownCount();
    });
    host.appendChild(chip);
  }

  // When parent aggregation is active on the Code tab, also display top subsystem
  // galaxy chips so the user can map canvas galaxy colors to subsystem directories
  // and click any chip to focus its galactic nucleus.
  if (state.tab === "code" && view.aggregateToParent) {
    const galaxyMap = new Map<string, { count: number; scope: string }>();
    for (const n of graph.nodes) {
      if (view.hiddenTypes[n.type] || !matchNodeFilter(n, currentFilter())) continue;
      const scope = scopeOfNode(n);
      const cKey = clusterKeyOfNode({ id: n.id, sources: n.sources, scope }).key;
      const prev = galaxyMap.get(cKey);
      if (prev) prev.count += 1;
      else galaxyMap.set(cKey, { count: 1, scope });
    }
    const topGalaxies = [...galaxyMap.entries()]
      .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
      .slice(0, 8);
    for (const [clusterKey, info] of topGalaxies) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "lchip lchip-galaxy";
      const swColor = galaxyColorOfCluster(clusterKey, info.scope);
      chip.innerHTML = `<span class="sw" style="background:${swColor}"></span>${clusterKey} <span style="color:var(--muted);font-weight:500">${info.count}</span>`;
      chip.title = `Subsystem galaxy "${clusterKey}" (${info.count} files) — click to focus hub`;
      chip.addEventListener("click", () => {
        view.focusCluster(clusterKey);
      });
      host.appendChild(chip);
    }
  }

  // A decoration toggle, not a type filter: it sits after the type chips, carries
  // its own class, and deliberately does NOT feed `updateShownCount` — hiding a
  // face hides no node.
  const graphHasOwners = graph.nodes.some((n) => n.owners?.length);
  if (graphHasOwners) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "lchip lchip-people" + (view.showOwners ? "" : " off");
    chip.innerHTML = `<span class="sw" style="background:${cvar("--con")}"></span>people`;
    chip.title = "Show who has worked on each area";
    chip.addEventListener("click", () => {
      view.showOwners = !view.showOwners;
      renderLegend();
      view.restyle();
    });
    host.appendChild(chip);
  }
}

function updateShownCount(): void {
  const graph = activeGraph();
  if (!graph) { $("lcount").textContent = ""; return; }
  const shown = graph.nodes.filter((n) => !view.hiddenTypes[n.type] && matchNodeFilter(n, currentFilter())).length;
  $("lcount").textContent = `${shown} / ${graph.nodes.length} nodes shown`;
}

function updateCounts(): void {
  const el = $("counts");
  if (state.tab === "outline" && state.code) {
    const files = state.code.nodes.filter((n) => n.type === "file" && matchNodeFilter(n, currentFilter())).length;
    const totalSyms = state.code.nodes.filter((n) => matchNodeFilter(n, currentFilter())).length;
    el.textContent = `${files} files · ${totalSyms} symbols`;
  } else {
    const graph = activeGraph();
    el.textContent = graph ? `${graph.meta.nodeCount} nodes · ${graph.meta.edgeCount} links` : "";
  }
}

/* ---------- detail panel ---------- */
function showDetail(id: string | null): void {
  renderDetail($("detail"), activeGraph(), graphTab(), id, (next) => {
    if (state.tab === "outline") {
      showDetail(next);
      renderOutline($("tree"), state.code!, next, state.outlineOpen, showDetail, currentFilter());
    } else if (state.canvasBase === "sankey") {
      sankeyView.select(next);
      showDetail(next);
    } else {
      view.focus(next);
    }
  });
}

view.onSelect = (id) => {
  sankeyView.selectedId = id;
  showDetail(id);
};

sankeyView.onSelect = (id) => {
  view.selected = id;
  view.restyle();
  showDetail(id);
};

function syncSankeyView(autoCollapse = false): void {
  const g = activeGraph();
  if (!g) return;
  const visibleNodes = g.nodes.filter((n) => !view.hiddenTypes[n.type] && matchNodeFilter(n, currentFilter()) && (!view.triStateResult || view.triStateResult.visibleIds.has(n.id)));
  const visSet = new Set(visibleNodes.map((n) => n.id));
  const visibleEdges = g.edges.filter((e) => visSet.has(e.source) && visSet.has(e.target) && !view.hiddenRels[chipKey(e.relation)]);
  sankeyView.setData(visibleNodes, visibleEdges, autoCollapse);
}

function setCanvasBase(base: CanvasBase): void {
  state.canvasBase = base;
  const isSankey = base === "sankey";
  const gEl = $("graphContainer");
  const sEl = $("sankeyContainer");
  const gBtn = $("baseGalaxyBtn");
  const sBtn = $("baseSankeyBtn");
  const galaxyGroup = $("galaxyViewGroup");
  const zoomCtl = document.querySelector<HTMLElement>(".zoomctl");

  if (gEl) gEl.hidden = isSankey;
  if (sEl) sEl.hidden = !isSankey;
  if (galaxyGroup) galaxyGroup.style.display = isSankey ? "none" : "";
  if (zoomCtl) zoomCtl.style.display = isSankey ? "none" : "";

  if (gBtn) {
    gBtn.classList.toggle("active", !isSankey);
    gBtn.style.background = !isSankey ? "var(--accent, #38bdf8)" : "";
    gBtn.style.color = !isSankey ? "#0b0e11" : "";
    gBtn.style.fontWeight = !isSankey ? "600" : "";
  }
  if (sBtn) {
    sBtn.classList.toggle("active", isSankey);
    sBtn.style.background = isSankey ? "var(--accent, #38bdf8)" : "";
    sBtn.style.color = isSankey ? "#0b0e11" : "";
    sBtn.style.fontWeight = isSankey ? "600" : "";
  }

  if (isSankey) {
    syncSankeyView(true);
  } else {
    view.reheat();
  }
}

$("baseGalaxyBtn")?.addEventListener("click", () => setCanvasBase("galaxy"));
$("baseSankeyBtn")?.addEventListener("click", () => setCanvasBase("sankey"));

/* ---------- tabs ---------- */
function setTab(tab: Tab): void {
  state.tab = tab;
  document.querySelectorAll<HTMLButtonElement>(".tab").forEach((b) => {
    b.setAttribute("aria-selected", b.dataset.tab === tab ? "true" : "false");
  });
  const isOutline = tab === "outline";
  $("canvasWrap").hidden = isOutline;
  $("outlineView").hidden = !isOutline;
  view.hiddenRels = {};
  view.hiddenTypes = {};
  view.selected = null;
  sankeyView.selectedId = null;
  showDetail(null);

  const empty = $("graphEmpty");
  if (tab === "outline") {
    if (state.code) renderOutline($("tree"), state.code, null, state.outlineOpen, showDetail, currentFilter());
    else {
      $("outlineView").hidden = true;
      $("canvasWrap").hidden = false;
      showEmpty("No code graph yet — run <code>graft graph</code> to generate <span class=\"mono\">graph.json</span>.");
    }
  } else {
    const raw = tabSourceGraph(tab);
    if (!raw || raw.nodes.length === 0) {
      showEmpty(raw?.meta.emptyNote ? escapeText(raw.meta.emptyNote) : (tab === "code"
        ? "No code graph yet — run <code>graft graph</code> to generate <span class=\"mono\">graph.json</span>."
        : "No context graph — run <code>graft init</code> first."));
    } else {
      empty.hidden = true;
      view.setData(raw, graphTab());
      picker.setGraph(raw);
      if (state.canvasBase === "sankey") {
        syncSankeyView(true);
      }
      if (typeof requestAnimationFrame !== "undefined") {
        requestAnimationFrame(() => {
          view.resetView();
        });
      }
    }
  }

  const aggChip = $("aggregateChip");
  if (aggChip) aggChip.style.display = tab === "code" ? "" : "none";
  renderChips();
  renderLegend();
  updateShownCount();
  updateCounts();
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

function showEmpty(html: string): void {
  const empty = $("graphEmpty");
  empty.innerHTML = html;
  empty.hidden = false;
}

document.querySelectorAll<HTMLButtonElement>(".tab").forEach((b) => {
  b.addEventListener("click", () => setTab(b.dataset.tab as Tab));
});

/* ---------- search ---------- */
const search = $("search") as HTMLInputElement;
search.addEventListener("input", () => {
  view.query = search.value.trim();
  view.restyle();
  if (state.canvasBase === "sankey") {
    sankeyView.dirFilterQuery = view.query;
    sankeyView.render();
  }
});
search.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && view.query) {
    const hit = view.firstMatch();
    if (hit) {
      if (state.canvasBase === "sankey") {
        sankeyView.select(hit.id);
        showDetail(hit.id);
      } else {
        view.focus(hit.id);
      }
    }
  }
});

/* ---------- scope & directory filtering ---------- */
function toggleScope(scope: ConcreteScope, enabled: boolean): void {
  if (enabled) {
    state.selectedScopes.add(scope);
  } else {
    state.selectedScopes.delete(scope);
  }
  view.scopes = state.selectedScopes;

  // Sync checkboxes across both canvas and outline filter bars
  document.querySelectorAll<HTMLInputElement>('input.scope-cb').forEach((cb) => {
    const s = (cb.dataset.scope ?? cb.dataset.outlineScope) as ConcreteScope;
    const isChecked = state.selectedScopes.has(s);
    if (cb.checked !== isChecked) cb.checked = isChecked;
    const parent = cb.closest(".scope-chip");
    if (parent) parent.classList.toggle("on", isChecked);
  });

  applyFilters();
}

function setExcluded(raw: string): void {
  const dirs = raw.split(",").map((s) => s.trim()).filter(Boolean);
  state.excludeDirs = dirs;
  view.excludeDirs = dirs;
  const in1 = $("excludeInput") as HTMLInputElement | null;
  const in2 = $("outlineExcludeInput") as HTMLInputElement | null;
  if (in1 && in1.value !== raw) in1.value = raw;
  if (in2 && in2.value !== raw) in2.value = raw;
  applyFilters();
}

function applyFilters(): void {
  syncTriStateFilter();
  view.scopes = state.selectedScopes;
  view.restyle();
  if (view.autoRebounce) {
    view.rebounceVisible();
  }
  if (state.canvasBase === "sankey") {
    syncSankeyView(false);
  }
  renderChips();
  renderLegend();
  updateShownCount();
  updateCounts();
  if (state.tab === "outline" && state.code) {
    renderOutline($("tree"), state.code, view.selected, state.outlineOpen, showDetail, currentFilter());
  }
}

document.querySelectorAll<HTMLInputElement>("input.scope-cb").forEach((cb) => {
  cb.addEventListener("change", () => {
    const s = (cb.dataset.scope ?? cb.dataset.outlineScope) as ConcreteScope;
    if (s) toggleScope(s, cb.checked);
  });
});

const transCb = $("transitiveCb") as HTMLInputElement | null;
transCb?.addEventListener("change", () => {
  view.showTransitive = transCb.checked;
  const parent = transCb.closest(".scope-chip");
  if (parent) parent.classList.toggle("on", transCb.checked);
  applyFilters();
});

/* ---------- view controls (aggregate, blooms, rainbow) ---------- */
const aggregateCb = $("aggregateCb") as HTMLInputElement | null;
aggregateCb?.addEventListener("change", () => {
  view.setAggregateToParent(aggregateCb.checked);
  const parent = aggregateCb.closest(".scope-chip");
  if (parent) parent.classList.toggle("on", aggregateCb.checked);
  if (view.selected && aggregateCb.checked) {
    const graph = activeGraph();
    if (graph && !graph.nodes.some((n) => n.id === view.selected)) {
      const pid = parentIdOfNode({ id: view.selected });
      view.selected = graph.nodes.some((n) => n.id === pid) ? pid : null;
      view.restyle();
    }
  }
  if (state.canvasBase === "sankey") {
    syncSankeyView(false);
  }
  renderChips();
  renderLegend();
  updateShownCount();
  updateCounts();
  showDetail(view.selected);
});

const bloomsCb = $("bloomsCb") as HTMLInputElement | null;
bloomsCb?.addEventListener("change", () => {
  view.setShowBlooms(bloomsCb.checked);
  const parent = bloomsCb.closest(".scope-chip");
  if (parent) parent.classList.toggle("on", bloomsCb.checked);
});

view.onBloomsThrottled = () => {
  if (bloomsCb) bloomsCb.checked = false;
  const parent = bloomsCb?.closest(".scope-chip");
  if (parent) {
    parent.classList.remove("on");
    parent.setAttribute("title", "Blooms auto-disabled to preserve 60fps render budget (>16ms)");
  }
};

const rainbowCb = $("rainbowCb") as HTMLInputElement | null;
rainbowCb?.addEventListener("change", () => {
  view.setRainbowEdges(rainbowCb.checked);
  const parent = rainbowCb.closest(".scope-chip");
  if (parent) parent.classList.toggle("on", rainbowCb.checked);
  renderChips();
});

const rebounceCb = $("rebounceCb") as HTMLInputElement | null;
rebounceCb?.addEventListener("change", () => {
  view.setAutoRebounce(rebounceCb.checked);
  const parent = rebounceCb.closest(".scope-chip");
  if (parent) parent.classList.toggle("on", rebounceCb.checked);
});

const contractionToggle = $("contractionToggle") as HTMLButtonElement | null;
const weightsMenu = $("weightsMenu") as HTMLDivElement | null;
const closeWeightsMenu = $("closeWeightsMenu") as HTMLButtonElement | null;

const sliderDep = $("sliderDependency") as HTMLInputElement | null;
const sliderCon = $("sliderContract") as HTMLInputElement | null;
const sliderAss = $("sliderAssociation") as HTMLInputElement | null;
const sliderStr = $("sliderStructure") as HTMLInputElement | null;
const sliderSup = $("sliderSupport") as HTMLInputElement | null;
const sliderGap = $("sliderClusterGap") as HTMLInputElement | null;

const valDep = $("valDependency");
const valCon = $("valContract");
const valAss = $("valAssociation");
const valStr = $("valStructure");
const valSup = $("valSupport");
const valGap = $("valClusterGap");

const toggleHeuristics = $("toggleHeuristics") as HTMLInputElement | null;
const btnResetWeights = $("btnResetWeights") as HTMLButtonElement | null;

function syncSliderUI() {
  const tuning = view.weightTuning;
  if (sliderDep && valDep) { sliderDep.value = String(tuning.dependency); valDep.textContent = String(tuning.dependency); }
  if (sliderCon && valCon) { sliderCon.value = String(tuning.contract); valCon.textContent = String(tuning.contract); }
  if (sliderAss && valAss) { sliderAss.value = String(tuning.association); valAss.textContent = String(tuning.association); }
  if (sliderStr && valStr) { sliderStr.value = String(tuning.structure); valStr.textContent = String(tuning.structure); }
  if (sliderSup && valSup) { sliderSup.value = String(tuning.supportWeight); valSup.textContent = String(tuning.supportWeight); }
  if (sliderGap && valGap) { sliderGap.value = String(tuning.clusterGap); valGap.textContent = String(tuning.clusterGap); }
  if (toggleHeuristics) { toggleHeuristics.checked = tuning.useHeuristics !== false; }

  const modeLabels: Record<EdgeContractionMode, string> = {
    coupled: "☍ Pull: Coupled ▾",
    code: "⚙ Pull: Code ▾",
    spec: "✓ Pull: Spec ▾",
    doc: "🗎 Pull: Doc ▾",
    directory: "📁 Pull: Directory ▾",
  };
  if (contractionToggle) {
    contractionToggle.textContent = modeLabels[view.contractionMode] ?? "☍ Pull ▾";
  }

  document.querySelectorAll<HTMLButtonElement>(".preset-btn").forEach((btn) => {
    const p = btn.getAttribute("data-cosmos-preset");
    btn.classList.toggle("active", p === view.contractionMode);
  });
}

// Initial sync of button labels and sliders with loaded/default config
syncSliderUI();

contractionToggle?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (weightsMenu) {
    weightsMenu.hidden = !weightsMenu.hidden;
    if (!weightsMenu.hidden) syncSliderUI();
  }
});

closeWeightsMenu?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (weightsMenu) weightsMenu.hidden = true;
});

document.addEventListener("click", (e) => {
  if (weightsMenu && !weightsMenu.hidden && !weightsMenu.contains(e.target as Node) && e.target !== contractionToggle) {
    weightsMenu.hidden = true;
  }
});

document.querySelectorAll<HTMLButtonElement>(".preset-btn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const preset = btn.getAttribute("data-cosmos-preset") as EdgeContractionMode;
    if (preset) {
      view.setContractionMode(preset);
      syncSliderUI();
    }
  });
});

sliderDep?.addEventListener("input", () => {
  const v = parseFloat(sliderDep.value);
  if (valDep) valDep.textContent = String(v);
  view.setWeightTuning({ dependency: v });
});
sliderCon?.addEventListener("input", () => {
  const v = parseFloat(sliderCon.value);
  if (valCon) valCon.textContent = String(v);
  view.setWeightTuning({ contract: v });
});
sliderAss?.addEventListener("input", () => {
  const v = parseFloat(sliderAss.value);
  if (valAss) valAss.textContent = String(v);
  view.setWeightTuning({ association: v });
});
sliderStr?.addEventListener("input", () => {
  const v = parseFloat(sliderStr.value);
  if (valStr) valStr.textContent = String(v);
  view.setWeightTuning({ structure: v });
});
sliderSup?.addEventListener("input", () => {
  const v = parseFloat(sliderSup.value);
  if (valSup) valSup.textContent = String(v);
  view.setWeightTuning({ supportWeight: v });
});
sliderGap?.addEventListener("input", () => {
  const v = parseInt(sliderGap.value, 10);
  if (valGap) valGap.textContent = String(v);
  view.setWeightTuning({ clusterGap: v });
});
toggleHeuristics?.addEventListener("change", () => {
  view.setWeightTuning({ useHeuristics: toggleHeuristics.checked });
});
btnResetWeights?.addEventListener("click", (e) => {
  e.stopPropagation();
  view.setContractionMode("coupled");
  view.setWeightTuning({ ...COSMOS_PRESETS.coupled });
  syncSliderUI();
});

$("excludeInput")?.addEventListener("input", (ev) => {
  setExcluded((ev.target as HTMLInputElement).value);
});
$("outlineExcludeInput")?.addEventListener("input", (ev) => {
  setExcluded((ev.target as HTMLInputElement).value);
});

/* ---------- zoom controls ---------- */
$("zin").addEventListener("click", () => view.zoomBy(1.25));
$("zout").addEventListener("click", () => view.zoomBy(1 / 1.25));
$("zreset").addEventListener("click", () => view.resetView());

/* ---------- theme ---------- */
const THEME_KEY = "graft-viz-theme";
const savedTheme = localStorage.getItem(THEME_KEY);
if (savedTheme) document.documentElement.setAttribute("data-theme", savedTheme);
$("themeBtn").addEventListener("click", () => {
  const root = document.documentElement;
  const current = root.getAttribute("data-theme");
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = current ? current === "dark" : systemDark;
  const next = isDark ? "light" : "dark";
  root.setAttribute("data-theme", next);
  localStorage.setItem(THEME_KEY, next);
  view.restyle();
  renderChips();
  renderLegend();
  showDetail(view.selected);
});

/* ---------- files picker controls ---------- */
$("pickerAll")?.addEventListener("click", () => picker.selectAll());
$("pickerNone")?.addEventListener("click", () => picker.selectNone());
$("pickerSearch")?.addEventListener("input", (ev) => {
  picker.setFilterQuery((ev.target as HTMLInputElement).value);
});

/* ---------- resizable left files panel ---------- */
const PICKER_W_KEY = "graft-viz-picker-w";
const PICKER_COLLAPSED_KEY = "graft-viz-picker-collapsed";
const MIN_PICKER = 160;

function setPickerWidth(px: number, persist = true): void {
  const w = Math.min(Math.max(MIN_PICKER, Math.round(px)), Math.round(window.innerWidth * 0.45));
  rootEl.style.setProperty("--picker-w", `${w}px`);
  if (persist) localStorage.setItem(PICKER_W_KEY, String(w));
}
const savedPickerW = Number(localStorage.getItem(PICKER_W_KEY));
if (Number.isFinite(savedPickerW) && savedPickerW >= MIN_PICKER) setPickerWidth(savedPickerW, false);

function setPickerCollapsed(collapsed: boolean, persist = true): void {
  const panel = $("pickerPanel");
  const resizer = $("pickerResizer");
  const openTab = $("pickerOpenTab");
  if (!panel) return;
  panel.hidden = collapsed;
  if (resizer) resizer.hidden = collapsed;
  if (openTab) openTab.hidden = !collapsed;
  if (persist) localStorage.setItem(PICKER_COLLAPSED_KEY, collapsed ? "1" : "0");
  view.reheat();
}

const savedCollapsed = localStorage.getItem(PICKER_COLLAPSED_KEY) === "1";
if (savedCollapsed) setPickerCollapsed(true, false);

$("pickerCollapse")?.addEventListener("click", () => setPickerCollapsed(true));
$("pickerOpenTab")?.addEventListener("click", () => setPickerCollapsed(false));
$("pickerToggleAppbar")?.addEventListener("click", () => {
  const panel = $("pickerPanel");
  setPickerCollapsed(!panel.hidden);
});

const pickerResizer = $("pickerResizer");
let draggingPicker = false;
pickerResizer?.addEventListener("pointerdown", (ev) => {
  const pe = ev as PointerEvent;
  draggingPicker = true;
  pickerResizer.setPointerCapture(pe.pointerId);
  document.body.style.cursor = "col-resize";
  ev.preventDefault();
});
pickerResizer?.addEventListener("pointermove", (ev) => {
  if (!draggingPicker) return;
  const stage = $("stage");
  const stageLeft = stage.getBoundingClientRect().left;
  setPickerWidth((ev as PointerEvent).clientX - stageLeft);
});
const endPickerDrag = (ev: Event): void => {
  if (!draggingPicker) return;
  draggingPicker = false;
  document.body.style.cursor = "";
  try { pickerResizer?.releasePointerCapture((ev as PointerEvent).pointerId); } catch {}
  view.reheat();
};
pickerResizer?.addEventListener("pointerup", endPickerDrag);
pickerResizer?.addEventListener("pointercancel", endPickerDrag);

/* ---------- resizable detail panel ---------- */
const DETAIL_W_KEY = "graft-viz-detail-w";
const MIN_DETAIL = 220;
const clampDetail = (px: number): number =>
  Math.min(Math.max(MIN_DETAIL, Math.round(window.innerWidth * 0.6)), Math.max(MIN_DETAIL, Math.round(px)));
function setDetailWidth(px: number, persist = true): void {
  const w = clampDetail(px);
  rootEl.style.setProperty("--detail-w", `${w}px`);
  if (persist) localStorage.setItem(DETAIL_W_KEY, String(w));
}
const savedDetailW = Number(localStorage.getItem(DETAIL_W_KEY));
if (Number.isFinite(savedDetailW) && savedDetailW >= MIN_DETAIL) setDetailWidth(savedDetailW, false);

const resizer = $("detailResizer");
let draggingDetail = false;
resizer.addEventListener("pointerdown", (ev) => {
  const pe = ev as PointerEvent;
  draggingDetail = true;
  resizer.setPointerCapture(pe.pointerId);
  document.body.style.cursor = "col-resize";
  ev.preventDefault();
});
resizer.addEventListener("pointermove", (ev) => {
  if (!draggingDetail) return;
  // panel is flush to the window's right edge: width = distance from cursor to that edge.
  setDetailWidth(window.innerWidth - (ev as PointerEvent).clientX);
});
const endDetailDrag = (ev: Event): void => {
  if (!draggingDetail) return;
  draggingDetail = false;
  document.body.style.cursor = "";
  try { resizer.releasePointerCapture((ev as PointerEvent).pointerId); } catch { /* not captured */ }
  view.reheat();
};
resizer.addEventListener("pointerup", endDetailDrag);
resizer.addEventListener("pointercancel", endDetailDrag);
resizer.addEventListener("keydown", (ev) => {
  const ke = ev as KeyboardEvent;
  if (ke.key !== "ArrowLeft" && ke.key !== "ArrowRight") return;
  const step = ke.shiftKey ? 40 : 16;
  const cur = $("detail").getBoundingClientRect().width;
  setDetailWidth(cur + (ke.key === "ArrowLeft" ? step : -step));
  view.reheat();
  ev.preventDefault();
});

/* ---------- data loading + live reload ---------- */
async function loadAll(): Promise<void> {
  const [context, code] = await Promise.all([loadContextGraph(), loadCodeGraph()]);
  state.context = context;
  state.code = code;
  // The subtitle only exists on an exported page (`graft viz --export --title`),
  // where the same file is published per pull request and the reader needs to know
  // WHICH one they opened.
  const where = [context.meta.repoName, context.meta.subtitle].filter(Boolean).join(" · ");
  $("repoName").textContent = where;
  document.title = `graft viz — ${where}`;
  // A blast export ships one tab: its Code tab would be the repo's whole wiring
  // graph, which answers nothing about the pull request the page is about.
  const tabs = context.meta.tabs;
  if (tabs) {
    document.querySelectorAll<HTMLButtonElement>(".tab").forEach((b) => {
      b.hidden = !tabs.includes(b.dataset.tab as Tab);
    });
  }
  // An exported page says which tab holds its content: a structural build has no
  // concept nodes, so the default Context tab would open on an empty canvas.
  const wanted = context.meta.defaultTab;
  setTab(wanted && wanted !== state.tab ? wanted : state.tab);
}

onServerChange(() => {
  const selected = view.selected;
  void loadAll().then(() => {
    if (selected) { view.selected = selected; view.restyle(); showDetail(selected); }
  });
});

void loadAll();
