# ADR 0012: Pure ForceAtlas2 Layout and Viewport-Scaled Archipelago Blooms

## Context & Problem Statement
Following the visualizer migration to Sigma.js (ADR 0009) and archipelago bloom enhancements (ADR 0011), two significant issues emerged when viewing realistic, large codebases (e.g. 2,900+ nodes and 7,000+ edges):

1. **Quadratic Main-Thread Layout Stutter & Wobble**:
   `viewer/graph.ts` previously retained a legacy `d3-force` physics engine on the main UI thread. For 3,000 nodes, computing pairwise repulsion and collisions across hundreds of animation ticks caused massive stutter. Crucially, on every single simulation tick, `this.drawArchipelago()` was called, executing an unindexed $O(N^2)$ pairwise distance loop ($\approx 8.5 \times 10^6$ calculations per tick, 60 times/sec). This froze the browser for 30+ seconds before nodes converged.
2. **Archipelago Bloom Canvas Dimension Clipping (300×150 Default)**:
   Sigma's `createWebGLContext("archipelago")` and `createCanvas("archipelago-badges")` instantiate canvas elements without dimension attributes. By HTML5 spec, canvases default to $300 \times 150$ pixels. Because their pixel buffer dimensions (`canvas.width`, `canvas.height`) were never synchronized with the container's physical pixel dimensions (`clientWidth * dpr`, `clientHeight * dpr`), the WebGL viewport and instanced bloom quads were rendered only within a small rectangle pinned to the top-left corner of the screen.

## Decision Drivers
- **Instant Non-Blocking Convergence**: Eliminate long simulation wobbling. Large graphs (3,000+ nodes) must settle in $<100\text{ ms}$ upon initial load.
- **Pure Graphology Architecture**: Eliminate the `d3-force` dependency entirely from `viewer/graph.ts` as originally intended by ADR 0009.
- **Full Viewport Bloom Coverage**: Archipelago WebGL and badge layers must automatically track the container's true physical dimensions and device pixel ratio across resizes.
- **Linear-Time Archipelago Cohesion ($O(N)$)**: Replace the $O(N^2)$ distance checks with a 2D spatial hash grid so bloom calculations take $<2\text{ ms}$.
- **Zero Simulation Overhead on Drag**: Direct graph manipulation via Sigma's `nodeDrag` events instead of running a full-graph physics loop.

## Decision Outcome & Rationale

### 1. Pure ForceAtlas2 Barnes-Hut Convergence and Cluster-Seeded Archipelago Initialization
- Replace `d3-force` simulation with `graphology-layout-forceatlas2`.
- **Cluster-Seeded Phyllotaxis Initialization**: Avoid placing unpositioned nodes in a single 1D circle on the perimeter. Symmetrical perimeter rings trap ForceAtlas2 in a hollow circle equilibrium. Instead, seed initial coordinates by grouping nodes into architectural subsystem clusters (`clusterKeyOfNode`), placing cluster centroids across 2D space, and arranging cluster members via golden-ratio phyllotaxis spirals.
- **LinLog & Hub Dissuasion**: Run ForceAtlas2 with `linLogMode: true` (logarithmic attraction that forms compact community islands) and `outboundAttractionDistribution: true` (hub dissuasion that prevents high-degree hubs from collapsing multiple clusters into one). Barnes-Hut quadtrees converge 3,000 nodes in $\sim 100\text{–}300\text{ ms}$ into distinct 2D archipelagos.
- Sigma node dragging updates coordinates directly on the Graphology graph (`graph.setNodeAttribute(id, 'x', coords.x)`) without waking up a continuous physics engine.

### 2. Full-Viewport Canvas Synchronization
- In `drawArchipelago()`, compare `canvas.width` and `canvas.height` with `Math.round(container.clientWidth * dpr)` and `Math.round(container.clientHeight * dpr)`.
- If dimensions differ (on initial load or window resize), resize the WebGL canvas, update CSS width/height, and update `gl.viewport(0, 0, canvas.width, canvas.height)`.
- Apply identical synchronization to the 2D badge canvas.

### 3. Spatial Hash Grid for Archipelago Blooms ($O(N^2) \to O(N)$)
- Create a 2D spatial grid with cell size equal to the neighborhood radius $R_{nbr}$.
- Insert each projected node into its respective grid bucket.
- Query only the current cell and its 8 neighboring cells to compute cluster neighbor counts and continuous closeness sums.
- This reduces pairwise checks from $N^2$ (8.5 million checks for 2,914 nodes) down to $\approx 20\text{–}30$ checks per node ($\approx 7 \times 10^4$ total checks), completing in $<2\text{ ms}$.

### 4. Decoupling Physics from Blooms
- Blooms are rendered on camera movements, node selection/hover, window resize, and immediately after layout convergence—never in a high-frequency physics tick loop.

### 5. Fixed Rainbow Edge Color Taxonomy
- Define a canonical, vibrant rainbow palette mapped directly by relation verb / family:
  - `part of` (structure): Sky Blue (`#38bdf8`)
  - `uses` / `calls` / `depends_on`: Golden Amber (`#fbbf24`)
  - `covers` / `verifies`: Emerald Green (`#10b981`)
  - `documents`: Royal Purple (`#a855f7`)
  - `influences`: Hot Rose / Magenta (`#ec4899`)
  - `extends`: Coral Red (`#f43f5e`)
  - `implements`: Royal Indigo (`#8b5cf6`)
  - `transitive`: Bright Tangerine (`#f97316`)
  - `references`: Slate Blue (`#64748b`)
- Display matching color swatches on the top-bar edge chips for direct visual synchronization.

### 6. Interactive Elastic Spring Rubberbanding on Drag
- During `nodeDrag`, compute drag displacement $\Delta \vec{x}, \Delta \vec{y}$.
- Pull directly connected 1-hop neighbor nodes via an elastic spring force $\vec{x}_{nbr} += \Delta \vec{x} \cdot \gamma$, where $\gamma$ decays smoothly with distance.
- On `nodeDragEnd`, execute a brief stepped relaxation (10 iterations of ForceAtlas2) to organically settle the cluster around the new position without endless background wobbling.

## Consequences & Trade-offs
- **Positive**: 
  - Graph loads and converges almost instantaneously into 2D archipelagos.
  - Zero UI thread freezing or stuttering.
  - Archipelago blooms cover 100% of the viewport seamlessly across any screen resolution and device pixel ratio.
  - Edges are immediately recognizable by color without reading labels or tooltips.
  - Interactive tactile rubberbanding is preserved during drag while maintaining static stability when released.
  - Bundle size decreases by eliminating the `d3-force` package from the client viewer.
