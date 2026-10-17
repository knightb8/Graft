# ADR 0009: Sigma.js and Graphology WebGL Visualizer Migration

## Context & Problem Statement
The Graft interactive visualizer (`graft viz` and `graft viz --export`) previously rendered graphs using SVG DOM elements driven by `d3-force` on the browser's main thread.
While SVG DOM rendering is straightforward and works well for small graphs (< 200 nodes), it exhibits severe performance degradation on medium and large codebases:
1. **DOM Bloat & Memory Overhead**: In graphs with 1,000+ nodes and 3,000+ edges, the browser must maintain, layout, and repaint over 10,000 SVG elements (`<g>`, `<circle>`, `<path>`, `<text>`).
2. **Main-Thread Simulation Stutter**: `d3-force` computes $O(N \log N)$ or $O(N^2)$ force physics per animation frame directly on the main UI thread, freezing user input and stuttering interactions.
3. **Compositing & Interaction Latency**: Panning, zooming, and clicking nodes require continuous style recalculations and repaints, resulting in noticeable lag.

Graft repositories often produce wiring graphs with thousands of symbols and files (e.g. Graft itself has 1,377 nodes in its code graph). We need a visualization engine that scales smoothly to tens of thousands of nodes.

## Decision Drivers
- **Rendering Scalability**: Fluid 60 FPS rendering, panning, and zooming for 10,000+ nodes.
- **Background Layout**: Non-blocking force layout execution (e.g., ForceAtlas2) that does not lock user interactions.
- **Offline Self-Contained Bundling**: Full compatibility with `graft viz --export` — zero external CDN dependencies, bundled via `esbuild` into `dist/viewer/app.js`.
- **Feature Parity**: Complete preservation of existing features:
  - Tripartite architectural scopes (code, docs, specs)
  - Directory exclusion & file-tree picker filtering
  - Transitive shortcut edge synthesis
  - Dynamic focus mode (amber outgoing, accent incoming, dimmed unselected)
  - Search centering and selection synchronization with the detail panel.

## Considered Options
1. **SVG DOM Optimization (Culling/Virtualization)**: Culling off-screen elements. *Rejected*: Still bound to the DOM; when zoomed out to view the whole architecture, all elements must still be rendered, causing frame drops.
2. **Custom HTML5 2D Canvas**: Hand-rolling a Canvas 2D renderer. *Rejected*: Requires reimplementing spatial indexing, hit-testing, curved arrow rendering, and camera pan/zoom mathematics from scratch.
3. **Cytoscape.js**: Broadly-used graph library. *Rejected*: Larger bundle size and primarily 2D canvas-based; WebGL support is less native than specialized WebGL engines.
4. **Sigma.js with Graphology**: Specialized WebGL graph rendering engine built on top of Graphology. *Selected*.

## Decision Outcome & Rationale
We will adopt **Sigma.js** and **Graphology** to replace the SVG-based `GraphView` in `viewer/graph.ts`.

### Architecture & Mechanics:
1. **Graph Model (`graphology`)**:
   - `GraphView` instantiates a directed Graphology graph (`new Graph({ type: "directed", multi: false })`).
   - Nodes hold coordinates (`x`, `y`), display label (`name`), visual radius (`size`), color (`color`), and metadata (`scope`, `type`, `sources`, `owners`).
   - Edges hold relation data (`relation`, `description`, `confidence`, `transitive`, `via`).
2. **Hardware-Accelerated WebGL Rendering (`sigma`)**:
   - Sigma renders nodes and edges directly into WebGL canvas buffers with hardware shaders.
   - Directed edges are rendered with arrowheads using Sigma's built-in arrow programs.
   - Dynamic styling and focus dimming are managed via Sigma's reactive `nodeReducer` and `edgeReducer` without recreating or mutating DOM nodes.
3. **ForceAtlas2 Layout (`graphology-layout-forceatlas2`)**:
   - Layout is computed using ForceAtlas2 with Barnes-Hut spatial indexing, allowing non-blocking or stepped convergence.
4. **Bundle & Export Integrity**:
   - `sigma`, `graphology`, and `graphology-layout-forceatlas2` bundle seamlessly via `esbuild` into `dist/viewer/app.js`, ensuring `graft viz --export` produces a completely standalone single-file HTML artifact without CDN links.
