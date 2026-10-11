@cli
Feature: Exclude Directory CLI Filtering
  As an AI coding agent or engineer indexing a large codebase
  I want to exclude specific directories via the --exclude-dir CLI flag
  So that noisy, generated, or transient subtrees are ignored during graph construction

  Background:
    Given a repository with source code and noisy subdirectories

  Scenario: Excluding a directory from graph construction
    Given a directory containing source files designated with "--exclude-dir"
    When Graft builds the context graph
    Then files inside the excluded directory should not be ingested
    And no symbols from the excluded directory should appear in the graph nodes

  Scenario: Multiple directory exclusion flags
    Given multiple "--exclude-dir" arguments specified on the command line
    When Graft runs context indexing
    Then all specified directories should be skipped
