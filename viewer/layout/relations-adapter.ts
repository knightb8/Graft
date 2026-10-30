/**
 * Relation weights, ideal lengths, and degree normalization adapter.
 *
 * Wires layout physics directly to the canonical relation registry in viewer/relations.ts
 * as specified in ADR 0020 and cleanup_plan.md.
 */

import {
  idealEdgeLength,
  normalizedEdgeWeight,
  normalizeRelation,
  RELATIONS,
  type EdgeContractionMode,
} from "../relations.js";

export { idealEdgeLength, normalizedEdgeWeight, normalizeRelation, RELATIONS };

/**
 * Returns the ideal edge length for stress-SGD.
 */
export function getIdealLength(
  relation?: string,
  preset: EdgeContractionMode = "coupled",
  intraCluster = true,
): number {
  return idealEdgeLength(relation ?? "uses", preset, intraCluster);
}

/**
 * Returns the layout attraction strength for an edge.
 */
export function getStrength(
  relation?: string,
  preset: EdgeContractionMode = "coupled",
  intraCluster = true,
): number {
  const norm = normalizeRelation(relation);
  const def = RELATIONS[norm] ?? RELATIONS.uses;
  const base = def.layout.presets?.[preset]?.strength ?? def.layout.strength;
  return intraCluster ? base : base * 0.5;
}

/**
 * Computes cosine-normalized edge weight: strength / sqrt(degU * degV).
 */
export function normalizeEdgeWeight(
  baseWeight: number,
  degU: number,
  degV: number,
  preset: EdgeContractionMode = "coupled",
): number {
  const denom = Math.sqrt(Math.max(1, degU) * Math.max(1, degV));
  return Number((baseWeight / denom).toFixed(5));
}
