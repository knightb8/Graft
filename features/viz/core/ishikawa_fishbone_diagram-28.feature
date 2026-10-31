@viz @adr:docs/adr/0024-ishikawa-fishbone-cause-effect-diagram.md
@covers:viewer/fishbone-view.ts @covers:viewer/main.ts @covers:test/viz-fishbone.test.ts
Feature: Ishikawa Fishbone Cause-and-Effect Diagram for Focused Tripartite Lineage
  As a software engineer performing root-cause analysis on a code component
  I want an Ishikawa-style fishbone diagram where the selected node is anchored on the left as the head and its causes fan out along angled ribs to the right
  So that I can immediately inspect the governing ADRs, covering specifications, upstream dependencies, and tests that influence the component

  Background:
    Given a Tripartite codebase containing ADRs, BDD feature specifications, source code, and tests
    And an active graph model populated with semantic relationships across all scopes

  @covers:viewer/fishbone-view.ts @covers:viewer/main.ts @covers:test/viz-fishbone.test.ts
  Scenario: Selecting Fishbone canvas mode with an active node renders the head on the left and horizontal spine
    Given the node "src/core.ts" is selected as the focal target
    When the user switches the canvas view to "🐟 Fishbone"
    Then the fishbone canvas should be displayed and other canvas views hidden
    And the focal node should be anchored as the head on the left side of the canvas
    And a central spine should extend horizontally from the head toward the right

  @covers:viewer/fishbone-view.ts @covers:test/viz-fishbone.test.ts
  Scenario: Major ribs branch backwards toward the tail grouped by Tripartite lifecycle categories
    Given the focal head node has upstream connections across ADRs, specs, code, and tests
    When the fishbone diagram is generated
    Then major category ribs should branch off the spine angling backwards toward the tail
    And top ribs should angle upward and to the right
    And bottom ribs should angle downward and to the right
    And each rib should be labeled with its Tripartite category name and node count

  @covers:viewer/fishbone-view.ts @covers:test/viz-fishbone.test.ts
  Scenario: Sub-bones and descriptions branch off to the right of their parent main ribs
    Given an ADR node and a BDD spec node connected to the focal component
    When the sub-bones are placed along the category ribs
    Then each sub-bone should extend horizontally to the right of its parent main rib
    And each sub-bone should display the node identifier and its semantic relation verb
    And node descriptions on adjacent sub-bones should not visually collide

  @covers:viewer/fishbone-view.ts @covers:viewer/main.ts @covers:test/viz-fishbone.test.ts
  Scenario: Clicking a sub-bone node re-roots the fishbone around the newly selected node
    Given a rendered fishbone diagram centered on "src/core.ts"
    And a sub-bone for "docs/adr/0001-init.md" displayed on the ADR rib
    When the user clicks the "docs/adr/0001-init.md" node on the fishbone
    Then "docs/adr/0001-init.md" should become the new focal head on the left
    And the fishbone spine and ribs should immediately regenerate around the new head

  @covers:viewer/fishbone-view.ts @covers:viewer/main.ts
  Scenario: Opening Fishbone view without an active selection displays an informative prompt
    Given no node is currently selected in the graph
    When the user switches the canvas view to "🐟 Fishbone"
    Then an empty-state prompt should guide the user to select any node
    And selecting a node from the file tree should immediately render its fishbone
