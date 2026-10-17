@viz @adr:docs/adr/0011-visualizer-archipelago-blooms-and-lod-labeling.md
Feature: Visualizer Archipelago Blooms and Smart LOD Labels
  As a developer exploring large codebase context graphs
  I want to see high-cohesion subsystems visualised as radiant archipelagos and readable LOD labels
  So that spatial navigation is intuitive, labels do not collide, and filtering hides elements completely

  Background:
    Given a multi-directory context graph loaded in the Sigma WebGL visualizer
    And the visualizer includes the archipelago background canvas layer

  @covers:viewer/graph.ts @covers:test/viz-sigma.test.ts
  Scenario: Scale-adaptive neighborhood cohesion blooms on WebGL layer
    When the graph nodes are rendered on the canvas
    Then neighborhood cohesion should be computed dynamically based on node proximity and graph scale
    And isolated nodes without cluster neighbors should emit zero bloom
    And dense cluster communities should render hardware-accelerated WebGL radiant blooms
    And a watermark badge should display near the cluster centroid for high-cohesion regions

  @covers:viewer/graph.ts @covers:test/viz-sigma.test.ts
  Scenario: Smart LOD label visibility across zoom levels
    When the camera is zoomed out to view the entire graph
    Then major landmark hub nodes with high connectivity should display visible labels
    And non-landmark nodes should have automatic collision-grid label visibility
    When the user zooms in closer to a cluster
    Then labels for individual nodes should progressively appear where space permits without collision

  @covers:viewer/graph.ts @covers:test/viz-sigma.test.ts
  Scenario: Instant hover focus on nodes, neighbors, and archipelagos
    When the user hovers the cursor over a node
    Then that node and its direct neighbors should be highlighted with visible labels
    And connected edges should illuminate with directional colors
    And the surrounding archipelago cluster bloom should glow with heightened vibrancy

  @covers:viewer/graph.ts @covers:test/viz-sigma.test.ts
  Scenario: Complete node and edge disappearance on subtree unticking
    When the user unticks a directory or file in the sidebar tree picker
    Then all nodes belonging to the unticked path should receive hidden visibility
    And node sizes and opacities should be reduced to zero
    And connected edges should also receive hidden visibility
    And the unticked nodes should be excluded from archipelago cluster calculations
