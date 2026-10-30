@viz @adr:docs/adr/0016-hybrid-miller-sankey-and-tristate-cascade-filters.md
Feature: Hybrid Miller-Sankey Explorer and Tri-State Cascading Tree Filters
  As an architect or developer exploring a codebase in Graft
  I want tri-state cascading tree filters, round-trip circletrace blast analysis, and 5-stage Sankey flow aggregation
  So that I can trace intent from ADRs through Features, Code, Tests, and Docs, compare branches side-by-side, and subtract utility noise

  Background:
    Given a codebase graph containing ADRs, BDD Features, Code modules, Tests, and Documentation nodes
    And semantic edges connecting ADRs to Features, Features to Code, and Tests and Docs to Code

  @covers:viewer/sankey.ts @covers:viewer/data.ts @covers:test/viz-sigma.test.ts
  Scenario: Five-stage lifecycle classification and forward-backward lineage reduction
    When nodes are classified into lifecycle stages
    Then each artifact should map to ADRs, Features, Code, Tests, or Docs
    When the user selects an ADR or Feature for active reduction
    Then the reduced visible set should retain the full upstream and downstream connected lineage across all stages
    And unconnected artifacts should be counted in the reduced ghost summary

  @wip
  # Note: Top-row tri-state tree header per column (ADR 0016 Phase 2) UI deferred; underlying set algebra is covered in viewer/data.ts.
  @covers:viewer/sankey.ts @covers:viewer/picker.ts @covers:viewer/graph.ts @covers:test/viz-sigma.test.ts
  Scenario: Tri-state cascading set algebra with Reduce, Keep Ticked Pinning, and Explicit Exclusion
    Given the user reduces the view to "ADR-01" so only its downstream lineage is active
    When the user ticks "Feat-A" into the Pinned Keep state
    And switches the active reduction root to "ADR-02"
    Then the visible set should equal the union of "ADR-02" lineage and the pinned "Feat-A" lineage
    When the user marks a high-fan-in utility module as Explicitly Excluded
    Then the excluded module and its incident links should be subtracted from the visible set and flow math

  @covers:viewer/sankey.ts @covers:viewer/graph.ts @covers:test/viz-sigma.test.ts
  Scenario: Circletrace two-hop reflection discovers indirectly coupled sibling features and governing ADRs
    When the user triggers Circletrace on "Feat-A"
    Then the forward pass should identify all Code and Test artifacts directly covered by "Feat-A"
    And the reflection pass should trace backward from those shared Code and Test artifacts to discover co-dependent sibling Features and governing ADRs
    And reflected secondary nodes and links should be marked as circletrace couplings for contrasting highlight

  @covers:viewer/sankey.ts @covers:test/viz-sigma.test.ts
  Scenario: Miller folder roll-up and drill-down dynamically aggregates and splits Sankey column bars and ribbons
    When a directory group in a lifecycle column is collapsed
    Then child artifacts in that directory should merge into a single macro bar with aggregated coupling weight and coverage status
    And incident ribbons should merge into a combined macro ribbon
    When the directory group is expanded
    Then the macro bar should split into individual child bars with proportional sub-ribbons
    And nodes lacking outbound verification or documentation links should be flagged with gap detection

  @covers:viewer/sankey.ts @covers:viewer/main.ts @covers:viewer/index.html @covers:test/viz-sigma.test.ts
  Scenario: Switching between the Galaxy canvas base and the Stacked Flow canvas base renders an interactive draggable 5-column Sankey SVG
    Given the visualizer is open on the Galaxy canvas base
    When the user clicks the Stacked Flow canvas base switcher
    Then the Galaxy WebGL canvas should be hidden and the Stacked Flow container should become visible
    And the Sankey view should render an interactive SVG containing all five stage columns (ADRs, Specs, Code, Tests, Docs) and flow ribbons
    When the user drags a bar or column header in the Stacked Flow chart
    Then the dragged bar or column and all connected cubic Bézier ribbons should move dynamically to the new coordinates
    When the user clicks a bar in the Stacked Flow chart
    Then Circletrace lineage should highlight the connected upstream and downstream bars and ribbons and synchronize selection with the inspector drawer


