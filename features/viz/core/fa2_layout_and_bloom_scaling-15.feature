@viz @adr:docs/adr/0012-pure-forceatlas2-layout-and-viewport-bloom-scaling.md
Feature: Pure ForceAtlas2 Layout and Viewport-Scaled Archipelago Blooms
  As a developer exploring large codebase context graphs
  I want the graph layout to converge rapidly and the archipelago bloom overlay to fill the entire viewport
  So that exploration is immediately responsive without waiting for slow simulations or seeing clipped overlays

  Background:
    Given a large visualization graph containing thousands of nodes and edges
    And the visualizer view is initialized with WebGL rendering and archipelago overlays

  @covers:viewer/graph.ts @covers:test/viz-sigma.test.ts
  Scenario: Rapid layout convergence via Barnes-Hut ForceAtlas2
    When the visualizer receives a dataset with thousands of nodes
    Then layout positions should be computed using Barnes-Hut ForceAtlas2 without main-thread physics stutter
    And the graph layout should reach steady-state convergence immediately upon load
    And nodes should be positioned into readable architectural clusters

  @covers:viewer/graph.ts @covers:test/viz-sigma.test.ts
  Scenario: Full-viewport archipelago bloom canvas sizing across device pixel ratios
    When the visualizer is mounted or resized within its container
    Then the archipelago WebGL canvas buffer dimensions should match the container physical dimensions scaled by device pixel ratio
    And the bloom overlay should span across the entire visible canvas area without upper-left clipping
    And cluster watermark badges should position accurately across the full viewport

  @covers:viewer/graph.ts @covers:test/viz-sigma.test.ts
  Scenario: Linear-time spatial grid neighborhood cohesion calculation
    When archipelago blooms are calculated for thousands of visible nodes
    Then proximity checks should be resolved using a spatial hash grid
    And neighborhood cohesion should compute in linear time without quadratic pairwise stalls
    And dense communities should illuminate with cohesive Gaussian radiance

  @covers:viewer/graph.ts @covers:test/viz-sigma.test.ts
  Scenario: Direct node manipulation without background physics simulation
    When the user drags an individual node on the canvas
    Then the node position should update immediately on the Graphology graph
    And connected edges should track the dragged position in WebGL
    And no continuous background physics loop should be triggered
