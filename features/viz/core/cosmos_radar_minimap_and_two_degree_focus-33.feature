@viz @adr:docs/adr/0028-lanum-graph-visualization-enhancements-and-stacked-flow-hierarchy.md
@covers:viewer/minimap.ts @covers:viewer/graph.ts @covers:test/viz-minimap.test.ts
Feature: Cosmos Radar Minimap and Two-Degree Focus Halos
  As an engineer navigating large graphs in the Cosmos visualizer
  I want an overview radar minimap with a draggable viewport indicator and two-degree focus halos
  So that I maintain global spatial orientation while zoomed in and distinguish 1-hop direct dependencies from 2-hop transitive neighbors

  Background:
    Given a multi-cluster graph rendered in the Cosmos visualizer

  @covers:viewer/minimap.ts @covers:test/viz-minimap.test.ts
  Scenario: Overview radar minimap projects galaxy positions and maps viewport coordinates bidirectionally
    Given node coordinates spanning the Cosmos world bounding box
    And an active camera viewport state with center coordinates and zoom ratio
    When the radar minimap model is computed
    Then all visible nodes should project proportionally into the minimap canvas bounds
    And the camera viewport rectangle should accurately reflect the visible world region
    When the user clicks or drags a target position on the minimap
    Then the minimap coordinate should convert back to the corresponding world camera center

  @covers:viewer/minimap.ts @covers:viewer/graph.ts @covers:test/viz-minimap.test.ts
  Scenario: Two-degree focus neighborhood distinguishes 1-hop direct neighbors from 2-hop transitive blast nodes
    Given a chain of connected nodes across three hops in the Cosmos graph
    When the user focuses a seed node
    Then the seed node should receive hop 0 focus state with full opacity
    And 1-hop direct neighbors should receive hop 1 focus state with full opacity and primary edge highlighting
    And 2-hop transitive neighbors should receive hop 2 focus state with intermediate opacity and secondary edge styling
    And nodes beyond 2 hops should be dimmed into the background
