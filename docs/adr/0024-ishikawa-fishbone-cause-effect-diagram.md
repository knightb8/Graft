# ADR 0024: Ishikawa Fishbone Cause-and-Effect Diagram for Focused Tripartite Lineage

## Status
Accepted (2026-10-31) — Adds the `🐟 Fishbone` Ishikawa visualizer as a first-class canvas mode alongside `🌌 Galaxy` and `📊 Stacked Flow`.

## Context & Problem Statement
Graft indexes codebases into linked markdown nodes carrying exact file:line spans across the Tripartite architecture: Architecture Decision Records (ADRs) $\to$ Specifications (Specs/Features) $\to$ Production Code $\to$ Verification Suites (Tests) $\to$ Documentation (Docs).

While Graft offers two primary global views:
1. **2D Galaxy Canvas (`🌌 Galaxy`)**: Force-directed spatial graph clustering (via 2-Level Stress Majorization, Cosmos FA2, or Classic D3-force).
2. **5-Column Stacked Flow (`📊 Stacked Flow`)**: Full-system lifecycle flow with barycenter crossing minimization and hierarchical folder drill-down.

Neither of these views is optimized for **directed root-cause analysis (RCA)**. When an engineer investigates a failing test, a production regression, a security alert, or an architectural deviation on a specific component, they need a dedicated causal diagram that answers:
- What decisions (ADRs) governed this component?
- What specifications (features) defined its behavior?
- What code modules and upstream dependencies directly feed into it?
- What tests verify its contracts?
- What documentation describes its usage?

Traditional Ishikawa (fishbone or cause-and-effect) diagrams organize contributing causes into distinct categories branching off a central spine that terminates at the focal effect. Adapting this metaphor to software context graphs provides an intuitive, structured root-cause visualization.

## Decision Drivers
- **Focal Causal Clarity**: Eliminate background noise; display only the upstream causal cone (ancestors, governing ADRs, covering specs, and verifying tests) for a selected node.
- **Tripartite Alignment**: Map major fish ribs directly to Graft's canonical 5 lifecycle categories (ADRs, Specs, Code, Tests, Docs).
- **Anatomical & Ergonomic Geometry**:
  - The focal node sits as the **Head on the left**.
  - The central **Spine** extends horizontally to the right.
  - Major **Ribs** angle backwards toward the tail ($+45^\circ$ for top ribs, $-45^\circ$ for bottom ribs).
  - Sub-bones and descriptions branch off to the **right** of each main rib, ensuring left-to-right reading order without overlap.
- **Interactive Re-Rooting**: Clicking any node attached to a bone immediately re-roots the fishbone around that node.
- **First-Class Canvas Mode**: Accessible directly from the top toolbar via a `🐟 Fishbone` button alongside `🌌 Galaxy` and `📊 Stacked Flow`.

## Decision Outcome & Architecture

```
                                    /─── [ADRs & Decisions (2)]
                                   /
                                  /───── 0001-init.md (governs)           /─── [Specs & Features (2)]
                                 /                                       /
                                /───── 0002-tripartite.md (governs)     /───── auth.feature (covers)
                               /                                       /
                              /                                       /───── login.feature (covers)
                             /                                       /
[HEAD: a.ts] ═══════════════╩═══════════════════════════════════════╩═════════════════> (Tail Fin)
 (Selected)                  \                                       \
                              \                                       \
                               \───── a.test.ts (verifies)             \───── architecture.md (documents)
                                \                                       \
                                 \───── auth.test.ts (verifies)          \───── setup.md (references)
                                  \                                       \
                                   \─── [Tests & Verification (2)]         \─── [Documentation (2)]
```

### 1. The Head & Central Spine
- **Focal Head**: Anchored on the left at $(x_0, y_0)$. Rendered as an accentuated capsule displaying the selected node's name, path, and lifecycle badge.
- **Central Spine**: A clean horizontal vector extending from the head to $(x_{\max}, y_0)$, terminating with a stylized tail fin icon.
- **Empty State**: If no node is selected when opening Fishbone mode, the canvas displays an instructional empty state (`"Select any node to inspect its Ishikawa causal fishbone"`) and auto-selects the primary graph hub if available.

### 2. Major Category Ribs (Tripartite Partitioning)
Nodes in the upstream causal cone are partitioned into 5 canonical lifecycle stages via `classifyArtifactStage`:
- **Top Ribs** (sweeping up and right at $+45^\circ$):
  - **`adrs`**: Architecture Decision Records and governance decisions.
  - **`features`**: BDD specifications, user stories, and requirements.
- **Bottom Ribs** (sweeping down and right at $-45^\circ$):
  - **`tests`**: Automated unit, integration, and E2E verification suites.
  - **`docs`**: Technical documentation, developer guides, and architectural notes.
- **Mid/Transverse Ribs**:
  - **`code`**: Upstream module dependencies, imports, and utility sinks.
- Each rib terminates with an interactive category pill badge displaying the stage title and node count in its canonical Tripartite color:
  - ADRs & Docs: purple (`var(--docs, #a855f7)`)
  - Specs / Features: emerald green (`var(--features, #10b981)`)
  - Tests: sky blue (`var(--accent, #38bdf8)`)
  - Code: amber (`var(--amber, #fbbf24)`)

### 3. Right-Side Sub-Bones (Bonelets & Descriptions)
- Sub-bones branch off horizontally to the **right** of each diagonal main rib.
- Each sub-bone holds a clickable node card with:
  - Symbol / file name
  - Directional relation chip (e.g. `governs`, `covers`, `calls`, `verifies`, `documents`)
- Hovering over a sub-bone highlights the full transmission path along the rib into the central spine and head.
- Left-clicking a sub-bone immediately selects that node as the new Head, smoothly re-rooting the fishbone diagram.

### 4. Integration into Grafton UI
- Added `🐟 Fishbone` button to `#canvasWrap .filterbar` under `Canvas`.
- Implemented `viewer/fishbone-view.ts` (`FishboneView` class) managing SVG rendering, pan/zoom, and click events.
- Connected to `state.canvasBase` (`"galaxy" | "sankey" | "fishbone"`).
- Automatically hidden when in Galaxy or Stacked Flow mode, and vice-versa.

## Consequences & Verification
- **Positive**:
  - Provides a dedicated, low-noise root-cause analysis view for any node in the graph.
  - Directly exposes Tripartite compliance (e.g. immediately reveals if a component lacks governing ADRs, specifications, or tests).
  - Clear visual distinction between global topology (Galaxy), systemic lifecycles (Stacked Flow), and local root causes (Fishbone).
- **Verification**:
  - Validated by BDD feature `features/viz/core/ishikawa_fishbone_diagram-28.feature`.
  - Automated tests in `test/viz-fishbone.test.ts` verifying geometry, rib classification, sub-bone placement, and interactive re-rooting.
