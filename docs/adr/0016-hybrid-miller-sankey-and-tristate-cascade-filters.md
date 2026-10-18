# ADR 0016: Hybrid Miller-Sankey Traceability Explorer, Tri-State Cascading Tree Filters, and Circletrace Set Algebra

## Context & Problem Statement
While the 2D WebGL galaxy/tree visualizer (ADRs 0013–0015) excels at spatial neighborhood discovery, architectural governance and traceability workflows require structured multi-stage lineage analysis across the software lifecycle:
- **Forward Traceability (Intent $\to$ Implementation)**: Which Features implement `ADR-0014`, which Code modules implement those Features, which Tests verify them, and which Docs explain them? Are there dead-end gaps (e.g., untested or undocumented code)?
- **Backward Traceability ("Why Does This Exist?")**: When a test fails or a code module is being refactored, which upstream Feature specifications and ADR invariants govern it?
- **"Circletrace" (Round-Trip Blast Radius & Indirect Coupling)**: If a developer modifies `Feature A`, which implementing Code files does it touch, and when reflected backward from those shared files, which *other* sibling Features (`Feature B`) and ADRs (`ADR-07`) are indirectly coupled to the change?
- **Cascading Set-Algebra Filtering ("Reduce, Keep What I Tick, Subtract Noise")**: Standard folder trees (ADR 0007 `TreePicker`) only support static boolean file visibility (`checked` / `unchecked`). Users need an active set-algebra filter engine where clicking a node narrows (reduces) the view to its connected lineage ($\cap$), ticking `[✓]` pins a slice into a persistent union ($\cup$) for side-by-side branch comparison or a "Refactor Basket", and excluding `[x]` subtracts high-fan-in utility noise (`-`) so secondary flows scale up cleanly.

## Synergy & Cross-Check with Existing Specifications

| Existing Spec / ADR | Capability Already Built | Synergy & Unification with Miller-Sankey Concept |
| :--- | :--- | :--- |
| **ADR 0004 / 0005** (`semantic_edges-11`, `semantic_edges_refinement-12`) | Tripartite semantic edges (`influences`, `covers`, `verifies`, `binds`, `documents`, `uses`) | Directly populates the **5 Sankey Artifact Stages**: **Col 1: ADRs** (`docs/adr/*`) $\xrightarrow{\text{influences}}$ **Col 2: Features** (`features/**/*.feature`) $\xrightarrow{\text{covers/binds}}$ **Col 3: Code** (`src/**`, `viewer/**`) $\xleftarrow{\text{verifies}}$ **Col 4: Tests** (`test/**`) $\xleftarrow{\text{documents}}$ **Col 5: Docs** (`docs/**`). |
| **ADR 0007** (`tree_picker-11.feature`) | Left sidebar `TreePicker` with 2-state checkboxes (`selectedFiles`) | Upgrade `TreePicker` (and column headers) to the **Tri-State Cascading Filter Engine** (`[ ]` Neutral, `[✓]` Pinned Keep, `[x]` Explicit Exclude) + **Click-to-Reduce** ($\cap$) and **Shift-Click Circletrace** across both the WebGL Canvas and the Sankey Flow view! |
| **ADR 0008** (`transitive_edges-12.feature`) | `generateTransitiveEdges` across hidden intermediaries | Powers **Non-Adjacent Column Ribbons** and **Transitive Survival** when an intermediate column or folder is collapsed/filtered. |
| **ADR 0013** (`bloom_rainbow_and_aggregation_toggles-16`) | `aggregateGraphToParents` & `RELATION_COLORS` | Powers **Miller Folder Roll-Up / Drill-Down** (collapsing a folder in a column merges its Sankey bars and aggregates ribbon weights; expanding splits the ribbon into child file sub-ribbons) and colors ribbons using the canonical relation palette. |
| **ADR 0014 / 0015** (`galaxy_cluster_layout-17`, `tree_backbone-18`) | Curved edges, edge weight hierarchy, and backbone chord filtering | **Ribbon-Weight Thresholding Slider** (`minCouplingWeight: 1..10`) and **Explicit Exclude (`[x]`)** work in both the Sankey view and the 2D WebGL graph to dissolve utility hairballs on demand. |

## Decision Outcome & Architecture

### 1. Unified 5-Stage Artifact Classification (`classifyArtifactStage`)
Every node in the Graft graph maps deterministically to one of 5 canonical lifecycle stages:
1. **`adrs`**: Architectural Decision Records (`docs/adr/**` or `@adr` concepts).
2. **`features`**: BDD Gherkin Specifications (`features/**/*.feature`).
3. **`code`**: Production source modules and symbols (`src/**`, `viewer/**`, excluding test files).
4. **`tests`**: Test suites and step definitions (`test/**`, `**/*.test.*`, `**/*.spec.*`, `features/steps/**`).
5. **`docs`**: Developer, architecture, and reference documentation (`docs/**` excluding `docs/adr/**`, `README.md`, `*.adoc`).

