# ADR 0008: Transitive Edge Generation and Edge Contrast in Visualizer

## Context & Problem Statement
When exploring graphs in the Graft visualizer (`graft viz`), users frequently apply filters:
1. **Architectural Scopes**: e.g., filtering down to only Documentation (`docs`) and Code (`code`), hiding Specifications (`specs`).
2. **Directory Tree Picker**: e.g., selecting specific subsystems (`docs/` and `src/`), omitting test or spec folders.

In the Tripartite Architecture, many meaningful relationships are multi-hop across domains:
- An ADR node ($A$) connects via `influences` to a BDD Feature ($B$).
- The BDD Feature ($B$) connects via `covers` to a source module ($C$).

When the user unchecks the `specs` scope checkbox, node $B$ is hidden from view. Previously, the graph filter dropped all edges touching hidden nodes, leaving node $A$ and node $C$ completely disconnected on the canvas despite their direct architectural lineage ($A \to B \to C$).

Furthermore, feedback indicates that normal edges in the visualizer can have insufficient contrast/visibility against the background canvas (opacity 0.5 with low-contrast muted tones), making structural dependencies hard to distinguish.

## Decision Drivers
- **Continuous Architectural Traceability**: When intermediate nodes are filtered away, users must still see that two visible components have an indirect relationship.
- **Edge Legibility**: Default edges must be clearly visible with sufficient contrast, width, and distinct rendering for direct vs transitive edges.
- **Cycle and Explosion Prevention**: Transitive edge resolution must be bounded (e.g., max 2 or 3 intermediate hops) and deduplicated.
- **User Controllability**: Users must be able to toggle transitive edges on/off in the visualizer chrome.

## Decision Outcome & Rationale
1. **Transitive Edge Generator (`src/graph/transitive.ts` & `viewer/`)**:
   - Given an active graph and a set of visible nodes, traverse outbound edges through hidden intermediate nodes (up to max depth 3).
   - If an unbroken directed path leads to another visible node, generate a **transitive edge**:
     - `source`: the starting visible node.
     - `target`: the destination visible node.
     - `relation`: `"transitive"` or combined chain label (e.g. `influences → covers`).
     - `confidence`: `"inferred"`.
     - `via`: array of intermediate hidden node IDs and names.
2. **Visual Contrast & Distinctions (`viewer/style.css` & `viewer/graph.ts`)**:
   - Boost base edge opacity from `0.5` to `0.72` and base stroke width for clearer visibility.
   - Boost color contrast for `--edge` in both light mode and dark mode.
   - Render transitive edges with a dedicated dashed pattern (`stroke-dasharray: 4 4`), amber/accent accenting or distinct contract styling, and descriptive tooltips showing the contracted path.
3. **Interactive Toggle in Viewer**:
   - Add a checkbox in the visualizer filter bar: `[x] Transitive edges`.
