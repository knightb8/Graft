@viz @adr:docs/adr/0025-circular-dependency-wheel-chord-diagram.md
@covers:viewer/wheel-view.ts @covers:viewer/main.ts @covers:test/viz-wheel.test.ts
Feature: Circular Dependency Wheel (Chord Diagram) for Lifecycle Coupling
  As a software architect evaluating cross-tier coupling and circular dependencies
  I want a circular dependency wheel with Tripartite stages arranged along the perimeter and weighted chords passing through the interior
  So that I can immediately detect architectural boundary violations and circular loops across ADRs, specs, code, and tests

  Background:
    Given a Tripartite project with ADRs, feature specs, source code, and tests
    And an active graph containing cross-stage dependencies and references

  @covers:viewer/wheel-view.ts @covers:viewer/main.ts @covers:test/viz-wheel.test.ts
  Scenario: Selecting Wheel canvas mode renders a circular perimeter with 5 Tripartite sectors
    When the user switches the canvas view to "🎡 Wheel"
    Then the wheel canvas should be displayed and other canvas views hidden
    And the perimeter should be divided into 5 distinct sector arcs for ADRs, Specs, Code, Tests, and Docs
    And each sector should be styled with its canonical Tripartite scope color

  @covers:viewer/wheel-view.ts @covers:test/viz-wheel.test.ts
  Scenario: Interior chords connect related entities with curved Bézier ribbons
    Given active dependency and governance edges between nodes in different sectors
    When the circular chord diagram is rendered
    Then smooth curved ribbons should flow through the interior connecting source and target nodes
    And ribbon thickness should scale with connection count or coupling weight
    And ribbon colors should reflect the semantic relation family

  @covers:viewer/wheel-view.ts @covers:viewer/main.ts @covers:test/viz-wheel.test.ts
  Scenario: Hovering or clicking a sector or node illuminates connected chords
    Given a rendered dependency wheel with multiple active chords
    When the user clicks or hovers a specific node on the perimeter
    Then only chords connected to the active node should be brightly illuminated
    And unrelated chords should be visually dimmed to reduce clutter
    And the detail inspector should display the selected node's properties
