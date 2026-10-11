@core
Feature: Tripartite Scope and Directory Filtering for Context Graph
  As an AI coding agent or developer querying Graft
  I want to filter the context graph by tripartite scope (code, specs, docs) and exclude directories
  So that I can focus query results and tool outputs on relevant parts of the codebase

  Background:
    Given a context graph containing code definitions, BDD specifications, and documentation nodes

  Scenario: Filtering nodes by architectural scope
    When I filter the graph by "docs" scope
    Then only documentation nodes should be admitted
    And code symbols and specification steps should be excluded

  Scenario: Excluding directories from graph query results
    When I filter the graph excluding directory "test/"
    Then nodes originating under "test/" should be excluded
    And nodes outside "test/" should be preserved

  Scenario: Composing scope and directory filters
    When I filter the graph for "code" scope and exclude directory "vendor/"
    Then only code nodes located outside "vendor/" should be admitted
    And edges connecting to excluded nodes should be removed
