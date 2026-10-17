@parsing @adr:docs/adr/0010-asciidoc-ast-support-and-references.md
Feature: AsciiDoc AST Support, Includes, and References
  As an architect maintaining technical documentation in AsciiDoc
  I want Graft to extract sections, include directives, and cross-references from .adoc files
  So that architectural documentation written in AsciiDoc is linked to the codebase context graph

  Background:
    Given an AsciiDoc document with section titles, include directives, and cross-references

  @covers:src/graph/asciidoc.ts
  Scenario: Extracting section hierarchy from an AsciiDoc file
    When Graft extracts the AST from an AsciiDoc file
    Then a file node should be created for the document
    And each section heading should be extracted as a module node with exact line spans
    And structural containment edges should connect enclosing sections

  @covers:src/graph/asciidoc.ts
  Scenario: Resolving include directives to target files
    When an AsciiDoc document contains an "include::src/core/engine.ts[]" directive
    Then an edge should be extracted linking the document section to the included code file
    And the edge relation should be classified as "documents"

  @covers:src/graph/asciidoc.ts
  Scenario: Resolving cross-references and xref links
    When an AsciiDoc document contains an "xref:docs/adr/0001.adoc[ADR 0001]" reference
    Then an edge should be extracted linking the document to the referenced target
    And the edge relation should be classified as "influences"
