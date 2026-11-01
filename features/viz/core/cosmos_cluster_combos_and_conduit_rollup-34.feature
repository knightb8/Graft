@viz @adr:docs/adr/0028-lanum-graph-visualization-enhancements-and-stacked-flow-hierarchy.md
@covers:viewer/combos.ts @covers:viewer/graph.ts @covers:test/viz-combos.test.ts
Feature: Interactive Cluster Combos and Multi-Link Conduit Rollup in Cosmos View
  As an engineer exploring high-density module topologies in the Cosmos visualizer
  I want directory galaxies to collapse into composite combo nodes with rolled-up conduit edges and support in-place expansion
  So that link hairballs are eliminated at overview scale while allowing targeted drill-down into specific subsystems

  Background:
    Given a graph containing multiple directory clusters with intra-cluster and inter-cluster dependency edges

  @covers:viewer/combos.ts @covers:test/viz-combos.test.ts
  Scenario: Collapsing clusters into combos aggregates member nodes and scales combo radius non-linearly
    Given directory clusters with varying member node counts
    When cluster combo aggregation is enabled
    Then each collapsed directory cluster should be represented by a single composite combo node
    And the combo node radius should scale non-linearly by the square root of its member count
    And intra-cluster edges within collapsed combos should be hidden

  @covers:viewer/combos.ts @covers:test/viz-combos.test.ts
  Scenario: Parallel inter-cluster edges roll up into weighted conduits with logarithmic width scaling
    Given 12 parallel dependency edges connecting nodes in cluster A to nodes in cluster B
    When cluster combo aggregation or conduit rollup is computed
    Then the parallel edges should merge into a single conduit edge between cluster A and cluster B
    And the conduit edge should carry the total interaction count of 12
    And the conduit stroke width should scale logarithmically by log2(count + 1)

  @covers:viewer/combos.ts @covers:test/viz-combos.test.ts
  Scenario: In-place expansion of a single combo reveals its constituent nodes while keeping other combos collapsed
    Given all directory clusters are collapsed into combo nodes
    When the user expands cluster A in-place
    Then the constituent member nodes and intra-cluster edges of cluster A should be restored
    And cluster B should remain collapsed as a single combo node
    And edges between cluster A members and cluster B should connect directly to the cluster B combo node
