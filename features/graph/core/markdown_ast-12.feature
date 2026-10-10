@core
Feature: Markdown AST Support
  As an AI coding agent maintaining documentation
  I want Graft to natively index Markdown files via the Tree-Sitter Generic Tier
  So that architectural documentation can be structurally linked to the code it describes

  Scenario: Registering Markdown in the parser pipeline
    Given the Graft configuration
    When the system boots
    Then ".md" should be recognized in the codebase extensions
    And the generic tier should support the "markdown" grammar

  Scenario: Extracting Markdown sections
    Given a Markdown file with hierarchical headings
    When Graft runs the AST extraction
    Then headings should be extracted as "module" nodes to represent document sections
