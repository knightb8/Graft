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

### 1. Pure ForceAtlas2 Barnes-Hut Convergence
- Replace `d3-force` simulation with `graphology-layout-forceatlas2`.
- Run ForceAtlas2 synchronously upon dataset load (`forceAtlas2.assign(this.graph, { iterations: 80, settings: { barnesHutOptimize: true, ... } })`). Barnes-Hut spatial quadtrees converge 3,000 nodes in $\sim 50\text{ ms}$ without blocking or wobbling.
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

## Consequences & Trade-offs
- **Positive**: 
  - Graph loads and converges almost instantaneously.
  - Zero UI thread freezing or stuttering.
  - Archipelago blooms cover 100% of the viewport seamlessly across any screen resolution and device pixel ratio.
  - Bundle size decreases by eliminating the `d3-force` package from the client viewer.
- **Negative**:
  - Dragging a node moves that individual node directly rather than elastic spring-pulling its neighbors (which is preferred in large graphs to avoid unwanted layout destabilization).
