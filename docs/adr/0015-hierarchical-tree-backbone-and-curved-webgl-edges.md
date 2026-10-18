# ADR 0015: Hierarchical Tree-Backbone Layout, Rest-Length Branching, and Curved WebGL Edges

## Context & Problem Statement
Even after grouping files into separated subsystem islands (ADR 0014), the WebGL visualizer exhibits a geometric "crisscross" mesh appearance compared to the organic, branching "tree-like" aesthetic of the original visualizer. Root-cause comparison against `upstream/main` identifies four structural and rendering causes:

1. **Loss of Structural Containment Hierarchy (`part_of` / `contains`) Under File Aggregation**:
   - In the unaggregated graph, `file -> symbol` containment (`part_of` / `contains`, family `structure`) forms a natural forest of trees.
   - When `aggregateGraphToParents` collapses symbols into their parent `file` nodes, all `contains` edges are absorbed and dropped. What remains is 372 flat `file` nodes connected solely by 1,950 `uses` / `imports` edges — a dense non-planar mesh with zero hierarchical parent nodes (`module` / directory containers).
2. **ForceAtlas2 Zero-Rest-Length Attraction vs. Hookean Rest-Length Springs**:
   - ForceAtlas2 pulls connected nodes toward distance $d = 0$ until balanced by global $1/r$ repulsion, and post-convergence compaction (`intraCompactFactor`) further compresses nodes across one another, causing short edges inside each cluster to cross over the centroid.
   - By contrast, tree-like layouts enforce explicit **rest-length springs** (`REST = { structure: 85, dependency: 145, contract: 150, association: 185 }`) combined with non-overlapping collision radii (`r + gap`), which push overly close connected nodes apart to a uniform branch distance and fan leaf nodes outward without internal edge crossings.
3. **Razor-Straight WebGL Line Segments vs. Curved Quadratic Bézier Arcs**:
   - The original renderer drew every edge as a Quadratic Bézier curve offset normal to the chord (`Q mx,my tx,ty` with a `10px` perpendicular bow).
   - Sigma's default `line` edge program draws rigid Euclidean straight lines. When hundreds of straight segments intersect at acute angles, the human visual system perceives a harsh geometric "laser grid / crisscross" rather than organic tree branches.
4. **Non-Tree Cross-Cutting Utility Imports Drawn at Rest**:
   - Cross-cutting imports (e.g., 75 test files each importing 5–10 source modules, and every source module importing shared utilities like `node-file.ts`, `state.ts`, and `types.ts`) form a bipartite/mesh overlay across the tree hierarchy. Drawing all non-tree chords simultaneously at rest obscures the branching tree skeleton.

