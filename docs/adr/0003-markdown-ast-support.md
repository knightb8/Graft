# ADR 0003: Markdown AST Support

## Context & Problem Statement
Graft uses Markdown files for concept nodes and visual cards, but it does not natively parse them into the Tree-Sitter AST context graph. This prevents us from creating `documents` or `references` edges from architectural documentation directly to the code components they describe, keeping the documentation and code trees fundamentally isolated during Graph traversal.

## Decision Drivers
- **Traceability**: We must establish a native bridge from documentation to source code.
- **Simplicity**: We should utilize the existing Generic Breadth Tier (using `tags.scm`-like queries) rather than hand-writing a custom AST extractor.
- **Performance**: Parsing Markdown shouldn't significantly delay the build process.

## Considered Options
1. **Custom Regex Parser**: Scraping Markdown for links and headers. (Rejected: fragile and misses hierarchical context).
2. **Tree-Sitter Generic Tier**: Adding `.md` to the Generic Breadth Tier via `tree-sitter-markdown`.

## Decision Outcome & Rationale
We will adopt the **Tree-Sitter Generic Tier** approach. We will add `.md` to `CODE_EXTENSIONS` and register `markdown` in `src/graph/generic.ts`. A custom `markdown.scm` query file will map headings (e.g., `# Architecture`) to `module` nodes, and inline links or code blocks to `references` or `documents` edges, bridging the gap seamlessly.
