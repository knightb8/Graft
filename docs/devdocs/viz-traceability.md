# Visualization Traceability Matrix (BDD Chem Closure Audit)

This document maps all BDD specifications in `features/viz/core/*-16..26.feature` to their executing test coverage and covered production source modules.

Governed by [ADR 0013](docs/adr/0013-visualizer-bloom-rainbow-toggles-and-parent-aggregation.md), [ADR 0014](docs/adr/0014-galaxy-cluster-layout-and-edge-hierarchy.md), [ADR 0015](docs/adr/0015-hierarchical-tree-backbone-and-curved-webgl-edges.md), [ADR 0016](docs/adr/0016-hybrid-miller-sankey-and-tristate-cascade-filters.md), [ADR 0017](docs/adr/0017-wasm-typedarray-galaxy-physics-and-zero-alloc-rendering.md), [ADR 0018](docs/adr/0018-tunable-cosmos-gravity-presets-support-sinks-and-edge-bundling.md), [ADR 0019](docs/adr/0019-directional-blast-attenuation-and-collider-zero-decay.md), [ADR 0020](docs/adr/0020-unified-relation-registry-and-degree-normalized-edge-weights.md), [ADR 0021](docs/adr/0021-two-level-stress-sgd-organic-layout-with-preset-constraints.md), and [ADR 0022](docs/adr/0022-hierarchical-drill-down-and-crossing-minimized-ordering-in-stacked-flow-columns.md).

---

## 1. Traceability Summary

| Feature File | Topic | Total Scenarios | Covered | Partial / WIP | Missing |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `features/viz/core/bloom_rainbow_and_aggregation_toggles-16.feature` | Blooms, Rainbow, Aggregation | 5 | 5 | 0 | 0 |
| `features/viz/core/galaxy_cluster_layout-17.feature` | Galaxy Separation & Hub Anchor | 7 | 6 | 1 | 0 |
| `features/viz/core/hierarchical_tree_backbone_and_curved_edges-18.feature` | Tree Backbone & Curved Edges | 6 | 6 | 0 | 0 |
| `features/viz/core/hybrid_miller_sankey_and_tristate_filters-19.feature` | Miller-Sankey & Circletrace | 5 | 4 | 1 | 0 |
| `features/viz/core/wasm_typedarray_galaxy_acceleration-20.feature` | WASM & Flat Spatial Grid | 3 | 3 | 0 | 0 |
| `features/viz/core/interactive_physics_and_visual_parity-21.feature` | Verlet Drag & Visual Grammar | 5 | 4 | 0 | 1 |
| `features/viz/core/cosmos_gravity_presets_and_edge_bundling-22.feature` | Cosmos Presets & Bundling | 5 | 5 | 0 | 0 |
| `features/viz/core/directional_blast_attenuation_and_sankey_subfolders-23.feature` | Blast Attenuation & Colliders | 5 | 5 | 0 | 0 |
| `features/viz/core/relation_registry_and_degree_normalization-24.feature` | Unified Relation Registry | 5 | 5 | 0 | 0 |
| `features/viz/core/two_level_stress_layout_and_preset_constraints-25.feature` | Two-Level Stress-SGD Layout | 5 | 2 | 3 | 0 |
| `features/viz/core/stacked_flow_hierarchical_drilldown-26.feature` | Hierarchical Column Drill-Down | 6 | 6 | 0 | 0 |
| **Totals** | | **57** | **51** | **5** | **1** |

---

## 2. Detailed Traceability Specifications

### Feature 16: Visualizer Bloom, Rainbow, and Parent Aggregation Toggles
- **Specification**: `features/viz/core/bloom_rainbow_and_aggregation_toggles-16.feature`
- **Governing ADR**: `docs/adr/0013-visualizer-bloom-rainbow-toggles-and-parent-aggregation.md`

