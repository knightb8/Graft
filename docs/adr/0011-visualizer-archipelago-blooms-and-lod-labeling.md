# ADR 0011: Visualizer Archipelago Blooms, Smart LOD Labels, and Complete Filtering

## Context & Problem Statement
With the migration to Sigma.js WebGL (ADR 0009), the Graft visualizer achieved fluid 60 FPS rendering for thousands of nodes. However, real-world developer exploration revealed three critical ergonomic and architectural challenges:

1. **Text Soup vs. Total Silence**:
   - Showing labels on all nodes caused dense, unreadable overlapping text collision ("text soup") when zoomed out.
   - Showing labels only on mouse hover stripped away all spatial orientation and navigational anchors, making the graph feel barren and disorienting.
2. **Missing Subsystem Cohesion Highlights**:
   - While nodes are positioned by physics, the high-level semantic modularity (e.g. `src/graph`, `src/parser`, `docs/adr`, `features/parsing`) lacked visual cohesion. Users could not easily perceive distinct architectural "islands" or high-cohesion communities when viewing the full graph.
3. **Sidebar Tree Filtering Leaking Node Circles**:
   - When users unticked a directory or file in the sidebar tree picker, labels were removed but the node circles remained on the canvas. In Sigma.js v4, `DisplayData` expects `visibility: "visible" | "hidden"`, whereas the legacy reducer only returned `hidden: true`, which the WebGL shaders ignored.
4. **Natural Physics & Spring Dragging**:
   - Users missed the intuitive, tactile "wobbliness" of dynamic physics and spring-based node dragging, while requiring predictable screen-based node sizing.

## Decision Drivers
- **Cartographic Clarity**: Major hubs should act as visible landmarks when zoomed out; detailed labels should smoothly appear as space allows when zooming in without overlapping.
- **Architectural Cohesion ("Archipelagos")**: Visually delineate high-cohesion subsystems with soft luminous blooms and organic contours behind the nodes.
- **Strict Filtering**: Unchecked or filtered nodes and edges must be completely eliminated from the visual pipeline, leaving zero phantom circles.
- **Interactive Tactility**: Live D3 force simulation with spring-based node dragging and screen-referenced node sizing.
- **Zero Performance Degradation**: Maintain 60 FPS pan/zoom and layout relaxation without DOM reflow.

## Decision Outcome & Architecture

We adopt a **Dual-Layer Architecture** combining Sigma WebGL with an HTML5 2D canvas backdrop, paired with a hierarchical Level-of-Detail (LOD) label system and strict visibility reducers.

### 1. Native WebGL 2 Hardware Shader Pipeline & Adaptive Cohesion
- **Integrated WebGL 2 Layer (`sigma.createWebGLContext`)**:
  - Rather than running a CPU-bound 2D canvas context, the archipelago bloom layer is provisioned directly via Sigma's layer manager: `this.sigma.createWebGLContext("archipelago", { beforeLayer: "stage" })`.
  - Automatically participates in Sigma's canvas lifecycle (device pixel ratio scaling on resize, and automated DOM cleanup on `sigma.kill()`).
  - Executes a specialized WebGL 2 GLSL 300 es vertex and fragment shader using instanced quads (`gl.drawArraysInstanced`).
  - Fragment shader computes exponential Gaussian radiance with smooth quadratic edge falloff:
    `float glow = exp(-r2 * 2.5) * (1.0 - r2 * r2);`
  - Uses premultiplied additive alpha blending (`gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)`), allowing overlapping auras to fuse additively into radiant, continuous metaball archipelagos directly on the GPU in a single draw call.

