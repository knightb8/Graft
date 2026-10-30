@viz @adr:docs/adr/0022-hierarchical-drill-down-and-crossing-minimized-ordering-in-stacked-flow-columns.md
@covers:viewer/sankey.ts @covers:viewer/main.ts @covers:test/viz-sankey-columns.test.ts
Feature: Hierarchical Drill-Down and Crossing-Minimized Ordering in Stacked Flow Columns
  As an engineer analyzing Tripartite dependencies in the Stacked Flow column view
  I want predictable click-versus-expansion disambiguation, progressive one-level drill-down, contiguous child placement, scrollable columns, and barycenter crossing minimization
  So that deep module hierarchies can be navigated smoothly without visual squashing, ribbon tangling, or stale interaction state

  Background:
    Given a Tripartite project containing nested directory structures across ADRs, Specs, Code, and Tests
    And the Stacked Flow column visualization is rendered with stages for each Tripartite scope

  @covers:viewer/sankey.ts @covers:viewer/main.ts @covers:test/viz-sankey-columns.test.ts
  Scenario: Double-click expands folder while single click traces dependency flows
    Given a collapsed directory bar in the Code column
    When the user single-clicks the directory bar
    Then the directory should be selected and its incoming and outgoing ribbon flows highlighted
    And the directory bar DOM element should remain intact without re-rendering the entire canvas
    When the user double-clicks the directory bar
    Then the directory should toggle to expanded state without unselecting the node on the second click

  @covers:viewer/sankey.ts @covers:test/viz-sankey-columns.test.ts
  Scenario: Progressive one-level drill-down compacts single-child directory chains
    Given a deep nested directory structure "features/viz/core" containing multiple feature files
    When the user expands the root "features" folder bar
    Then only immediate child subdirectories should be revealed rather than flooding the column with leaf files
    And nested directories with only a single child folder should compact into a combined directory bar
    When the user subsequently expands a subfolder bar
    Then the next hierarchical level should be progressively revealed

  @covers:viewer/sankey.ts @covers:test/viz-sankey-columns.test.ts
  Scenario: Expanded child bars remain contiguous at the parent's vertical slot
    Given a collapsed folder bar positioned in the middle of a stage column
    When the user expands the folder bar
    Then all immediate child bars should be placed contiguously within the parent's vertical slot
    And sibling child bars should stay together without being scattered across the column by global weight sorting

  @covers:viewer/sankey.ts @covers:viewer/main.ts @covers:test/viz-sankey-columns.test.ts
  Scenario: Scrollable stage columns preserve minimum bar heights under expansion
    Given a stage column containing numerous files and expanded folders
    When the cumulative height of all visible bars exceeds the viewport height
    Then each bar should maintain a minimum legible height and readable label
    And the stage column should support vertical scrolling to accommodate all bars without squashing or overlap

  @covers:viewer/sankey.ts @covers:test/viz-sankey-columns.test.ts
  Scenario: Barycenter sweeps minimize ribbon crossings between adjacent columns
    Given multiple stage columns connected by inter-module dependency ribbons
    When column bar ordering is calculated
    Then bars should be ordered using iterative barycenter sweeps matching connected ribbon weights
    And ribbon crossings between adjacent columns should be significantly reduced compared to independent weight sorting

  @covers:viewer/sankey.ts @covers:test/viz-sankey-columns.test.ts
  Scenario: State pruning removes stale offsets and isolates view state across graphs
    Given an expanded directory with active layout bar offsets
    When the directory is collapsed or filtered
    Then obsolete bar offsets and hover references should be pruned immediately
    And directory expansion state should be isolated and reset when loading a different graph