## Decision Drivers
- **Organic Tree-Like Topology**: Both aggregated (`aggregate = on`) and granular (`aggregate = off`) views must exhibit a clean, branching tree skeleton (`subsystem module -> file -> symbol`) with zero internal crisscross clutter.
- **Explicit Branch Rest Lengths & Collision Spacing**: Parent-to-child and hub-to-leaf connections must settle at readable, uniform radial branch distances (`85px–145px`) rather than collapsing across cluster centers.
- **Curved WebGL Edge Geometry**: Edges must render as smooth, gently bowed arcs (`@sigma/edge-curve` or custom curved WebGL shader) rather than harsh straight lines.
- **Tree-Backbone Primary Visibility (Progressive Disclosure of Mesh Chords)**: In the resting state, the **hierarchical tree backbone** (`part_of` / `contains` containment edges plus each node's primary parent dependency in the spanning tree) renders prominently, while secondary cross-cutting mesh imports remain ultra-faint or hidden until a node is hovered or selected.

## Decision Outcome & Rationale

### 1. Semantic Relation Weight Hierarchy, Cosmos Presets & Tunable Sliders (`COSMOS_PRESETS`, `CosmosWeightTuning`)
- Because the left File Tree panel already exposes the logical file-system hierarchy (`part_of`), the Galaxy View emphasizes **functional and semantic inter-relations** (`implements`, `extends`, `covers`, `verifies`, `documents`, `influences`, `uses`, `references`).
- Define an explicit **Semantic Relation Weight Hierarchy** combined with 5 selectable **Cosmos Gravity Presets** (`EdgeContractionMode = "coupled" | "code" | "spec" | "doc" | "directory"`) and live **Interactive Weight Tuning Sliders** (`CosmosWeightTuning` in `#weightsMenu`):
  - **Base Semantic Hierarchy**:
    - **`implements` / `extends`**: `3.0` (strongest architectural inheritance/realization binding)
    - **`covers` / `verifies`**: `2.5` (BDD spec-to-code verification binding)
    - **`documents` / `influences`**: `2.0` (ADR-to-spec/code governance binding)
    - **Intra-cluster `uses` / `calls` / `depends_on`**: `1.8` (cohesive subsystem collaboration)
    - **Cross-cluster `uses` / `calls` / `depends_on`**: `0.6` (moderate cross-module coupling)
    - **`references`**: `0.25` (weak informational citation)
    - **Support-Class Incoming `uses` / `references` (`isSupportTarget = true`)**: `0.15` (~80% layout pull reduction so utility sinks do not distort domain topology)
  - **Selectable Cosmos Presets (`COSMOS_PRESETS`) & Sliders Sub-Menu (`#weightsMenu`)**:
    1. **`"coupled"` (Balanced Coupled Cosmos)**: Balanced tripartite pull across specs, docs, and code (`dependency: 1.8`, `contract: 2.5`, `association: 2.0`, `structure: 1.2`, `supportWeight: 0.15`, `clusterGap: 38`).
    2. **`"code"` (Code-Centric Cosmos)**: Prioritizes runtime architecture (`dependency: 3.0`, `structure: 1.4`) while specs and docs orbit lightly around the code modules they cover (`contract: 0.8`, `association: 0.6`).
    3. **`"spec"` (Requirements / Spec-Centric Cosmos)**: Prioritizes BDD specifications and verification (`contract: 3.4`, `association: 2.2`, `dependency: 0.7`), pulling implementation files directly into the gravitational orbit of the `.feature` specs they satisfy.
    4. **`"doc"` (Document / ADR-Centric Cosmos)**: Prioritizes architectural governance (`association: 3.5`, `contract: 1.8`, `dependency: 0.6`), pulling specs and code modules into clusters around the ADRs and design documents that govern them.
    5. **`"directory"` (Directory Tree Cosmos)**: Prioritizes strict filesystem hierarchy (`structure: 2.8`, `intraClusterMultiplier: 3.5`).
  - **Live Tuning Sliders**: Users can fine-tune `dependency`, `contract`, `association`, `structure`, `supportWeight`, and `clusterGap` via sliders in the toolbar sub-menu (`setWeightTuning`), immediately reweighting edges and re-bouncing the cosmos.

### 2. Support / Utility Class Detection & Dampening (`detectSupportNodes`)
- Utility and support modules (e.g., `helpers.ts`, `types.ts`, `utils.ts`, `constants.ts`) are imported across almost every subsystem. If given normal attraction weight, they act like gravitational black holes in the center of the canvas with dozens of yellow spiderweb lines radiating in all directions.
- `detectSupportNodes(nodes, edges, clusterKeyMap)` reliably identifies support/utility nodes via a dual criterion:
  1. **Topological Sink Criterion**: Cross-cluster fan-in from $\ge 3$ distinct source clusters (`crossClusterFanIn >= 3`) AND high sink ratio (`inDegree / (outDegree + 1) >= 2.0`).
  2. **Lexical & Structural Utility Criterion**: Basename or symbol name matching canonical utility patterns (`/\b(helpers?|utils?|utilities|types?|common|shared|constants?|schemas?|config|errors?)\b/i` or `.d.ts`) combined with `inDegree >= 2` and sink ratio $\ge 1.5$ (or pure `type`/`interface` nodes with `outDegree == 0` and `inDegree >= 3`).
- **Layout & Visual Treatment of Support Classes**:
  - Incoming `uses` and `references` edges targeting a support node have their layout weight dampened to `0.15` (~80% reduction).
  - Cross-cluster `uses` and `references` edges targeting a support node are excluded from resting cross-galaxy backbone bridges and hidden at rest (`visibility: "hidden"`), illuminating cleanly on hover or selection of the support node or its caller.
  - Detected support nodes are marked with `isSupportNode: true` and visually badged (`◈` prefix / `[support]` indicator and distinct ring styling) so developers immediately recognize shared support/utility infrastructure.

### 3. D3-Style Organic Layout Spacing (No Artificial Hub Compression, 30–45px Intra-Cluster Breathing Room)
- **Eliminate Synthetic `15.0` Hub Springs**:
  - Previously, injecting synthetic `__galaxy_spring_` edges (`weight: 15.0`) crushed every cluster into a tiny ball of overlapping dots while `interExpandFactor: 1.45` + `minVoidGap: 95` blew 500px empty voids between clusters.
  - We remove the overpowering `15.0` hub springs so ForceAtlas2 positions nodes organically according to real semantic edge weights.
- **Pairwise Intra-Cluster Node Repulsion & Natural Inter-Cluster Adjacency**:
  - Inside `relaxAndSeparateGalaxiesVectorized` (`viewer/wasm-physics.ts`) and `separateGalaxies` (`viewer/data.ts`), enforce pairwise node-to-node collision/repulsion spacing (`minNodeDist = rA + rB + 28px`, ~`35–45px` center-to-center breathing room) so local triangles, hubs, and spokes inside each cluster are clearly legible (matching classic `d3-force` community layouts).
  - Use gentle cluster cohesion (`intraCompactFactor = 0.92`, `interExpandFactor = 1.0`, `minVoidGap = 35px`) and a compact initial cluster seeding radius so coupled clusters sit naturally adjacent to the bridges that connect them.

### 4. Hierarchical Control-Point Edge Bundling & Highway Weighting (`computeHierarchicalEdgeBundles`)
- Inspired by Observable's Hierarchical Edge Bundling (`@d3/hierarchical-edge-bundling`):
  - Group cross-cluster edges by directional cluster corridor `(sourceCluster -> targetCluster)` and intra-cluster edges by local hub corridor.
  - Compute shared corridor control vectors from `[sourceClusterCentroid -> targetClusterCentroid]` so all edges travelling in the same direction share a coherent curvature sign and magnitude (`bundleCurvature` around `0.20–0.28` with a tiny deterministic per-strand ribbon offset `±0.012` so parallel strands merge visually into a smooth bundled highway at rest while remaining individually selectable).
  - **Highway Visibility Boost ($\sqrt{N}$)**: Scale resting stroke opacity and width by `Math.sqrt(bundleSize)`:
    - `bundleOpacity = Math.min(0.78, 0.38 + 0.12 * Math.sqrt(bundleSize))`
    - `bundleSizePx = Math.min(3.2, 1.35 + 0.42 * Math.sqrt(bundleSize))`
    - This guarantees that multi-edge directional corridors look like crisp, high-signal arterial highways rather than faint, washed-out hairlines.

### 5. Interactive "Re-Bounce vs. Hold" Simulation Toggle (`rebounceVisible`)
- When filters or contraction modes change, users have explicit control over whether the layout **re-bounces** dynamically or **holds** node positions fixed:
  - **`re-bounce` Mode Enabled (`autoRebounce = true`, default)**:
    - Filtering or changing contraction mode triggers `rebounceVisible()`, which relaxes the currently visible nodes and edges using vectorized rest-length springs weighted by `computeEdgeLayoutWeight` + intra-galaxy pairwise collision repulsion + `separateGalaxies`, and smoothly animates (`requestAnimationFrame` cubic-out interpolation over ~18 frames) each visible node from its previous `(x, y)` to its new equilibrium `(targetX, targetY)`.
  - **`hold` Mode Enabled (`autoRebounce = false`)**:
    - Filtering updates node/edge visibility in-place via `restyle()` without moving any node coordinates, preserving spatial memory.

### 6. Orphan Micro-Cluster Consolidation & Sigma `setGraph` DragManager Continuity
- **Orphan Micro-Cluster Consolidation**:
  - Any directory cluster containing fewer than 2 files (`count < 2`) is consolidated into its top-level parent directory cluster (`src`, `docs`, `features`, `scripts`, or `root`) so isolated single-file directories do not float as disconnected 1-node dots in deep space.
- **Sigma `setGraph` DragManager Monkeypatch**:
  - Immediately after `this.sigma.setGraph(nextGraph)`, explicitly patch `internals.dragManager.graph = nextGraph` and `edgeGroups.graph = nextGraph` so node dragging remains 100% functional across initial load, tab switches, and aggregation toggles.

## Consequences & Trade-offs
- **Positive**:
  - Restores the organic, readable community structure of classic D3 force layouts (clear 30–45px intra-cluster node spacing + natural inter-cluster proximity) while running at 60fps in WebGL2.
  - Reliably detects support/utility classes (`helpers.ts`, `types.ts`, `utils.ts`), dampening their gravitational pull by ~80% and hiding their resting fan-in spiderwebs until focused.
  - Bundles parallel directional edges into high-visibility arterial splines scaled by $\sqrt{\text{bundleSize}}$.
- **Negative**:
  - Pairwise intra-cluster node repulsion adds a lightweight $O(K \cdot M^2)$ pass per cluster (where $M$ is cluster size), which takes $< 0.8\text{ms}$ in typed arrays for 1,000 nodes.



