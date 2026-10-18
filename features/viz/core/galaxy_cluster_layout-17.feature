@viz @adr:docs/adr/0014-galaxy-cluster-layout-and-edge-hierarchy.md
Feature: Galaxy Cluster Layout and Spiderweb Edge De-Cluttering
  As a developer exploring a codebase in the Graft visualizer
  I want subsystem modules to condense into well-separated galaxies with hubs at their cores and cross-cluster spiderweb edges attenuated
  So that I can immediately perceive architectural islands and subsystem boundaries without visual hairball clutter

  Background:
    Given a codebase visualization graph containing multiple subsystem directories, hub files, and cross-cutting dependencies
    And the visualizer view is initialized with WebGL rendering

  @covers:viewer/graph.ts @covers:viewer/data.ts @covers:test/viz-sigma.test.ts
  Scenario: Intra-galaxy edges outweigh inter-galaxy edges to condense distinct islands
    When layout edge weights are assigned for ForceAtlas2 convergence
    Then edges connecting nodes within the same subsystem cluster should receive high attraction weight
    And edges connecting nodes across different subsystem clusters should receive low attraction weight
    And nodes within each subsystem should coalesce into a compact local galaxy

  @covers:viewer/graph.ts @covers:test/viz-sigma.test.ts
  Scenario: Subsystem hubs anchor at galactic centers rather than flinging to the outer perimeter
    When ForceAtlas2 and galaxy separation converge on a graph with high-degree hub nodes
    Then outbound hub dissuasion should be disabled so hubs are not flung to the outer rim
    And high-degree subsystem hubs should remain positioned near their respective galaxy centroids
    And distinct subsystem galaxies should be separated by clear inter-galaxy void space

  @covers:viewer/graph.ts @covers:test/viz-sigma.test.ts
  Scenario: Inter-galaxy spiderweb edges are dimmed at rest and illuminated on focus
    When the graph is rendered in its resting state with no node selected or hovered
    Then intra-galaxy edges within the same subsystem should render with crisp foreground opacity
    And inter-galaxy edges spanning across different subsystems should render with low background filament opacity
    When the user hovers or selects a node
    Then both intra-galaxy and inter-galaxy edges incident to the focused node should illuminate to full opacity

  @covers:viewer/graph.ts @covers:viewer/data.ts @covers:viewer/main.ts @covers:test/viz-sigma.test.ts
  Scenario: Aggregated file containers receive distinct subsystem galaxy colors and legend swatches
    Given parent container aggregation is enabled on the code tab
    When file container nodes across multiple subsystem directories are rendered
    Then nodes belonging to different code subsystem clusters should receive distinct galaxy palette colors
    And specification and documentation nodes should preserve their canonical tripartite scope colors
    And the legend should display subsystem galaxy swatches for the active clusters

  @covers:viewer/graph.ts @covers:viewer/data.ts @covers:test/viz-sigma.test.ts
  Scenario: Every visible subsystem galaxy labels its nucleus hub at default zoom
    When the graph contains both large and small subsystem galaxies
    Then the landmark selection pass should include the highest-degree nucleus hub from each multi-node galaxy
    And every subsystem island should display its primary hub label at rest

  @covers:viewer/graph.ts @covers:test/viz-sigma.test.ts
  Scenario: Dragging and releasing a node keeps unrelated galaxies stationary
    Given multiple separated subsystem galaxies are rendered on the canvas
    When the user drags a node and releases it
    Then connected neighbors should elastically follow the dragged node
    And unrelated galaxies should remain stationary in their separated positions

  @covers:viewer/main.ts @covers:viewer/detail.ts @covers:test/viz-sigma.test.ts
  Scenario: Detail panel inspects aggregated file containers and navigates lifted edges
    Given parent container aggregation is enabled on the code tab
    When the user selects an aggregated file container node
    Then the detail panel should display the aggregated symbol count summary and lifted file-level dependencies
    And clicking a dependency link in the detail panel should focus the corresponding target file container on the canvas

