# ADR 0025: Circular Dependency Wheel (Chord Diagram) for Lifecycle Coupling

## Status
Accepted (2026-10-31) — Adds the `🎡 Wheel` circular chord visualizer as a fourth canvas mode alongside `🌌 Galaxy`, `📊 Stacked Flow`, and `🐟 Fishbone`.

## Context & Problem Statement
Graft provides spatial graph exploration (`🌌 Galaxy`), systemic lifecycle columns (`📊 Stacked Flow`), and targeted root-cause analysis (`🐟 Fishbone`). However, when assessing whole-codebase architectural coupling, circular dependencies, and cross-tier architectural boundary violations, linear and force-directed layouts have notable limitations:
- In force-directed layouts (`Galaxy`), cyclic chords cross through node clusters and become visually tangled.
- In linear column flows (`Stacked Flow`), backward edges (e.g. Code referencing Docs or cyclic inter-module calls) must bend backward around columns or are rendered as inverted loops.
- Engineers need a compact, holistic view where **all interactions are visible simultaneously**, circular feedback loops are immediately apparent, and architectural coupling density between lifecycle stages can be seen at a glance.

A **Circular Dependency Wheel** (Chord Diagram) solves this by placing all entities along a circular perimeter divided into canonical Tripartite lifecycle sectors, with smooth interior Bézier ribbons connecting interacting entities.

## Decision Drivers
- **Holistic Architectural Topology**: Display all cross-stage and inter-module dependencies without directional column bias.
- **Tripartite Perimeter Partitioning**: The circumference is divided into 5 proportional arcs:
  1. `ADRs & Decisions` (`#a855f7`)
  2. `Specs & Requirements` (`#10b981`)
  3. `Production Code` (`#38bdf8`)
  4. `Tests & Verification` (`#f59e0b`)
  5. `Documentation & Guides` (`#ec4899`)
- **Interior Quadratic/Cubic Bézier Chords**: Ribbons pass through the interior of the wheel with control points pulled toward the center origin $(cx, cy)$.
- **Interactive Chord Illumination**: Hovering or clicking any sector or node highlights its active flows while dimming background chords.
- **First-Class Canvas Mode**: Integrated into the top toolbar as `Canvas: [🌌 Galaxy] [📊 Stacked Flow] [🐟 Fishbone] [🎡 Wheel]`.

## Decision Outcome & Architecture

```
                      1. ADRs & Decisions
                         (Purple Arc)
                    ,-'""`-.
                ,'    / \   `.
  5. Docs    ,'      /   \    `.  2. Specs & Features
  (Pink)    /       /     \     \ (Green Arc)
           |        \     /      |
           |         \   /       |
            \         \ /       /
             `.        |      ,'  3. Code Modules
               `.      |    ,'    (Blue Arc)
                 `-.  /  .-'
                    `'--'
               4. Tests & Verification
                  (Amber Arc)
```

### 1. Perimeter Arc Geometry
- Center $(cx, cy)$ computed from container dimensions.
- Outer radius $R_{\text{out}} \approx \min(W, H) / 2 - 70$, inner radius $R_{\text{in}} = R_{\text{out}} - 16$.
- The $360^\circ$ circle is divided into 5 stage sectors, separated by small angular void gaps ($2.5^\circ$).
- Within each sector, nodes are allocated angular slots proportional to their connection degree or uniform segments.

### 2. Interior Ribbon Chords
- For each edge $(u, v)$ with relation $r$:
  - Start point on inner perimeter: $p_1 = (R_{\text{in}} \cos\theta_u, R_{\text{in}} \sin\theta_u)$.
  - End point on inner perimeter: $p_2 = (R_{\text{in}} \cos\theta_v, R_{\text{in}} \sin\theta_v)$.
  - Control point: Pulled inward toward center $(cx, cy)$ with tension factor $0.45$.
  - Drawn using SVG `<path d="M p1x,p1y Q cx,cy p2x,p2y ...">` with opacity attenuation.
  - Colors match relation families (`var(--features)`, `var(--docs)`, `var(--amber)`, `var(--accent)`).

### 3. Interactive Focus & Blast
- Hovering or clicking a sector (e.g. `ADRs`) illuminates all chords originating from or terminating in that stage.
- Selecting an individual node lights up its primary causal and consumer ribbons, displaying source $\to$ target relationship labels.
- Synchronized with `state.selectedNode` across all canvas views.

## Consequences & Verification
- **Positive**:
  - Provides an immediate visual fingerprint of project coupling and circular dependencies.
  - Seamlessly bridges Tripartite governance (ADRs) and verification (Tests).
- **Verification**:
  - Validated by BDD feature `features/viz/core/circular_dependency_wheel-29.feature`.
  - Automated tests in `test/viz-wheel.test.ts`.