- **Scale-Adaptive Neighborhood Cohesion Model (No Fixed X)**:
  - Fixed clustering thresholds (e.g. static circular blooms for directories $\ge X$) fail because small repos (15 nodes) and large repos (2,500 nodes) have vastly different spatial and semantic scales.
  - Instead, the visualizer computes a continuous **neighborhood cohesion field**:
    1. **Scale-Dependent Distance**: Neighborhood search radius adaptively scales with total visible nodes $N$:
       $R_{\text{nbr}} = \text{clamp}(110 \times (100 / \max(20, N))^{0.25}, 50, 180)\text{ px}$.
       Contracts automatically in dense graphs to keep blooms localized; expands in sparse graphs to preserve island connectivity.
    2. **Topology & Subsystem Density**: Evaluates proximity and subsystem matching across neighbors. Isolated or solitary nodes (< 1 cluster neighbor) receive **zero bloom** ($C_i = 0$), preventing artificial circles on lonely files.
    3. **Continuous Cohesion Score**: Dense neighborhoods additively accumulate high cohesion ($C_i \in [0.1, 1.0]$), with a $+0.45$ radiance boost when focused by mouse hover or selection.
  - A lightweight watermark badge layer (`createCanvas("archipelago-badges", { beforeLayer: "mouse" })`) renders crisp vector typography labels (`⬡ src/graph (14)`) at the centroids of verified high-cohesion clusters.

### 2. Smart Level-of-Detail (LOD) Labeling
In Sigma 4, `DisplayData` supports `labelVisibility: "visible" | "auto" | "hidden"`:
- **Landmark Anchors**: Visible nodes with high degree (`node.deg >= 6`) are assigned `labelVisibility: "visible"`. In zoomed-out views, these major hubs act like capital cities on a world map.
- **Hover & Selection Prominence**: Hovering or selecting any node assigns `labelVisibility: "visible"`, elevated font size (`13px`), and contrast background chip to that node and all its direct neighbors, while connected edges illuminate.
- **Spatial Collision Grid on Zoom**: Normal nodes receive `labelVisibility: "auto"`. Combined with `labelRenderedSizeThreshold: 8.5`, `labelDensity: 0.8`, and `labelGridCellSize: 120`, labels remain hidden when zoomed out and progressively emerge into available space as the user zooms in, completely avoiding text collision.

### 3. Strict WebGL Visibility Reducers
In `reduceNode` and `reduceEdge`:
- When a node is not shown according to filter criteria (`matchNodeFilter`):
  ```ts
  return {
    ...data,
    visibility: "hidden",
    hidden: true,
    size: 0,
    opacity: 0,
    color: "transparent",
    label: null,
    labelVisibility: "hidden",
  };
  ```
- When an edge connects to any hidden node, is an inactive transitive edge, or matches a hidden relation chip:
  ```ts
  return {
    ...data,
    visibility: "hidden",
    hidden: true,
    size: 0,
    opacity: 0,
    color: "transparent",
  };
  ```
This ensures Sigma's WebGL shaders discard the geometry entirely.

### 4. D3-Force Physics & Spring Dragging
- `GraphView` runs a live `forceSimulation(this.nodes)` with many-body charge repulsion, distance-scaled links, collision radii (`n.r + 26`), and center pull.
- Sigma drag events (`nodeDragStart`, `nodeDrag`, `nodeDragEnd`) lock node coordinates (`fx`, `fy`) and re-heat alpha (`0.3`), producing realistic spring resistance.
- Simulation ticks feed positions into Graphology attributes and trigger synchronized archipelago canvas updates.

## Status
Accepted and Implemented.

## Consequences
- **Positive**:
  - The graph has a cartographic, celestial aesthetic with distinct subsystem archipelagos.
  - Zooming in and out is clean, legible, and completely free of text soup.
  - Instant hover focus allows effortless exploration of any node and its immediate neighborhood.
  - Unticking any branch in the directory tree cleanly removes all associated nodes and edges.
  - 60 FPS performance is preserved with hardware-accelerated canvas transforms and frustum culling.
- **Negative / Trade-offs**:
  - Additional 2D canvas context to manage alongside WebGL (handled cleanly via lifecycle hooks in `destroy()` and window resize listeners).
