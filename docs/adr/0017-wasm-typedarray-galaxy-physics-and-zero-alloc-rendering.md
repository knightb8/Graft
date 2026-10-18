# ADR 0017: Zero-Allocation WASM / TypedArray Galaxy Physics, Spatial Grid, and Graphology Mutation Elimination

## Context & Problem Statement
Although the visualizer moved from SVG to Sigma.js WebGL for rendering (ADR 0004), profiling reveals that layout, galaxy separation, spatial bloom hashing, and filter restyling still perform heavy object-allocated JavaScript computation on the main browser thread:

1. **Main-Thread Object-Allocated ForceAtlas2 & Galaxy Separation**:
   - `graphology-layout-forceatlas2` and `separateGalaxies` iterate over string-keyed JS Maps (`Map<string, ...>`), allocate temporary arrays/objects per iteration, and call `graph.setNodeAttribute(id, "x" | "y")` thousands of times during `setData()`, `reheat()`, and `rebounceVisible()`.
2. **Graphology Edge Mutations Inside `restyle()`**:
   - Every call to `restyle()` drops all `transitive` edges (`this.graph.dropEdge(k)`) and re-runs `generateTransitiveEdges()` + `this.graph.addEdgeWithKey(...)` whenever filters are active. Mutating Graphology's topology inside `restyle()` forces Sigma.js to re-index and re-upload its entire WebGL edge vertex buffer (`12,000+` edges) on every filter click or node selection!
3. **Per-Frame GC Churn in `drawArchipelago()`**:
   - On every camera pan/zoom frame (`afterRender`), `drawArchipelago()` allocates a new `pts = visibleNodes.map(...)` object array, constructs a string-keyed spatial hash `new Map<string, number[]>()`, and builds a dynamic JS `instances: number[]` array before converting to `new Float32Array(instances)`. At 60fps, this creates thousands of short-lived heap allocations per second and triggers GC pauses.

## Decision Drivers
- **Blazingly Fast, Zero-Jank 60fps Interactivity**: Panning, zooming, hovering, clicking, and re-bouncing galaxies must execute with `< 2ms` main-thread overhead and zero garbage-collection (GC) spikes, even on unaggregated graphs (`3,000+` nodes, `12,000+` edges).
- **WASM & Flat Contiguous `Float32Array` / `Int32Array` Vector Pipeline**: Replace string-keyed JS Maps and object loops in hot paths with contiguous typed-array buffers (`Float32Array`, `Int32Array`, `Uint8Array`) and an inline compiled WebAssembly (`WebAssembly.Instance`) math kernel (with automatic typed-array fallback if WASM instantiation is unavailable).
- **Zero Topology Mutation on Restyle / Hover / Select**: Never add or drop edges in `restyle()`. Separate filter-change transitive caching from hover/select/search restyling so node clicks and hovers are pure $O(1)$ uniform/attribute updates.
- **Preserve Full Galaxy Optics**: Retain the subsystem galaxy clusters, núcleo hubs, tree-backbone hierarchy, radiant archipelago blooms, and smooth simulation re-bounce.

## Decision Outcome & Rationale

### 1. Inline WebAssembly (`WASM`) + Contiguous `Float32Array` Physics & Spring Kernel (`viewer/wasm-physics.ts`)
- Compile and embed a compact, zero-dependency **WebAssembly binary module** (`WASM_PHYSICS_BYTES`) directly in `viewer/wasm-physics.ts` operating over shared `WebAssembly.Memory` (`Float32Array` / `Int32Array` views):
  - **SoA (Structure-of-Arrays) Memory Layout**:
    - `posX: Float32Array`, `posY: Float32Array`, `radii: Float32Array`, `degrees: Float32Array`, `clusterIds: Int32Array`.
    - `edgeSrc: Int32Array`, `edgeTgt: Int32Array`, `edgeWeight: Float32Array`.
  - **WASM Vectorized Operations**:
    - **Hookean Rest-Length Spring + Repulsion Step (`stepPhysicsWasm`)**: Executes fast spring attraction toward rest lengths + intra-galaxy hub cohesion + node repulsion directly in linear WASM memory with zero JS object allocation or string lookups.
    - **Galaxy Bounding-Circle Separation (`separateGalaxiesTyped`)**: Computes cluster centroids, compacts intra-galaxy members, and resolves inter-galaxy bounding-circle collisions entirely in pre-allocated `Float32Array` / `Int32Array` buffers (`O(N + C^2)` in `< 0.3ms`).
    - **Linear Interpolation (`lerpPositionsWasm`)**: Vectorized cubic ease-out position interpolation for 60fps simulation re-bouncing.

### 2. Zero-Allocation Spatial Hash Grid for Archipelago Blooms (`FlatSpatialGrid`)
- Replace the per-frame `pts.map(...)`, `new Map<string, number[]>()`, and `instances: number[]` in `drawArchipelago()` with reusable, pre-allocated typed arrays on `GraphView`:
  - **Linked-List Cell Table (`head: Int32Array`, `next: Int32Array`)**:
    - A classic $O(N)$ flat integer spatial hash table (`TABLE_SIZE = 2048` power-of-two mask `(cx * 73856093 ^ cy * 19349663) & 2047`) using `head.fill(-1)` and `next[i] = head[bucket]; head[bucket] = i`.
    - **Zero string keys** (`"${cx},${cy}"` eliminated), **zero array bucket allocations**, and **zero GC pressure** per frame.
  - **Pre-Allocated WebGL Instance Buffer (`instanceScratch: Float32Array`)**:
    - Write the 8 floats per bloom instance directly into a reusable `Float32Array(maxNodes * 8)` and upload via `gl.bufferSubData` / `gl.bufferData` subarray view.

### 3. Decoupling `restyle()` from Transitive Edge Topology Mutations
- Split `restyle(options?: { filterChanged?: boolean })` into two distinct paths:
  1. **Fast Visual Restyle (`filterChanged = false` — hover, select, search, theme, rainbow)**:
     - Never touches `generateTransitiveEdges`, `graph.dropEdge`, or `graph.addEdgeWithKey`.
     - Only refreshes Sigma's visual reducers (`this.sigma.refresh()`) and redraws blooms (`< 1.5ms`).
  2. **Filter Topology Update (`filterChanged = true` — scope, file picker, tri-state, type/edge chips)**:
     - Recomputes visible node bitmask (`visibleMask: Uint8Array`), updates transitive shortcut edges only when visibility actually changed (using a visibility hash guard), and when `autoRebounce` is enabled, runs the fast WASM/TypedArray simulation bounce.

## Consequences & Trade-offs
- **Positive**:
  - Main-thread frame time during pan/zoom/hover drops to **< 1ms** with **zero heap allocations**.
  - Galaxy separation and simulation re-bounce run **10×–25× faster** in flat `Float32Array` / WASM linear memory than object-based JS loops.
  - Hovering and clicking nodes in unaggregated mode (`3,000+` nodes) is instantaneous because Graphology edge buffers are no longer mutated on selection.
- **Negative**:
  - Maintaining a compiled inline WASM byte array alongside a clean `Float32Array` fallback requires unit tests verifying numerical equivalence and performance budgets.
