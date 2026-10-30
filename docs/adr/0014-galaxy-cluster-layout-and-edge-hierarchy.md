# ADR 0014: Galaxy Cluster Layout, Hub Centripetal Cohesion, and Inter-Cluster Spiderweb De-Cluttering

## Status
Amended (2026-10-30): Edge weighting tables and ForceAtlas2 post-layout separation heuristics are amended and superseded by ADR 0020 (Unified Relation Registry and Degree-Normalized Edge Weights) and ADR 0021 (Two-Level Stress-SGD Organic Layout with Preset Constraints).

## Context & Problem Statement
When viewing medium-to-large codebases (e.g., 372 aggregated file nodes and 1,950 edges on the Code tab) in the Graft WebGL visualizer, the layout previously converged into a single round "distance-pushed spiderweb" rather than distinct, well-separated architectural galaxies (archipelagos):

1. **Hub Perimeter Flinging (`outboundAttractionDistribution: true`)**:
   - ForceAtlas2's `outboundAttractionDistribution` (also known as *Dissuade Hubs*) divides each outgoing edge's attractive force by its source node's out-degree, while node repulsion remains proportional to degree.
   - As a result, high-degree architectural hubs (`cli.ts`, `ask.ts`, `node-file.ts`, `build.ts`, `tools.ts`, `paths.ts`) experienced weak attraction and massive repulsion, flinging them to the outer perimeter ring and stretching their `uses` edges all the way across the canvas like the spokes of a giant spiderweb.
2. **Unweighted Cross-Cluster Hairball**:
   - Every edge carried identical unit layout weight (`1.0`). Cross-cutting utility imports (e.g., `test/*.test.ts` importing `src/*`, or modules importing shared utilities like `src/util/state.ts` and `src/context/node-file.ts`) pulled every directory into one undifferentiated central blob.
   - Furthermore, ForceAtlas2's `edgeWeightInfluence: 0.5` dampened any weight differences by taking the square root of edge weights.
3. **Visual Spiderweb Clutter**:
   - All 1,950 dependency edges were rendered at high opacity (`0.80`) and thickness (`1.8px`), painting a dense yellow web across the entire viewport that obscured the underlying island communities.
4. **Uniform Node Color on Aggregated Code View**:
   - With parent aggregation enabled (`aggregate = on`), all 372 code containers have `type = "file"`, causing almost the entire graph to render in a single monochrome orange (`--k-file`) instead of visually distinguishing subsystem galaxies.

## Decision Drivers
- **True Galactic Archipelagos**: Each architectural subsystem (`src/graph`, `src/viz`, `src/ask`, `src/blast`, `viewer`, `features/*`, `docs/*`, `test/*`) must form a tight, self-contained local cluster separated from other clusters by clear negative space (void).
- **Galactic Nuclei (Hubs at Cluster Centers)**: High-degree hub files must sit at the core of their respective subsystem galaxy rather than being flung to the outer rim.
- **Spiderweb Suppression**: Intra-galaxy edges must remain crisp and legible, while long-range cross-galaxy edges must be visually attenuated in the resting state (while still illuminating to `1.0` opacity on hover or selection).
- **Subsystem Chromatic Identity**: In aggregated file mode, file nodes should be colored by their subsystem galaxy palette so each island has a distinct visual identity.

## Decision Outcome & Rationale

### 1. Hierarchical Edge Weighting & Virtual Intra-Galaxy Cohesion (`computeEdgeLayoutWeight`)
- Partition edges into **intra-galaxy** (`clusterKeyOfNode(source) === clusterKeyOfNode(target)`) and **inter-galaxy** (`clusterKeyOfNode(source) !== clusterKeyOfNode(target)`):
  - **Intra-galaxy edges**: Assigned high layout weight (`weight = 12.0`).
  - **Inter-galaxy edges**: Assigned low layout weight (`weight = 0.15`), preventing cross-cutting utility imports from collapsing separate directories into a single hairball.
- **Virtual Galactic Nucleus Springs**:
  - For each subsystem cluster, identify its highest-degree node as the **galactic nucleus** (anchor).
  - Connect every member of that cluster to its nucleus with an internal layout cohesion weight (`weight = 15.0`) during ForceAtlas2 layout calculation (or reinforce intra-cluster topology), guaranteeing that even loosely connected files within the same directory coalesce into a tight island around their hub.