| Scenario | Covering Test | Source Modules | Status |
| :--- | :--- | :--- | :---: |
| Archipelago blooms disabled by default for zero-overhead initial paint | `Archipelago blooms are disabled by default (showBlooms: false) for zero initial overhead` (`test/viz-sigma.test.ts:822`) | `viewer/graph.ts`, `viewer/main.ts` | **covered** |
| Adaptive performance budget guards 60fps render loop against compute spikes | `Adaptive performance budget automatically throttles blooms when draw duration exceeds 16ms` (`test/viz-sigma.test.ts:828`) | `viewer/graph.ts` | **covered** |
| Toggling rainbow colored edges on and off | `Rainbow edge toggle assigns canonical relation colors when true and neutral monochrome with focus contrast when false` (`test/viz-sigma.test.ts:758`) | `viewer/graph.ts`, `viewer/main.ts` | **covered** |
| Parent container aggregation enabled by default | `aggregateGraphToParents collapses granular symbols into parent file containers and lifts edges` (`test/viz-sigma.test.ts:679`) | `viewer/graph.ts`, `viewer/data.ts` | **covered** |
| Toggling parent container aggregation off for granular symbol inspection | `aggregateGraphToParents collapses granular symbols into parent file containers and lifts edges` (`test/viz-sigma.test.ts:679`) | `viewer/graph.ts`, `viewer/main.ts` | **covered** |

---

### Feature 17: Galaxy Cluster Layout and Spiderweb Edge De-Cluttering
- **Specification**: `features/viz/core/galaxy_cluster_layout-17.feature`
- **Governing ADR**: `docs/adr/0014-galaxy-cluster-layout-and-edge-hierarchy.md`

| Scenario | Covering Test | Source Modules | Status |
| :--- | :--- | :--- | :---: |
| Intra-galaxy edges outweigh inter-galaxy edges to condense distinct islands | `EDGE_CONTRACTION_WEIGHTS and computeEdgeLayoutWeight calculate distinct profiles in coupled vs directory mode` (`test/viz-sigma.test.ts:857`) | `viewer/data.ts`, `viewer/graph.ts` | **covered** |
| Subsystem hubs anchor at galactic centers rather than flinging to the outer perimeter | `separateGalaxies compacts intra-cluster members around hubs and enforces inter-galaxy void space` (`test/viz-sigma.test.ts:900`) | `viewer/graph.ts` | **covered** |
| Inter-galaxy spiderweb edges are dimmed at rest and illuminated on focus | `Spiderweb edge hierarchy renders intra-galaxy edges crisply and dims cross-galaxy edges until focused` (`test/viz-sigma.test.ts:950`) | `viewer/graph.ts` | **covered** |
| Aggregated file containers receive distinct subsystem galaxy colors and legend swatches | `galaxyColorOfCluster assigns distinct subsystem colors while preserving specs and docs scope colors` (`test/viz-sigma.test.ts:980`) | `viewer/data.ts`, `viewer/main.ts` | **covered** |
| Every visible subsystem galaxy labels its nucleus hub at default zoom | `computeGalaxyLandmarks guarantees every multi-node galaxy labels its nucleus hub at rest` (`test/viz-sigma.test.ts:995`) | `viewer/graph.ts`, `viewer/data.ts` | **covered** |
| Dragging and releasing a node keeps unrelated galaxies stationary | `relaxLocalNeighborhood resolves local neighbor overlap while keeping unrelated galaxies 100% stationary` (`test/viz-sigma.test.ts:1019`) | `viewer/graph.ts` | **covered** |
| Detail panel inspects aggregated file containers and navigates lifted edges | `aggregateGraphToParents collapses granular symbols into parent file containers and lifts edges` (`test/viz-sigma.test.ts:679`) | `viewer/detail.ts`, `viewer/main.ts` | **partial** (container metadata covered; interactive detail panel click navigation verified in browser) |

---

### Feature 18: Hierarchical Tree-Backbone Layout and Curved WebGL Edges
- **Specification**: `features/viz/core/hierarchical_tree_backbone_and_curved_edges-18.feature`
- **Governing ADR**: `docs/adr/0015-hierarchical-tree-backbone-and-curved-webgl-edges.md`

