# ADR 0005: Persistent File Exclusion via `.graphignore`

## Context & Problem Statement
Currently, Graft allows excluding files and directories via CLI flags such as `--only-dir` and `--exclude-dir`. While `--exclude-dir` can be recorded in the graph's cache fingerprint, this has major drawbacks:
1. It is not shared across a team or committed to git (fingerprint files are in `.cache/`).
2. Tools running without explicit flags (MCP servers, editors, automated hooks, fresh checkouts) do not know about these exclusions until a build with `--exclude-dir` is executed.
3. Repositories often track legacy files or noisy directories (e.g. `docs/checkpoints`, run logs, generated datasets) that cannot easily be removed from git or `.ignore` (because `git ls-files` outputs git-tracked files regardless of `.gitignore` or `.ignore`).

## Decision Drivers
- **Developer Ergonomics**: Out-of-the-box persistent configuration without having to memorize or supply repetitive CLI flags.
- **Git-Tracked Noise Filtering**: Ability to filter files tracked by git that should nonetheless never appear in the Graft graph.
- **Zero Configuration Drift**: Consistency between CLI builds, MCP queries, background refresh hooks, and CI runs.
- **Standard Syntax**: Familiar pattern-matching rules modeled after `.gitignore`.

## Considered Options
1. **Rely solely on `--exclude-dir` CLI flags**: Rejected due to poor DX and loss on fresh checkouts.
2. **Use `.ignore`**: Rejected because `git ls-files` strictly indexes tracked files and bypasses `.ignore`.
3. **Dedicated `.graphignore` file**: Accepted.

## Decision Outcome & Rationale
We introduce support for an explicit `.graphignore` file located at the repository root:
- Graft checks for `<repo>/.graphignore` on file discovery (`walkDir` in `src/ingest/fs.ts` and `src/graph/source-files.ts`).
- Rules in `.graphignore` are parsed and applied to all enumerated files, filtering out matches whether tracked by Git or found via filesystem walk.
- Supports standard glob/ignore syntax (comments `#`, leading/trailing slashes, directory wildcards `**`, negation `!`).
- Seamlessly integrates with `--exclude-dir` and `--only-dir`.