### 2. ForceAtlas2 Galactic Tuning & Post-Convergence Island Separation
- Disable `outboundAttractionDistribution` (`false`) so high-degree hubs are pulled into the center of their community instead of being pushed to the outer perimeter ring.
- Set `edgeWeightInfluence: 1.2` (up from `0.5`) so the $80\times$ weight differential between intra-galaxy (`12.0`) and inter-galaxy (`0.15`) edges strongly governs cluster condensation.
- **2D Phyllotaxis Galaxy Seeding & Post-Layout Galaxy Packing**:
  - Seed cluster centroids on a 2D golden-angle phyllotaxis spiral (`r = sqrt(clusterIdx + 1) * 280`) rather than a 1D perimeter ring.
  - After ForceAtlas2 converges local community structure, apply a deterministic **Galaxy Separation Pass** (`separateGalaxies`): compute each cluster's centroid and radius, amplify inter-galaxy centroid separation vs. intra-galaxy spread (tightening intra-cluster coordinates around their centroid by `0.55` while expanding inter-centroid distances and resolving any bounding-circle overlaps with explicit void padding). This mathematically guarantees distinct galaxies separated by clean negative space.

### 3. Intra-Galaxy vs. Inter-Galaxy Edge Opacity Hierarchy (`reduceEdge`)
- Track `intraCluster: boolean` on every Graphology edge.
- In the resting state (`role === "none"`):
  - **Intra-galaxy edges** (`intraCluster === true`): Render crisply (`opacity = 0.68`, `size = 1.6px`) to show internal subsystem wiring clearly.
  - **Inter-galaxy edges** (`intraCluster === false`): Render as subtle background filaments (`opacity = 0.11`, `size = 0.9px`) so long-range cross-cluster links do not form a dense yellow spiderweb across the void.
- In active focus (`role === "out"` or `role === "in"` on hover/select):
  - Both intra-galaxy and inter-galaxy connected edges illuminate to full prominence (`opacity = 1.0`, `size += 1.2px`), preserving immediate dependency traceability across galaxies.

### 4. Subsystem Galaxy Coloring for Aggregated File Containers (`galaxyColorOfCluster`)
- When rendering on the Code tab with parent container aggregation active (`aggregateToParent === true` and `node.type === "file"`), color nodes using a deterministic, high-contrast galaxy palette keyed by their subsystem cluster (`clusterKeyOfNode`) while preserving canonical tripartite colors for `specs` (emerald) and `docs` (violet).
- Display subsystem galaxy color chips in the legend so users can immediately map island colors to directory subsystems.

### 5. Per-Galaxy Nucleus Landmark Labeling (`computeGalaxyLandmarks`)
- Previously, `landmarkSet` selected only the top 12 highest-degree nodes globally, leaving smaller subsystem galaxies completely unlabeled at default zoom.
- The landmark selection pass now elects the **galactic nucleus (highest-degree hub) of every visible subsystem galaxy** (with $\ge 2$ members) first, and then fills remaining slots up to 18 landmarks with global high-degree nodes. Every galaxy island therefore displays its primary anchor label at rest.

### 6. Stationary Galaxies on Single-Node Drag Release & Tab Isolation
- Releasing a single dragged node (`nodeDragEnd`) must **not** trigger an unweighted global ForceAtlas2 pass across the entire graph, which previously caused all other galaxies to jump and collapse toward the center. Instead, elastic spring rubberbanding moves direct neighbors during drag and keeps all other galaxies stationary on release.
- Cached node positions (`prevPositions`) are strictly isolated per `(tab, aggregateToParent)` state so switching from Context to Code (or toggling aggregation) never leaks stale coordinates into the galaxy seeding pass.

### 7. Active-Graph Detail Panel & Navigation Consistency
- When parent container aggregation is active on the Code tab, the detail panel (`showDetail` / `renderDetail`) must resolve nodes and incident edges against `activeGraph()` (the aggregated container graph) rather than the raw unaggregated symbol graph, ensuring synthesized file containers, symbol counts, galaxy color swatches, and neighbor navigation links work seamlessly.

## Consequences & Trade-offs
- **Positive**:
  - Eliminates the round perimeter-flung spiderweb completely.
  - Produces unmistakable architectural galaxies with clear void space between subsystems, labeled galactic nuclei, and hubs anchored at galactic cores.
  - Drastically reduces visual clutter on dense graphs (1,950+ edges) while keeping every cross-cluster dependency 100% inspectable on hover or click.
  - Detail panel inspection and neighbor navigation work identically across both aggregated file containers and granular symbols.
- **Negative**:
  - Post-FA2 galaxy separation adds ~1–2ms of arithmetic during `setData`, well within the instantaneous load budget.

