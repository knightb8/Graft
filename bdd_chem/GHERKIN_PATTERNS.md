# Gherkin Patterns Reference Guide

This guide provides examples and best practices for writing high-quality Gherkin in `.feature` files.

## 1. Background Blocks

Use a `Background` block for shared preconditions that apply to every scenario in the feature file.

**Example:**
```gherkin
Feature: User Authentication

  Background:
    Given the system is initialized
    And the standard configuration is loaded

  Scenario: Successful login
    When a valid user logs in
    Then they should be granted access
```

**Warning:** Do not overload the `Background` block. It runs before *every* scenario in the file. If a step only applies to some scenarios, place it within those specific scenarios instead.

## 2. Data Tables

Data tables allow you to pass structured data to a single step. This is ideal for setting up initial states, passing multiple configuration values, or asserting against lists of items.

**Example:**
```gherkin
Scenario: Processing multiple configurations
  Given the system is provisioned with the following settings:
    | Setting Name | Value | Enabled |
    | feature_x    | 100   | true    |
    | feature_y    | 200   | false   |
  When the configuration is applied
  Then the system should reflect the updated settings
```

## 3. Scenario Outlines with Examples

Use `Scenario Outline` with an `Examples` table to execute the exact same scenario multiple times with different sets of data. This prevents duplication of steps across similar scenarios.

**Example:**
```gherkin
Scenario Outline: Order processing with various payment methods
  Given an order is created with a total of "<amount>"
  When the payment is processed using "<method>"
  Then the order status should be "<status>"

  Examples: Valid Payments
    | amount | method      | status     |
    | 50.00  | credit_card | confirmed  |
    | 15.00  | gift_card   | confirmed  |

  Examples: Rejected Payments
    | amount | method      | status     |
    | 100.00 | expired_cc  | rejected   |
```

## 4. Doc Strings

Use triple quotes (`"""`) to pass multi-line strings to a step. This is especially useful for large text blocks, JSON payloads, or configuration file contents.

**Example:**
```gherkin
Scenario: Submitting a complex payload
  Given the API endpoint is available
  When a request is submitted with the following JSON:
    """
    {
      "request_id": "req-9981",
      "payload": {
        "items": [1, 2, 3],
        "metadata": "sample"
      }
    }
    """
  Then the response should indicate success
```

## 5. Tags for Filtering

Tags can be used to organize and filter tests for execution. Beyond standard architectural or component tags, you can use tags to categorize tests by their purpose or status.

**Examples of common tags:**
- `@wip`: Work in progress; often excluded from CI runs.
- `@smoke`: Quick, critical path tests to verify basic health.
- `@regression`: Comprehensive tests run to ensure existing functionality remains intact.
- `@slow`: Tests that take a long time to run; might be scheduled separately.
- `@JIRA-123`: Link a scenario directly to a specific issue tracker ticket.

**Example:**
```gherkin
@smoke @regression
Scenario: Core system initialization
  Given the core modules are started
  Then the system should report ready status
```

### 5.1 Tripartite Semantic Linking Tags (`@adr:`, `@covers:`, `@ref:`)

Graft indexes codebase intent across the Tripartite Architecture (Code, Specifications, Documentation). Use explicit semantic tags to bridge these domains:

1. **Governing Architecture (`@adr:<path>`)**:
   - Connects the Feature to the governing Architectural Decision Record (`docs/adr/*.md`).
   - Generates an `influences` edge in Graft: $\text{ADR} \xrightarrow{\text{influences}} \text{Feature}$.
   - You can also write a markdown link in the feature description: `Governed by [ADR 0001](docs/adr/0001-init.md)`.
2. **Behavioral Code Coverage (`@covers:<path>`)**:
   - Connects the Feature or Scenario to the domain module(s) or step definition file(s) that implement it.
   - Generates a `covers` edge in Graft: $\text{Feature/Scenario} \xrightarrow{\text{covers}} \text{Module/Class/Steps}$.
3. **External References (`@ref:<path>`)**:
   - Connects to auxiliary configurations, test assets, or related specs.
   - Generates a `references` edge in Graft.

**Example:**
```gherkin
@core
@adr:docs/adr/0001-optical-acquisition.md
@covers:src/twoflower/desk/motion.py
@covers:features/steps/desk_capture_steps.py
Feature: Physical Desk Optical Acquisition
  Governed by [ADR 0001: Optical Desk Acquisition](docs/adr/0001-optical-acquisition.md).

  @covers:src/twoflower/desk/motion.py
  Scenario: Autonomous motion settling captures a physical book spread
    Given a live camera feed observing an open book spread
    When a page is flipped and motion settles for 600 milliseconds
    Then an acquisition trigger should fire
```

## 6. Anti-patterns to Avoid

When writing Gherkin, avoid the following common pitfalls:

*   **Imperative steps:** Avoid writing steps that describe *how* to do something (e.g., clicking buttons, filling fields by CSS selector). Focus on *what* is happening (declarative).
    *   *Bad:* `When I type "admin" into the username field and click the login button`
    *   *Good:* `When the administrator logs in`
    *   *Exception (Compliance & Hard Technical Constraints):* This general rule applies **unless** the scenario specifies a **Compliance requirement or a hard technical/architectural constraint** (e.g., WebAssembly/TypedArray execution, zero-allocation memory invariants, security/regulatory compliance, or hard frame-time SLAs) where locking down the technical mechanism in the `.feature` spec is intentionally required to prevent **code-drift** by future contributors or AI agents.
*   **Giant scenarios:** Scenarios with 20+ steps are hard to read, maintain, and debug. Break complex scenarios into smaller, focused scenarios.
*   **Scenarios that depend on execution order:** Every scenario must be completely independent. Never rely on the state left by a previous scenario.
*   **Misusing Background:** Putting steps in a `Background` that only apply to a subset of the scenarios in the file. If it doesn't apply to *every* scenario, it belongs in the individual scenarios.

