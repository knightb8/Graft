# 26. Visualizer Ergonomics, Dynamic Fishbone Clearance, and Galaxy Sizing Metrics

Date: 2026-10-31
Status: Accepted

## Context

Graft provides multiple visualizer modalities for inspecting the context and codebase knowledge graphs: 2D WebGL Cosmos/Galaxy, Stacked Miller-Sankey Lifecycle Flow, Ishikawa Cause-and-Effect Fishbone, and Circular Dependency Wheel.

User feedback and interactive dogfooding highlighted three critical areas of ergonomic friction and visual limitation:
1. **Stacked Flow Drag/Click Interference & Blast Clear**:
   - Mutating the DOM on `pointerdown` (`el.parentElement.appendChild(el)`) breaks browser pointer capture and drops `pointerup` and subsequent `click` events, rendering bar bubble selection erratic.
   - The absolute `.filterbar` container overlay and narrow toolbar top margin caused click events targeted at `#sankeyClearTrace` to be intercepted or blocked.
2. **Fishbone Zoom & Sub-Spine Overlapping**:
   - On every wheel event tick, `FishboneView` destroyed and rebuilt the full SVG DOM, resetting zoom origin to $(0,0)$ and causing severe jitter without cursor anchoring.
   - Static rib lengths ($220\text{px}$) and uniform junction placement provided insufficient vertical clearance ($\le 25\text{px}$) when categories contained 4+ items, causing sub-bone cards ($24\text{px}$ high) to collide vertically and horizontally with adjacent ribs.
3. **Space/Galaxy Mode Sizing Dimensions & Uniform Edge Girth**:
   - In Galaxy mode, node radius was constrained to a single degree-based metric, lacking dimensions for Lines of Code (LOC), function/section symbol count, in-degree, and out-degree.
   - Edges between modules were rendered with uniform thin stroke widths, failing to convey accumulated multi-call traffic corridors between heavily coupled parent files or subsystems.

## Decision

1. **Stacked Flow Pointer Invariant & Layer Isolation**:
   - Remove `appendChild` from `pointerdown`. Only hoist dragged elements during `pointermove` after the move threshold ($\ge 8\text{px}$) is exceeded.
   - Give `.filterbar` `pointer-events: none` and children `pointer-events: auto`.
   - Provide a minimum $62\text{px}$ top margin on `.sankey-toolbar` to ensure clean separation from the filter bar.
   - Ensure `#sankeyClearTrace` binds to both `click` and `pointerdown` to immediately reset selection and blast attenuation state.
2. **Smooth Cursor-Anchored Fishbone Zooming & Dynamic Geometric Clearance**:
   - Update wheel event handling to perform cursor-anchored scaling directly on the `<g class="fishbone-stage">` element using CSS/SVG transforms without re-rendering the DOM.
   - Replace fixed rib lengths with dynamic heights: $\Delta Y = \max(160, (\text{count} + 1) \times 36)$, guaranteeing a minimum $12\text{px}$ vertical gap between adjacent sub-bone cards.
   - Dynamically space spine junctions based on the horizontal bounding footprint of each rib ($\Delta X + \text{boneWidth} + 40\text{px}$), eliminating collisions between sequential ribs.
3. **Multi-Metric Galaxy Node Sizing & Accumulated Edge Girth**:
   - Introduce `NodeSizeMetric: "degree" | "loc" | "symbols" | "indegree" | "outdegree"`.
   - Parse LOC ranges from node `sources` (e.g. `L1-L150` $\to 150$) and count contained child symbols.
   - Add UI pill selectors in the Galaxy toolbar to switch node sizing dynamically on the fly.
   - Aggregate edge connection density between pairs $(u, v)$ in `reduceEdge`, scaling edge stroke size proportionally ($\text{size} \propto \sqrt{\text{accumulatedCount}}$) to reveal architectural traffic corridors.

## Consequences

- Stacked Flow interaction becomes rock-solid: single clicks select bubbles immediately, double clicks expand folders, and the Clear Blast Trace button is completely reliable.
- Fishbone zoom operates at 60fps anchored under the mouse cursor, and categories with arbitrary numbers of items never overlap.
- Galaxy visualization allows developers to immediately identify massive files (by LOC), complex modules (by symbols), architectural hubs (by in/out degree), and dense coupling corridors (by accumulated edge girth).
