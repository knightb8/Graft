# ADR 0021: Two-Level Stress-SGD Organic Layout with Preset Constraints

## Status
Accepted (2026-10-30) — Amends and supersedes the multi-pass ForceAtlas2 galaxy relaxation pipeline from ADR 0012, ADR 0014, ADR 0015, and ADR 0018.

## Context & Problem Statement
In previous iterations, Graft's visualizer attempted to achieve both global cluster separation and local organic readability by stacking five consecutive layout passes on top of one another:
1. Pure ForceAtlas2 continuous relaxation (ADR 0012).
2. Synthetic concentric galaxy seeding (`applyCosmosConcentricLayout`).
3. Vectorized pairwise node relaxation (`relaxAndSeparateGalaxiesVectorized`, ADR 0017).
4. Heuristic centroid expansion and intra-cluster compaction (`separateGalaxies`, ADR 0014).
5. Post-hoc edge curvature offsets (ADR 0015).

This stacked-pass architecture suffered from fundamental flaws:
- **Pass Cancellation & Visual Homogeneity**: Each subsequent heuristic pass partially or completely overwrote the physics of the prior pass. Bounding-circle expansion and artificial hub springs wiped out the subtle gravitational differences computed by the cosmos presets (`code`, `spec`, `doc`), causing all presets to look virtually indistinguishable.
- **Microscopic "Berry" Clusters and Void Canyons**: Bounding-circle galaxy separation forced nodes within each cluster into squashed, dense disks while pushing neighboring clusters across hundreds of pixels of empty space, destroying natural topological proximity between tightly coupled subsystems.
- **Convergence Instability**: ForceAtlas2's degree-based repulsion frequently resulted in coordinate oscillations, requiring artificial dampening hacks and heuristic timeouts.

## Decision Drivers
- **Principled Single-Pipeline Layout**: Replace five competing post-hoc passes with a coherent, multi-scale optimization pipeline grounded in graph-drawing literature.
- **Fast, Deterministic Convergence**: The layout engine must converge reliably within bounded iterations (target: $\le 30$ iterations) without coordinate explosions or erratic jitter.
- **Preserve True Inter-Cluster Coupling**: Distance between subsystem clusters must emerge from actual cross-module dependencies rather than synthetic bounding-box repulsion.
- **Measurably Distinct Presets**: Architectural presets (`code`, `spec`, `doc`, `directory`) must act as formal geometric constraints that produce visibly distinct spatial structures.
- **Smooth Interactivity**: Maintain real-time interactive node dragging and backward compatibility with legacy layouts.

## Decision Outcome & Architecture

### 1. Two-Level Hierarchical Layout Architecture (`viewer/layout/two-level.ts`)
Instead of applying global $N^2$ forces across all nodes simultaneously:
1. **Level 1 — Cluster Meta-Graph**:
   - Aggregate individual files and symbols into subsystem directory clusters.
   - Construct a high-level meta-graph where each node represents a cluster and each edge represents the summed inter-cluster coupling weight.
   - Solve the meta-graph layout to place cluster centers, ensuring cluster distances directly reflect architectural coupling.
2. **Level 2 — Intra-Cluster Interior Geometry**:
   - Position the internal nodes of each cluster relative to their cluster center, optimizing internal edges and local contract constraints.
   - Scale intra-cluster bounds to fit within the cluster disc while guaranteeing minimum node clearance ($\ge 28\text{px}$).

### 2. Stress Majorization via Stochastic Gradient Descent (`viewer/layout/stress-sgd.ts`)
Both levels of the layout pipeline are solved using Stress Majorization via Stochastic Gradient Descent (SGD), as formulated by Zheng, Pawar & Goodman (2018), building upon Gansner, Koren & North (2005) and Pivot MDS (Brandes & Pich, 2007).

#### Stress Objective Function
The stress energy $E(X)$ over node positions $X$ is defined as:
$$E(X) = \sum_{i < j} w_{ij} \left( \|X_i - X_j\| - d_{ij} \right)^2$$
where:
- $d_{ij}$ is the graph-theoretic shortest path distance between nodes $i$ and $j$, calculated by Dijkstra / Pivot MDS using the ideal lengths ($L_0$) declared in ADR 0020.
- $w_{ij} = d_{ij}^{-\alpha}$ (typically $\alpha = 2$) is the normalization weight prioritizing local distance accuracy over distant pairs.

