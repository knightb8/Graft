@viz
Feature: Transitive Edge Generation and Edge Visibility
  As an architect inspecting a filtered context graph in the visualizer
  I want indirect edges between visible nodes to be rendered when intermediate nodes are filtered away
  So that I can trace architectural dependencies even when specifications or folders are hidden

  Background:
    Given an architecture containing an ADR node "adr-01", a Feature node "spec-01", and a Code node "code-01"
    And "adr-01" influences "spec-01"
    And "spec-01" covers "code-01"

  Scenario: Generating a transitive edge when an intermediate node is filtered out
    When the user filters out specifications so that "spec-01" is hidden
    And transitive edges are enabled
    Then a transitive edge should connect "adr-01" directly to "code-01"
    And the transitive edge should be styled with a dashed pattern and path description

  Scenario: Disabling transitive edges
    When the user disables transitive edges in the filter bar
    Then no transitive edge should connect "adr-01" to "code-01"
    And "adr-01" and "code-01" should appear without a connecting line
