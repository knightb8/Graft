# ADR 0023: Entity Event System and Columnar TypedArray Component Stores

## Status
Accepted (2026-10-30) — Extends and formalizes the flat-memory vector architecture from ADR 0017 (WASM & TypedArray Physics) and ADR 0021 (Two-Level Stress-SGD Layout).

## Context & Problem Statement
Graft's WebGL visualization engine (Sigma.js + Graphology) previously represented nodes and edges as conventional JavaScript heap objects:
- Every node was an allocated object with nested properties (`{ id, attributes: { x, y, size, color, ... } }`).
- Interactions and state mutations traversed object maps and emitted dynamic JavaScript event payloads.

As codebase graphs scale past 5,000 files and 20,000 fine-grained symbols, this object-oriented model encounters fundamental physical limits on modern hardware:
1. **L1/L2/L3 Cache Misses from Pointer Chasing**: Iterating over 20,000 object references scattered across the V8 heap destroys CPU cache line locality, making physics updates memory-bandwidth bound rather than compute bound.
2. **Garbage Collection (GC) Stutter**: Physics simulation and interaction loops tick 60 times per second. Event objects, coordinate vectors, and closure allocations trigger frequent minor GC scavenges, causing visible frame drops.
3. **GPU Data Marshalling Overhead**: WebGL requires contiguous binary buffers (`Float32Array`). In an object model, the CPU must iterate through every object to pack coordinates into typed arrays prior to every draw call, wasting 5–15ms per frame in pure serialization.

## Decision Drivers
- **Massive Graph Scale**: Smoothly simulate and render graphs containing **$\ge 50,000$ nodes and $150,000$ edges** at a locked 60 FPS.
- **Zero-Allocation Interactive Loop**: Eliminate per-frame heap allocations (0 bytes allocated per 60fps frame).
- **Direct GPU Pipeline Integration**: Enable direct binary streaming (`gl.bufferSubData`) from CPU memory buffers into WebGL Vertex Buffer Objects (VBOs).
- **Deterministic Event Propagation**: Support deterministic replay and testing by recording interaction signals as packed integer events.

## Decision Outcome & Architecture

### 1. Dense Entity Identifiers & Columnar Stores (Structure of Arrays)
Entities are strictly 32-bit integer indices ($i \in [0, N-1]$). Node attributes are partitioned into parallel contiguous TypedArrays:
- **Transform**: `posX: Float32Array`, `posY: Float32Array` (2D world positions).
- **Physics**: `velX: Float32Array`, `velY: Float32Array`, `mass: Float32Array` (Verlet dynamics).
- **Visuals**: `colorRGBA: Uint32Array` (32-bit packed hex), `radius: Float32Array` (radius in pixels).
- **Blast Lineage**: `blastEnergy: Float32Array` ([0.0 .. 1.0]), `blastHop: Uint8Array`.
- **State Bitmask**: `flags: Uint32Array` (bitflags for `VISIBLE`, `HOVERED`, `SELECTED`, `IS_SEED`, `IN_BLAST`, `PINNED`, `DIRTY_POSITION`).

### 2. Zero-Allocation Event Ring Buffer
Rather than allocating JavaScript event objects on interaction, signals are written as 4-tuple float/integer records into a pre-allocated circular buffer (stride 4, capacity 2,048 events):
$$\text{Event Slot} = [\text{OpCode (16-bit)}, \text{EntityID (16-bit)}, \text{ParamA (Float32)}, \text{ParamB (Float32)}]$$

Supported OpCodes:
- `POINTER_DOWN`, `POINTER_MOVE`, `POINTER_UP`
- `NODE_SELECT`, `BLAST_TRIGGER`
- `FOLDER_EXPAND`, `FOLDER_COLLAPSE`
- `SCOPE_FILTER`, `WAKE_CLUSTER`

### 3. Pipeline Systems Execution
Each frame processes state through sequential cache-friendly batch loops:
1. **`EventDispatcherSystem`**: Drains the ring buffer, updates bitmask flags, marks affected clusters as awake.
2. **`SpatialGridSystem`**: Rebins positions into a flat integer spatial hash grid (`Int32Array`) for $O(1)$ neighbor queries without string keys.
3. **`VerletPhysicsSystem`**: Steps spring and collision forces only over active, dirty entities. Entities flagged `PINNED` hold their user-dragged coordinates.
4. **`CausalBlastSystem`**: Evaluates upstream provenance and downstream impact using a flat Compressed Sparse Row (CSR) topology buffer, enforcing causal collider zero-decay rules.
5. **`WebGLRenderSystem`**: Streams dirty coordinate slices directly to WebGL VBOs via `gl.bufferSubData()` without intermediate object loops.

## Consequences

### Positive
- **Scale Multiplication**: Unlocks fluid 60 FPS navigation on 50,000+ nodes (a $10\times$ increase over previous object architecture limits).
- **Zero GC Jitter**: Eliminates minor GC scavenges during continuous drag and camera interactions.
- **WASM & WebGPU Native**: The flat columnar layout can be shared directly with WebAssembly linear memory (`WebAssembly.Memory`) and WebGPU storage buffers without data marshalling.
- **Deterministic Replay**: Exploration sessions can be serialized as compact byte streams of event tuples and replayed with bit-for-bit precision.

### Negative / Trade-Offs
- **More Complex Direct API**: Components must be accessed via entity index (`store.posX[id]`) rather than object property syntax (`node.x`).
- **Capacity Management**: Stores must be pre-allocated or resized in geometric chunks ($2\times$) when codebase graphs exceed initial capacity.

## References & Tripartite Traceability
- **Governing Technical Specification**: [docs/devdocs/entity-event-system-tech-spec.md](../devdocs/entity-event-system-tech-spec.md)
- **BDD Specification**: [features/viz/core/entity_event_system_and_columnar_stores-27.feature](../../features/viz/core/entity_event_system_and_columnar_stores-27.feature)
- **Predecessor ADRs**:
  - [ADR 0017: WASM and TypedArray Vector Physics](0017-wasm-typedarray-galaxy-physics-and-zero-alloc-rendering.md)
  - [ADR 0020: Unified Relation Registry and Degree-Normalized Edge Weights](0020-unified-relation-registry-and-degree-normalized-edge-weights.md)
  - [ADR 0021: Two-Level Stress-SGD Organic Layout](0021-two-level-stress-sgd-organic-layout-with-preset-constraints.md)
