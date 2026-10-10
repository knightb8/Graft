@core
Feature: Tripartite Semantic Edges
  As an AI coding agent exploring a codebase
  I want Graft to model the intent between Code, Specs, and Docs using distinct semantic edge relations
  So that I can traverse architectural boundaries without losing the contextual "why"

  Scenario: Extending the core Relation taxonomy
    Given the Graft core edge schema
    When the schema is compiled
    Then it should support the "specifies" relation for specs-to-code links
    And it should support the "binds" relation for spec-step to code-definition links
    And it should support the "verifies" relation for test-to-production links
    And it should support the "documents" relation for doc-to-code links