### 2. Tri-State Cascading Set-Algebra Engine (`TriStateFilterEngine`)
Shared across both the left `TreePicker` (in Canvas/Outline views) and the Top-Row Tree Headers (in the Sankey Explorer):
- **Per-Node Tri-State (`"neutral" | "pinned" | "excluded"`)**:
  - `[ ]` **Neutral** (default): Visibility follows the active focus reduction (or all visible when no reduction is active).
  - `[✓]` **Pinned (Keep / Union $\cup$)**: Explicitly locks the node **and its connected upstream/downstream lineage** into the visible set so it survives subsequent reductions on other branches (enabling **Side-by-Side Branch Comparison** and **Refactor Baskets**).
  - `[x]` **Excluded (Subtract $-$)**: Hard-strips the node and all its incident edges/ribbons from layout, flow math, and rendering so high-fan-in utility hubs (`node-file.ts`, `state.ts`) can be subtracted with one click.
- **Interaction Primitives**:
  - **Row Click (Active Reduce $\cap$)**: Sets `activeReduceNode` (or stage set), narrowing visible nodes to the connected upstream + downstream lineage of the clicked node:
    $$\text{Visible} = \bigl(\text{Lineage}(\text{ActiveReduce}) \cup \text{Lineage}(\text{Pinned})\bigr) \setminus \text{Excluded}$$
  - **Shift-Click / Circletrace Button (Round-Trip Reflection)**:
    - **Step 1 (Forward)**: Traces from the selected source node(s) (e.g., `Feature A`) to its directly connected target implementation nodes (`Code` and `Tests`).
    - **Step 2 (Reflection)**: Traces backward and outward from those shared `Code`/`Test` nodes to discover all co-dependent sibling `Features`, governing `ADRs`, and `Docs`, marking reflected secondary paths with `role = "circletrace"` (rendered in contrasting amber/gold).
- **3-Tier Visual Lexicon (Explicit vs. Dynamic Filters)**:
  - **Cyan Outline**: Active focus / reduce root (`activeReduceNode`).
  - **Emerald Green Outline + Pin Badge (`[✓]`)**: Explicitly pinned inclusion.
  - **Crimson Red Strikethrough + Dashed Border (`[x]`)**: Explicitly excluded artifact.
  - **Ghost Stub Bar (`"N items reduced — click to reset"`)**: Summarizes filtered-out volume at the bottom of the tree/column so scale context is never lost.

### 3. Unified 5-Column Grid (Top-Row Tri-State Tree + Bottom-Row Stacked Sankey)
Added as a dedicated view mode / tab (**`Flow` / `Sankey`**) alongside `Context`, `Code`, and `Outline`:
- **1:1 Vertical Column Alignment**: 5 columns (`ADRs` | `Features` | `Code` | `Tests` | `Docs`) with drag-to-reorder headers.
- **Top Row**: Synchronized **Tri-State Tree Filter** per column with expand/collapse chevrons (`▸`/`▾`) and `[ ]`/`[✓]`/`[x]` checkboxes.
- **Bottom Row**: **Stacked Sankey Column** directly beneath each tree header:
  - **Bar Height**: Proportional to coupling weight (link count, symbol count, or churn).
  - **Internal Stacked Status Segments**: Coverage/health ratio (e.g., covered vs. uncovered code, linked vs. gap/orphan nodes) with **Gap Spotting warning badges** on dead-end nodes (e.g., Code with 0 Test or Doc links).
  - **Curved Sankey Ribbons**: Cubic Bézier ribbons (`C`) connecting bars across adjacent or non-adjacent columns, with thickness proportional to edge multiplicity/coupling weight.
  - **In-Place Folder Collapse/Expand**: Collapsing a folder in a column's top tree merges its child Sankey bars into a single macro folder bar and aggregates its ribbons; expanding splits the ribbon back into file-level sub-ribbons.

## Phased Implementation Roadmap
- **Phase 1 (Immediate First Improvement — Engine + Tri-State Tree + Circletrace)**:
  1. Implement the pure, unit-tested **Tri-State Cascading Set-Algebra & Circletrace Engine** (`classifyArtifactStage`, `computeLineageSet`, `computeCircletrace`, `evaluateTriStateFilter`, `computeSankeyColumns`) in `viewer/sankey.ts` (and export from `viewer/data.ts`).
  2. Upgrade `viewer/picker.ts` and `viewer/graph.ts` to support **Tri-State Checkboxes (`[ ]` Neutral $\to$ `[✓]` Pin Keep $\to$ `[x]` Exclude)**, **Click-to-Reduce Lineage**, **Circletrace Mode**, and the **Ghost Stub Reset Bar**, so users can immediately use "Reduce + Keep Ticked", "Subtract Noise (`[x]`)", and "Circletrace" right inside the existing visualizer!
- **Phase 2 (Unified 5-Column Sankey Flow Tab)**:
  - Mount the 5-column Top-Row Tree + Bottom-Row Stacked SVG Sankey canvas in a `Flow` tab in `viewer/index.html` and `viewer/main.ts` powered by the Phase 1 engine.

