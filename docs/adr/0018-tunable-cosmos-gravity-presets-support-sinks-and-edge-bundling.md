# ADR 0018: Tunable Cosmos Gravity Presets, First-Class `defines` Ontology, Support/Utility Sink Dampening, D3-Style Organic Spacing, and Hierarchical Edge Bundling

## Status
Amended (2026-10-30): Overlapping Cosmos weight tables and heuristic regex support sink detection are consolidated and superseded by ADR 0020 (Unified Relation Registry and Degree-Normalized Edge Weights), and multi-pass ForceAtlas2 relaxation is superseded by ADR 0021 (Two-Level Stress-SGD Organic Layout with Preset Constraints).

## Context & Problem Statement
Visualizing a Tripartite Architecture (`Docs/ADRs <-> BDD Specs/Tests <-> Production Code`) requires more than a single static force-directed layout:

1. **Squashed "Berry" Clusters & Artificial Empty Canyons**:
   - Injecting synthetic `weight: 15.0` hub springs (`__galaxy_spring_`) combined with aggressive post-pass compaction (`intraCompactFactor: 0.58`) and wide expansion (`interExpandFactor: 1.45`, `minVoidGap: 95px`) crushed every subsystem into a microscopic ball of overlapping dots (`r ≈ 15px`) separated by 500px voids.
   - By contrast, classic organic force-directed community layouts (`d3-force`) give nodes inside each cluster `30–45px` of non-overlapping breathing room so local triangles, hubs, and spokes are legible, while keeping coupled clusters naturally adjacent.
2. **Gravitational Distortion from Support / Utility Sinks (`helpers.ts`, `types.ts`, `utils.ts`)**:
   - Shared utility modules and type-definition files have high cross-cluster fan-in (`uses` / `references` from many distinct subsystems) and near-zero outgoing dependencies (high sink ratio).
   - Treating incoming `uses` edges to utility sinks with normal attraction weight turns `helpers.ts` and `types.ts` into central black holes that pull unrelated domain subsystems together and spray dozens of yellow cross-cluster lines across the resting canvas.
3. **Faint Unbundled Parallel Splines Across Clusters**:
   - When 4–10 edges travel in the same direction between two clusters (`sourceCluster -> targetCluster`), rendering them with independent uncoordinated curvatures and low resting opacity makes them look either washed-out or messy, whereas **Hierarchical Edge Bundling** (`@d3/hierarchical-edge-bundling`) aligns same-corridor edges along shared cluster-to-cluster control vectors and scales highway prominence with $\sqrt{\text{bundleSize}}$.
4. **Different Architectural Questions Require Different Gravitational Centers (Code-Centric vs. Spec-Centric vs. Doc-Centric Cosmos) & First-Class `defines` Edges**:
   - In a **Code-Centric** review, runtime modules and interfaces (`implements`, `extends`, `uses`) should form the structural core while specs and docs orbit the code they verify.
   - In a **Specification / TDD / BDD-Centric** review, `.feature` specifications and test contracts **define** the expected capabilities (`defines`, `covers`, `verifies`), and production classes **implement** / fulfill those specifications — so specifications should act as stationary gravitational "suns" pulling the code that fulfills them into their orbit.
   - In a **Document / ADR-Centric** review, Architectural Decision Records (`influences`, `documents`, `defines`, `references`) should anchor the cosmos, gathering governed specs and modules around each architectural decision.
   - Previously, `defines` was normalized away to `"validates"` in `src/viz/assemble.ts` and absent from `Relation` in `src/graph/types.ts`.

---

