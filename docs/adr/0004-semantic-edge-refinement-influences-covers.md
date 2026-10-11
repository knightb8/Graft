# ADR 0004: Semantic Edge Refinements - Influences and Covers

## Context & Problem Statement
In ADR 0002, we introduced Tripartite Semantic Edges (`specifies`, `binds`, `verifies`, `documents`). However, user feedback regarding the conceptual model of the Tripartite Architecture highlighted a semantic gap:
1. Architectural Decision Records (ADRs) and high-level strategy documents **influence** or **govern** features, they do not merely "document" them.
2. Feature descriptions (Gherkin specs) **cover** tests and implementations, which is a more intuitive and inclusive term than `specifies`.

## Decision Drivers
- **Ontological Accuracy**: The graph relationships should perfectly mirror the mental model of the Tripartite Architecture.
- **Precision**: Differentiating a generic `documents` edge (code explanation) from an `influences` edge (architectural governance).

## Considered Options
1. Keep the existing ADR 0002 taxonomy and treat ADRs as generic `documents`. (Rejected: imprecise).
2. Add `influences` and rename `specifies` to `covers`. (Accepted).

## Decision Outcome & Rationale
We are refining the `Relation` types in `src/graph/types.ts`:
- Added `influences`: Connects an ADR or documentation node to the Feature/Spec it governs. 
- Renamed `specifies` to `covers`: Connects a Spec/Feature to the Module/Class/Test it covers.

*Rationale*: This perfectly aligns the Graft graph engine with the true Tripartite ontology:
- **ADRs (Why)** -> `influences` -> **Features (What)**
- **Features (What)** -> `covers` -> **Implementations / Tests (How)**
- **Tests** -> `verifies` -> **Implementations**
- **Docs** -> `documents` -> **Implementations**