| Scenario | Covering Test | Source Modules | Status |
| :--- | :--- | :--- | :---: |
| Semantic relation weight hierarchy, cosmos presets, and interactive weight sliders govern layout pull | `COSMOS_PRESETS provides tailored profiles for code, spec, and doc modes with dynamic reweighting` (`test/viz-sigma.test.ts:2050`) | `viewer/data.ts`, `viewer/graph.ts`, `viewer/main.ts` | **covered** |
| Support and utility classes are detected, visually badged, and dampened in layout and resting edges | `detectSupportNodes identifies topological sinks and lexical utility modules` (`test/viz-sigma.test.ts:1838`) | `viewer/data.ts`, `viewer/graph.ts` | **covered** |
| D3-style organic intra-cluster node spacing and natural inter-cluster proximity | `relaxAndSeparateGalaxiesVectorized enforces D3-style organic clearance >= 28px between sibling nodes in a cluster` (`test/viz-sigma.test.ts:1948`) | `viewer/wasm-physics.ts`, `viewer/graph.ts` | **covered** |
| Hierarchical control-point edge bundling aligns parallel corridor splines and boosts highway visibility | `computeHierarchicalEdgeBundles assigns corridor curvature and scales restOpacity and restSize by sqrt(bundleSize)` (`test/viz-sigma.test.ts:1997`) | `viewer/graph.ts`, `viewer/data.ts` | **covered** |
| Toggling between Re-Bounce simulation and Hold positions on filter changes | `rebounceVisible recalculates equilibrium coordinates when autoRebounce is enabled and holds positions when false` (`test/viz-sigma.test.ts:1381`) | `viewer/graph.ts`, `viewer/main.ts` | **covered** |
| Orphan micro-cluster consolidation and interactive node dragging after graph rebuilds | `synthesizeDirectoryTree, consolidateOrphanClusters, and Sigma dragManager monkeypatch preserve tree hierarchy and node dragging` (`test/viz-sigma.test.ts:1325`) | `viewer/data.ts`, `viewer/graph.ts` | **covered** |

---

### Feature 19: Hybrid Miller-Sankey Explorer and Tri-State Cascading Tree Filters
- **Specification**: `features/viz/core/hybrid_miller_sankey_and_tristate_filters-19.feature`
- **Governing ADR**: `docs/adr/0016-hybrid-miller-sankey-and-tristate-cascade-filters.md`

| Scenario | Covering Test | Source Modules | Status |
| :--- | :--- | :--- | :---: |
| Five-stage lifecycle classification and forward-backward lineage reduction | `classifyArtifactStage classifies nodes across 5 canonical lifecycle stages` (`test/viz-sigma.test.ts:1040`) | `viewer/sankey.ts`, `viewer/data.ts` | **covered** |
| Tri-state cascading set algebra with Reduce, Keep Ticked Pinning, and Explicit Exclusion | `evaluateTriStateFilter enforces Reduce (∩), Keep Ticked Pinning (∪), and Explicit Exclusion (-)` (`test/viz-sigma.test.ts:1075`) | `viewer/data.ts`, `viewer/picker.ts` | **partial** (`@wip`: data-layer algebra covered in `viewer/data.ts`; Sankey column header tree UI deferred) |
| Circletrace two-hop reflection discovers indirectly coupled sibling features and governing ADRs | `computeCircletrace computes primary lineage and reflects backward across shared implementation boundaries` (`test/viz-sigma.test.ts:1155`) | `viewer/sankey.ts`, `viewer/graph.ts` | **covered** |
| Miller folder roll-up and drill-down dynamically aggregates and splits Sankey column bars and ribbons | `computeSankeyColumns aggregates Miller folder columns and spots dead-end gaps` (`test/viz-sigma.test.ts:1225`) | `viewer/sankey.ts` | **covered** |
| Switching between the Galaxy canvas base and the Stacked Flow canvas base renders an interactive draggable 5-column Sankey SVG | `SankeyView.render() renders all 5 stage columns (adrs, features, code, tests, docs) and ribbons without throwing` (`test/viz-sigma.test.ts:2247`) | `viewer/sankey.ts`, `viewer/main.ts`, `viewer/index.html` | **covered** |

---

### Feature 20: WASM and TypedArray Vectorized Galaxy Physics and Zero-Allocation Rendering
- **Specification**: `features/viz/core/wasm_typedarray_galaxy_acceleration-20.feature`
- **Governing ADR**: `docs/adr/0017-wasm-typedarray-galaxy-physics-and-zero-alloc-rendering.md`

