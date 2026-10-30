@viz @adr:docs/adr/0021-two-level-stress-sgd-organic-layout-with-preset-constraints.md
@covers:viewer/layout/stress-sgd.ts @covers:viewer/layout/two-level.ts @covers:viewer/graph.ts @covers:test/viz-layout-stress.test.ts
Feature: Two-Level Stress-SGD Organic Layout with Preset Constraints
  As a developer visualizing complex multi-module software graphs in Graft
  I want a two-level stress majorization layout using stochastic gradient descent and geometric preset constraints
  So that subsystem clusters remain compact and coherent, presets produce visibly distinct and stable architectures, and layout convergence is fast and deterministic

  Background:
    Given a graph model with multiple subsystem directory clusters and cross-module dependencies
    And the layout engine is initialized with stress-majorization SGD capability

  @covers:viewer/layout/stress-sgd.ts @covers:viewer/layout/two-level.ts @covers:test/viz-layout-stress.test.ts
  Scenario: Two-level hierarchical layout separates cluster meta-graph from interior geometry
    Given multiple distinct subsystem directory clusters containing interconnected files
    When the two-level layout pipeline executes
    Then a cluster meta-graph should first position cluster centers based on aggregated inter-cluster edge weights
    And each cluster's interior nodes should then be positioned within their allocated cluster disc
    And inter-cluster distances should reflect actual cross-module coupling without artificial repulsion voids

  @covers:viewer/layout/stress-sgd.ts @covers:test/viz-layout-stress.test.ts
  Scenario: Stress-SGD converges deterministically within bounded iterations
    Given graph nodes connected by weighted relation edges with specified ideal lengths
    When stress majorization is solved via stochastic gradient descent
    Then node positions should converge toward target shortest-path distances within 30 iterations
    And the layout should execute deterministically without explosive coordinate oscillation or drifting centers

  @covers:viewer/layout/two-level.ts @covers:viewer/graph.ts @covers:test/viz-layout-stress.test.ts
  Scenario: Architecture presets enforce distinct geometric constraints
    When the user selects the "code" cosmos preset
    Then code modules should be constrained within the central core radius while specifications and docs occupy outer rings
    When the user selects the "spec" cosmos preset
    Then specification nodes should be constrained to the center while implementation code clusters in surrounding orbits
    When the user selects the "directory" preset
    Then nodes should be bounded by hierarchical group containment constraints preserving folder boundaries
    And each preset should generate a measurably distinct radial and spatial distribution of node coordinates

  @covers:viewer/layout/two-level.ts @covers:viewer/graph.ts @covers:test/viz-layout-stress.test.ts
  Scenario: Hierarchical edge bundling routes along folder trees using B-splines
    Given cross-cluster edges connecting modules in disparate directory hierarchies
    When hierarchical edge bundling is applied along the directory tree with stiffness parameter 0.85
    Then parallel inter-cluster edges should curve along shared hierarchical corridor control points
    And bundled spline curves should preserve individual endpoint identities without visual collision

  @covers:viewer/layout/stress-sgd.ts @covers:viewer/graph.ts @covers:test/viz-layout-stress.test.ts
  Scenario: Layout engine toggle switches between stress-SGD and legacy pipelines
    Given the visualizer configured with the "layoutEngine" setting
    When "layoutEngine" is set to "stress"
    Then the two-level stress-SGD pipeline should compute node coordinates as the default engine
    When "layoutEngine" is set to "legacy"
    Then the legacy ForceAtlas2 relaxation pipeline should be used for backward compatibility
    And interactive node dragging should update coordinates using Verlet integration without destabilizing global layout
