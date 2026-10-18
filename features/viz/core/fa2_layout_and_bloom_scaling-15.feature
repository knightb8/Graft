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

  @covers:viewer/graph.ts @covers:test/viz-sigma.test.ts
  Scenario: 2D galaxy archipelago community formation prevents perimeter ring trapping
    When thousands of nodes across distinct architectural modules are loaded
    Then nodes should be initialized using cluster-seeded 2D phyllotaxis coordinates
    And ForceAtlas2 should apply LinLog logarithmic attraction and hub distribution
    And nodes should settle into organic 2D archipelagos rather than a hollow perimeter circle

  @covers:viewer/graph.ts @covers:viewer/data.ts @covers:test/viz-sigma.test.ts
  Scenario: Rainbow-coloured edges mapped by relation taxonomy
    When edges of various relation types are rendered in the visualizer
    Then each relation type should receive a distinct canonical rainbow color
    And the edge legend chips should reflect the relation colors
    And incoming and outgoing focused edges should preserve high-contrast visibility

  @covers:viewer/graph.ts @covers:test/viz-sigma.test.ts
  Scenario: Elastic neighborhood rubberbanding on node drag and release
    When the user drags an individual node on the canvas
    Then directly connected neighbor nodes should elastically follow with spring rubberbanding
    And releasing the node should trigger a stepped local relaxation settling the cluster


