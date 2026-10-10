@core
Feature: Gherkin File References
  As an AI coding agent navigating a BDD codebase
  I want Graft to link Gherkin specifications to the files they mention
  So that a feature file is connected to the code, tests and documents it is about

  Background:
    Given a codebase containing Gherkin specification files

  Scenario: Linking a markdown link in a description to its target file
    Given a feature or scenario description containing a markdown link to a repository file
    When Graft extracts the references of the feature file
    Then a reference edge should connect the feature or scenario to the linked file
    And web links and in-page anchors should not produce edges

  Scenario: Linking a reference tag to its target file
    Given a feature or scenario tagged with an "adr", "covers", "ref" or "references" tag carrying a file path
    When Graft extracts the references of the feature file
    Then a reference edge should connect the tagged element to that file

  Scenario: Linking a quoted file path in a step to its file
    Given a step whose text quotes a repository file path
    When Graft extracts the references of the feature file
    Then a reference edge should connect the enclosing scenario to that file

  Scenario: Resolving a file reference to a node in the repository
    Given a file reference that names a file existing in the repository
    When Graft computes the repository graph
    Then the reference edge should end at that file's node
