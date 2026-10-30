import test from "node:test";
import assert from "node:assert/strict";

test("Canonical registry separates layout physics, render styling, and blast transmission concerns", async () => {
  const { RELATIONS, normalizeRelation } = await import("../viewer/relations.js");

  const CANONICAL_RELATIONS = [
    "part_of",
    "contains",
    "implements",
    "extends",
    "defines",
    "covers",
    "verifies",
    "influences",
    "documents",
    "uses",
    "calls",
    "depends_on",
    "references",
    "transitive",
  ] as const;

  // Registry completeness
  for (const relKey of CANONICAL_RELATIONS) {
    const rel = RELATIONS[relKey];
    assert.ok(rel, `Relation ${relKey} must exist in RELATIONS registry`);
    assert.equal(rel.canonical, relKey);
    assert.ok(["structure", "dependency", "contract", "association"].includes(rel.family));
    assert.match(rel.color, /^#[0-9a-fA-F]{6}$/);

    // Layout concerns
    assert.ok(typeof rel.layout.strength === "number", `${relKey} must have layout.strength`);
    assert.ok(rel.layout.strength >= 0.0 && rel.layout.strength <= 1.0, `${relKey} strength in [0, 1]`);
    assert.ok(typeof rel.layout.idealLength === "number", `${relKey} must have layout.idealLength`);
    assert.ok(rel.layout.idealLength >= 0, `${relKey} idealLength must be non-negative`);

    // Render styling concerns
    assert.ok(typeof rel.render.prominence === "number", `${relKey} must have render.prominence`);
    assert.ok(rel.render.prominence >= 0.0 && rel.render.prominence <= 1.0, `${relKey} prominence in [0, 1]`);
    assert.ok(typeof rel.render.strokeWidth === "number", `${relKey} must have render.strokeWidth`);
    assert.ok(typeof rel.render.opacity === "number", `${relKey} must have render.opacity`);

    // Blast transmission concerns
    assert.ok(typeof rel.blast.forward === "function", `${relKey} must have blast.forward`);
    assert.ok(typeof rel.blast.reverse === "function", `${relKey} must have blast.reverse`);
  }

  // Transitive summary edges have zero layout strength
  assert.equal(RELATIONS.transitive.layout.strength, 0.0);

  // Alias normalization
  assert.equal(normalizeRelation("part of"), "part_of");
  assert.equal(normalizeRelation("PART OF"), "part_of");
  assert.equal(normalizeRelation("Part_Of"), "part_of");
  assert.equal(normalizeRelation("contains"), "contains");
  assert.equal(normalizeRelation("depends-on"), "depends_on");
  assert.equal(normalizeRelation("calls"), "calls");
  assert.equal(normalizeRelation("uses"), "uses");
  assert.equal(normalizeRelation("unknown_custom_verb"), "uses");

  // Blast directional causal multipliers
  const influencesFwd = RELATIONS.influences.blast.forward("SEED");
  assert.equal(influencesFwd.weight, 0.95);
  assert.equal(influencesFwd.nextPhase, "DOWN_REALIZE");

  const influencesRev = RELATIONS.influences.blast.reverse("SEED");
  assert.equal(influencesRev.weight, 0.92);
  assert.equal(influencesRev.nextPhase, "UP_PROVENANCE");

  const coversFwd = RELATIONS.covers.blast.forward("SEED");
  assert.equal(coversFwd.weight, 1.0);
  assert.equal(coversFwd.nextPhase, "DOWN_REALIZE");

  const definesFwd = RELATIONS.defines.blast.forward("SEED");
  assert.equal(definesFwd.weight, 0.95);
  assert.equal(definesFwd.nextPhase, "DOWN_REALIZE");

  const implementsFwd = RELATIONS.implements.blast.forward("SEED");
  assert.equal(implementsFwd.weight, 1.0);
  assert.equal(implementsFwd.nextPhase, "DEP_PREREQ");
});

test("Cosine degree normalization dynamically weakens hub dominance", async () => {
  const { normalizedEdgeWeight, normalizedInDegreeWeight } = await import("../viewer/relations.js");

  // Domain module u (deg=4) -> Utility hub v1 (deg=40)
  const hubWeight = normalizedEdgeWeight("uses", 4, 40);

  // Domain module u (deg=4) -> Specialized service v2 (deg=2)
  const serviceWeight = normalizedEdgeWeight("uses", 4, 2);

  // Cosine degree normalization: weight = strength / sqrt(degU * degV)
  // sqrt(4 * 40) = sqrt(160) ≈ 12.649
  // sqrt(4 * 2) = sqrt(8) ≈ 2.828
  // Ratio service / hub ≈ 12.649 / 2.828 ≈ 4.47 > 3
  assert.ok(
    serviceWeight > hubWeight * 3,
    `Specialized service (${serviceWeight}) should exert > 3x attraction of utility hub (${hubWeight})`,
  );

  // Guard zeros: non-zero finite value when degree is 0
  const zeroWeight = normalizedEdgeWeight("uses", 0, 0);
  assert.ok(Number.isFinite(zeroWeight));
  assert.ok(!Number.isNaN(zeroWeight));
  assert.ok(zeroWeight > 0);

  // In-degree normalization variant for target fan-in
  const inDegHub = normalizedInDegreeWeight("uses", 40);
  const inDegService = normalizedInDegreeWeight("uses", 2);
  assert.ok(
    inDegService > inDegHub * 3,
    `Target in-degree scaling: service (${inDegService}) > 3x hub (${inDegHub})`,
  );
});

test("Ideal target lengths order structural contracts closer than loose references", async () => {
  const { idealEdgeLength } = await import("../viewer/relations.js");

  const lenContains = idealEdgeLength("contains");
  const lenImplements = idealEdgeLength("implements");
  const lenDefines = idealEdgeLength("defines");
  const lenCovers = idealEdgeLength("covers");
  const lenVerifies = idealEdgeLength("verifies");
  const lenInfluences = idealEdgeLength("influences");
  const lenDocuments = idealEdgeLength("documents");
  const lenReferences = idealEdgeLength("references");

  // Structural hierarchy <= 40
  assert.ok(lenContains <= 40, `contains (${lenContains}) must be <= 40`);
  assert.ok(lenImplements <= 40, `implements (${lenImplements}) must be <= 40`);

  // Requirement verification between 50 and 70
  assert.ok(lenDefines >= 50 && lenDefines <= 70, `defines (${lenDefines}) in [50, 70]`);
  assert.ok(lenCovers >= 50 && lenCovers <= 70, `covers (${lenCovers}) in [50, 70]`);
  assert.ok(lenVerifies >= 50 && lenVerifies <= 70, `verifies (${lenVerifies}) in [50, 70]`);

  // Governance and documentation between 90 and 110
  assert.ok(lenInfluences >= 90 && lenInfluences <= 110, `influences (${lenInfluences}) in [90, 110]`);
  assert.ok(lenDocuments >= 90 && lenDocuments <= 110, `documents (${lenDocuments}) in [90, 110]`);

  // Loose references >= 150
  assert.ok(lenReferences >= 150, `references (${lenReferences}) must be >= 150`);

  // Exact relative ordering: implements < covers < verifies < influences < documents < references
  assert.ok(lenImplements < lenCovers, "implements < covers");
  assert.ok(lenCovers < lenVerifies, "covers < verifies");
  assert.ok(lenVerifies < lenInfluences, "verifies < influences");
  assert.ok(lenInfluences < lenDocuments, "influences < documents");
  assert.ok(lenDocuments < lenReferences, "documents < references");
});

test("Support sink dampening emerges topologically with regex heuristics as optional fallback", async () => {
  const { detectSupportNodes, supportScore } = await import("../viewer/data.js");

  const nodes = [
    { id: "src/utils/logger.ts", name: "logger.ts", type: "file", sources: ["src/utils/logger.ts"] },
    { id: "src/auth/authUtils.ts", name: "authUtils.ts", type: "file", sources: ["src/auth/authUtils.ts"] },
    { id: "src/core/model.ts", name: "model.ts", type: "file", sources: ["src/core/model.ts"] },
    { id: "src/api/handler.ts", name: "handler.ts", type: "file", sources: ["src/api/handler.ts"] },
    { id: "src/db/repo.ts", name: "repo.ts", type: "file", sources: ["src/db/repo.ts"] },
  ];

  // logger.ts is connected to 3 clusters (api, db, core) as incoming sink
  const edges = [
    { source: "src/api/handler.ts", target: "src/utils/logger.ts", relation: "uses" },
    { source: "src/db/repo.ts", target: "src/utils/logger.ts", relation: "uses" },
    { source: "src/core/model.ts", target: "src/utils/logger.ts", relation: "uses" },
    // authUtils has only 1 incoming edge and no cross-cluster sink topology
    { source: "src/auth/authUtils.ts", target: "src/core/model.ts", relation: "uses" },
  ];

  const clusterMap = new Map<string, string>([
    ["src/utils/logger.ts", "utils"],
    ["src/auth/authUtils.ts", "auth"],
    ["src/core/model.ts", "core"],
    ["src/api/handler.ts", "api"],
    ["src/db/repo.ts", "db"],
  ]);

  // With regex heuristics enabled (default), both lexical utility and topological sinks are found
  const withRegex = detectSupportNodes(nodes, edges, clusterMap, { useRegexHeuristics: true });
  assert.ok(withRegex.has("src/utils/logger.ts"), "logger is detected as support");

  // When regex heuristics are explicitly disabled, topological fan-in continues to detect logger
  const withoutRegex = detectSupportNodes(nodes, edges, clusterMap, { useRegexHeuristics: false });
  assert.ok(withoutRegex.has("src/utils/logger.ts"), "topological sink remains detected even without regex");
  assert.ok(!withoutRegex.has("src/auth/authUtils.ts"), "non-topological utility file is not flagged when regex is off");

  // Degree-based supportScore calculation
  const loggerScore = supportScore(10, 0, 3);
  const authScore = supportScore(1, 1, 1);
  assert.ok(loggerScore > authScore * 5, "logger support score is much higher than auth utility");
});

test("Layout strength adapts based on active graph perspective", async () => {
  const {
    RELATIONS,
    computeEdgeLayoutWeight,
    EDGE_CONTRACTION_WEIGHTS,
    SEMANTIC_RELATION_WEIGHTS,
    COSMOS_RELATION_WEIGHTS,
    SUPPORT_CLASS_EDGE_WEIGHT,
    RELATION_COLORS,
    relationColor,
    famOf,
  } = await import("../viewer/data.js");

  // 1. Perspective adaptation in registry
  const dirContainsStrength = RELATIONS.contains.layout.presets?.directory?.strength ?? 1.0;
  const dirPartOfStrength = RELATIONS.part_of.layout.presets?.directory?.strength ?? 1.0;
  assert.equal(dirContainsStrength, 1.0);
  assert.equal(dirPartOfStrength, 1.0);

  // In semantic architecture mode, contract edges dominate containment
  const semanticContains = RELATIONS.contains.layout.strength;
  const semanticImplements = RELATIONS.implements.layout.strength;
  const semanticCovers = RELATIONS.covers.layout.strength;
  assert.ok(semanticImplements > semanticContains, "implements dominates contains in semantic mode");
  assert.ok(semanticCovers > semanticContains, "covers dominates contains in semantic mode");

  // 2. Legacy backwards compatibility preservation
  assert.equal(EDGE_CONTRACTION_WEIGHTS.coupled.contract, 2.4);
  assert.equal(EDGE_CONTRACTION_WEIGHTS.directory.structure, 2.8);
  assert.deepEqual(SEMANTIC_RELATION_WEIGHTS.defines, { intra: 2.8, inter: 2.2 });
  assert.deepEqual(COSMOS_RELATION_WEIGHTS.code?.defines, { intra: 2.6, inter: 2.0 });
  assert.equal(SUPPORT_CLASS_EDGE_WEIGHT, 0.15);
  assert.equal(RELATION_COLORS["part of"], "#38bdf8");
  assert.equal(relationColor("defines"), "#c084fc");
  assert.equal(famOf("defines"), "contract");

  // Legacy computeEdgeLayoutWeight outputs preserved
  assert.equal(computeEdgeLayoutWeight("covers", false, false, "coupled"), 2.2);
  assert.equal(computeEdgeLayoutWeight("uses", false, false, "coupled"), 0.6);
  assert.equal(computeEdgeLayoutWeight("part_of", true, false, "directory"), 9.8);
});
