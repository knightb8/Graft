@viz @adr:docs/adr/0018-tunable-cosmos-gravity-presets-support-sinks-and-edge-bundling.md @adr:docs/adr/0015-hierarchical-tree-backbone-and-curved-webgl-edges.md
Feature: Tunable Cosmos Gravity Presets, Support Sink Heuristics, and Hierarchical Edge Bundling
  As an architect or developer exploring a Tripartite codebase (Docs/ADRs, BDD Specifications, and Code)
  I want to switch between Code-Centric, Specification-Centric, and Document-Centric cosmos gravity presets, fine-tune edge weights with persistent sliders, automatically dampen utility sinks, and bundle parallel corridor splines
  So that the graph layout adapts to my architectural question with D3-style organic readability and zero utility-sink clutter

  Background:
    Given a Tripartite visualization graph containing ADRs, BDD feature specifications, domain code modules, and shared support utilities
    And the WebGL visualizer is initialized with the Cosmos Gravity settings sub-menu

  @covers:src/graph/types.ts @covers:src/viz/assemble.ts @covers:viewer/data.ts @covers:test/viz-sigma.test.ts
  Scenario: First-class "defines" relation is preserved and categorized as a high-gravity contract edge
    Given nodes connected by "defines", "implements", "covers", "verifies", "documents", "influences", "uses", and "references" edges
    When the graph is assembled and loaded into the visualizer data layer
    Then "defines" edges should be preserved as a first-class relation in the "contract" family without being normalized to "validates"
    And "defines" edges should carry their own distinct canonical relation color and semantic layout weight

  @covers:viewer/data.ts @covers:viewer/graph.ts @covers:viewer/main.ts @covers:viewer/index.html @covers:test/viz-sigma.test.ts
  Scenario: Switching between Code-Centric, Spec-Centric, and Doc-Centric cosmos presets reshapes gravitational pull
    Given the Cosmos Gravity settings sub-menu provides presets for "code", "spec", "doc", "coupled", and "directory"
    When the user selects the "code" (Code-Centric) cosmos preset
    Then runtime realization and dependency edges ("implements", "extends", "uses") should receive the highest attraction weights while specification and documentation edges orbit lightly
    When the user selects the "spec" (Requirements / Specification-Centric) cosmos preset
    Then verification and contract edges ("covers", "verifies", "defines") should receive the highest attraction weights so implementation modules pull toward the specifications they fulfill
    When the user selects the "doc" (Document / ADR-Centric) cosmos preset
    Then governance and citation edges ("documents", "influences", "defines", "references") should receive the highest attraction weights so specs and code cluster around governing ADRs

  @covers:viewer/data.ts @covers:viewer/graph.ts @covers:viewer/main.ts @covers:test/viz-sigma.test.ts
  Scenario: Interactive weight sliders and heuristics toggle persist across sessions
    When the user adjusts individual family pull sliders or the cluster gap slider in the Cosmos Gravity sub-menu
    Then edge layout weights and cluster separation gap should update immediately and trigger a smooth layout re-bounce
    And the customized weight tuning and active cosmos preset should be persisted to local storage
    When the user disables the "Auto-detect support & type sinks" heuristic toggle
    Then support nodes should be evaluated with standard relation weights until heuristics are re-enabled or reset

  @covers:viewer/data.ts @covers:viewer/graph.ts @covers:test/viz-sigma.test.ts
  Scenario: Support and utility classes are detected, visually badged, and dampened in layout and resting edges
    Given domain modules alongside shared utility and type modules (such as helpers.ts and types.ts) with high cross-cluster fan-in and high sink ratios
    When support class heuristics are enabled
    Then high-fan-in topological sinks and utility/type modules should be classified as support nodes and visually badged
    And incoming dependency and reference edges targeting support nodes should be dampened to the configured support sink weight
    And cross-cluster dependency edges targeting support nodes should remain hidden at rest and illuminate when the support node or its caller is hovered or selected

  @covers:viewer/data.ts @covers:viewer/wasm-physics.ts @covers:viewer/graph.ts @covers:test/viz-sigma.test.ts
  Scenario: D3-style organic intra-cluster node spacing and Hierarchical Edge Bundling
    When subsystem clusters are relaxed and separated
    Then sibling nodes within each cluster should maintain at least 28 pixels of non-overlapping clearance so local triangles and spokes are readable
    And multiple edges travelling along the same directional cluster corridor should share coherent control-vector curvature and scale their resting stroke width and opacity by the square root of the bundle size
