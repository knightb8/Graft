# Mapping BDD Layout to Agile Workflows (JIRA / Scrum / Kanban)

The nested BDD directory structure (`features/<domain>/<layer>/<aspect>-<counter>.feature`) aligns perfectly with standard Agile project management hierarchies. This creates a seamless bridge between your project management tool (like JIRA) and your living documentation in code.

The structure is one half of the story; the other half is the lifecycle that drives a card from *To Do* to *Done*. That lifecycle — BDD-first specification, red→green→refactor, and the explicit closing gate — is defined in [DEVELOPMENT_CYCLE.md](./DEVELOPMENT_CYCLE.md). The phases map directly onto board columns:

| Board Column | Development Cycle Phase |
|---|---|
| To Do / Backlog | Phase 0 (pick up) & Phase 1 (plan & align) |
| In Progress | Phase 2 (specify feature) & Phase 3 (red→green→refactor) |
| Done | Phase 4 (close — only after user confirmation) |

> A Markdown Kanban is the zero-setup default, but it is swappable: the same mapping works verbatim against a real project management tool (Jira, Linear, GitHub Issues, …). The board is a slot, not a dependency — only the card's information (identity, status, link to its `.feature` and closing commit) has to survive the swap.

## 1. Structural Mapping to Jira

Here is how the physical file path maps to Agile ticket types:

*   **`<domain>`  ➔  Jira Epic**
    *   *Example*: The `features/billing/` domain represents the "Billing & Subscriptions" Epic. All stories related to billing naturally cluster here.
*   **`<aspect>`  ➔  Jira Story or Task**
    *   *Example*: The aspect `checkout_flow` directly corresponds to a User Story like "As a user, I want to check out so I can purchase a subscription."
*   **`<counter>` ➔  Backlog Priority / Sprint Ordering**
    *   *Example*: A counter of `10` vs `20` can represent the order in which stories were prioritized or implemented across sprints. It naturally maintains the chronological history of how the Epic was built.
*   **`.feature` Scenarios ➔ Acceptance Criteria**
    *   *Example*: The individual `Scenario:` blocks inside the feature file map directly to the Acceptance Criteria defined on the Jira Story.

## 2. Tagging for Bidirectional Traceability

To explicitly link the BDD code to your Agile board, you can use **ticket tags** as directives within your `.feature` files.

```gherkin
@core @JIRA-842 @sprint-12
Feature: User Login Flow
  As a registered user
  I want to log in
  So that I can access my dashboard

  Scenario: Successful login with valid credentials
    ...
```

*   **@JIRA-842**: Immediately tells developers which ticket originated this requirement. Many test runners and CI/CD tools can parse these tags to automatically update Jira tickets when tests pass.
*   **@sprint-12**: (Optional) Tracks which sprint the feature was delivered in.

## 3. Scrum vs. Kanban Workflows

### In a Scrum Workflow:
During Sprint Planning, when a Story is pulled into the Sprint, a developer (or AI Agent) creates the corresponding stub `.feature` file with the next available `<counter>`. 
The progression of the BDD test drives the Sprint progress:
1.  **To Do**: `.feature` file created, Scenarios written (Failing tests).
2.  **In Progress**: Application code written to make tests pass.
3.  **Done**: All Scenarios in the `.feature` file pass in CI.

### In a Kanban Workflow:
The structure supports a continuous flow of value. Because the `<counter>` leaves gaps (10, 20, 30...), you can easily slip high-priority expedited tasks into an existing domain without massive refactoring.
If an urgent bug fix or small feature arises in the `playback` domain, you simply create `playback/core/urgent_fix-15.feature`, slotting it perfectly into the living documentation.

---

## Why Not Use Ticket Numbers in the Filename?

You might wonder why we use a sequential counter (10, 20, 30) instead of just putting the ticket number in the file name (e.g., `checkout_flow-842.feature`). There are several critical reasons for this decoupling:

1. **Loss of Logical Ordering**: Ticket numbers are globally sequential across the whole organization, not localized to your specific domain. If you use ticket numbers, your file explorer will sort features arbitrarily (e.g., `842`, `1005`, `204`). A `10, 20, 30` sequence ensures the files sort chronologically in a way that tells a logical story of how the domain evolved.
2. **Living Documentation vs. Point in Time**: A `.feature` file is living documentation. Over its lifetime, it will be updated by many different tickets (bug fixes, refinements, UI changes). Pinning the filename to the *inaugural* ticket number creates a false impression that the file belongs only to that one ticket.
3. **Tool Lock-in**: If your company migrates from Jira to Linear or GitHub Issues, your filenames are permanently polluted with dead ticket IDs. 
4. **Separation of Concerns**: The file structure should describe the *architecture and behavior of the system*. Project management history belongs in the metadata (via `@tags`), not in the structural hierarchy of the codebase.