#### SGD Optimization & Fast Convergence
At each iteration $t$, random node pairs $(i, j)$ are sampled, and coordinates are updated along the stress gradient with step size:
$$\eta(t) = \frac{\eta_{\max}}{1 + \lambda t}$$
- **Speed**: Full convergence is achieved in approximately 30 iterations, compared to hundreds of iterations required by ForceAtlas2.
- **Stability**: Because stress is bounded by all-pairs shortest paths, nodes never "explode" outward or collapse onto a single point.

### 3. Presets as Geometric Constraints
Rather than subtly tweaking scalar spring multipliers that get erased by downstream passes, presets are enforced as explicit geometric projection constraints during SGD iterations:

- **Code-Centric Preset**: Radial constraint placing production code modules at the center ($r \approx 0$), with specifications and tests occupying an intermediate orbit ($r_1$), and architectural documentation in the outer orbit ($r_2$).
- **Spec-Centric Preset**: Inverts the radial constraint, placing BDD `.feature` specifications at $r \approx 0$, with covered source files in orbiting shells.
- **Doc-Centric Preset**: Places ADRs at the center ($r \approx 0$), with governed specifications and realized modules in surrounding orbits.
- **Directory Preset**: Applies WebCola-style rectangular and convex group containment constraints, strictly bounding child nodes within parent directory envelopes.

### 4. Holten Hierarchical Edge Bundling
For inter-cluster edges, replace per-corridor heuristic offsets with Holten (2006) Hierarchical Edge Bundling:
- Inter-cluster edges route along the shared directory tree backbone as B-spline control curves with stiffness parameter $\beta \approx 0.85$.
- Chords merge smoothly along arterial trunk corridors, eliminating hairball clutter across voids while clearly showing traffic volume.

### 5. Interaction & Layout Engine Toggle
- **Interactive Dragging**: Real-time dragging of pinned nodes uses Verlet integration to smoothly adjust local springs without destabilizing the global stress equilibrium.
- **Optional Continuous Polish**: When fine continuous organic relaxation is desired, ForceAtlas2 in `linLogMode` with `outboundAttractionDistribution` can run as an optional post-convergence micro-pass.
- **Engine Toggle**: The visualizer introduces a `layoutEngine: "stress" | "legacy"` setting (defaulting to `"stress"`), preserving full access to legacy ForceAtlas2 behavior for regression testing.

## References
1. Zheng, J. X., Pawar, S., & Goodman, D. F. (2018). *Graph Drawing by Stochastic Gradient Descent*. IEEE Transactions on Visualization and Computer Graphics, 25(9), 2738-2748.
2. Gansner, E. R., Koren, Y., & North, S. (2005). *Graph Drawing by Stress Majorization*. International Symposium on Graph Drawing (pp. 239-250). Springer, Berlin, Heidelberg.
3. Brandes, U., & Pich, C. (2007). *Eigensolver Methods for Progressive Multidimensional Scaling of Large Data*. In Graph Drawing (pp. 42-53).
4. Dwyer, T., Marriott, K., & Stuckey, P. J. (WebCola). *Fast and Flexible Non-overlapping Constraint Solving for Graph Layout*.
5. Holten, D. (2006). *Hierarchical Edge Bundling: Visualizing Multi-Dimensional Dependencies in Hierarchical Data*. IEEE Transactions on Visualization and Computer Graphics, 12(5), 741-748.
6. Jacomy, M., Venturini, T., Heymann, S., & Bastian, M. (2014). *ForceAtlas2, a Continuous Graph Layout Algorithm for Handy Network Visualization Designed for the Gephi Software*. PLoS ONE, 9(6), e98679.

## Consequences

### Positive
- Fully eliminates the unpredictable interactions between 5 stacked layout passes.
- Presets produce distinct, reproducible, and mathematically verified spatial structures.
- Solves global cluster arrangement in $\le 30$ iterations with zero coordinate explosion risk.
- Hierarchical edge bundling produces clean, readable highways between subsystems.

### Negative / Trade-offs
- Initial shortest-path geodesic matrix computation requires an initial $O(V \cdot E \log V)$ or Pivot-MDS pass, which is cached across layout runs.
- Group containment constraints require WebCola-style clipping during directory-mode iterations.