## Decision Drivers
- **D3-Style Organic Community Readability**: Eliminate artificial hub-spring compression, enforce `>= 28px` pairwise intra-cluster node clearance (`~35–45px` center-to-center spacing), and keep coupled clusters in natural proximity (`interExpandFactor = 1.0`, `minVoidGap = 35–44px`).
- **First-Class `defines` Verb & Tripartite Ontology**: Promote `defines` to a first-class relation (`Family = "contract"`) alongside `implements`, `covers`, `verifies`, `documents`, and `influences`.
- **Three Calibrated Cosmos Defaults + Live Weight Sliders (`#weightsMenu`)**: Provide one-click presets for **Code-Centric (`"code"`)**, **Spec / Requirements-Centric (`"spec"`)**, and **Doc / ADR-Centric (`"doc"`)** views (plus **Balanced Coupled (`"coupled"`)** and **Directory Tree (`"directory"`)**), backed by 6 interactive sliders and persistent `localStorage` configuration (`"graft.cosmosConfig"`).
- **Zero-Config Support/Utility Sink Heuristics (Toggleable)**: Automatically detect utility/type sinks topologically and lexically, dampen their incoming layout pull by ~80%, badge them visually (`◈`), and hide their cross-cluster incoming `uses` fan-in at rest — with a config checkbox (`useHeuristics`) to disable heuristics anytime.
- **Hierarchical Control-Point Edge Bundling**: Align parallel corridor splines along shared cluster-centroid control vectors and scale resting highway opacity and stroke width by $\sqrt{\text{bundleSize}}$.

---

## Decision Outcome & Rationale

### 1. First-Class `defines` Relation & Tripartite Ontological Direction
- **Schema & Family**:
  - Add `"defines"` to `Relation` in `src/graph/types.ts` and map `FAMILY.defines = "contract"` in `viewer/data.ts` with canonical color `#c084fc` (vivid purple) and hint `"what contract, type, or capability does this specify?"`.
  - Remove legacy `defines -> validates` and `influences -> configures` overrides in `src/viz/assemble.ts` so `defines` and `influences` survive intact in `.context/` and code graphs.
- **Ontological Meaning Across Presets**:
  - **Specification / Contract Definition (`defines`)**: Emitted when a module, ADR, or `.feature` specification declares a public contract, interface, type schema, or behavioral requirement.
  - **Realization (`implements` / `extends`)**: Emitted when a production class or module realizes an interface, base class, or specification contract.
  - **Verification (`covers` / `verifies`)**: Emitted when a BDD feature covers a module/test or a test suite verifies production code.

### 2. The Three Discussed Cosmos Defaults & Calibrated Weight-Sets (`COSMOS_PRESETS`)
Each preset defines explicit `intra-cluster / inter-cluster` verb weights and slider defaults:

| Relation / Parameter | 1. **Code-Centric (`"code"`)** | 2. **Spec / Requirements-Centric (`"spec"`)** | 3. **Doc / ADR-Centric (`"doc"`)** | **Balanced Coupled (`"coupled"`)** | **Directory Tree (`"directory"`)** |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **`implements` / `extends`** *(Realization)* | **`3.40 / 2.80`** | `2.40 / 2.00` | `1.50 / 1.10` | `3.00 / 2.60` | `3.85 / 0.28` |
| **`defines`** *(Contract / Type Spec)* | `2.60 / 2.00` | **`3.20 / 2.80`** | **`3.00 / 2.60`** | `2.80 / 2.20` | `3.85 / 0.28` |
| **`uses` / `calls` / `depends_on`** *(Runtime)* | **`2.60 / 1.40`** | `0.90 / 0.35` | `0.75 / 0.25` | `1.80 / 0.60` | `3.50 / 0.25` |
| **`covers` / `verifies`** *(Verification)* | `0.90 / 0.75` | **`3.60 / 3.20`** | `2.00 / 1.70` | `2.50 / 2.20` | `3.85 / 0.28` |
| **`documents` / `influences`** *(Governance)* | `0.70 / 0.55` | `2.40 / 2.10` | **`3.60 / 3.30`** | `2.00 / 1.80` | `3.50 / 0.25` |
| **`references`** *(Citation)* | `0.30 / 0.15` | `0.45 / 0.30` | **`1.80 / 1.40`** | `0.45 / 0.25` | `3.50 / 0.25` |
| **`part_of` / `contains`** *(Structure)* | `1.80 / 0.70` | `1.10 / 0.40` | `1.00 / 0.40` | `1.40 / 0.50` | **`9.80 / 0.70`** |
| **Support Sink Pull (`supportWeight`)** | `0.12` | `0.08` | `0.08` | `0.15` | `0.15` |
| **Cluster Gap (`clusterGap`)** | `35 px` | `42 px` | `44 px` | `38 px` | `55 px` |

