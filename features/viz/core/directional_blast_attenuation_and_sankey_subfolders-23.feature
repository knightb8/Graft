@viz @adr:docs/adr/0019-directional-blast-attenuation-and-collider-zero-decay.md
Feature: Directional Blast Attenuation, Causal Collider Zero-Decay Rules, and Sankey Suite Sub-Foldering
  As an architect or developer tracing change impact in Graft
  I want blast propagation to obey directional edge semantics, decay to zero across causal colliders, and sub-folder flat test suites
  So that shared utility sinks and observer leaves never leak false transitive coupling across unrelated modules

  Background:
    Given a codebase graph with ADRs, BDD Features, Code modules, Test suites, and Documentation nodes

  @covers:viewer/sankey.ts @covers:viewer/data.ts @covers:test/viz-sigma.test.ts
  Scenario: Monotonic downstream realization and upstream provenance attenuate energy per hop
    Given an ADR influencing a Feature, the Feature covering a Code module, and a Test verifying that Code module
    When the user triggers blast attenuation from the ADR seed with hop decay 0.65
    Then the ADR seed should have hop 0 and energy 1.0
    And the governed Feature at hop 1 should have energy >= 0.90
    And the covered Code module at hop 2 and verifying Test at hop 3 should have monotonically decreasing energy

  @covers:viewer/sankey.ts @covers:viewer/data.ts @covers:test/viz-sigma.test.ts
  Scenario: Shared utility sink collider decays to zero and blocks false coupling between unrelated callers
    Given Module A uses SharedHelper and Module B also uses SharedHelper
    When the user triggers directional blast attenuation from Module A
    Then SharedHelper should be reached at hop 1 as a prerequisite dependency
    And the reverse dependency path from SharedHelper into Module B should decay to zero
    And Module B should not be energized in the blast result

  @covers:viewer/sankey.ts @covers:viewer/data.ts @covers:test/viz-sigma.test.ts
  Scenario: Reverse consumer impact propagates from a modified callee to all upstream callers without leaking into their other callees
    Given Caller A uses CoreEngine and Caller A also uses UnrelatedUtil
    When the user triggers directional blast attenuation from CoreEngine
    Then Caller A should be energized at hop 1 via reverse consumer impact
    And UnrelatedUtil should decay to zero so prerequisite callees of Caller A are not falsely marked as impacted

  @covers:viewer/sankey.ts @covers:viewer/data.ts @covers:test/viz-sigma.test.ts
  Scenario: Leaf observer nodes (Tests, Docs, and loose References) terminate propagation after hop 1
    Given Code X is verified by Test Suite 1 and documented by Guide Doc
    And Guide Doc also documents Unrelated Code Y
    And Code X has a loose references link to Concept Z which references Concept W
    When the user triggers directional blast attenuation from Code X
    Then Test Suite 1, Guide Doc, and Concept Z should be reached at hop 1 as terminal leaf sinks
    And Unrelated Code Y and Concept W at hop 2 should decay to zero and remain unenergized

  @covers:viewer/sankey.ts @covers:viewer/main.ts @covers:test/viz-sigma.test.ts
  Scenario: Flat test directories sub-folder by domain prefix and support interactive directory filtering in Stacked Flow
    Given flat test files "test/viz-sigma.test.ts" and "test/cli-help.test.ts" in the Tests stage
    When folders are grouped in the Stacked Flow view
    Then the Tests column should roll up into domain sub-folder bars "test/viz" and "test/cli"
    When the user filters or hides "test/cli"
    Then only matching directory and file bars should remain visible in the Stacked Flow chart
