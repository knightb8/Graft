@adr:docs/adr/0026-visualizer-ergonomics-fishbone-dynamics-and-galaxy-sizing-metrics.md
@covers:viewer/graph.ts
@covers:viewer/fishbone-view.ts
@covers:viewer/sankey-view.ts
Feature: Visualizer Ergonomics, Dynamic Fishbone Clearance, and Galaxy Sizing Metrics
  As an architect inspecting a complex codebase graph
  I want flexible node sizing dimensions, accumulated edge girths, smooth fishbone navigation, and reliable lifecycle flow selection
  So that structural hot spots and dependency corridors are instantly apparent without UI friction

  Scenario: Space mode supports diverse node sizing metrics and accumulated edge girth
    Given a codebase knowledge graph with files, functions, and varying LOC spans
    When the visualizer switches node sizing metric between "degree", "loc", "symbols", "indegree", and "outdegree"
    Then the computed node radius scales according to each respective metric
    And parallel and multi-call edges scale their stroke girth proportionally to accumulated connection density

  Scenario: Fishbone diagram scales rib lengths and junction spacing dynamically without overlap
    Given a causal tree containing a category with multiple sub-bone nodes
    When the Ishikawa Fishbone model is computed for the head node
    Then the rib height expands dynamically to ensure vertical clearance between cards
    And sequential ribs along the central spine maintain sufficient horizontal distance to prevent collisions

  Scenario: Stacked Lifecycle Flow maintains reliable pointer events and clear trace execution
    Given a rendered Stacked Lifecycle Flow chart
    When a user clicks on an artifact bar without dragging
    Then the bar is selected without premature DOM re-parenting
    And clicking the Clear Blast Trace button clears selection and blast highlighting
