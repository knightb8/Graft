# ADR 0022: Hierarchical Drill-Down and Crossing-Minimized Ordering in Stacked Flow Columns

## Status
Accepted (2026-10-30) — Amends and refines the Stacked Flow / Miller-Sankey column behaviors from ADR 0016.

## Context & Problem Statement
The Stacked Flow (Miller-Sankey) column view introduced in ADR 0016 provided a 5-stage lifecycle visualization (`ADRs` $\to$ `Features` $\to$ `Code` $\to$ `Tests` $\to$ `Docs`). However, practical usage revealed six severe usability and rendering defects (C1–C6 in the Graft Viz Cleanup Plan):

1. **C1 — Double-Click Expansion Failure**:
   The canvas event pipeline executed a full DOM replacement (`innerHTML = ...`) on `pointerup` whenever no movement occurred. Consequently, the second click of a double-click landed on a newly created DOM element, preventing the native `dblclick` event from ever reaching the target bar. Additionally, the first click toggled selection ON, and the second click toggled it OFF.
2. **C2 — All-or-Nothing Folder Explosion**:
   `folderGroupKeyOfNode` was hardcoded to evaluate only the top two path segments (e.g., `features/viz`). Expanding a folder immediately exploded all deeply nested files (e.g., everything in `features/viz/core/**`) at once, overwhelming the column with hundreds of small bars without intermediate navigation.
3. **C3 — Expanded Sibling Scattering**:
   Bars in a column were globally sorted by weight across the entire stage. When a folder was expanded, its child files were scattered across disparate vertical positions in the column rather than staying together where the parent folder had been located.
4. **C4 — Vertical Squashing and Overlap**:
   The column attempted to fit all bars within a fixed viewport height by scaling down bar heights (from 18px to 12px and smaller). In large codebases, this crushed bars into illegible 1px slivers and produced overlapping text labels. There was no vertical scrolling or virtualization.
5. **C5 — Ribbon Tangling and Spaghetti Crossings**:
   Because columns sorted bars independently by local weight rather than considering ribbon connections to adjacent stages, ribbons between columns crisscrossed chaotically, resembling tangled spaghetti.
6. **C6 — Stale Interaction State**:
   Layout offset caches (`barOffsets`) retained obsolete identifiers after nodes were expanded, collapsed, or filtered. Furthermore, directory collapse state (`collapsedDirs`) persisted inappropriately across tab switches and distinct graph loads.

## Decision Drivers
- **Rock-Solid Click Disambiguation**: Single clicks must reliably select bars and trace flows without destructive DOM teardown; double clicks must reliably toggle expansion.
- **Progressive Hierarchical Drill-Down**: Users must be able to expand one directory level at a time, with single-child path segments compacted cleanly.
- **Spatial Locality (Contiguous Children)**: Expanding a directory must expand its children within the parent's allocated vertical slot, preserving visual continuity.
- **Legible Typography & Column Scrolling**: Bars must never shrink below minimum legible height; columns must scroll vertically when contents exceed canvas height.
- **Crossing Minimization**: Adjacent column ribbons must be ordered using iterative barycenter sweeps (as in D3-Sankey) to produce clean, untangled laminar flows.
- **Clean State Lifecycle**: Expansion and layout caches must be automatically pruned and isolated across graph models.

## Decision Outcome & Architecture

### 1. Click vs. Contextual Menu & Chevron Expansion (C1)
- **Immediate Single-Click Selection**:
  - A simple left click on any bar immediately selects it and calculates directional blast attenuation across all stages without debounce latency or inter-element race conditions.
- **Right-Click & Ctrl-Click Context Menu**:
  - Right-clicking (or Ctrl/Cmd-clicking) on any bar opens a floating Context Menu with distinct, unambiguous actions:
    - 📂 **Expand Folder** / 📁 **Collapse Folder** (for directory groups)
    - ⚡ **Trace Lineage Blast** (initiates forward/reverse blast propagation)
    - 📂 **Expand All in Stage** / 📁 **Collapse All in Stage**
    - 📄 **Focus in Detail Inspector** (for file leaves)
    - 👁 **Hide Bar / Folder**
