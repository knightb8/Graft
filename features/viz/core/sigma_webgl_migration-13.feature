@viz @adr:docs/adr/0009-sigma-webgl-visualizer-migration.md
Feature: Sigma.js WebGL Graph Visualizer
  As a developer inspecting a large codebase context graph
  I want the visualizer to render thousands of nodes and edges using a WebGL engine
  So that exploration, panning, zooming, and filtering remain fast and responsive at 60 FPS

  Background:
    Given a visualization graph containing code, documentation, and specification nodes
    And the graph is initialized in the visualizer view

  @covers:viewer/graph.ts
  Scenario: Loading graph into Graphology and Sigma WebGL engine
    When the visualizer receives graph data with nodes and edges
    Then the graph should be loaded into a Graphology instance
    And the Sigma WebGL renderer should mount onto the container canvas
    And each node should receive color, size, and label attributes

  @covers:viewer/graph.ts
  Scenario: Dynamic node and edge reducers for focus and selection
    When the user selects a node in the visualizer
    Then the selected node and its direct neighbors should be highlighted
    And outgoing edges from the selected node should be styled as dependencies
    And incoming edges to the selected node should be styled as dependants
    And unselected nodes outside the neighborhood should be dimmed

  @covers:viewer/graph.ts
  Scenario: Rendering transitive shortcut edges in WebGL
    When intermediate nodes are hidden by filter criteria
    And transitive edges are enabled
    Then synthetic transitive edges should be added to the Graphology model
    And the edges should be rendered with transitive styling connecting visible endpoints
