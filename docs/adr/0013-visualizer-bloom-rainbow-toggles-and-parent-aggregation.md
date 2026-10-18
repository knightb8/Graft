# ADR 0013: Visualizer Bloom, Rainbow Edge Toggles, and Parent Container Aggregation Depth

## Context & Problem Statement
The Graft interactive visualizer (`graft viz`) renders code and context graphs with high semantic fidelity. However, as graphs scale to thousands of symbols (e.g., 2,935 nodes and 7,019 edges), developers face different cognitive needs depending on their exploration task:

1. **Visual Density & Modality Preferences**:
   - Some developers rely on archipelago radiant blooms to detect subsystems, while others prefer a clean, distraction-free node-and-link canvas.
   - Rainbow edge coloring allows rapid visual categorization of relation types (`part of`, `uses`, `covers`, `influences`), but some architectural reviews require a neutral monochrome palette to focus strictly on topological structure.
2. **Granularity vs. Abstraction (Symbol vs. File Aggregation)**:
   - By default, the code graph ingests every function, method, class, interface, and document section as an independent node. On large codebases, this generates thousands of nodes, creating high visual noise when the user simply wants to understand file-to-file and module-to-module dependencies.
   - Collapsing child symbols into their parent container (the file or document node) and lifting edges between them dramatically reduces graph complexity (from ~3,000 nodes to ~370 files), boosting semantic token density and rendering speed.

## Decision Drivers
- **Configurable Visual Overlays**: Provide explicit user controls to toggle Archipelago blooms and Rainbow edge coloring without page reloads.
- **Hierarchical Aggregation by Default**: Default to parent container aggregation (`aggregate = on`) so graphs open in a clean, legible architectural mode, with an instant toggle to drill down into granular symbol nodes (`aggregate = off`).
- **Semantic Edge Lifting**: When aggregating child symbols, preserve dependency topology by lifting edges between child symbols to their respective parent container nodes.
- **Deduplication & Edge Weighting**: Deduplicate lifted parallel edges while tracking multi-call densities.
- **State Persistence & Offline Export**: Maintain toggle choices across view changes and support toggles in offline `graft viz --export` single-file HTML bundles.

## Decision Outcome & Rationale

### 1. Archipelago Bloom Toggle & Adaptive Performance Budget (`showBlooms`)
- **Default State**: `false` (OFF by default).
  - Background compute, WebGL instance buffering, spatial grid hashing, and badge drawing are completely skipped on initial load.
  - Ensures instantaneous first paint with zero GPU fill-rate overhead.
- When toggled `true`:
  - Re-computes spatial hash grid cohesion and renders radiant Gaussian blooms and cluster badges.
- **Adaptive Performance Budget & Auto-throttle**:
  - The render loop measures bloom execution time via `performance.now()`.
  - If a frame takes longer than $16\text{ ms}$ (the 60fps frame budget threshold) or if the active graph exceeds 350 nodes on low-power devices, the visualizer automatically throttles or disables blooms to preserve 60fps responsiveness.
  - The UI toggle chip reflects this status and informs the user.

### 2. Rainbow Edge Coloring Toggle (`rainbowEdges`)
- Add a toolbar toggle control for rainbow edges (default: `true`).
- When `true`:
  - Edges render in their canonical relation colors (`relationColor(rel)`): Sky Blue for `part of`, Golden Amber for `uses`, Emerald Green for `covers`/`verifies`, Violet for `documents`, Hot Rose for `influences`, Coral for `extends`, and Tangerine for `transitive`.
  - Edge chips in the legend display matching colored SVG glyphs and borders.
- When `false` (monochrome):
  - Edges render in uniform muted slate (`cvar("--edge")`).
  - Active focus (incoming/outgoing) preserves directional contrast (`--accent` and `--fil`).

### 3. Parent Container Aggregation (`aggregateToParent`)
- Add a toggle control: **"Aggregate to files"** (default: `true`).
- **Aggregation Engine**:
  - Identify container parents: For code graphs, nodes of types `function`, `method`, `class`, `interface`, `type`, `enum` map to their parent `file` node (determined via `sources` path or parent hierarchy). For doc graphs, sections map to their parent doc node.
  - When `aggregateToParent = true`:
    - Only parent container nodes are instantiated in the Graphology model.
    - Each container node's radius scales with its internal symbol count: `r = baseR + sqrt(symbolCount) * 1.5`.
    - Edges between child symbols are lifted to connect their parent container nodes. Self-referential internal calls (within the same file) are omitted or collapsed.
    - Lifted parallel edges are merged with count annotations.
  - When `aggregateToParent = false`:
    - Full granular graph is instantiated with all individual functions, methods, and types.
- Dynamically re-runs ForceAtlas2 and auto-framing on aggregation state toggle.

## Consequences & Trade-offs
- **Positive**:
  - Massive legibility improvement: Graphs load cleanly at file/module scale by default (~370 nodes instead of ~3,000).
  - Users can seamlessly switch between high-level architectural architecture and granular symbol call graphs.
  - Developers can customize the visual aesthetic (blooms on/off, rainbow on/off) with a single click.
- **Negative**:
  - Lifting edges across parents requires a preprocessing pass during `setData` when aggregation is enabled (completes in $<10\text{ ms}$).
