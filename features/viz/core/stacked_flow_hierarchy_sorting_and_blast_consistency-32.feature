@viz @adr:docs/adr/0028-lanum-graph-visualization-enhancements-and-stacked-flow-hierarchy.md
@covers:viewer/sankey-engine.ts @covers:viewer/sankey-view.ts @covers:viewer/relations.ts @covers:test/viz-sankey-columns.test.ts
Feature: Stacked Flow Intact Directory Hierarchy, Deterministic Sorting, Fixed Slots, and Blast Trace Consistency
  As an engineer analyzing Tripartite dependencies in the Stacked Lifecycle Flow
  I want intact directory hierarchies per column, configurable sorting orders, non-draggable bar slots, and edge-verified bidirectional blast traces
  So that module structure stays organized and blast selections highlight consistent causal paths across all five lifecycle stages

  Background:
    Given a Tripartite project with nested directories across ADRs, Specs, Code, Tests, and Docs
    And the Stacked Lifecycle Flow column visualization is active

  @covers:viewer/sankey-engine.ts @covers:viewer/sankey-view.ts @covers:test/viz-sankey-columns.test.ts
  Scenario: Blast trace propagates consistently upstream from tests through code to specs and downstream from specs through code to tests
    Given a feature specification covering a code module that is imported by a verification test
    When the user selects the verification test for Blast Trace
    Then the blast trace should highlight the imported code module and propagate upstream to the governing feature specification
    When the user selects the feature specification for Blast Trace
    Then the blast trace should highlight the covered code module and propagate downstream to the verification test
    And only ribbons carrying active blast edges between affected endpoints should illuminate

  @covers:viewer/sankey-engine.ts @covers:viewer/sankey-view.ts @covers:test/viz-sankey-columns.test.ts
  Scenario: Directory hierarchy remains intact per column with collapsible parent folder headers and contiguous children
    Given a stage column containing files across multiple nested directories
    When a directory group is expanded in the column
    Then a collapsible parent folder header bar should remain visible above its indented child bars
    And sibling files belonging to the same parent directory should stay contiguously grouped within their directory slot

  @covers:viewer/sankey-view.ts @covers:test/viz-sankey-columns.test.ts
  Scenario: Bars and columns remain in fixed layout slots without freeform node dragging
    Given rendered stage columns and bars in the Stacked Lifecycle Flow
    When the user clicks and drags on a bar or column header
    Then the bar and column coordinates should remain fixed in their deterministic layout slots
    And single-clicking a bar should toggle its Blast Trace selection without drag-timer interference

  @covers:viewer/sankey-engine.ts @covers:viewer/sankey-view.ts @covers:test/viz-sankey-columns.test.ts
  Scenario: Columns support sorting by barycenter flow, directory tree hierarchy, alphabetical name, and coupling weight
    Given a stage column with multiple directory groups and module bars
    When the user selects the "name" sorting order
    Then directory groups and sibling bars within each column should be ordered alphabetically by label
    When the user selects the "weight" sorting order
    Then directory groups and sibling bars within each column should be ordered descending by coupling weight
    When the user selects the "hierarchy" sorting order
    Then bars should be ordered deterministically by directory tree path
