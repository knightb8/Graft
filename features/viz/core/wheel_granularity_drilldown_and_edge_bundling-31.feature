@viz @adr:docs/adr/0027-hierarchical-wheel-granularity-drilldown-and-edge-bundling.md
Feature: Circular Dependency Wheel Granularity Depths, In-Place Drill-Down, and Hierarchical Edge Bundling
  As a software architect examining whole-codebase dependencies in Graft
  I want the Circular Dependency Wheel to support Module, File, and Symbol depths, in-place arc drill-down, and bundled chords
  So that I can evaluate high-level subsystem coupling without visual clutter and trace granular dependencies on demand

  Background:
    Given a codebase graph with ADRs, BDD Features, Code modules, Test suites, and Documentation nodes

  @covers:viewer/wheel-view.ts @covers:test/viz-wheel.test.ts
  Scenario: Wheel computes aggregated Module depth arcs and sums inter-module chords
    Given source code files in "src/graph" and "src/mcp" with multiple interconnected symbols
    When the wheel model is computed at "module" depth
    Then the perimeter arcs should represent directory packages instead of individual symbols
    And inter-module chords should aggregate the edge weights between those packages

  @covers:viewer/wheel-view.ts @covers:test/viz-wheel.test.ts
  Scenario: Wheel computes File depth with parent-aggregated containers by default
    Given multiple functions and classes inside "viewer/wheel-view.ts"
    When the wheel model is computed at "file" depth
    Then the symbols should be rolled up into the parent file container
    And the chord endpoints should terminate on the file perimeter slot

  @covers:viewer/wheel-view.ts @covers:test/viz-wheel.test.ts
  Scenario: In-place drill-down expands a module arc into constituent child files
    Given a module arc representing "src/graph" at module depth
    When the user triggers in-place drill-down on "src/graph"
    Then the "src/graph" arc should expand to display its constituent child files
    And a breadcrumb indicator should be displayed allowing reset to all modules

  @covers:viewer/wheel-view.ts @covers:test/viz-wheel.test.ts
  Scenario: Hierarchical edge bundling routes chords through shared radial corridors
    Given multiple cross-module chords between "viewer" and "src/graph"
    When edge bundling is enabled on the wheel model
    Then the chords should be routed as cubic Bézier curves through radial corridor waypoints
    And parallel chords in the same corridor should bundle together into shared trunks
