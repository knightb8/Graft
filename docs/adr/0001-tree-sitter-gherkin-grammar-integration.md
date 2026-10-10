# 0001: Tree-sitter Gherkin Grammar Integration Strategy

## Context & Problem Statement
Graft needs to index Gherkin (`.feature`) files to extract AST definitions (Features, Scenarios) and step calls into the context graph. This is necessary to fully index BDD feature files across our ecosystem and link them to corresponding code step definitions (Python, TypeScript, Go). We must decide on the integration strategy for the Gherkin tree-sitter grammar.

## Decision Drivers
- **Consistency**: Must align with Graft's existing tree-sitter architecture.
- **Portability**: End-user installation should be smooth without complex native compilation if possible.
- **Performance**: Parsing speed for potentially large BDD specifications.

## Considered Options
1. **Generic Breadth Tier (Native Bindings)**: Adding `tree-sitter-gherkin` as a native Node.js dependency alongside existing languages (like `tree-sitter-python` and `tree-sitter-typescript`).
2. **WebAssembly Grammar**: Integrating via `web-tree-sitter` utilizing a `.wasm` compiled version of the Gherkin grammar.

## Decision Outcome & Rationale
We will proceed with the **WebAssembly Grammar** approach.
*Rationale:* While native bindings are performant, leaning towards a WebAssembly grammar approach enhances portability (no `node-gyp` builds on install for this new language) and is sufficient for the breadth of Gherkin files which typically aren't bottlenecked by WASM boundary overheads. It sets a precedent for adding new lightweight text-based grammars without bloating native dependencies.

## Pros and Cons
**WebAssembly Grammar**
* **Pro**: High portability; works everywhere `web-tree-sitter` works without native toolchains.
* **Pro**: Easier to manage as a fallback or breadth tier.
* **Con**: Minor performance overhead compared to native bindings.

**Generic Breadth Tier (Native Bindings)**
* **Pro**: Peak performance.
* **Pro**: Aligns with existing native packages in `package.json`.
* **Con**: Potential build issues on different architectures if pre-builds are unavailable.
