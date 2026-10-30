# ADR 0020: Unified Relation Registry, Degree-Normalized Edge Weights, and Emergent Sink Dampening

## Status
Accepted (2026-10-30) — Amends and consolidates edge weight definitions from ADR 0014, ADR 0015, and ADR 0018.

## Context & Problem Statement
In the Graft visualization subsystem, edge weights and relation semantics historically accreted across four independent, overlapping configuration tables:
1. `EDGE_CONTRACTION_WEIGHTS` in `viewer/data.ts` (ForceAtlas2 contraction heuristics).
2. `SEMANTIC_RELATION_WEIGHTS` in `viewer/data.ts` (base tripartite relation weights).
3. `COSMOS_RELATION_WEIGHTS` / `COSMOS_PRESETS` in `viewer/data.ts` (per-preset intra/inter cluster multipliers).
4. `SUPPORT_CLASS_EDGE_WEIGHT` in `viewer/data.ts` and `detectSupportNodes` (hard-coded dampening for utility sinks).

In addition, ADR 0019 introduced directional blast transmission weights and causal collider rules.

Because each layout pass and view mode read from different weight definitions, several critical architectural defects emerged:
- **Scattered Truth & Coupling**: Modifying an edge semantic required synchronizing up to four separate tables and heuristic fallback paths.
- **Hub & Black-Hole Dominance**: High-fan-in modules (e.g., `helpers.ts`, `types.ts`, `state.ts`) attracted dozens of incoming connections. Treating edge attraction without considering node degree caused high-degree hubs to violently pull disparate clusters together into undifferentiated hairballs.
- **Brittle Regex Heuristics**: Support and utility sinks were suppressed using regex filename patterns (`/\b(helpers?|utils?|types?|common)\b/i`), which failed for non-standard utility names and created fragile special-case logic disconnected from the underlying graph topology.
- **Conflation of Concerns**: Physical layout attraction strength, geometric ideal rest length, resting WebGL render prominence, and blast wave transmission were tangled into single scalar numbers.

## Decision Drivers
- **Single Source of Truth**: All semantic relation metadata (layout physics, render styling, blast dynamics) must be declared in one unified registry module (`viewer/relations.ts`).
- **Separation of Concerns**: Distinctly delineate:
  - **Layout Strength & Ideal Length**: Physical forces for distance-preserving layouts.
  - **Render Prominence**: Visual stroke width, resting opacity, and family colors.
  - **Blast Transmission**: Directional energy propagation and collider dampening.
- **Mathematically Emergent Sink Handling**: Suppress hub black-holes via cosine degree normalization rather than hand-tuned regex filters.
- **Tripartite Distance Ordering**: Structural contracts and specifications must pull tighter than peripheral documentation and loose citations.

## Decision Outcome & Architecture

### 1. Unified Relation Registry (`viewer/relations.ts`)
Consolidate all relation properties into a canonical registry providing three explicit facets for every relation:

```typescript
export interface RelationDefinition {
  family: 'structure' | 'contract' | 'realization' | 'dependency' | 'governance' | 'documentation' | 'association';
  layout: {
    strength: number;      // 0.0 to 1.0 (coupling spring stiffness)
    idealLength: number;   // Target Euclidean distance in layout units
    dominantPerspective?: 'directory' | 'semantic';
  };
  render: {
    strokeWidth: number;
    restingOpacity: number;
    color: string;
    curved: boolean;
  };
  blast: {
    forwardMultiplier: number;
    reverseMultiplier: number;
    isTerminalSink?: boolean;
    zeroDecayOnCollider?: boolean;
  };
}
```

### 2. Canonical Relation Weights and Target Lengths Table

| Relation | Layout Strength ($w_{\text{rel}}$) | Ideal Length ($L_0$) | Render Prominence | Blast Transmission | Architectural Role |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `part_of` / `contains` | 1.0 (dir) / 0.4 (sem) | 30 | Medium, Tree Spine | Downstream realization (0.95) | Structural containment; dominant in Directory mode |
| `implements` / `extends` | 0.9 | 40 | High, Crisp Solid | Bidirectional tight (0.90) | Rigid architectural contracts |
| `defines` / `covers` | 0.8 | 60 | High, Vivid Purple/Cyan | Downstream realization (0.90) | Specification $\to$ Code realization |
| `verifies` | 0.6 | 70 | Medium-High, Green | Reverse verification (0.85) | Test suites orbiting covered modules |
| `influences` | 0.5 | 90 | Medium, Violet | Downstream governance (0.75) | ADR $\to$ Specification governance |
| `documents` | 0.3 | 110 | Light, Lavender | Leaf termination (0.65) | Explanatory documentation floating at periphery |
| `uses` / `calls` / `depends_on` | $0.5 \cdot \frac{1}{\sqrt{\text{deg}_{\text{in}}(v)}}$ | 50 | Dynamic filament | Forward prerequisite / reverse consumer | Runtime invocation & shared dependency |
| `references` | 0.1 | 150 | Ultra-light (0.12) | Terminal leaf (0.30) | Loose informational citations |
| `transitive` | 0.0 | — | Dynamic dashed | Flow-only | Visual summary; excluded from physical layout |

### 3. Cosine Degree Normalization
Rather than hand-crafting dampening multipliers or relying on lexical regex matching, the layout attraction weight of an edge $(u, v)$ is computed via cosine degree normalization:

$$W(u, v) = \frac{w_{\text{rel}}}{\sqrt{\text{deg}(u) \cdot \text{deg}(v)}}$$

For directed runtime dependencies (`uses`, `calls`, `depends_on`), the normalization explicitly scales with target in-degree:

$$W_{\text{dep}}(u, v) = \frac{0.5}{\sqrt{\text{deg}_{\text{in}}(v)}}$$

**Emergent Consequences**:
- A utility sink with $\text{deg}_{\text{in}} = 49$ experiences $\sqrt{49} = 7\times$ force dampening ($W \approx 0.07$), naturally preventing it from collapsing the layout into a central hairball.
- Specialized module-to-module dependencies with $\text{deg}_{\text{in}} = 1$ retain full attraction strength ($W = 0.50$).
- Regex heuristics (`detectSupportNodes`) become an optional cosmetic hint (e.g. for icon badging) rather than a required layout crutch.

## Consequences

### Positive
- Replaces four conflicting weight tables with a single, type-safe registry in `viewer/relations.ts`.
- Elimination of artificial gravity "black holes" via mathematically justified degree normalization.
- Consistent ideal distances ensure that contracts and specifications naturally position closer to code than documentation and references.
- Decouples visual rendering adjustments from physical layout calculations.

### Negative / Trade-offs
- Edges connected to high-degree hubs have lower layout stiffness, requiring layout solvers (such as Stress-SGD in ADR 0021) to rely on shortest-path geodesics rather than direct spring tension alone.
