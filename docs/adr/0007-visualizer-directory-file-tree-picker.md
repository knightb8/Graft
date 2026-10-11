# ADR 0007: Visualizer Directory and File Tree-View Picker Panel

## Context & Problem Statement
The Graft interactive visualizer (`graft viz`) allows users to filter nodes by architectural scope (`all`, `code`, `docs`, `specs`) and comma-separated directory exclusion names (ADR 0006). However, in medium-to-large codebases with intricate directory layouts, typing directory names into an exclusion text box is cumbersome when users want to selectively explore or compare specific subsystems (e.g. visualizing only `src/graph/` and `src/viz/`, or isolating a single subsystem alongside its corresponding `features/` directory).

Users need an interactive tree-view panel located on the left of the canvas where they can browse the hierarchy of directories and files, toggle checkboxes to select or deselect specific subdirectories and files, and observe the force-directed graph update dynamically.

## Decision Drivers
- **Interactive Exploration**: Provide an intuitive, IDE-like file tree sidebar on the left side of the visualizer to pick exact subtrees and files.
- **Hierarchical Checkbox Cascading**: Selecting or deselecting a directory cascades down to all descendant files and subdirectories. Partial selection displays an indeterminate checkbox state.
- **Collapsible & Resizable**: The left panel must be collapsible (via a toggle button) to maximise canvas space when needed, and resizable via a drag handle, persisting user width preferences.
- **Composable Filtering**: The file tree filter must compose cleanly with the existing tripartite scope filters (`code`, `docs`, `specs`) and directory exclusion filters.
- **Zero Overhead**: The tree must be constructed directly in the viewer from the in-memory `VizGraph` without requiring server round-trips or disk re-scans.

## Considered Options
1. **Modal / Dialog Picker**: An overlay modal opened from a toolbar button. (Rejected: hides the canvas while choosing files, preventing live visual feedback as selections change).
2. **Floating Popover**: A floating dropdown list. (Rejected: insufficient space for deep hierarchical file trees).
3. **Collapsible Left Sidebar Tree Panel with Checkboxes**: Accepted.

## Decision Outcome & Rationale
We implement a **Left Sidebar Tree-View Picker Panel** in the visualizer:
- **Component Architecture (`viewer/picker.ts` & `viewer/index.html`)**:
  - Placed on the left of the stage (`aside.sidebar-picker`), before the canvas wrapper.
  - A vertical drag resizer (`.resizer-left`) and a collapse/expand toggle button.
  - Quick action buttons: **All** (select all files) and **None** (clear selection).
  - Search input for fast tree filtering by file/folder name.
- **Hierarchical Selection Logic**:
  - Builds a trie/tree of directories and files from all node `sources` and paths present in the active graph.
  - Maintains `selectedFiles: Set<string> | null` (where `null` represents all files selected by default).
  - Parent directory checkboxes automatically reflect child states: checked (all selected), unchecked (none selected), or indeterminate (some selected).
- **Graph & Outline Integration**:
  - `matchNodeFilter` in `src/graph/filter.ts` and `viewer/data.ts` supports `selectedFiles?: Set<string>`.
  - When selection changes, `applyFilters()` updates `view.restyle()`, `renderChips()`, `renderLegend()`, `updateShownCount()`, and the outline tree.
