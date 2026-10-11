@core
Feature: Markdown AST and Document Structure Extraction
  As an AI coding agent analyzing documentation
  I want Graft to index Markdown files into the repo context graph
  So that headings are extracted as module nodes and linked appropriately

  Background:
    Given a codebase containing Markdown files

  Scenario: Registering markdown extension in Graft parser pipeline
    Given a file with the ".md" extension in the repository
    When Graft analyzes the repository file types
    Then the file should be recognized as a valid source language

  Scenario: Extracting Markdown headings as module nodes
    Given a Markdown file defining several headings
    When Graft extracts definitions from the Markdown file
    Then each heading should be extracted as a top-level module node
    And each heading node should carry precise line spans covering its declaration

  Scenario: Linking headings to their enclosing document
    Given a Markdown file containing extracted headings
    When Graft constructs the graph edges
    Then a "contains" relation edge should connect the document file to each of its heading nodes

  Scenario: Extracting Markdown links as document edges
    Given a Markdown file with a standard link pointing to another markdown file
    When Graft computes the repository graph
    Then a "documents" reference edge should connect the source file to the linked target file
