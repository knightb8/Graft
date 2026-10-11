/**
 * Transitive Edge Generation for Filtered Graphs.
 *
 * When intermediate nodes are hidden by scope or directory filtering,
 * this computes shortcut edges connecting visible nodes across hidden paths
 * (e.g. ADR -> Feature -> Code becomes ADR -> Code).
 */
export interface TransitiveEdge {
  source: string;
  target: string;
  relation: string;
  description?: string;
  transitive: true;
  via: string[];
  confidence?: "extracted" | "inferred";
}

export interface EdgeLike {
  source: string;
  target: string;
  relation: string;
  description?: string;
  confidence?: "extracted" | "inferred";
}

/**
 * Computes transitive shortcut edges connecting visible nodes across hidden intermediaries.
 *
 * @param allEdges All edges in the complete active graph
 * @param isVisible Predicate checking if a node ID is currently visible/admitted
 * @param maxHops Maximum number of intermediate hidden hops to traverse (default 3)
 */
export function generateTransitiveEdges(
  allEdges: EdgeLike[],
  isVisible: (id: string) => boolean,
  maxHops = 3,
): TransitiveEdge[] {
  // Build adjacency list for fast traversal: source -> array of outbound edges
  const adj = new Map<string, EdgeLike[]>();
  for (const e of allEdges) {
    let list = adj.get(e.source);
    if (!list) {
      list = [];
      adj.set(e.source, list);
    }
    list.push(e);
  }

  // Pre-index direct visible-to-visible connections to avoid redundant duplicates
  const directVisible = new Set<string>();
  for (const e of allEdges) {
    if (isVisible(e.source) && isVisible(e.target)) {
      directVisible.add(`${e.source}->${e.target}`);
    }
  }

  const result: TransitiveEdge[] = [];
  const emitted = new Set<string>();

  // Find visible sources that have outbound edges leading to hidden nodes
  for (const [sourceId, edges] of adj.entries()) {
    if (!isVisible(sourceId)) continue;

    for (const firstEdge of edges) {
      // If target is directly visible, direct edge already exists
      if (isVisible(firstEdge.target)) continue;

      // Target is hidden: explore paths starting at firstEdge.target
      const queue: Array<{
        current: string;
        path: string[];
        relations: string[];
      }> = [
        {
          current: firstEdge.target,
          path: [firstEdge.target],
          relations: [firstEdge.relation],
        },
      ];

      const visitedInWalk = new Set<string>([sourceId, firstEdge.target]);

      while (queue.length > 0) {
        const item = queue.shift()!;
        if (item.path.length > maxHops) continue;

        const nextEdges = adj.get(item.current) ?? [];
        for (const nextEdge of nextEdges) {
          const targetId = nextEdge.target;

          if (targetId === sourceId) continue; // Cycle back to source

          if (isVisible(targetId)) {
            // Reached a visible target!
            const key = `${sourceId}->${targetId}`;
            if (!directVisible.has(key) && !emitted.has(key)) {
              emitted.add(key);
              const chainRels = [...item.relations, nextEdge.relation];
              const relSummary = chainRels.join(" → ");
              result.push({
                source: sourceId,
                target: targetId,
                relation: "transitive",
                description: `via ${item.path.join(", ")} (${relSummary})`,
                confidence: "inferred",
                transitive: true,
                via: item.path,
              });
            }
          } else {
            // Target is also hidden: continue traversal if not visited and within depth
            if (!visitedInWalk.has(targetId) && item.path.length < maxHops) {
              visitedInWalk.add(targetId);
              queue.push({
                current: targetId,
                path: [...item.path, targetId],
                relations: [...item.relations, nextEdge.relation],
              });
            }
          }
        }
      }
    }
  }

  return result;
}
