@core
Feature: Gherkin AST and Call Graph Extraction
  As an AI coding agent analyzing BDD codebases
  I want Graft to index Gherkin feature files into the repo context graph
  So that scenarios, features, and step references are queryable and linked to step definitions

  Background:
    Given a codebase containing Gherkin specification files

  Scenario: Registering feature extension in Graft parser pipeline
    Given a file with the ".feature" extension in the repository
    When Graft analyzes the repository file types
    Then the file should be recognized as a valid source language
    And no unsupported language warnings should be emitted

  Scenario: Extracting Feature and Scenario definition symbols
    Given a Gherkin feature file defining a feature with multiple scenarios
    When Graft extracts definitions from the feature file
    Then the feature title should be extracted as a top-level module node
    And each scenario title should be extracted as a test definition node
    And each node should carry precise line spans covering its declaration

  Scenario: Extracting Step calls as graph references
    Given a scenario containing Given, When, and Then steps
    When Graft extracts call references from the scenario
    Then each step keyword and expression should be captured as a reference call
    And step calls should belong to their enclosing scenario definition scope

  Scenario: Linking Gherkin step calls to code step definitions across languages
    Given a Gherkin step referencing an implemented behavior
    And a matching step definition implemented in a Python, TypeScript, or Go test file
    When Graft computes the repository call graph
    Then a reference edge should connect the Gherkin step call to the step definition symbol
