# ADR 0019: Directional Blast Attenuation, Causal Collider Zero-Decay Rules, and Sankey Suite Sub-Foldering

## Status
Accepted (2026-10-19)

## Context & Problem Statement
When a user clicks an artifact (an ADR, BDD Feature, Code module, Test suite, or Documentation node) in either the **Stacked Lifecycle Flow (Miller-Sankey)** or the **Galaxy View**, Graft highlights the "affected lineage" across multiple hops.

However, treating graph edges as **undirected** during multi-hop blast propagation introduces three severe architectural distortions:

1. **Shared Utility Sink Leakage (Causal V-Structure / Collider Trap)**:
   - Suppose `Feature A` (or `Module A`) uses `helpers.ts` (`A --uses--> helpers.ts`), and `Module B` also uses `helpers.ts` (`B --uses--> helpers.ts`).
   - An undirected 2-hop walk (`A -> helpers.ts -> B`) illuminates `Module B` when `A` is clicked—even though changing `A` has **zero causal or architectural impact** on `B`!
   - In causal graph theory (Pearl's d-separation), `A -> U <- B` is a **collider (V-structure)**: entering a dependency sink forward (`--uses-->`) and reversing backward out of it (`<--uses--`) must **decay immediately to `0.0` (blocked)**.

2. **Observer / Leaf Sink Leakage (`Tests` and `Docs` as Non-Transmitting Leaves)**:
   - `Test A --verifies--> Code X <--verifies-- Test B`: Clicking `Test A` should show `Code X` (and its governing `Feature` / `ADR`), but should **not** chain through `Code X` to light up unrelated `Test B` unless explicit Circletrace co-verification reflection is requested.
   - `Doc A --documents--> Code X <--documents-- Doc B`: Documentation observes code; modifying a code module does not flow *through* a documentation file into other code modules (`Code X <-documents-- Doc --documents-> Code Y` must decay to **`0.0`**).
   - `references`: Loose textual `references` edges are informational at Hop 1 (`0.55`), but chaining 2+ hops after a `references` edge creates noisy associative drift and must decay to **`0.0`** beyond Hop 1.

3. **Flat Test Directory Granularity in Miller-Sankey**:
   - In many TypeScript/Node repositories (including Graft), test suites live in a flat 1-level directory (`test/viz-sigma.test.ts`, `test/cli-help.test.ts`, `test/graph-build.test.ts`), while `src/` and `features/` use 2+ nested folder levels (`src/graph/`, `features/viz/`).
   - Standard 2-segment path grouping leaves the **4. Tests** column either completely ungrouped or collapsed into a single monolithic `📁 test` bar.

---

## Decision Outcome & Architecture

### 1. Directional Phase State Machine & Causal Collider Zero-Decay Rules (`computeBlastAttenuation`)

Multi-hop blast propagation is modeled as a **directed phase-aware state machine** where each traversal state carries `(nodeId, hop, energy, phase)` and evaluates each candidate step `(u -> v)` according to the edge's **semantic verb**, **traversal direction** (`"forward"` along `source -> target` vs. `"reverse"` along `target -> source`), and the **incoming phase**:

#### A. Traversal Phases (`BlastPhase`)
1. **`"SEED"` (Hop 0)**: Starting state at the clicked artifact(s) with `energy = 1.00`.
2. **`"DOWN_REALIZE"` (Downstream Realization)**: Moving downstream from intent to implementation and verification:
   - `ADR --influences--> Spec --covers/defines/implements--> Code <--verifies-- Test` and `Code <--documents-- Doc`.
3. **`"UP_PROVENANCE"` (Upstream Provenance)**: Moving upstream from verification or implementation back to governing requirements and architectural decisions:
   - `Test/Doc --verifies/documents--> Code <--covers/defines-- Spec <--influences-- ADR`.
4. **`"DEP_PREREQ"` (Forward Prerequisite Dependency)**: Moving along `Caller --uses/calls/depends_on--> Callee` (what `Caller` depends on to function).
5. **`"DEP_IMPACT"` (Reverse Consumer Impact)**: Moving along `Callee <--uses/calls/depends_on-- Caller` (what downstream consumers break if `Callee` changes).
6. **`"LEAF_SINK"` (Terminal Observer)**: Reached via `references` or leaf `documents`; **cannot propagate to any further hops (`nextWeight = 0.0`)**.

#### B. Directional Edge Transmission & Zero-Decay Matrix

| Edge Verb (`source -> target`) | Traversal Direction | Semantic Meaning | Allowed Incoming Phases | Resulting Phase | Transmission Weight ($w_{\text{dir}}$) | Zero-Decay / Collider Block Rules ($w = 0.0$) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`influences`** (`ADR -> Spec`) | **Forward** (`ADR -> Spec`) | Downstream Governance | `SEED`, `DOWN_REALIZE` | `DOWN_REALIZE` | **`0.95`** | Blocked (`0.0`) from `UP_PROVENANCE` (prevents `Spec_1 <- ADR -> Spec_2` zig-zag unless Circletrace is enabled). |
| **`influences`** (`ADR -> Spec`) | **Reverse** (`Spec -> ADR`) | Upstream Provenance | `SEED`, `UP_PROVENANCE` | `UP_PROVENANCE` | **`0.92`** | Blocked (`0.0`) from `DOWN_REALIZE` (prevents `ADR_1 -> Spec <- ADR_2` collider). |
| **`covers` / `defines`** (`Spec -> Code`) | **Forward** (`Spec -> Code`) | Contract Realization | `SEED`, `DOWN_REALIZE` | `DOWN_REALIZE` | **`1.00`** (`covers`), **`0.95`** (`defines`) | Blocked (`0.0`) from `UP_PROVENANCE` (prevents `Code_1 <- Spec -> Code_2` fan-out when tracing a single code file's provenance). |
| **`covers` / `defines`** (`Spec -> Code`) | **Reverse** (`Code -> Spec`) | Governing Requirement | `SEED`, `UP_PROVENANCE`, `DEP_IMPACT` | `UP_PROVENANCE` | **`0.95`** | Blocked (`0.0`) from `DOWN_REALIZE` unless `includeReflected = true` (Circletrace mode). |
| **`implements` / `extends`** (`Sub -> Super`) | **Forward** (`Sub -> Super`) | Contract Target | `SEED`, `UP_PROVENANCE`, `DEP_PREREQ` | `DEP_PREREQ` | **`1.00`** | Blocked (`0.0`) from `DEP_IMPACT` (prevents `Sub_1 -> Super <- Sub_2` collider). |
| **`implements` / `extends`** (`Sub -> Super`) | **Reverse** (`Super -> Sub`) | Concrete Implementers | `SEED`, `DOWN_REALIZE`, `DEP_IMPACT` | `DEP_IMPACT` | **`1.00`** | Blocked (`0.0`) from `DEP_PREREQ` (`0.0` collider block). |
| **`verifies`** (`Test -> Code`) | **Forward** (`Test -> Code`) | Verified Implementation | `SEED`, `UP_PROVENANCE` | `UP_PROVENANCE` | **`1.00`** | Blocked (`0.0`) from `DOWN_REALIZE` (prevents `Code_1 <- Test -> Code_2` leak). |
| **`verifies`** (`Test -> Code`) | **Reverse** (`Code -> Test`) | Verification Suite | `SEED`, `DOWN_REALIZE`, `DEP_IMPACT` | `LEAF_SINK` | **`1.00`** | Transitions to `LEAF_SINK` so traversal terminates at the Test node (`Code -> Test -> OtherCode = 0.0`). |
| **`documents`** (`Doc -> Target`) | **Forward** (`Doc -> Target`) | Documented Subject | `SEED` | `UP_PROVENANCE` | **`0.90`** | Only allowed at Hop 1 from a clicked Doc (`SEED`); blocked (`0.0`) on subsequent hops so Docs never act as bridges between code modules. |
| **`documents`** (`Doc -> Target`) | **Reverse** (`Target -> Doc`) | Attached Documentation | `SEED`, `DOWN_REALIZE`, `DEP_IMPACT` | `LEAF_SINK` | **`0.85`** | Transitions to `LEAF_SINK` (`Target -> Doc -> Anything = 0.0`). |
| **`uses` / `calls` / `depends_on`** (`Caller -> Callee`) | **Forward** (`Caller -> Callee`) | Prerequisite Callee | `SEED`, `DOWN_REALIZE`, `DEP_PREREQ` | `DEP_PREREQ` | **`0.78`** | **Blocked (`0.0`)** from `DEP_IMPACT`! (`Callee <--uses-- Caller --uses--> OtherCallee` does not propagate impact into prerequisites). Support sinks terminate after 1 hop. |
| **`uses` / `calls` / `depends_on`** (`Caller -> Callee`) | **Reverse** (`Callee -> Caller`) | Downstream Impact | `SEED`, `DEP_IMPACT` | `DEP_IMPACT` | **`0.88`** | **Collider Block (`0.0`)** from `DEP_PREREQ`! (`Caller_A --uses--> SharedUtil <--uses-- Caller_B = 0.0`). |
| **`part_of` / `contains`** | **Forward / Reverse** | Structural Containment | `SEED`, `UP_PROVENANCE`, `DOWN_REALIZE` | Preserves phase | **`0.88`** | Structural parent/child containment preserves monotonic direction. |
| **`references`** (`A -> B`) | **Forward** (`A -> B`) | Loose Reference | `SEED` | `LEAF_SINK` | **`0.55`** | **Decays to `0.0` after Hop 1** (`LEAF_SINK`) and **Reverse (`B -> A`) is `0.0`** unless `A` or `B` is the clicked seed. |

---

### 2. Per-Hop Energy Attenuation Formula

For any valid directional transition `(u -> v)` where $w_{\text{dir}} > 0$:

$$\text{Energy}(v) = \text{Energy}(u) \times \gamma_{\text{hop}}(\text{hop}) \times w_{\text{dir}}(u \to v, \text{phase}) \times \text{fanoutPenalty}(u)$$

Where:
- **Hop 0 (Clicked Seed)**: $\text{Energy} = 1.00$
- **Hop 1 (Direct Connected Neighbor)**: $\gamma_{\text{hop}}(1) = 1.00$ (direct neighbors receive full directional relation transmission $w_{\text{dir}}$)
- **Hop $k \ge 2$ (Multi-Hop Lineage)**: $\gamma_{\text{hop}}(k) = \gamma \in [0.30, 1.00]$ (default **`0.65`**, user-tunable via the **Hop Decay** slider in the Stacked Flow toolbar)
- **Hub Fan-Out Penalty**: $\text{fanoutPenalty}(u) = \frac{1}{1 + 0.05 \cdot \max(0, \deg(u) - 5)}$ for $\text{hop} \ge 1$.

---

### 3. Domain Prefix Sub-Foldering for Flat Test Suites (`folderGroupKeyOfNode`)

To ensure the **4. Tests** column in the Miller-Sankey view has the same architectural sub-folder ergonomics as `src/` and `features/`:
- Multi-segment paths (`parts.length >= 3`, e.g., `src/graph/build.ts`, `features/viz/core/galaxy.feature`, `docs/adr/0019.md`) group by their top 2 path segments (`src/graph`, `features/viz`, `docs/adr`).
- Flat 2-segment test paths (`test/<suite>-<aspect>.test.ts` or `tests/<suite>_<aspect>.spec.ts`) extract the domain prefix before the first `-` or `_`, producing virtual sub-folder bars **`📁 test/viz`**, **`📁 test/cli`**, **`📁 test/graph`**, **`📁 test/parsing`**, etc.

---

## Verification & Compliance
- **Governed BDD Specification**: [`features/viz/core/directional_blast_attenuation_and_sankey_subfolders-23.feature`](../../features/viz/core/directional_blast_attenuation_and_sankey_subfolders-23.feature)
- **Covered Implementations**: `viewer/sankey.ts`, `viewer/data.ts`, `viewer/main.ts`, `test/viz-sigma.test.ts`