- **Chevron Hit-Area & Native Double-Click**:
  - The leading `▸` / `▾` chevron on folder bars provides a dedicated hit area that directly toggles folder expansion on single click.
  - Native double-click (`dblclick`) on folder bars remains supported as a direct keyboard/mouse shortcut without delaying single-click selection.

### 2. Progressive Drill-Down & Single-Child Chain Compaction (C2)
- **Arbitrary Depth Hierarchy**:
  - Replace the 2-level folder grouping with a full tree representation (`DirectoryTree`).
  - Expanding a folder bar reveals only its immediate children at depth $d + 1$.
- **Chain Compaction**:
  - Intermediate directories that contain only a single child directory (e.g., `src` $\to$ `adapters` $\to$ `sql`) are compacted into a single consolidated bar (e.g., `src/adapters/sql/`) to avoid unnecessary single-child columns or empty intermediate clicks.

```
Collapsed:  [ features/ (8 files) ]
Double-click:
Expanded:   [ features/viz/ (5 files) ]
            [ features/parsing/ (3 files) ]
```

### 3. Contiguous In-Place Child Placement (C3)
- When a folder bar expands, its child elements are placed contiguously within the vertical slot previously occupied by the parent folder.
- Column-wide weight sorting is applied hierarchically: top-level entries are sorted by weight, but child elements are sorted within their parent's localized vertical partition, preserving mental models and visual stability.

### 4. Minimum Bar Heights and Scrollable Columns (C4)
- **Minimum Legible Bar Height**: Enforce a strict minimum bar height of $20\text{px}$ and $4\text{px}$ inter-bar gap. Text labels are clipped with ellipsis rather than allowed to overlap vertically.
- **Independent Column Scrolling**: Each stage column is wrapped in an independent scroll container (or virtualized list). When the cumulative height of expanded bars exceeds the available viewport height, the column scrolls smoothly with a visible scrollbar indicator.

### 5. Crossing Minimization via Barycenter Sweeps (C5)
To eliminate ribbon crossings between adjacent stage columns:
- Implement two-sided barycenter sweeps (inspired by the classic Sugiyama framework and `d3-sankey`):
  1. For each node $v$ in column $C_k$, compute its forward barycenter based on the vertical positions of connected nodes in column $C_{k+1}$ weighted by ribbon strength:
     $$\text{Barycenter}(v) = \frac{\sum_{(v, u) \in E} y(u) \cdot W(v, u)}{\sum_{(v, u) \in E} W(v, u)}$$
  2. Perform alternating left-to-right and right-to-left sweeps across the 5 columns to iteratively sort bars within their local contiguous slots.
  3. Resolve overlaps with a relaxation pass that enforces minimum bar heights and gaps.

### 6. State Lifecycle & Cache Pruning (C6)
- **Offset Cache Invalidation**: On every expand, collapse, or filter event, `barOffsets` is cleanly rebuilt from scratch for only active, visible bar IDs.
- **Isolated View State**: Directory expansion sets are scoped to the active graph fingerprint and cleanly reset when switching datasets or tabs.
- **Dead Code Cleanup**: Remove unreferenced `hoveredBarId` leftovers and toolbar overlap glitches.

## Planned Modules
- `viewer/sankey.ts`: Complete engine/view separation; pure column layout, barycenter ordering, and drill-down tree logic.
- `viewer/main.ts`: Event orchestration, DOM binding, and scroll synchronization.

## Consequences

### Positive
- Reliable double-click expansion and single-click tracing without DOM destruction glitches.
- Progressive disclosure allows users to explore large codebases level-by-level without visual flooding.
- Sibling bars stay together in-place, eliminating confusing jumps.
- Barycenter ordering dramatically reduces ribbon tangle, resulting in clean, readable flows.
- Scrolling preserves readable labels and bars regardless of the number of expanded items.

### Negative / Trade-offs
- Column scrolling requires rendering ribbons against the scroll offsets of source and target columns, updating path vectors when a column is scrolled.
- Barycenter sweeps add a fast iterative sorting pass before rendering ribbons.
