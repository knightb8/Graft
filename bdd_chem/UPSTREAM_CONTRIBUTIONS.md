# Upstream Contributions (Zero-Pollution PR Strategy)

When applying the **BDD Chem** framework to a personal fork of a public upstream repository, a core challenge arises: how to submit Pull Requests upstream without polluting the original repository with your customized BDD workflow files (`features/`, `bdd_utils.sh`, `AGENTS.md`, `GEMINI.md`, `docs/adr/`, etc.).

---

## The Golden Rule: Cohesive Development, Ephemeral Extraction

In BDD Chem, a `.feature` specification is an executable contract that guides code design (Red → Green → Refactor). 
**During development on your fork, specs, ADRs, tests, and source code belong together.** 

> **Anti-Pattern Warning: The "Parallel Spec Branch" Trap**
> Do not attempt to maintain a parallel universe of shadow `spec/*` branches separate from `feature/*` code branches. Splitting specs and code across branches leads to branch hyper-inflation (16+ branches for 5 features), amputated specs that cannot execute tests, code branches without their own specifications, and constant merge conflict overhead.

Instead, BDD Chem strictly uses **Ephemeral PR Extraction**: develop feature branches with specs and code united, and extract clean, upstream-ready PR branches **only at submission time**.

---

## The Recommended Workflow: Ephemeral Extraction

### 1. Develop Cohesively on Your Fork Feature Branch
Create a feature branch from your fork's main branch (e.g. `knightb8/main`) or `upstream/main`:
```bash
git checkout -b feature/my-feature knightb8/main
```
Follow the standard BDD Chem cycle:
1. Write the Architectural Decision Record under `docs/adr/`.
2. Write declarative specifications in `features/<domain>/<layer>/<aspect>-<counter>.feature`.
3. Implement step definitions, production code in `src/`, and tests in `test/`.
4. Commit the narrative naturally. Both the spec and the implementation evolve in lockstep.

### 2. When Done, Merge to Your Fork Trunk
Merge `feature/my-feature` into your fork's unified working trunk (`knightb8/main`). 
All your BDD tooling, generated indices (`./bdd_utils.sh index`), and test suites run green here.

### 3. Extract a Clean PR Branch On Demand (Zero Pollution)
Only when you explicitly decide that a feature is mature, tested, and ready to propose upstream, extract a pristine branch directly off `upstream/main`:

```bash
# 1. Fetch latest upstream
git fetch upstream

# 2. Cut a clean PR branch directly from upstream/main
git checkout -b pr/my-feature upstream/main

# 3. Checkout only code and production tests from your feature branch
git checkout feature/my-feature -- src/ test/ docs/devdocs/

# 4. Review git status to confirm zero BDD files (no features/, no bdd_chem/, no AGENTS.md)
git status

# 5. Commit with standard conventional commits
git commit -m "feat(scope): concise upstream-ready description"

# 6. Push to origin and open your upstream PR
git push origin pr/my-feature
```

Alternatively, if your commits on `feature/my-feature` were cleanly structured, you can cherry-pick only the implementation commits:
```bash
git checkout -b pr/my-feature upstream/main
git cherry-pick <commit-hash-code-only>
git push origin pr/my-feature
```

---

## Branch Naming Conventions

* **`feature/<name>`**: Local development branch on your fork. Contains specs, ADRs, code, and tests.
* **`knightb8/main`** (or `<fork>/main`): Your fork's runtime integration branch. Contains everything.
* **`main`**: Mirror of `upstream/main`. Keep clean and tracking upstream.
* **`pr/<name>`**: **Ephemeral branch created only when ready to submit upstream.** Never create `pr/` branches prematurely during exploratory development. Once merged upstream or closed, `pr/<name>` is deleted.

---

## Benefits of Ephemeral Extraction

1. **Self-Contained Features**: Anyone checking out `feature/my-feature` has the full context: the ADR explaining *why*, the Gherkin spec defining *what*, and the code/tests showing *how*.
2. **Zero Upstream Pollution**: Upstream maintainers only ever see pristine commits affecting `src/` and native tests.
3. **No Branch Sprawl**: You only maintain active feature branches. No shadow `spec/*`, `bdd-base`, or bridge branches.
4. **Resilient to Upstream Changes**: When upstream updates, you simply rebase or merge `upstream/main` into your fork trunk, without needing to synchronize parallel branch pairs.