| Scenario | Covering Test | Source Modules | Status |
| :--- | :--- | :--- | :---: |
| Re-bouncing galaxy clusters via vectorized WASM and TypedArray buffers settles within a single frame budget | `isWasmPhysicsActive returns true and relaxAndSeparateGalaxiesVectorized relaxes and separates 1,000 nodes within 16ms` (`test/viz-sigma.test.ts:1435`) | `viewer/wasm-physics.ts`, `viewer/data.ts` | **covered** |
| Panning and zooming with radiant galaxy blooms uses a zero-allocation integer spatial hash grid | `FlatSpatialGrid computes accurate intra-cluster neighbor counts and cohesion scores in < 2ms without string keys` (`test/viz-sigma.test.ts:1505`) | `viewer/wasm-physics.ts`, `viewer/graph.ts` | **covered** |
| Selecting, hovering, and searching nodes responds instantaneously without mutating Graphology edge topology | `Selecting, hovering, and searching nodes does not drop or recreate transitive edges when node visibility has not changed` (`test/viz-sigma.test.ts:1562`) | `viewer/graph.ts` | **covered** |

---

### Feature 21: Interactive Bouncy Drag Physics and Original Visualizer Parity
- **Specification**: `features/viz/core/interactive_physics_and_visual_parity-21.feature`
- **Governing ADR**: `docs/adr/0015-hierarchical-tree-backbone-and-curved-webgl-edges.md`, `docs/adr/0017-wasm-typedarray-galaxy-physics-and-zero-alloc-rendering.md`

| Scenario | Covering Test | Source Modules | Status |
| :--- | :--- | :--- | :---: |
| Interactive node dragging pins the dragged node and drives bouncy spring-and-collision physics on neighbors | `interactive node dragging pins the dragged node, steps Velocity-Verlet physics on neighbors, and setContractionMode reweights edges` (`test/viz-sigma.test.ts:1710`), line 1785 | `viewer/graph.ts`, `viewer/wasm-physics.ts` | **covered** |
| Manual reheat and filter re-bounce energize the velocity-Verlet simulation | `rebounceVisible recalculates equilibrium coordinates when autoRebounce is enabled and holds positions when false` (`test/viz-sigma.test.ts:1381`) | `viewer/graph.ts`, `viewer/data.ts` | **covered** |
| Edge family grammar and focus-mode incident verb labels | `reduceEdge renders curved splines, keeps curated cross-galaxy bridges visible at rest, hides non-backbone cross chords, and shows focus verb labels` (`test/viz-sigma.test.ts:1633`) | `viewer/graph.ts` | **covered** |
| Contributor owner badges fan out on nodes and toggle as a pure decoration | None (`viewer/detail.ts` renders contributor metadata in inspector drawer) | `viewer/detail.ts` | **missing** (`@wip`: WebGL canvas perimeter fan-out deferred) |
| Search query dimming and focusing the first matching node | `Smart LOD label rules prioritize landmarks, hover, and search hits` (`test/viz-sigma.test.ts:251`), line 1562 | `viewer/graph.ts`, `viewer/main.ts` | **covered** |

---

### Feature 22: Tunable Cosmos Gravity Presets, Support Sink Heuristics, and Hierarchical Edge Bundling
- **Specification**: `features/viz/core/cosmos_gravity_presets_and_edge_bundling-22.feature`
- **Governing ADR**: `docs/adr/0018-tunable-cosmos-gravity-presets-support-sinks-and-edge-bundling.md`, `docs/adr/0015-hierarchical-tree-backbone-and-curved-webgl-edges.md`

