# OpenSpec Interop

[OpenSpec](https://openspec.dev) is a spec-driven development (SDD) framework for AI coding assistants: a CLI plus slash-commands (`/opsx:propose`, `/opsx:apply`, `/opsx:archive`, …) that turn a task into durable artifacts — `proposal.md`, delta `specs/`, `design.md`, `tasks.md` — and archive completed changes back into a single evolving system spec.

It is not a competitor to BDD Chem. It is one concrete, productized implementation of the *plan → align → implement → close* skeleton this repo defines in [DEVELOPMENT_CYCLE.md](./DEVELOPMENT_CYCLE.md), plus automation around it. Where OpenSpec stores *prose* requirements (RFC 2119 MUST/SHOULD), BDD Chem stores *executable* Gherkin. They compose cleanly; this guide shows how.

---

## 1. Phase ↔ Command Mapping

The cycle's phases translate directly onto OpenSpec's artifacts and commands:

| Development Cycle Phase | OpenSpec Equivalent |
|---|---|
| Phase 0 — Pick up a task | Backlog sync skills (e.g. `openspec-linearized` for Linear/Jira) or cross-repo **stores** |
| Phase 1 — Plan & align | `/opsx:explore` (pre-implementation analysis) then `/opsx:propose` → `proposal.md`; ADRs live in a custom schema (e.g. `spec-driven-with-adr`) or `design.md` |
| Phase 2 — Specify (BDD first) | The delta `specs/` in `openspec/`; acceptance criteria written as **fenced Gherkin** (see §2) or pointing at the `.feature` files in the suite |
| Phase 3 — Implement | `/opsx:apply` — agent implements step definitions and production code against the spec |
| Phase 4 — Close | `/opsx:verify` + `/opsx:archive` — archive merges the deltas into the main spec |

The standard loop `/opsx:propose → /opsx:apply → /opsx:archive` is exactly the Phase 2 → 3 → 4 arrow of the cycle, machine-enforced.

## 2. Where Gherkin Lives Inside an OpenSpec Spec

Two working patterns, depending on where you want the source of truth:

### Pattern A — Gherkin embedded in the spec (spec as source)
Write the acceptance criteria directly into the spec as a fenced Gherkin block, and generate the runnable tests from it:

```markdown
## Requirements

### Requirement: Session Expiration
The system MUST expire sessions after 15 minutes of inactivity.

```gherkin
Scenario: Active session expires after inactivity
  Given a logged-in user
  When the session is idle for 15 minutes
  Then the session is terminated
```
```

A test generator (e.g. Cucumber.js) compiles the fenced Gherkin into step bindings. The spec stays the single source; the `.feature` files become generated artifacts.

### Pattern B — Spec references the suite (features as source)
Keep the `.feature` files canonical under the [nested layout](README.md) and let the OpenSpec spec reference them:

```markdown
### Requirement: Session Expiration
The system MUST expire sessions after 15 minutes of inactivity.
Executable contract: `features/sessions/core/expiration-10.feature` (@core)
```

The spec carries the *why* and the traceability link; the suite carries the *executable what*. This preserves bdd_chem's living-documentation role and keeps step definitions where [STEP_DEFINITIONS.md](./STEP_DEFINITIONS.md) wants them.

**Recommendation:** Pattern B fits BDD Chem's philosophy (feature files are the executable contract, not a by-product). Pattern A is attractive when you want the OpenSpec archive to be the sole source of truth and don't mind generated `.feature` files.

## 3. What Each Side Keeps

OpenSpec brings:
- **Automation** — slash-command loop wired into 30+ AI tools, CLI, GitHub Action.
- **Delta specs** — `ADDED`/`MODIFIED`/`REMOVED` requirements designed for parallel changes without conflicts.
- **Archive → spec-as-truth** — the system spec becomes a durable, evolving record of behavior.
- **Backlog & cross-repo integration** — PM-tool sync, stores (beta).

BDD Chem keeps:
- **Executable contracts** — Gherkin runs; prose doesn't. Red→green→refactor is only possible with something that runs.
- **The user-confirmation gate** — OpenSpec's `verify`/`archive` records completion; it does not replace the rule that *the user explicitly confirms a stage is done*.
- **Tool-agnostic structure** — the nested layout and the cycle work with or without OpenSpec; adopting OpenSpec later is a drop-in, not a rewrite.

## 4. Adopting OpenSpec Later

Per [DEVELOPMENT_CYCLE.md](./DEVELOPMENT_CYCLE.md), the task board is a **replaceable slot**. OpenSpec is a full-fledged change-loop that can be slotted in without touching a single phase or renaming a single `.feature` file:

1. `npm install -g @fission-ai/openspec && openspec init`
2. Route Phase 0/1 pickups through `/opsx:propose` (or a backlog-sync skill).
3. Keep writing declarative Gherkin per [GHERKIN_PATTERNS.md](./GHERKIN_PATTERNS.md) — either embedded (Pattern A) or referenced (Pattern B).
4. Use `/opsx:apply` for Phase 3 and `/opsx:verify` + `/opsx:archive` for Phase 4 — but keep the explicit user confirmation on top.

The result: OpenSpec automates the plumbing; BDD Chem keeps the suite structured and the work genuinely done.
