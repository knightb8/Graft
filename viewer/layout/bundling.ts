/**
 * Hierarchical Edge Bundling via Directory Trees and B-Splines (Holten 2006).
 *
 * Routes cross-cluster edges along the directory hierarchy tree. Blends tree control
 * points with straight lines using stiffness parameter beta (default 0.85), producing
 * clean, readable B-spline corridors that prevent chord tangle across galaxies.
 */

export interface BundlingOptions {
  beta?: number; // 0 = straight line, 1 = strict tree path, default 0.85
}

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Computes hierarchical B-spline control points for edges along the folder tree.
 */
export function computeHierarchicalBsplineBundles<
  T extends { id: string; x: number; y: number; [k: string]: any },
>(
  nodes: T[],
  edges: Array<{ source: string; target: string; [k: string]: any }>,
  options: BundlingOptions = {},
): Map<string, Point2D[]> {
  const beta = options.beta ?? 0.85;
  const bundles = new Map<string, Point2D[]>();

  const nodeMap = new Map<string, T>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  // 1. Build directory tree centroids
  // Split path into hierarchy components: "src/auth/login.ts" -> ["", "src", "src/auth"]
  const folderNodes = new Map<string, T[]>();

  for (const n of nodes) {
    const parts = n.id.split("/");
    let curr = "";
    // Root
    let list = folderNodes.get("");
    if (!list) {
      list = [];
      folderNodes.set("", list);
    }
    list.push(n);

    // Intermediate folders
    for (let i = 0; i < parts.length - 1; i++) {
      curr = curr ? `${curr}/${parts[i]}` : parts[i];
      let fList = folderNodes.get(curr);
      if (!fList) {
        fList = [];
        folderNodes.set(curr, fList);
      }
      fList.push(n);
    }
  }

  // Centroid for each folder
  const folderCentroid = new Map<string, Point2D>();
  for (const [folder, mNodes] of folderNodes.entries()) {
    let sx = 0;
    let sy = 0;
    for (const mn of mNodes) {
      sx += mn.x;
      sy += mn.y;
    }
    folderCentroid.set(folder, {
      x: sx / mNodes.length,
      y: sy / mNodes.length,
    });
  }

  function getAncestors(id: string): string[] {
    const parts = id.split("/");
    const ancestors = [""];
    let curr = "";
    for (let i = 0; i < parts.length - 1; i++) {
      curr = curr ? `${curr}/${parts[i]}` : parts[i];
      ancestors.push(curr);
    }
    return ancestors;
  }

  // 2. For each edge, compute tree path from source to target through LCA
  for (const edge of edges) {
    const srcNode = nodeMap.get(edge.source);
    const tgtNode = nodeMap.get(edge.target);
    const key = `${edge.source}->${edge.target}`;

    if (!srcNode || !tgtNode) {
      continue;
    }

    const pStart: Point2D = { x: srcNode.x, y: srcNode.y };
    const pEnd: Point2D = { x: tgtNode.x, y: tgtNode.y };

    const srcAnc = getAncestors(edge.source);
    const tgtAnc = getAncestors(edge.target);

    // Find Lowest Common Ancestor (LCA)
    let lca = "";
    let lcaIdxSrc = 0;
    let lcaIdxTgt = 0;

    for (let i = Math.min(srcAnc.length, tgtAnc.length) - 1; i >= 0; i--) {
      if (srcAnc[i] === tgtAnc[i]) {
        lca = srcAnc[i];
        lcaIdxSrc = i;
        lcaIdxTgt = i;
        break;
      }
    }

    // Path in tree: src -> src ancestors up to LCA -> tgt ancestors down from LCA -> tgt
    const treePoints: Point2D[] = [pStart];

    // Ascend from src
    for (let i = srcAnc.length - 1; i > lcaIdxSrc; i--) {
      const c = folderCentroid.get(srcAnc[i]);
      if (c) treePoints.push(c);
    }

    // LCA
    const lcaC = folderCentroid.get(lca);
    if (lcaC) treePoints.push(lcaC);

    // Descend to tgt
    for (let i = lcaIdxTgt + 1; i < tgtAnc.length; i++) {
      const c = folderCentroid.get(tgtAnc[i]);
      if (c) treePoints.push(c);
    }

    treePoints.push(pEnd);

    // If path is short (just src and tgt), synthesize two intermediate points along the straight line
    if (treePoints.length <= 2) {
      const mid1: Point2D = {
        x: pStart.x * 0.66 + pEnd.x * 0.34,
        y: pStart.y * 0.66 + pEnd.y * 0.34,
      };
      const mid2: Point2D = {
        x: pStart.x * 0.34 + pEnd.x * 0.66,
        y: pStart.y * 0.34 + pEnd.y * 0.66,
      };
      bundles.set(key, [pStart, mid1, mid2, pEnd]);
      continue;
    }

    // Holten straightening: B-spline control points P_i = beta * T_i + (1 - beta) * L_i
    const K = treePoints.length - 1;
    const finalPoints: Point2D[] = [];

    for (let i = 0; i <= K; i++) {
      if (i === 0) {
        finalPoints.push({ x: pStart.x, y: pStart.y });
        continue;
      }
      if (i === K) {
        finalPoints.push({ x: pEnd.x, y: pEnd.y });
        continue;
      }

      const t = i / K;
      const straightX = (1 - t) * pStart.x + t * pEnd.x;
      const straightY = (1 - t) * pStart.y + t * pEnd.y;
      const treeP = treePoints[i];

      const bx = beta * treeP.x + (1 - beta) * straightX;
      const by = beta * treeP.y + (1 - beta) * straightY;
      finalPoints.push({ x: bx, y: by });
    }

    bundles.set(key, finalPoints);
  }

  return bundles;
}
