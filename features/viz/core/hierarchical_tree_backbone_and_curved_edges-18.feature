@viz @adr:docs/adr/0015-hierarchical-tree-backbone-and-curved-webgl-edges.md
Feature: Hierarchical Tree-Backbone Layout and Curved WebGL Edges
  As a developer exploring a codebase in the Graft visualizer
  I want the graph to organize into an organic, non-crossing radial tree hierarchy with gently curved edges and rest-length branch spacing
  So that I can read the architecture as a clean branching tree without harsh straight-line crisscross clutter

  Background:
    Given a codebase visualization graph containing subsystem directories, files, symbols, and cross-cutting dependencies
    And the visualizer view is initialized with WebGL rendering

  @covers:viewer/data.ts @covers:viewer/graph.ts @covers:viewer/main.ts @covers:test/viz-sigma.test.ts
  Scenario: Semantic relation weight hierarchy, cosmos presets, and interactive weight sliders govern layout pull
    Given edge contraction weights are defined for semantic relation verbs, cosmos presets, and tunable family sliders
    When layout attraction weights are evaluated in coupled mode
    Then architectural realization edges (implements, extends) should exert stronger pull than verification edges (covers, verifies) and governance edges (documents, influences)
    And intra-cluster dependency edges should exert stronger pull than cross-cluster dependency edges and informational references
    When the user selects the Code-Centric, Spec-Centric, Doc-Centric, or Directory cosmos preset or adjusts the weight sliders in the settings sub-menu
    Then edge attraction weights and cluster gap spacing should dynamically update to prioritize the selected cosmos perspective and re-bounce the layout

  @covers:viewer/data.ts @covers:viewer/graph.ts @covers:test/viz-sigma.test.ts
  Scenario: Support and utility classes are detected, visually badged, and dampened in layout and resting edges
    Given a graph containing domain modules alongside shared utility and type modules (such as helpers.ts and types.ts) with high cross-cluster fan-in and high sink ratios
    When support class detection analyzes topological fan-in and utility naming patterns
    Then high-fan-in utility sinks and shared helper/type modules should be classified as support nodes
    And incoming dependency and reference edges targeting support nodes should have their layout attraction weight reduced by approximately 80 percent
    And cross-cluster dependency edges targeting support nodes should remain hidden at rest until the support node or its caller is hovered or selected
    And detected support nodes should carry a visual support indicator

  @covers:viewer/data.ts @covers:viewer/wasm-physics.ts @covers:viewer/graph.ts @covers:test/viz-sigma.test.ts
  Scenario: D3-style organic intra-cluster node spacing and natural inter-cluster proximity
    When subsystem clusters are relaxed and separated after force-directed convergence
    Then nodes within the same cluster should maintain non-overlapping breathing room of at least 28 pixels so internal triangles and spokes are legible
    And coupled clusters should settle in close proximity without artificial hub-spring compression or excessive empty voids

  @covers:viewer/data.ts @covers:viewer/graph.ts @covers:test/viz-sigma.test.ts
  Scenario: Hierarchical control-point edge bundling aligns parallel corridor splines and boosts highway visibility
    When multiple edges travel in the same direction between a source cluster and a target cluster
    Then edges sharing the same directional corridor should receive coherent curvature aligned with the cluster-to-cluster control vector
    And resting stroke opacity and width for bundled corridor bridges should scale upward with the square root of the bundle size so multi-edge highways remain crisp and visible
    When the user hovers or selects any node
    Then all incident backbone, support, and cross-mesh edges for that node should illuminate at full opacity

  @covers:viewer/data.ts @covers:viewer/graph.ts @covers:viewer/main.ts @covers:test/viz-sigma.test.ts
  Scenario: Toggling between Re-Bounce simulation and Hold positions on filter changes
    Given the visualizer toolbar provides a re-bounce simulation toggle
    When re-bounce mode is enabled and the user changes a scope, file tree, or exclusion filter
    Then the layout should dynamically recalculate equilibrium positions for the remaining visible galaxies and animate nodes smoothly
    When the user toggles re-bounce mode off to hold positions and changes a filter
    Then the remaining visible nodes should stay locked at their existing coordinates without re-bouncing

  @covers:viewer/data.ts @covers:viewer/graph.ts @covers:test/viz-sigma.test.ts
  Scenario: Orphan micro-cluster consolidation and interactive node dragging after graph rebuilds
    When a graph is loaded or rebuilt via detached graph swap
    Then single-node micro-clusters should consolidate into their parent top-level subsystem so no isolated orphan nodes float in void space
    And Sigma's internal dragManager graph reference should be synchronized so interactive node dragging remains active



