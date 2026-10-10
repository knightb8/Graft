# BDD Chem 🧱

> *"Words in the head."* — In Terry Pratchett's Discworld, a **chem** is the inscribed tablet placed inside a golem's head that gives it purpose, rules, and direction. This project serves the same function for AI coding agents and developers: a set of precise, portable instructions that tell them exactly how to build and maintain a structured BDD test suite.

---

A standalone toolkit of guidelines, scripts, and agent skills for enforcing a highly scalable, maintainable, and readable structure for Behavior-Driven Development (BDD) `.feature` files — plus the **development cycle** that turns that structure into a shipping process.

Drop this into any project. Give it to any agent. The chems do the rest.

## The Problem

BDD projects inevitably devolve into a flat mess of dozens of `.feature` files with inconsistent naming, no discoverability, and no connection to the project management workflow. And even a perfectly nested suite says nothing about *when* features get written or what "done" means. This toolkit enforces a strict nested directory convention that scales infinitely, and pairs it with a portable [development cycle](DEVELOPMENT_CYCLE.md) — BDD-first specification, red→green→refactor implementation, and an unambiguous closing gate.

## The Convention

```
features/<domain>/<layer>/<aspect>-<counter>.feature
```

| Component | Purpose | Example |
|---|---|---|
| `domain` | Business capability / Epic | `billing`, `auth`, `playback` |
| `layer` | Architectural layer | `core`, `api`, `web`, `cli` |
| `aspect` | Descriptive feature name | `checkout_flow`, `login` |
| `counter` | Ordering integer (convention: multiples of 10) | `10`, `20`, `30` |

**Example path:** `features/billing/api/checkout_flow-10.feature`

## Contents

### 📖 Guidelines
| File | What It Covers |
|---|---|
| [DEVELOPMENT_CYCLE.md](./DEVELOPMENT_CYCLE.md) | The portable idea-to-shipped contract: pick up, plan & align, specify BDD-first, implement red→green→refactor, close |
| [WORKFLOW_DIAGRAM.md](./WORKFLOW_DIAGRAM.md) | Mermaid flowcharts: the full development lifecycle + the feature-file placement decision |
| [AGILE_MAPPING.md](./AGILE_MAPPING.md) | How the directory structure maps to Jira Epics, Stories, Scrum & Kanban |
| [OPENSPEC_INTEROP.md](./OPENSPEC_INTEROP.md) | How the cycle maps onto OpenSpec (propose→apply→archive) and where Gherkin lives in an OpenSpec spec |
| [INDEX_STRATEGY.md](./INDEX_STRATEGY.md) | The two-file index pattern (`INDEX.md` auto-generated, `README.md` human-curated) |
| [UPSTREAM_CONTRIBUTIONS.md](./UPSTREAM_CONTRIBUTIONS.md) | Zero-pollution upstream PR strategy: cohesive fork development + ephemeral PR extraction |
| [FAQ.md](./FAQ.md) | Edge cases: cross-domain features, counter limits, sub-domains |

### ✍️ Writing Guides
| File | What It Covers |
|---|---|
| [GHERKIN_PATTERNS.md](./GHERKIN_PATTERNS.md) | Background, Data Tables, Scenario Outlines, Doc Strings, anti-patterns |
| [STEP_DEFINITIONS.md](./STEP_DEFINITIONS.md) | Step code organization, shared test context, lifecycle hooks (Go/Python/JS) |

### ▶️ Execution
| File | What It Covers |
|---|---|
| [RUNNING_TESTS.md](./RUNNING_TESTS.md) | Path & tag filtering, test result artifacts for multi-agent handover |

### 🔧 Automation
| File | What It Covers |
|---|---|
| [bdd_utils.sh](./bdd_utils.sh) | Lint the directory structure, auto-generate a feature index |

### 🤖 Agent Integration
| File | What It Covers |
|---|---|
| [SKILL.md](./SKILL.md) | Drop-in AI agent skill file (e.g., for Antigravity, Cursor, Aider) |

## Quick Start

```bash
# Copy bdd_chem into your project (or symlink/submodule it)
cp -r bdd_chem/ /path/to/your/project/

# Lint your existing features directory
./bdd_chem/bdd_utils.sh lint ./features

# Generate a feature index
./bdd_chem/bdd_utils.sh index ./features ./features/INDEX.md
```

## Similar Tools

BDD Chem sits on the *executable end* of the spec-driven spectrum: it is a convention + agent skill, not a CLI framework, so nothing is a 1:1 clone. These are the closest analogues, grouped by facet:

### Spec-driven development frameworks (process-contract end)
| Tool | What It Is | How It Compares |
|---|---|---|
| [GitHub Spec Kit](https://github.com/github/spec-kit) | `specify` CLI, `.specify/` conventions, `constitution.md` of non-negotiable principles, 29+ agent integrations | Closest in *shape* (toolkit of conventions + agent integrations), but prose specs, not executable Gherkin; heavier (Python CLI, rigid phase gates) |
| [OpenSpec](https://openspec.dev) | Lightweight `propose → apply → archive` loop, delta specs, cross-repo stores | Same spirit as our [development cycle](DEVELOPMENT_CYCLE.md); see [OPENSPEC_INTEROP.md](./OPENSPEC_INTEROP.md) for the mapping |
| [Kiro](https://kiro.dev) (AWS) | Agentic IDE, EARS requirements + formal verification | Powerful but IDE-locked; verification at the cost of portability |

### BDD / Gherkin writing & linting (structure end)
| Tool | What It Is | How It Compares |
|---|---|---|
| [gherkin-guidelines.md](https://github.com/AutomationPanda/gherkin-guidelines-for-ai) | Open-source context file for AI agents writing Gherkin | Closest analogue to [SKILL.md](./SKILL.md)'s role |
| [gherkin-lint](https://github.com/gherkin-lint/gherkin-lint) | Linter for feature files (naming, step size, tags) | The lint half of [bdd_utils.sh](./bdd_utils.sh) |
| [gherkin-best-practices](https://github.com/andredesousa/gherkin-best-practices) | Guideline list (declarative style, tags, layering) | Overlaps [GHERKIN_PATTERNS.md](./GHERKIN_PATTERNS.md) |
| [QA Skills](https://qaskills.sh) | Marketplace of SKILL.md packs for AI agents | BDD Chem is a standalone instance of this genre |

### Living-documentation generators (index/documented-suite end)
[Pickles](https://www.picklesdoc.com/), [Cluecumber](https://github.com/trivago/cluecumber-report-plugin), [Reqnroll LivingDoc](https://docs.specflow.org/projects/specflow-livingdoc/en/latest/), CukeDocs, [CucumberStudio](https://www.smartbear.com/product/cucumberstudio/) — render feature files plus results into stakeholder HTML/Confluence docs; complements the [INDEX_STRATEGY.md](./INDEX_STRATEGY.md) pattern.

### What stays distinct
No tool above pairs a nested layout convention, an agent skill, and a closing-gate process into one **zero-dependency, tool-agnostic** package whose contracts are *executable*. Spec Kit/OpenSpec/Kiro write prose that doesn't run; the linters/guidelines have no process or agent glue. That gap is exactly where BDD Chem lives.

## License

Do what you want with it. The golems won't mind.
