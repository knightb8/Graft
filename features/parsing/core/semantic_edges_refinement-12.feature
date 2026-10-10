@core
Feature: Semantic Edge Refinements for Tripartite Architecture
  As an AI coding agent maintaining strict graph ontology
  I want Graft to emit "influences" and "covers" edges
  So that architectural decisions and features map cleanly to their dependents

  Background:
    Given a codebase containing ADRs and Gherkin features

  Scenario: ADRs linking to features emit influences edges
    Given an ADR document containing a markdown link to a ".feature" file
    When Graft constructs the graph edges
    Then an "influences" relation edge should connect the ADR to the feature
    And a generic "documents" edge should not be used

  Scenario: Features covering code and tests
    Given a Gherkin feature file
    When Graft extracts its semantic relationships
    Then the graph taxonomy should support a "covers" relation type for feature targets
