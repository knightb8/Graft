# Development Cycle

This document is the canonical, tool-agnostic contract for how work moves from idea to shipped code under the BDD Chem convention.
It applies equally to AI agents and human contributors, in any language, on any platform.

It pairs with the [nested directory layout](README.md): the layout tells you *where* a feature file lives; this cycle tells you *when* a feature file comes into existence and what "done" means. One is useless without the other — a well-named feature file is not a shipped feature.

Project-specific rules (test-runner quirks, framework mechanics, database constraints, tooling commands) do **not** belong here. Keep those in the consuming project's own agent/contributor rules file (e.g. `AGENTS.md`). This contract is the portable skeleton; that file is the flesh.

---

## Phase 0 — Pick Up a Task

Work always originates from the project's task tracker or board (TODO list, Kanban, Jira, GitHub Issues — the format does not matter).

> **The board is a replaceable slot, not a sacred artifact.** A plain Markdown Kanban is a deliberate low-friction default that keeps this contract tool-free — but nothing about the cycle is coupled to it. If the project needs one, the Markdown board can be swapped for an integration into a real project management tool (Jira, Linear, GitHub Issues, …) without changing a single phase. What must survive the swap is the *information* the board carries: task identity, status, and the link to its `.feature` file and closing commit. See [AGILE_MAPPING.md](./AGILE_MAPPING.md) for how the layout maps onto those tools.

Before touching any code, check what is already known about the item:

- Is there a BDD feature file in `features/`?
- Is there an ADR / decision record in the project's specs?
- Is there a product spec or issue thread?

> **Do not proceed to Phase 1 until you have read every relevant existing document.**

---

## Phase 1 — Plan & Align

**For any non-trivial task** (new feature, schema migration, architecture change, significant refactor):

1. **Produce a plan** — a concrete, step-by-step execution plan based on what is known.
2. **Review it** — an interactive interview/refinement step to surface hidden assumptions, resolve ambiguities, and agree on scope *before* any commitment is made. (The concrete mechanism is your choice: a review call, a written checklist, a structured prompt — the point is the deliberate alignment step exists.)

> Skip the review step only for trivial bug fixes or clearly mechanical tasks (renaming a variable, fixing a lint error).

If the work involves a significant architectural decision (database design, sync protocol, privacy model, data schema), write an **ADR / decision record** *before* implementation begins. ADRs capture the *why* — rejected alternatives, constraints, context. They are not implementation guides.

---

## Phase 2 — Specify (BDD First)

**No implementation without a feature file.**

1. Write the feature in Gherkin inside the appropriate path, following the [nested layout convention](README.md):
   ```
   features/<domain>/<layer>/<aspect>-<counter>.feature
   ```
2. Write **declarative** Gherkin — *what* the system does, never *how* to click a button — **unless** the scenario enforces a **Compliance requirement or a hard technical constraint** (e.g., WebAssembly/SIMD execution, zero-allocation memory bounds, cryptographic primitives, or strict frame-time budgets) required to prevent architectural or performance code-drift. See [GHERKIN_PATTERNS.md](./GHERKIN_PATTERNS.md).
3. Run your project's step-binding/stub generator if it has one.
4. Ensure the task is tracked on the board as an active item.

---

## Phase 3 — Implement

**Red → Green → Refactor.**

1. Implement the step definitions for the feature.
2. Write production code to make the steps pass.
3. **No step may be left as an unimplemented stub** — a feature is not done until all steps have real implementations and pass.
4. Make **intermediate commits** as checkpoints during development.

### Schema Migrations
- Capture a real fixture *before* migrating, using the project's sanctioned tooling (never ad-hoc scratch tools).
- Store it as a versioned migration fixture.
- Add BDD scenarios covering the migration (old data survives, schema is reproducible).
- No migration is complete without a passing reproducibility test.

---

## Phase 4 — Close

**A task is closed only when all of the following are true:**

- [ ] All BDD steps pass (unit-level suite and integration suite where applicable).
- [ ] No critical static-analysis errors (red entries in the IDE / CI).
- [ ] A **semantic "closing commit"** exists — a single commit whose message clearly identifies the completed topic (e.g. `feat(sync): implement circle QR handshake`). Intermediate commits are welcome; the closing commit must be findable.
- [ ] The item is moved on the board from active → done, with a one-line implementation summary.
- [ ] Any new architectural decision has an ADR in the project's decision records.
- [ ] Any new edge case has a BDD feature file — never a comment in the project's rules file.

> **The user must explicitly confirm** that a manual iteration or testing phase is complete before the cycle moves on. Do not self-declare a stage done.

---

## Key Principles

- **BDD first.** If there is no feature file, the feature does not exist.
- **Edge cases → feature files, not rules files.** Rules files (`AGENTS.md` and friends) contain behavioural rules, not implementation documentation. The moment an edge case lives in a comment instead of a `.feature` file, it is no longer executable, verifiable, or discoverable.
- **ADRs explain why.** Feature files specify what. Code is how.
- **Closing commits must be findable.** Tag or clearly phrase them so any topic can be reconstructed from version-control history.
- **Manual verification is required.** The user confirms; the agent does not self-sign-off.
- **Project-specific mechanics live in the project.** Tooling, test-runner quirks, and framework constraints belong in the consuming project's rules, not in this portable contract.

---

## Document Map

| What | Where |
|---|---|
| This process contract | [`DEVELOPMENT_CYCLE.md`](DEVELOPMENT_CYCLE.md) |
| Lifecycle workflow diagram | [`WORKFLOW_DIAGRAM.md`](WORKFLOW_DIAGRAM.md) |
| Directory layout & naming | [`README.md`](README.md) |
| Mapping to Agile boards | [`AGILE_MAPPING.md`](AGILE_MAPPING.md) |
| OpenSpec interop (SDD loop) | [`OPENSPEC_INTEROP.md`](OPENSPEC_INTEROP.md) |
| Gherkin writing rules | [`GHERKIN_PATTERNS.md`](GHERKIN_PATTERNS.md) |
| Step definition organization | [`STEP_DEFINITIONS.md`](STEP_DEFINITIONS.md) |
| Running & filtering tests | [`RUNNING_TESTS.md`](RUNNING_TESTS.md) |
| Agent-facing skill (condensed) | [`SKILL.md`](SKILL.md) |