| Scenario | Covering Test | Source Modules | Status |
| :--- | :--- | :--- | :---: |
| First-class "defines" relation is preserved and categorized as a high-gravity contract edge | `defines is first-class relation and useHeuristics toggle controls support dampening` (`test/viz-sigma.test.ts:2107`) | `src/graph/types.ts`, `src/viz/assemble.ts`, `viewer/data.ts` | **covered** |
| Switching between Code-Centric, Spec-Centric, and Doc-Centric cosmos presets reshapes gravitational pull | `COSMOS_PRESETS provides tailored profiles for code, spec, and doc modes with dynamic reweighting` (`test/viz-sigma.test.ts:2050`), line 2183 | `viewer/data.ts`, `viewer/graph.ts`, `viewer/main.ts` | **covered** |
| Interactive weight sliders and heuristics toggle persist across sessions | `defines is first-class relation and useHeuristics toggle controls support dampening` (`test/viz-sigma.test.ts:2107`) | `viewer/data.ts`, `viewer/main.ts` | **covered** |
| Support and utility classes are detected, visually badged, and dampened in layout and resting edges | `detectSupportNodes identifies topological sinks and lexical utility modules` (`test/viz-sigma.test.ts:1838`), line 1893 | `viewer/data.ts`, `viewer/graph.ts` | **covered** |
| D3-style organic intra-cluster node spacing and Hierarchical Edge Bundling | `relaxAndSeparateGalaxiesVectorized enforces D3-style organic clearance >= 28px between sibling nodes in a cluster` (`test/viz-sigma.test.ts:1948`), line 1997 | `viewer/data.ts`, `viewer/wasm-physics.ts`, `viewer/graph.ts` | **covered** |

---

### Feature 23: Directional Blast Attenuation, Causal Collider Zero-Decay Rules, and Sankey Suite Sub-Foldering
- **Specification**: `features/viz/core/directional_blast_attenuation_and_sankey_subfolders-23.feature`
- **Governing ADR**: `docs/adr/0019-directional-blast-attenuation-and-collider-zero-decay.md`

| Scenario | Covering Test | Source Modules | Status |
| :--- | :--- | :--- | :---: |
| Monotonic downstream realization and upstream provenance attenuate energy per hop | `folderGroupKeyOfNode sub-folders flat test suites by domain prefix, SankeyView filters directories, and computeBlastAttenuation decays energy per hop` (`test/viz-sigma.test.ts:2318`, sub-test 2) | `viewer/sankey.ts`, `viewer/data.ts` | **covered** |
| Shared utility sink collider decays to zero and blocks false coupling between unrelated callers | Same test (`test/viz-sigma.test.ts:2318`, sub-test 4: Scenario A) | `viewer/sankey.ts`, `viewer/data.ts` | **covered** |
| Reverse consumer impact propagates from a modified callee to all upstream callers without leaking into their other callees | Same test (`test/viz-sigma.test.ts:2318`, sub-test 4: Scenario B) | `viewer/sankey.ts`, `viewer/data.ts` | **covered** |
| Leaf observer nodes (Tests, Docs, and loose References) terminate propagation after hop 1 | Same test (`test/viz-sigma.test.ts:2318`, sub-test 4: Leaf Sinks) | `viewer/sankey.ts`, `viewer/data.ts` | **covered** |
| Flat test directories sub-folder by domain prefix and support interactive directory filtering in Stacked Flow | Same test (`test/viz-sigma.test.ts:2318`, sub-tests 1 & 3) | `viewer/sankey.ts`, `viewer/main.ts` | **covered** |

---

### Feature 24: Unified Relation Registry and Degree-Normalized Edge Weights
- **Specification**: `features/viz/core/relation_registry_and_degree_normalization-24.feature`
- **Governing ADR**: `docs/adr/0020-unified-relation-registry-and-degree-normalized-edge-weights.md`

| Scenario | Covering Test | Source Modules | Status |
| :--- | :--- | :--- | :---: |
| Canonical registry separates layout physics, render styling, and blast transmission concerns | `Canonical registry separates layout physics, render styling, and blast transmission concerns` (`test/viz-relations.test.ts:4`) | `viewer/relations.ts`, `viewer/data.ts` | **covered** |
| Cosine degree normalization dynamically weakens hub dominance | `Cosine degree normalization dynamically weakens hub dominance` (`test/viz-relations.test.ts:41`) | `viewer/relations.ts`, `viewer/data.ts` | **covered** |
| Ideal target lengths order structural contracts closer than loose references | `Ideal target lengths order structural contracts closer than loose references` (`test/viz-relations.test.ts:65`) | `viewer/relations.ts` | **covered** |
| Support sink dampening emerges topologically with regex heuristics as optional fallback | `Support sink dampening emerges topologically with regex heuristics as optional fallback` (`test/viz-relations.test.ts:98`) | `viewer/relations.ts`, `viewer/data.ts` | **covered** |
| Layout strength adapts based on active graph perspective | `Layout strength adapts based on active graph perspective` (`test/viz-relations.test.ts:133`) | `viewer/relations.ts` | **covered** |

