@core
Feature: Gherkin Semantic Links
  As an AI coding agent reasoning about intent
  I want Graft to type the links from a specification by their meaning
  So that governing decisions and covered code are distinguishable from plain mentions

  Background:
    Given a codebase containing Gherkin specification files
    And Graft supports the tripartite semantic relations

  Scenario: An architectural decision governs a specification
    Given a feature tagged with an "adr" tag or linking to an architectural decision record
    When Graft extracts the references of the feature file
    Then the decision should be connected to the feature by an influences edge

  Scenario: A specification covers code
    Given a scenario tagged with a "covers" tag carrying a source file path
    When Graft extracts the references of the feature file
    Then the scenario should be connected to that file by a covers edge

  Scenario: Other mentions stay plain references
    Given a step quoting a file path or a tag using the "ref" kind
    When Graft extracts the references of the feature file
    Then the link should be a plain references edge
