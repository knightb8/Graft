@viz @adr:docs/adr/0013-visualizer-bloom-rainbow-toggles-and-parent-aggregation.md
Feature: Visualizer Bloom, Rainbow, and Parent Aggregation Toggles
  As a developer inspecting a codebase in the Graft visualizer
  I want to toggle archipelago blooms, rainbow edge coloring, and parent container aggregation
  So that I can customize visual density and effortlessly switch between macro-architectural and granular symbol views

  Background:
    Given a codebase visualization graph containing modules, files, functions, and cross-references
    And the visualizer view is loaded with interactive controls

  @covers:viewer/graph.ts @covers:viewer/main.ts @covers:test/viz-sigma.test.ts
  Scenario: Archipelago blooms disabled by default for zero-overhead initial paint
    When the visualizer loads with a codebase graph
    Then archipelago blooms should be disabled by default
    And the archipelago WebGL canvas and badge layers should remain clear and unrendered
    And the initial viewport paint should complete with zero bloom compute overhead
    When the user toggles the bloom control on
    Then radiant cluster blooms and community watermark badges should render across the viewport
    When the user toggles the bloom control off
    Then the archipelago WebGL canvas and badge layers should be cleared and hidden

  @covers:viewer/graph.ts @covers:viewer/main.ts @covers:test/viz-sigma.test.ts
  Scenario: Adaptive performance budget guards 60fps render loop against compute spikes
    Given archipelago blooms are enabled
    When bloom render duration exceeds the frame budget of sixteen milliseconds
    Then the visualizer should automatically disable blooms to preserve sixty frames per second
    And the bloom control chip should update to reflect the throttled state

  @covers:viewer/graph.ts @covers:viewer/main.ts @covers:test/viz-sigma.test.ts
  Scenario: Toggling rainbow colored edges on and off
    When the visualizer loads with rainbow edge coloring enabled by default
    Then edges of different relation types should render in distinct canonical rainbow colors
    And the edge legend chips should display matching colored glyphs and swatches
    When the user toggles the rainbow control off
    Then all edges should render in a uniform neutral monochrome color
    And focused incoming and outgoing edges should preserve directional contrast
    When the user toggles the rainbow control on
    Then edges should restore their distinct canonical relation colors

  @covers:viewer/graph.ts @covers:viewer/main.ts @covers:test/viz-sigma.test.ts
  Scenario: Parent container aggregation enabled by default
    When the visualizer receives a dataset with thousands of fine-grained symbols
    Then parent container aggregation should be enabled by default
    And child functions, methods, and types should be collapsed into their parent file or card nodes
    And edges between child symbols should be lifted to connect their parent container nodes
    And internal intra-file references should be absorbed into the parent node size
    And the total node count should represent the compact parent container set

  @covers:viewer/graph.ts @covers:viewer/main.ts @covers:test/viz-sigma.test.ts
  Scenario: Toggling parent container aggregation off for granular symbol inspection
    Given parent container aggregation is active
    When the user toggles the aggregation control off
    Then the graph should unpack to reveal individual function, method, and section nodes
    And individual symbol-to-symbol call links should be rendered at full granularity
    And ForceAtlas2 should recalculate cluster layout for the granular symbol graph