---

### Feature 25: Two-Level Stress-SGD Organic Layout with Preset Constraints
- **Specification**: `features/viz/core/two_level_stress_layout_and_preset_constraints-25.feature`
- **Governing ADR**: `docs/adr/0021-two-level-stress-sgd-organic-layout-with-preset-constraints.md`

| Scenario | Covering Test | Source Modules | Status |
| :--- | :--- | :--- | :---: |
| Two-level hierarchical layout separates cluster meta-graph from interior geometry | `Two-level hierarchical layout separates cluster meta-graph from interior geometry` (`test/viz-layout-stress.test.ts:1`) | `viewer/layout/stress-sgd.ts`, `viewer/layout/two-level.ts` | **partial** (test authored; implementation in progress by Workstream C) |
| Stress-SGD converges deterministically within bounded iterations | `Stress-SGD converges deterministically within bounded iterations` (`test/viz-layout-stress.test.ts:1`) | `viewer/layout/stress-sgd.ts` | **partial** (test authored; implementation in progress by Workstream C) |
| Architecture presets enforce distinct geometric constraints | `Architecture presets enforce distinct geometric constraints` (`test/viz-layout-stress.test.ts:1`) | `viewer/layout/two-level.ts`, `viewer/graph.ts` | **covered** |
| Hierarchical edge bundling routes along folder trees using B-splines | `Hierarchical edge bundling routes along folder trees using B-splines` (`test/viz-layout-stress.test.ts:1`) | `viewer/layout/two-level.ts`, `viewer/graph.ts` | **covered** |
| Layout engine toggle switches between stress-SGD and legacy pipelines | `Layout engine toggle switches between stress-SGD and legacy pipelines` (`test/viz-layout-stress.test.ts:1`) | `viewer/layout/stress-sgd.ts`, `viewer/graph.ts` | **partial** (test authored; implementation in progress by Workstream C) |

---

### Feature 26: Hierarchical Drill-Down and Crossing-Minimized Ordering in Stacked Flow Columns
- **Specification**: `features/viz/core/stacked_flow_hierarchical_drilldown-26.feature`
- **Governing ADR**: `docs/adr/0022-hierarchical-drill-down-and-crossing-minimized-ordering-in-stacked-flow-columns.md`

| Scenario | Covering Test | Source Modules | Status |
| :--- | :--- | :--- | :---: |
| Double-click expands folder while single click traces dependency flows | `Double-click expands folder while single click traces dependency flows` (`test/viz-sankey-columns.test.ts:4`) | `viewer/sankey.ts`, `viewer/main.ts` | **covered** |
| Progressive one-level drill-down compacts single-child directory chains | `Progressive one-level drill-down compacts single-child directory chains` (`test/viz-sankey-columns.test.ts:38`) | `viewer/sankey.ts` | **covered** |
| Expanded child bars remain contiguous at the parent's vertical slot | `Expanded child bars remain contiguous at the parent's vertical slot` (`test/viz-sankey-columns.test.ts:74`) | `viewer/sankey.ts` | **covered** |
| Scrollable stage columns preserve minimum bar heights under expansion | `Scrollable stage columns preserve minimum bar heights under expansion` (`test/viz-sankey-columns.test.ts:110`) | `viewer/sankey.ts`, `viewer/main.ts` | **covered** |
| Barycenter sweeps minimize ribbon crossings between adjacent columns | `Barycenter sweeps minimize ribbon crossings between adjacent columns` (`test/viz-sankey-columns.test.ts:145`) | `viewer/sankey.ts` | **covered** |
| State pruning removes stale offsets and isolates view state across graphs | `State pruning removes stale offsets and isolates view state across graphs` (`test/viz-sankey-columns.test.ts:181`) | `viewer/sankey.ts` | **covered** |
