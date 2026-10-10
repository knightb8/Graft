---
name: bdd-nested-layout
description: Instructs the agent on how to organize, name, and structure Behavior-Driven Development (BDD) feature files using the scalable nested directory pattern, and how to drive work through the BDD-first development cycle. Activate this when creating new BDD projects, adding features to an existing BDD suite, or moving a task from idea to shipped feature.
---

# BDD Nested Directory Layout Skill

When the user asks you to write a new BDD feature or set up a BDD structure, you MUST adhere to the following rules:

## Development Cycle
Feature files are created and closed through a defined lifecycle, never ad hoc. Follow the portable contract in [DEVELOPMENT_CYCLE.md](./DEVELOPMENT_CYCLE.md) unless the project defines its own:

1.  **Plan & align** for any non-trivial task before writing anything — produce a plan and review it for hidden assumptions. Write an ADR for significant architectural decisions.
2.  **No implementation without a feature file.** A feature does not exist until it has declarative Gherkin in the suite.
3.  **Red → Green → Refactor.** Never leave steps as unimplemented stubs; commit as you go.
4.  **Close only when it's done.** All steps pass, a findable closing commit exists, the task moves to done on the board, edge cases became feature files (not comments) — and the user has explicitly confirmed completion. Do not self-declare a stage done.
5.  **Project-specific mechanics** (test-runner quirks, framework commands, database constraints) live in the project's own rules file, not here.

## Directory & File Naming Convention
All `.feature` files must follow this exact path structure:
`features/<domain>/<layer>/<aspect>-<counter>.feature`

1.  **`<domain>`**: The business domain or capability (e.g., `playback`, `auth`, `billing`).
2.  **`<layer>`**: The architectural layer being tested:
    *   `core`: Backend logic, domain models, algorithms.
    *   `api`: HTTP endpoints, GraphQL resolvers.
    *   `web`: Browser-based tests.
    *   `cli`: Command-line tools.
3.  **`<aspect>`**: A short descriptive snake_case name for the feature (e.g., `login_flow`, `audio_engine`).
4.  **`<counter>`**: A positive integer used for ordering files within the same directory. By convention, start at `10` and increment by `10` (e.g., `10`, `20`, `30`). The gaps allow inserting files later (e.g., `15` between `10` and `20`) without renaming existing files.

**Example:**
`features/users/web/login_flow-10.feature`

## Directives (Tags)
Every feature file must include at least one directive (tag) on the very first line before the `Feature:` keyword.

*   Use **`@core`** for backend, logic, or API tests that run fast and headlessly.
*   Use a **UI tag** (e.g., `@frontend`, `@ui`, or `@e2e` — pick one per project and use it consistently) for tests requiring a browser, DOM manipulation, or UI automation setup.

> **Important**: Your test runner must be explicitly configured to check for whichever UI tag you choose. Mismatched tags will cause browser tests to fail silently.

## Behavior
If the user asks to add a new feature to an existing domain and layer, list the existing files in that directory to find the highest `<counter>`, then add 10 for the new file.

After creating a new `.feature` file, update the auto-generated feature index by running `./bdd_utils.sh index` (see [INDEX_STRATEGY.md](./INDEX_STRATEGY.md)).

## Gherkin Writing Rules (Declarative vs. Imperative)
When generating the contents of the `.feature` file, you MUST write **Declarative** BDD, not Imperative. 

*   **BAD (Imperative/UI focused)**: `When I type "martin" into the "#username" field and I click the "Submit" button`
*   **GOOD (Declarative/Business focused)**: `When the user logs in with valid credentials`

Always focus on *what* the system is doing or *why* the user is doing it, entirely decoupled from *how* the UI is implemented.

For detailed Gherkin syntax patterns (Background, Data Tables, Scenario Outlines), see [GHERKIN_PATTERNS.md](./GHERKIN_PATTERNS.md).
For step definition code organization, see [STEP_DEFINITIONS.md](./STEP_DEFINITIONS.md).
For the full idea-to-shipped process, see [DEVELOPMENT_CYCLE.md](./DEVELOPMENT_CYCLE.md).
