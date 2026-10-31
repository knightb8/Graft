# Roadmap: Migration to Standalone Node CLI (`@bdd-chem/cli`)

> **Architectural Decision Note**: The project has decided to transition `bdd_chem` from an in-repo vendored toolkit with bash utilities (`bdd_utils.sh`) to a **standalone, zero-dependency Node.js / TypeScript CLI package** (**Option B**).
> 
> *Status*: Planned / Backlog. Documented for future extraction.

---

## 1. Why Standalone Package (Option B)?

Currently, `bdd_chem` is vendored directly into host repositories (e.g. `graft/bdd_chem/`), relying on `bdd_utils.sh` and `scripts/audit-tripartite.mjs`. Transitioning to a standalone npm package (`npx bdd-chem` or `@bdd-chem/cli`) offers key architectural benefits:

1. **Zero-Pollution Upstream Workflow**:
   - Host repositories contributing upstream (such as `knightb8/Graft` $\to$ `NanoNets/context-graph-engine`) will no longer need to maintain vendored framework files or run complex pre-push git safeguards.
   - BDD Chem becomes an external development dependency or an ad-hoc runner (`npx bdd-chem`), completely decoupling development methodology from upstream code.

2. **Native Cross-Platform Compatibility**:
   - Pure Node.js eliminates dependencies on Unix shells, BSD vs GNU `find`/`sed`/`grep` discrepancies, and Windows WSL/Git-Bash workarounds.

3. **Ecosystem-Wide Centralization**:
   - Enhancements (e.g. auto-incrementing feature counters, Mermaid graph exports of Tripartite ADR links, PR check annotations) benefit all repos across the workspace simultaneously without manual copy-pasting.

---

## 2. Planned CLI Interface

```bash
# Lint directory layout, naming, and tripartite health
npx bdd-chem lint [features_dir]

# Audit tripartite semantic links (ADRs ↔ Specs ↔ Code)
npx bdd-chem audit [features_dir] [adr_dir] [--strict] [--summary] [--json]

# Regenerate chronological markdown index
npx bdd-chem index [features_dir] [output_file]

# Scaffold a new feature file with next sequential counter
npx bdd-chem scaffold <domain> <layer> <aspect> [--adr <path>] [--covers <path>]

# Initialize standard directory structure in a fresh project
npx bdd-chem init
```

---

## 3. Migration Tasks (When Prioritized)

- [ ] Initialize standalone repository `knightb8/bdd-chem`.
- [ ] Port `bdd_utils.sh` linting and indexing logic into pure TypeScript/Node using `node:util` `parseArgs` (zero external dependencies).
- [ ] Integrate the existing ESM audit engine (`scripts/audit-tripartite.mjs`).
- [ ] Add unit test suite with mock file trees.
- [ ] Publish to npm / GitHub Packages as `bdd-chem` / `@bdd-chem/cli`.
- [ ] Update host repositories to use `npx bdd-chem` and remove vendored `bdd_chem/` directories.
