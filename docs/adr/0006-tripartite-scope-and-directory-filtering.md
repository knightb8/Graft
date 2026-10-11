# ADR 0006: Tripartite Scope and Directory Filtering

## Context & Problem Statement
With the introduction of the Tripartite Architecture (ADR 0002, ADR 0003, ADR 0004), Graft indexes codebases across three interconnected domains:
1. **Code**: Programming language source symbols, classes, functions, and call/import graphs.
2. **Specifications**: BDD Gherkin `.feature` specifications, scenarios, and step definitions.
3. **Documentation**: Markdown architecture notes, ADRs, and structural documentation.

While this unified graph captures complete end-to-end intent, viewing or querying large codebases can produce dense graphs containing artifacts irrelevant to a user's immediate question. Users inspecting the interactive visualizer (`graft viz`) cannot currently isolate a specific architectural scope (e.g., viewing only documentation links or specification coverage) or exclude specific noise directories (e.g. `test/`, `docs/checkpoints/`, `vendor/`) on the fly. Furthermore, MCP tools (`graft_find_code`, `graft_find_all`, `graft_trace_calls`) only accept a positive path prefix (`in`), lacking negative directory exclusion and tripartite scope filtering.

## Decision Drivers
- **Tripartite Alignment**: First-class support for filtering by the three architectural pillars: `code`, `specifications` (specs), and `documentation` (docs).
- **Interactive Visualizer Ergonomics**: Enable developers and code reviewers to filter large graphs in the web UI by scope and excluded directories without re-indexing.
- **Shared Query Capabilities**: Reusable filter primitives shared between the web viewer, CLI commands (`viz`, `viz --export`, `ask`, `grep`), and MCP tools.
- **Composable & Non-Destructive**: Filtering is a projection over the indexed graph—it does not mutate or discard indexed data, allowing dynamic switching.

## Considered Options
1. **Ad-hoc UI Regex Filtering**: Implement client-side text filtering only in the viewer. (Rejected: does not help MCP servers, automated agents, or CLI export).
2. **Partitioned Subgraphs at Index Time**: Split graphs into separate index databases per scope. (Rejected: severs tripartite semantic edges like `specifies`, `documents`, and `binds`).
3. **Unified Filter Engine Across Graph, Viz, and Tools**: Accepted.

## Decision Outcome & Rationale
We adopt a unified **Scope and Directory Filter Engine**:
- **Scope Classification**:
  - `specs`: Gherkin `.feature` files and BDD symbols.
  - `docs`: Markdown `.md` files and documentation section nodes.
  - `code`: All programming language source files and AST symbols (`.ts`, `.py`, `.go`, `.java`, etc.).
- **Shared Filter Engine (`src/graph/filter.ts`)**:
  - Defines `ScopeType = 'all' | 'code' | 'docs' | 'specs'`.
  - Implements `matchNodeFilter(node, filter)` and `filterGraph(graph, filter)` evaluating both scope membership and directory exclusions (matching path segments).
- **Visualizer Integration (`viewer/`)**:
  - Adds interactive scope toggle buttons to the visualizer chrome (`All`, `Code`, `Docs`, `Specs`).
  - Adds directory exclusion filtering to prune matching path prefixes from both the canvas simulation and the file outline tree.
  - Passes filter parameters through `assembleContextGraph` and `exportViz`.
- **MCP & CLI Tooling (`src/mcp/tools.ts`)**:
  - Adds optional `scope` and `exclude_dirs` parameters to `graft_find_code`, `graft_find_all`, `graft_trace_calls`, and `graft_repo_map`.
