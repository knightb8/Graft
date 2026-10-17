# ADR 0010: AsciiDoc AST Support, Includes, and Cross-References

## Context & Problem Statement
Many technical projects and architecture documentation suites use **AsciiDoc** (`.adoc`, `.asciidoc`) rather than Markdown (e.g., arc42 architecture templates, Spring projects, Antora, Red Hat documentation).
In the Tripartite Architecture (Code, Docs, Specs), architectural documentation belongs to the `docs` scope. While Graft natively indexes Markdown and Gherkin features, it previously ignored `.adoc` and `.asciidoc` files, leaving AsciiDoc-based architecture documentation unlinked from the code and specifications.

Furthermore, AsciiDoc has powerful native mechanisms for modularity and traceability:
1. **Include Directives (`include::...[]`)**: Projects embed other documents or reference code snippets (e.g., `include::shared.adoc[]`, `include::src/main.ts[lines=10..30]`).
2. **Cross-References (`xref:...[]` and `<<...>>`)**: Architectural documents link to other sections or ADRs.

Without native AsciiDoc parsing, these relationships cannot be extracted into the context graph.

## Decision Drivers
- **Tripartite Cohesion**: AsciiDoc files must be indexed as `docs` scope and bridged to code and specifications.
- **Traceability via Includes & References**: `include::...[]` and `xref:...[]` directives must resolve to concrete in-repo dependencies (`documents`, `influences`, `references`).
- **Simplicity & Zero Toolchain Overhead**: Parsing should be deterministic and fast without requiring native compiler toolchains.
- **Hierarchical Section Mapping**: Document headings (`= Title`, `== Section`, `=== Subsection`) must yield structured `module` nodes with exact file:line spans.

## Considered Options
1. **External CLI (Asciidoctor)**: Calling out to external ruby or node asciidoctor CLI. *Rejected*: Heavy external dependency and slow process spawning overhead during graph builds.
2. **Tree-Sitter AsciiDoc**: Compiling or loading an experimental tree-sitter wasm grammar. *Rejected*: No official or mature tree-sitter-asciidoc grammar in the standard `tree-sitter-wasm` bundle.
3. **Dedicated Deterministic AST & Directive Extractor (`src/graph/asciidoc.ts`)**: Fast, custom AST scanner that parses section hierarchies and extracts `include::`, `xref:`, and `<<...>>` directives. *Selected*.

## Decision Outcome & Rationale
We will implement dedicated AsciiDoc extraction in `src/graph/asciidoc.ts` and register `.adoc` and `.asciidoc` in `src/graph/extract.ts` and `src/graph/filter.ts`.

### Mechanics:
1. **Node Extraction**:
   - The file itself emits a `kind: "file"` node.
   - Headings (`= Title`, `== Section`, `=== Subsection`, `==== Sub-subsection`) emit `kind: "module"` nodes with exact line spans (`L<start>-L<end>`) and `contains` edges from the parent section or file node.
2. **Include Directives**:
   - `include::<target>[<options>]` emits an unresolved raw edge with `specifier: <target>` and relation `"documents"` (or `"influences"` if targeting ADRs), resolved by `resolveDocumentLink` in `resolve.ts`.
3. **Cross-References**:
   - `xref:<target>[<label>]` and `<<<target>,<label>>>` emit raw edges attributed to the nearest enclosing section heading.
4. **Tripartite Classification**:
   - `scopeOfPath()` classifies `.adoc` and `.asciidoc` under the `"docs"` scope, fully integrating them with scope checkboxes, tree pickers, and transitive shortcut edges.
