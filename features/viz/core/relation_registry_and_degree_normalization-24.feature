@viz @adr:docs/adr/0020-unified-relation-registry-and-degree-normalized-edge-weights.md
@covers:viewer/relations.ts @covers:viewer/data.ts @covers:test/viz-relations.test.ts
Feature: Unified Relation Registry and Degree-Normalized Edge Weights
  As a software architect exploring complex codebases in Graft
  I want a single relation registry defining layout strengths, ideal lengths, render prominence, and blast transmission with degree normalization
  So that graph layouts naturally reflect architectural distances, high-fan-in utility hubs never distort cluster geometry, and edge behaviors remain mathematically coherent

  Background:
    Given a Tripartite codebase graph containing architectural decisions, specifications, code modules, and shared utilities
    And the unified relation registry is loaded with canonical semantic relation definitions

  @covers:viewer/relations.ts @covers:viewer/data.ts @covers:test/viz-relations.test.ts
  Scenario: Canonical registry separates layout physics, render styling, and blast transmission concerns
    Given the canonical relation registry defining "defines", "implements", "covers", "verifies", "influences", "documents", "uses", "references", and "contains"
    When relation metadata is queried for layout, rendering, and blast traversal
    Then each relation should provide an explicit layout strength between 0.0 and 1.0 and an ideal target distance
    And each relation should define distinct render prominence attributes including stroke width, opacity, and color family
    And each relation should define directional blast propagation multipliers obeying causal collider constraints
    And transitive summary edges should have zero layout strength so they never distort physical node coordinates

  @covers:viewer/relations.ts @covers:viewer/data.ts @covers:test/viz-relations.test.ts
  Scenario: Cosine degree normalization dynamically weakens hub dominance
    Given a core domain module connected to a high-fan-in utility sink with in-degree 40
    And a second domain module connected to a specialized service with in-degree 2
    When edge layout attraction weights are computed using cosine degree normalization
    Then the edge weight targeting the high-fan-in utility should be scaled by the inverse square root of target degree
    And the specialized service edge should exert significantly higher layout attraction than the utility sink edge
    And high-degree hubs should not pull unrelated caller clusters together into artificial layout clumps

  @covers:viewer/relations.ts @covers:viewer/data.ts @covers:test/viz-relations.test.ts
  Scenario: Ideal target lengths order structural contracts closer than loose references
    When ideal layout distances are resolved across relation types
    Then structural hierarchy "contains" and "implements" edges should have target lengths of at most 40 units
    And requirement verification edges "defines", "covers", and "verifies" should have target lengths between 50 and 70 units
    And governance and documentation edges "influences" and "documents" should have target lengths between 90 and 110 units
    And loose "references" edges should have target lengths of at least 150 units to float at cluster peripheries

  @covers:viewer/relations.ts @covers:viewer/data.ts @covers:test/viz-relations.test.ts
  Scenario: Support sink dampening emerges topologically with regex heuristics as optional fallback
    Given a codebase with shared utility helpers exhibiting high in-degree ratios
    When layout weights are computed with automatic degree normalization enabled
    Then the utility helpers should be naturally dampened in layout force without requiring filename pattern matching
    When filename regex heuristics are explicitly disabled in user configuration
    Then topological degree normalization should continue dampening high-fan-in utility hubs

  @covers:viewer/relations.ts @covers:viewer/data.ts @covers:test/viz-relations.test.ts
  Scenario: Layout strength adapts based on active graph perspective
    Given the relation registry configured with perspective-specific weight multipliers
    When the active perspective is switched to directory mode
    Then "contains" and "part_of" hierarchy edges should receive maximum layout strength
    When the active perspective is switched to semantic architecture mode
    Then architectural contract edges "implements" and "covers" should dominate over file containment edges
