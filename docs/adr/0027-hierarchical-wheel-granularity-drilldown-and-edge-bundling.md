# ADR 0027: Hierarchical Wheel Granularity (Module/File/Symbol), In-Place Drill-Down, and Edge Bundling

## Status
Accepted (2026-10-31) — Enhances ADR 0025 (Circular Dependency Wheel Chord Diagram).

## Context & Problem Statement
The Circular Dependency Wheel (ADR 0025) provides a holistic 360° view of cross-tier coupling across the 5 Tripartite stages (`adrs`, `features`, `code`, `tests`, `docs`). However, in non-trivial codebases containing hundreds or thousands of granular symbols, two major ergonomic and visual challenges arise:
1. **Perimeter Symbol Overcrowding**: Displaying all granular functions and AST symbols simultaneously along a single circumference creates microscopic, illegible tick marks and label overlaps.
2. **Central Spiderweb Hairball**: When dozens of individual files in one subsystem (e.g., `viewer/`) communicate with files in another subsystem (e.g., `src/graph/`), unbundled quadratic chords passing through the origin $(cx, cy)$ intersect at arbitrary angles, forming a chaotic central knot.
3. **Missing Hierarchical Exploration**: Engineers need to inspect dependencies at multiple structural depths:
   - Macro architecture: How do top-level modules and directories interact?
   - Micro realization: Within a chosen module, which specific files and symbols drive those interactions?

Concentric multi-ring (Sunburst) layouts were evaluated but rejected as overly cluttered and difficult to navigate. Instead, a unified paradigm combining **Segmented Depth Modes**, **In-Place Arc Drill-Down**, and **Hierarchical Edge Bundling (HEB)** provides clarity and progressive disclosure.

## Decision Drivers
- **Three-Tier Granularity**: Explicit depth control across `📦 Module`, `📄 File` (default), and `⚡ Symbol`.
- **In-Place Arc Drill-Down**: Ability to expand a specific module arc directly on the wheel circumference to inspect its constituent files without losing full-system context.
- **Hierarchical Edge Bundling (HEB)**: Optional toggle that routes related chords through shared radial corridor waypoints, transforming central spiderwebs into clean arterial trunks.
- **Tripartite Alignment**: Preserves the 5 canonical perimeter sectors (`ADRs`, `Specs`, `Code`, `Tests`, `Docs`) and color-coded semantic edge families.
- **Unified Selection & Inspector Sync**: Selecting an arc, file, or chord synchronizes with `state.selectedNode` and the right-hand Inspector drawer.

## Decision Outcome & Architecture

### 1. Granularity Modes (`WheelDepth = "module" | "file" | "symbol"`)
- **`📦 Module Depth`**:
  - Nodes are aggregated by directory package prefix (e.g., `src/graph`, `src/mcp`, `viewer`, `features/parsing`, `docs/adr`).
  - Arcs on the perimeter represent entire packages with child count badges.
  - Chords represent total inter-package coupling (weight = count of constituent edges).
- **`📄 File Depth` (Default)**:
  - Symbols are aggregated into parent file containers via `aggregateGraphToParents`.
  - Arcs represent file modules (e.g., `extract.ts`, `native.ts`, `wheel-view.ts`).
  - Chords represent file-to-file import, `@covers:`, and `@adr:` links.
- **`⚡ Symbol Depth`**:
  - Full granular AST symbols (functions, types, BDD scenarios, ADR sections).

### 2. In-Place Arc Drill-Down
- In `Module` depth, double-clicking (or clicking the expand badge) on a module arc expands it in-place along its sector into its child files.
- The expanded arc occupies proportional angular space, rendering child file ticks along its sub-arc.
- A breadcrumb badge (`Zoom: <module-path> ✕`) appears in the Wheel control bar to collapse back to the macro view.
- Single-click on any arc selects it and illuminates all associated chords.

### 3. Hierarchical Edge Bundling Toggle (`bundleChords: boolean`)
- A toolbar toggle button `[ 🌿 Bundle Chords ]` toggles between direct and bundled chord routing:
  - **Direct Chords (`false`)**: Quadratic Bézier curves pulled toward center $(cx, cy)$ with tension factor $0.32$.
  - **Bundled Chords (`true`)**: Cubic Bézier curves routed through shared radial corridor control points ($R_{\text{bundle}} \approx R_{\text{in}} \times 0.55$). Parallel chords between the same subsystems merge into thick trunks through the disk interior before fanning out cleanly at destination sectors.

### 4. UI Toolbar Integration
```html
<div class="wheel-toolbar">
  <div class="ptool-group">
    <span class="ptool-label">Depth:</span>
    <button id="wheelDepthModule">📦 Module</button>
    <button id="wheelDepthFile" class="active">📄 File</button>
    <button id="wheelDepthSymbol">⚡ Symbol</button>
  </div>
  <div class="ptool-group">
    <button id="wheelBundleToggle" class="active">🌿 Bundle Chords</button>
  </div>
  <div id="wheelBreadcrumb" class="wheel-breadcrumb" hidden></div>
</div>
```

## Consequences & Verification
- **Positive**:
  - High-level architecture is immediately legible at Module depth with ~15–25 clean arcs.
  - Drill-down allows surgical inspection of a single subsystem without losing peripheral awareness of other stages.
  - Edge bundling eliminates central spiderwebs, making architectural flow corridors visually prominent.
- **Negative / Trade-offs**:
  - Aggregating graph nodes dynamically requires recomputing edge mappings when switching depth.
- **Verification**:
  - BDD feature `features/viz/core/wheel_granularity_drilldown_and_edge_bundling-31.feature`.
  - Unit & integration tests in `test/viz-wheel.test.ts`.