- **Rationale for Default 1 — Code-Centric (`"code"`)**:
  - Prioritizes runtime call/import topology (`uses = 2.6 / 1.4`, `implements = 3.4 / 2.8`) and module structure (`1.8`) so production packages form the primary backbone, while `.feature` files (`0.90 / 0.75`) and ADRs (`0.70 / 0.55`) orbit the code files they test and document without pulling production modules out of their subsystem clusters.
- **Rationale for Default 2 — Requirements / Spec-Centric (`"spec"`)**:
  - Inverts gravitational authority in favor of BDD specifications (`covers/verifies = 3.6 / 3.2`, `defines = 3.2 / 2.8`) while relaxing code-to-code `uses` (`0.90 / 0.35`). Production implementation files decouple from their filesystem neighbors and cluster directly around the `.feature` specifications they fulfill.
- **Rationale for Default 3 — Document / ADR-Centric (`"doc"`)**:
  - Elevates architectural governance (`documents/influences = 3.6 / 3.3`, `defines = 3.0 / 2.6`, `references = 1.8 / 1.4`) so ADRs and design documents act as galactic nuclei, gathering the specifications and code modules governed by each architectural decision.

### 3. Support / Utility Sink Heuristics & Persistent Config (`detectSupportNodes`, `useHeuristics`)
- **Dual Heuristic (`detectSupportNodes`)**:
  1. **Topological Sink**: Nodes receiving incoming dependency/reference edges from $\ge 3$ distinct source clusters (`crossClusterFanIn >= 3`) with a high sink ratio (`inDegree / (outDegree + 1) >= 2.0`).
  2. **Lexical & Structural Utility**: Nodes matching utility naming patterns (`helpers`, `utils`, `types`, `common`, `shared`, `constants`, `schema`, `config`, `errors`, `.d.ts`) or `type`/`interface` kinds with `inDegree >= 2` and sink ratio $\ge 1.5$.
- **Behavior When Enabled (`useHeuristics = true`, default)**:
  - Incoming `uses`/`references` edges to support nodes receive `supportWeight` (`0.08–0.15`, ~80–90% reduction).
  - Cross-cluster `uses`/`references` edges targeting support nodes are hidden at rest (`visibility: "hidden"`) and illuminate on hover/selection.
  - Detected support nodes display a `◈` visual badge (`◈ helpers.ts`).
- **Config Toggle & Persistence**:
  - Users can uncheck **Auto-detect support & type sinks** (`useHeuristics = false`) in `#weightsMenu` to disable heuristic dampening.
  - All preset selections, slider adjustments, and `useHeuristics` state persist automatically to `localStorage` (`"graft.cosmosConfig"`) and can be reset to defaults with one click.

### 4. D3-Style Organic Spacing & Hierarchical Control-Point Edge Bundling
- **Pairwise Intra-Cluster Node Clearance**:
  - Remove synthetic `15.0` hub springs and enforce pairwise intra-cluster repulsion (`minDist = rA + rB + 28px`) in `relaxAndSeparateGalaxiesVectorized` (`viewer/wasm-physics.ts`) and `separateGalaxies` (`viewer/data.ts`) with `intraCompactFactor = 0.92`, `interExpandFactor = 1.0`, `minVoidGap = 38px`.
- **Hierarchical Edge Bundling (`computeHierarchicalEdgeBundles`)**:
  - Group cross-cluster edges by directional corridor `(sourceCluster --> targetCluster)`, align their spline curvature along the shared cluster-centroid control vector (`0.22 ± 0.012` ribbon offset), and boost resting stroke opacity and width by $\sqrt{\text{bundleSize}}$ (`restOpacity = min(0.78, 0.36 + 0.12 * sqrt(N))`, `restSize = min(3.2, 1.3 + 0.42 * sqrt(N))`).
