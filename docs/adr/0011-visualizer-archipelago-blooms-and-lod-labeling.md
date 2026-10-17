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

### 1. Dual-Layer Visualizer Architecture
- **Backdrop Canvas (`archipelago-canvas`)**:
  - Inserted into the container at `z-index: 0` directly behind Sigma's WebGL canvas.
  - Renders soft, luminous radial gradient blooms and organic metaball halos for clusters with $\ge 2$ nodes.
  - Groups nodes by architectural subsystem/directory path (`src/graph`, `src/parser`, `docs/adr`, `features/parsing`).
  - Uses 90th percentile distance from the cluster centroid to prevent distant outlier nodes from over-expanding the archipelago contour.
  - Draws a subtle dashed contour and translucent watermark badge (`⬡ src/graph (14)`).
  - Highlights intensely when the cluster contains the currently hovered or selected node.
  - Synchronizes seamlessly with camera pan/zoom via `sigma.graphToViewport()` and frustum culling.

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
