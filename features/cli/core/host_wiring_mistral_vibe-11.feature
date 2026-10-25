@cli
Feature: Mistral Vibe Host Wiring
  As a developer using Mistral Vibe as my AI coding agent
  I want Graft's init to wire itself into Vibe like any other supported host
  So that Vibe sessions get the Graft instruction section and MCP tools without manual setup

  Background:
    Given a repository and a machine with Mistral Vibe installed

  Scenario: Vibe is offered as a wiring target when it is installed
    Given a Vibe user configuration directory in the home directory
    When Graft plans or runs host wiring
    Then Mistral Vibe appears among the selectable hosts
    And a marker-fenced Graft section is upserted into AGENTS.md

  Scenario: The Graft MCP server is registered in Vibe's user configuration
    Given a Vibe user configuration file in the home directory
    When Graft wires the Vibe host
    Then a graft stdio MCP server entry is added under the MCP servers list
    And other MCP servers and user settings in that file are preserved byte for byte
    And re-running the wiring is idempotent

  Scenario: Existing graft registrations converge to the current launch command
    Given a Vibe user configuration file already holding a graft MCP server entry
    When Graft wires the Vibe host
    Then the existing graft entry is replaced by the current one
    And entries belonging to other servers are untouched

  Scenario: Retraction removes only Graft's contribution
    Given a wired repository and a Vibe user configuration file
    When Graft retracts its host wiring
    Then the graft MCP server entry is removed from the Vibe user configuration
    And the Graft section is removed from AGENTS.md
    And a Vibe configuration holding nothing but the graft entry is deleted rather than left empty

  Scenario: Out-of-repo writes are withheld without global consent
    Given a Vibe user configuration directory in the home directory
    When Graft wires the Vibe host with out-of-repo writes suppressed
    Then the Vibe user configuration file is not written
    And the AGENTS.md section is still written inside the repository
