# ADR 0002: Tripartite Semantic Edges

## Context & Problem Statement
Graft currently models structural code using standard execution and structural edges (`contains`, `calls`, `imports`, `references`, `implements`, `extends`). However, as we expand Graft to map the "Tripartite Architecture" (Code, Specifications, and Documentation), these purely execution-based edges lose the semantic intent of *why* nodes are connected. A Gherkin feature does not "call" a domain module; it *specifies* it. A Markdown architecture doc doesn't "import" a source file; it *documents* it. We need explicit edge types to bridge these distinct trees without losing context.

## Decision Drivers
- **Semantic Clarity**: LLMs and developers traversing the graph must distinguish between a function invocation and a behavioral specification boundary.
- **Queryability**: It should be possible to query "what documents X?" independently from "what calls X?".
- **Consistency**: New edges must integrate seamlessly into `types.ts` and the existing resolution pipeline.

## Considered Options
1. **Generic Edges (Status Quo)**: Overloading `calls` and `references` for all inter-tree links. (Rejected: loses intent).
2. **Metadata Tags**: Storing intent inside edge metadata instead of distinct relations. (Rejected: complicates the core `Relation` taxonomy).
3. **Dedicated Semantic Relations**: Introducing explicitly named `Relation` variants for cross-tree bridges.

## Decision Outcome & Rationale
We will adopt **Dedicated Semantic Relations**. We are adding the following edge types to `Relation`:
- `specifies`: Connects high-level specifications (BDD Features) to domain modules.
- `binds`: Connects executable specification steps (Gherkin Steps) across the regex/language boundary to their step definitions.
- `verifies`: Connects tests or Scenarios to the specific production code they exercise.
- `documents`: Connects documentation nodes (Markdown files/sections) to the code or specifications they describe.

*Rationale*: This turns the context graph into a self-documenting intent tree. It empowers the graph traversal engine to weigh a "documents" edge differently from a "calls" edge during context assembly, significantly improving LLM reasoning about architectural boundaries.
