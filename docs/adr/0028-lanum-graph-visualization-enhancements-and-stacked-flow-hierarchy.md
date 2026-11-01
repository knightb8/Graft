# ADR 0028: Lanum Graph Visualization Enhancements and Stacked Flow Hierarchy & Blast Consistency

## Status
Accepted (2026-11-01) — Extends ADR 0016, ADR 0019, ADR 0020, and ADR 0022.

## Context & Problem Statement
A review of Graft's visualizers against Corey L. Lanum's *Visualizing Graph Data* (Manning, 2017) alongside practical testing of the Stacked Lifecycle Flow (`SankeyView`) identified two sets of improvements:

### A. Stacked Lifecycle Flow (`SankeyView`) Structural & Interaction Issues
1. **Blast Trace Selection Inconsistencies**:
   - Cross-view selection callbacks in `viewer/main.ts` updated `sankeyView.selectedId` without updating `sankeyView.selectedBarIds`, leaving stale folder member arrays active when switching views or clicking in the Detail Inspector.
   - `sankeyView.select(id)` did not resolve directory group identifiers (`dir:<stage>:<path>`) into constituent member node IDs.
   - Directional blast transitions blocked upstream provenance from `DEP_PREREQ` (`Test --uses--> Code <--covers-- Spec`) and downstream test discovery from `DOWN_REALIZE` (`ADR -> Spec -> Code <--uses-- Test`), as well as 1-hop reverse `references` from a `SEED` node.
   - Ribbon blast highlighting (`src.inLineage && tgt.inLineage`) lit up ribbons between two partially affected folder bars even when no active blast edge crossed between them.
2. **Loss of Directory Hierarchy per Column**:
   - In flat mode (or when expanding folders), bars lacked persistent `parentDir` and `depth` metadata, causing `orderBarsByBarycenter` to merge all bars into a single global block and scramble files from different directories across the column.
   - Expanding a directory removed the parent directory header bar entirely, removing the visual folder boundary and the `▾` chevron needed to collapse the folder back in place.
3. **Unintended Node & Column Dragging**:
   - Allowing freeform 2D dragging of individual bars and columns in a layered Sankey diagram violated layered layout discipline (Lanum Ch. 7) and required a custom `pointerup` 320ms click/double-click timer that interfered with rapid selection toggling.
4. **Lack of Explicit Column Sorting Metrics**:
   - Users could not switch column ordering between crossing-minimized barycenter flow, strict directory tree hierarchy, alphabetical name, or coupling weight/degree.

### B. Lanum Graph Visualization Enhancements (Ch. 5, 6, 7, 8)
1. **Overview Minimap / Radar Window (Ch. 6, Fig 6.4)**:
   - When zoomed into local symbols in Cosmos view, users lose global orientation across the architecture.
2. **Two-Degree Focus Halos (Ch. 6, Fig 6.10)**:
   - Binary focus (selected vs. dimmed) fails to distinguish 1-hop direct dependencies (100% prominence) from 2-hop transitive blast neighborhoods (~55% prominence).
3. **Interactive Cluster Combos & Multi-Link Conduit Rollup (Ch. 5 & Ch. 8)**:
   - Rendering all individual files simultaneously creates link clutter at low zoom. Users need in-place directory **Combo Nodes** (sized non-linearly by $\sqrt{N}$) that roll up inter-cluster edges into weighted conduits ($\text{width} \propto \log_2(\text{count} + 1)$) and expand/collapse on double-click.
4. **Smooth Layout Transition Animation (Ch. 6, Sec 6.4)**:
   - Instantaneous coordinate snapping when switching layouts (Force $\leftrightarrow$ Concentric $\leftrightarrow$ Stress-SGD) breaks spatial memory; positions should interpolate smoothly over ~250–300ms.

## Decision Outcome

### 1. Stacked Lifecycle Flow: Blast Consistency, Intact Hierarchy, Fixed Slots, and Sorting
- **Edge-Verified Blast Trace**:
  - Synchronize `selectedId` and `selectedBarIds` through `sankeyView.select(id)`, resolving folder bars (`dir:...`) to their member node IDs.
  - Allow `DEP_PREREQ` $\to$ `UP_PROVENANCE` on reverse `covers`/`defines` and `DOWN_REALIZE` $\to$ `DEP_IMPACT` on reverse `uses`/`calls`/`depends_on` when targeting test/doc stages, plus 1-hop reverse `references` from `SEED`, while strictly preserving the causal collider zero-decay invariant (`evaluateDirectionalBlastStep("uses", "reverse", "DEP_PREREQ") === 0.0`).
  - Track active blast edges in `BlastAttenuationResult.activeEdges` so a Sankey ribbon illuminates if and only if at least one constituent edge actively transmits blast between `src` and `tgt`.
- **Intact Directory Hierarchy per Column**:
  - Every `SankeyBar` carries `parentDir` and `depth`.
  - When a directory is expanded in hierarchical mode, emit an explicit collapsible directory header bar (`▾ 📂 <dir>`) followed contiguously by its indented child bars (`depth + 1`), keeping sibling files and subfolders strictly grouped within their parent directory's slot.
- **No Bar or Column Dragging**:
  - Remove freeform bar and column dragging (`barOffsets`, `colOffsets` drag listeners) from `SankeyView`, retaining canvas background pan and cursor-centered wheel zoom.
  - Use direct click handlers for Blast Trace selection and dedicated chevron / double-click handlers for folder expansion.
- **Configurable Column Sorting (`SankeySortOrder`)**:
  - Provide `"barycenter"` (crossing minimization within directory groups), `"hierarchy"` (directory path tree order), `"name"` (alphabetical A–Z), and `"weight"` (descending coupling weight / member count).

### 2. Overview Minimap ("Radar Window") & Two-Degree Focus Halos
- Introduce `viewer/minimap.ts` rendering a corner radar overlay with cluster dots and a draggable camera viewport rectangle.
- Upgrade Cosmos focus state to a 2-degree halo model: `0-hop` seed (1.0 opacity, accent ring), `1-hop` direct neighbors (1.0 opacity, solid relation edges), `2-hop` transitive neighborhood (0.55 opacity, secondary halo), and unrelated nodes (0.10 opacity).

### 3. Interactive Cluster Combos & Multi-Link Conduit Rollup
- Introduce `viewer/combos.ts` providing pure aggregation of directory clusters into composite combo nodes (`combo:<clusterKey>`) sized by $\sqrt{\text{memberCount}}$ and rolling up inter-cluster edges into weighted conduits with width scaled by $\log_2(\text{count} + 1)$.
- Support global combo mode toggle and in-place single-cluster expand/collapse.

### 4. Smooth Layout Transition Tweening
- Introduce `viewer/transitions.ts` with a zero-allocation cubic ease-out (`1 - (1 - t)^3`) position interpolator over `280ms` when switching layout modes or toggling cluster combos.

## Consequences
- **Positive**: Stacked Flow columns preserve directory structure, sort deterministically, and highlight exact causal blast paths without drag-induced click races. Cosmos view gains global radar orientation, 2-hop focus gradation, scalable cluster combos, and smooth animated transitions.
- **Negative / Trade-offs**: Emitting parent directory header bars above expanded children adds one compact header row per expanded folder, which is accommodated by scrollable stage columns.
