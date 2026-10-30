/**
 * Canonical Relation Registry and Degree-Normalized Layout Metrics for Graft.
 *
 * Consolidates layout physics, render styling, and directional blast propagation
 * across all semantic, structural, and dependency relation verbs.
 *
 * Governed by ADR 0020 (Unified Relation Registry & Layout Pipeline).
 */

export type Family = "structure" | "dependency" | "contract" | "association";

export type EdgeContractionMode = "coupled" | "code" | "spec" | "doc" | "directory";

export type CanonicalRelation =
  | "part_of"
  | "contains"
  | "implements"
  | "extends"
  | "defines"
  | "covers"
  | "verifies"
  | "influences"
  | "documents"
  | "uses"
  | "calls"
  | "depends_on"
  | "references"
  | "transitive";

export type BlastPhase =
  | "SEED"
  | "DOWN_REALIZE"
  | "UP_PROVENANCE"
  | "DEP_PREREQ"
  | "DEP_IMPACT"
  | "LEAF_SINK";

export interface BlastTransitionRule {
  weight: number;
  nextPhase: BlastPhase;
}

export interface DirectionalBlastRules {
  forward: (inPhase: BlastPhase, includeReflected?: boolean) => BlastTransitionRule;
  reverse: (inPhase: BlastPhase, includeReflected?: boolean) => BlastTransitionRule;
  weights?: {
    forward?: Partial<Record<BlastPhase, BlastTransitionRule>>;
    reverse?: Partial<Record<BlastPhase, BlastTransitionRule>>;
    reflectedForward?: Partial<Record<BlastPhase, BlastTransitionRule>>;
    reflectedReverse?: Partial<Record<BlastPhase, BlastTransitionRule>>;
  };
}

export interface RelationLayoutConfig {
  strength: number; // Base attraction in [0.0, 1.0]
  idealLength: number; // Target distance in layout units
  presets?: Partial<Record<EdgeContractionMode, { strength?: number; idealLength?: number }>>;
}

export interface RelationRenderConfig {
  prominence: number; // Relative visual prominence in [0.0, 1.0]
  strokeWidth: number;
  opacity: number;
}

export interface RelationDefinition {
  canonical: CanonicalRelation;
  family: Family;
  color: string;
  layout: RelationLayoutConfig;
  render: RelationRenderConfig;
  blast: DirectionalBlastRules;
  aliases?: string[];
  description?: string;
}

export interface EdgeContractionProfile {
  structure: number;
  dependency: number;
  contract: number;
  association: number;
  intraClusterMultiplier: number;
  interClusterMultiplier: number;
  transitiveScale: number;
}

const blastLeafSink = (): BlastTransitionRule => ({ weight: 0.0, nextPhase: "LEAF_SINK" });

/**
 * Single Canonical Relation Registry.
 *
 * Separates concerns:
 * - layout: strength and idealLength with perspective overrides
 * - render: visual prominence, stroke width, opacity, color
 * - blast: directional causal multipliers
 */
export const RELATIONS: Record<CanonicalRelation, RelationDefinition> = {
  part_of: {
    canonical: "part_of",
    family: "structure",
    color: "#38bdf8",
    layout: {
      strength: 0.4,
      idealLength: 30,
      presets: {
        directory: { strength: 1.0, idealLength: 25 },
        coupled: { strength: 0.4, idealLength: 30 },
        code: { strength: 0.5, idealLength: 30 },
        spec: { strength: 0.4, idealLength: 30 },
        doc: { strength: 0.4, idealLength: 30 },
      },
    },
    render: {
      prominence: 0.7,
      strokeWidth: 1.5,
      opacity: 0.8,
    },
    blast: {
      forward: (inPhase: BlastPhase) => ({
        weight: 0.88,
        nextPhase: inPhase === "SEED" ? "UP_PROVENANCE" : inPhase,
      }),
      reverse: (inPhase: BlastPhase) => ({
        weight: 0.88,
        nextPhase: inPhase === "SEED" ? "DOWN_REALIZE" : inPhase,
      }),
      weights: {
        forward: { SEED: { weight: 0.88, nextPhase: "UP_PROVENANCE" } },
        reverse: { SEED: { weight: 0.88, nextPhase: "DOWN_REALIZE" } },
      },
    },
    aliases: ["part of", "part-of", "lives_in", "member_of"],
    description: "Hierarchical containment: node belongs to parent container or subsystem",
  },

  contains: {
    canonical: "contains",
    family: "structure",
    color: "#38bdf8",
    layout: {
      strength: 0.4,
      idealLength: 30,
      presets: {
        directory: { strength: 1.0, idealLength: 25 },
        coupled: { strength: 0.4, idealLength: 30 },
        code: { strength: 0.5, idealLength: 30 },
        spec: { strength: 0.4, idealLength: 30 },
        doc: { strength: 0.4, idealLength: 30 },
      },
    },
    render: {
      prominence: 0.7,
      strokeWidth: 1.5,
      opacity: 0.8,
    },
    blast: {
      forward: (inPhase: BlastPhase) => ({
        weight: 0.88,
        nextPhase: inPhase === "SEED" ? "UP_PROVENANCE" : inPhase,
      }),
      reverse: (inPhase: BlastPhase) => ({
        weight: 0.88,
        nextPhase: inPhase === "SEED" ? "DOWN_REALIZE" : inPhase,
      }),
      weights: {
        forward: { SEED: { weight: 0.88, nextPhase: "UP_PROVENANCE" } },
        reverse: { SEED: { weight: 0.88, nextPhase: "DOWN_REALIZE" } },
      },
    },
    aliases: ["has_part", "encloses", "includes"],
    description: "Hierarchical enclosure: container holds child symbol or submodule",
  },

  implements: {
    canonical: "implements",
    family: "contract",
    color: "#8b5cf6",
    layout: {
      strength: 0.9,
      idealLength: 40,
      presets: {
        code: { strength: 0.95, idealLength: 40 },
        spec: { strength: 0.8, idealLength: 45 },
        doc: { strength: 0.6, idealLength: 50 },
        directory: { strength: 0.4, idealLength: 50 },
        coupled: { strength: 0.9, idealLength: 40 },
      },
    },
    render: {
      prominence: 0.95,
      strokeWidth: 2.0,
      opacity: 0.95,
    },
    blast: {
      forward: (inPhase: BlastPhase) => {
        if (inPhase === "SEED" || inPhase === "UP_PROVENANCE" || inPhase === "DEP_PREREQ") {
          return { weight: 1.0, nextPhase: "DEP_PREREQ" };
        }
        return blastLeafSink();
      },
      reverse: (inPhase: BlastPhase) => {
        if (inPhase === "SEED" || inPhase === "DOWN_REALIZE" || inPhase === "DEP_IMPACT") {
          return { weight: 1.0, nextPhase: "DEP_IMPACT" };
        }
        return blastLeafSink();
      },
      weights: {
        forward: {
          SEED: { weight: 1.0, nextPhase: "DEP_PREREQ" },
          UP_PROVENANCE: { weight: 1.0, nextPhase: "DEP_PREREQ" },
          DEP_PREREQ: { weight: 1.0, nextPhase: "DEP_PREREQ" },
        },
        reverse: {
          SEED: { weight: 1.0, nextPhase: "DEP_IMPACT" },
          DOWN_REALIZE: { weight: 1.0, nextPhase: "DEP_IMPACT" },
          DEP_IMPACT: { weight: 1.0, nextPhase: "DEP_IMPACT" },
        },
      },
    },
    aliases: ["realizes", "satisfies_interface"],
    description: "Type realization: concrete class or module implements an interface",
  },

  extends: {
    canonical: "extends",
    family: "contract",
    color: "#f43f5e",
    layout: {
      strength: 0.9,
      idealLength: 40,
      presets: {
        code: { strength: 0.95, idealLength: 40 },
        spec: { strength: 0.8, idealLength: 45 },
        doc: { strength: 0.6, idealLength: 50 },
        directory: { strength: 0.4, idealLength: 50 },
        coupled: { strength: 0.9, idealLength: 40 },
      },
    },
    render: {
      prominence: 0.95,
      strokeWidth: 2.0,
      opacity: 0.95,
    },
    blast: {
      forward: (inPhase: BlastPhase) => {
        if (inPhase === "SEED" || inPhase === "UP_PROVENANCE" || inPhase === "DEP_PREREQ") {
          return { weight: 1.0, nextPhase: "DEP_PREREQ" };
        }
        return blastLeafSink();
      },
      reverse: (inPhase: BlastPhase) => {
        if (inPhase === "SEED" || inPhase === "DOWN_REALIZE" || inPhase === "DEP_IMPACT") {
          return { weight: 1.0, nextPhase: "DEP_IMPACT" };
        }
        return blastLeafSink();
      },
      weights: {
        forward: {
          SEED: { weight: 1.0, nextPhase: "DEP_PREREQ" },
          UP_PROVENANCE: { weight: 1.0, nextPhase: "DEP_PREREQ" },
          DEP_PREREQ: { weight: 1.0, nextPhase: "DEP_PREREQ" },
        },
        reverse: {
          SEED: { weight: 1.0, nextPhase: "DEP_IMPACT" },
          DOWN_REALIZE: { weight: 1.0, nextPhase: "DEP_IMPACT" },
          DEP_IMPACT: { weight: 1.0, nextPhase: "DEP_IMPACT" },
        },
      },
    },
    aliases: ["inherits", "subclasses"],
    description: "Type inheritance: derived class specializes a base class",
  },

  defines: {
    canonical: "defines",
    family: "contract",
    color: "#c084fc",
    layout: {
      strength: 0.8,
      idealLength: 60,
      presets: {
        spec: { strength: 0.95, idealLength: 55 },
        code: { strength: 0.85, idealLength: 55 },
        doc: { strength: 0.85, idealLength: 60 },
        directory: { strength: 0.4, idealLength: 65 },
        coupled: { strength: 0.8, idealLength: 60 },
      },
    },
    render: {
      prominence: 0.85,
      strokeWidth: 1.8,
      opacity: 0.9,
    },
    blast: {
      forward: (inPhase: BlastPhase) => {
        if (inPhase === "SEED" || inPhase === "DOWN_REALIZE") {
          return { weight: 0.95, nextPhase: "DOWN_REALIZE" };
        }
        return blastLeafSink();
      },
      reverse: (inPhase: BlastPhase, includeReflected = false) => {
        if (inPhase === "SEED" || inPhase === "UP_PROVENANCE" || inPhase === "DEP_IMPACT") {
          return { weight: 0.95, nextPhase: "UP_PROVENANCE" };
        }
        if (includeReflected && inPhase === "DOWN_REALIZE") {
          return { weight: 0.82, nextPhase: "UP_PROVENANCE" };
        }
        return blastLeafSink();
      },
      weights: {
        forward: {
          SEED: { weight: 0.95, nextPhase: "DOWN_REALIZE" },
          DOWN_REALIZE: { weight: 0.95, nextPhase: "DOWN_REALIZE" },
        },
        reverse: {
          SEED: { weight: 0.95, nextPhase: "UP_PROVENANCE" },
          UP_PROVENANCE: { weight: 0.95, nextPhase: "UP_PROVENANCE" },
          DEP_IMPACT: { weight: 0.95, nextPhase: "UP_PROVENANCE" },
        },
      },
    },
    aliases: ["specifies", "declares_contract"],
    description: "Specification contract: feature file defines behavior contract for code",
  },

  covers: {
    canonical: "covers",
    family: "contract",
    color: "#10b981",
    layout: {
      strength: 0.8,
      idealLength: 60,
      presets: {
        spec: { strength: 0.95, idealLength: 55 },
        code: { strength: 0.5, idealLength: 70 },
        doc: { strength: 0.7, idealLength: 65 },
        directory: { strength: 0.3, idealLength: 70 },
        coupled: { strength: 0.8, idealLength: 60 },
      },
    },
    render: {
      prominence: 0.85,
      strokeWidth: 1.8,
      opacity: 0.9,
    },
    blast: {
      forward: (inPhase: BlastPhase) => {
        if (inPhase === "SEED" || inPhase === "DOWN_REALIZE") {
          return { weight: 1.0, nextPhase: "DOWN_REALIZE" };
        }
        return blastLeafSink();
      },
      reverse: (inPhase: BlastPhase, includeReflected = false) => {
        if (inPhase === "SEED" || inPhase === "UP_PROVENANCE" || inPhase === "DEP_IMPACT") {
          return { weight: 0.95, nextPhase: "UP_PROVENANCE" };
        }
        if (includeReflected && inPhase === "DOWN_REALIZE") {
          return { weight: 0.82, nextPhase: "UP_PROVENANCE" };
        }
        return blastLeafSink();
      },
      weights: {
        forward: {
          SEED: { weight: 1.0, nextPhase: "DOWN_REALIZE" },
          DOWN_REALIZE: { weight: 1.0, nextPhase: "DOWN_REALIZE" },
        },
        reverse: {
          SEED: { weight: 0.95, nextPhase: "UP_PROVENANCE" },
          UP_PROVENANCE: { weight: 0.95, nextPhase: "UP_PROVENANCE" },
          DEP_IMPACT: { weight: 0.95, nextPhase: "UP_PROVENANCE" },
        },
      },
    },
    aliases: ["tests_scenario", "binds"],
    description: "Specification coverage: feature or scenario covers target code",
  },

  verifies: {
    canonical: "verifies",
    family: "contract",
    color: "#10b981",
    layout: {
      strength: 0.6,
      idealLength: 70,
      presets: {
        spec: { strength: 0.9, idealLength: 60 },
        code: { strength: 0.5, idealLength: 75 },
        doc: { strength: 0.6, idealLength: 70 },
        directory: { strength: 0.3, idealLength: 75 },
        coupled: { strength: 0.6, idealLength: 70 },
      },
    },
    render: {
      prominence: 0.8,
      strokeWidth: 1.6,
      opacity: 0.85,
    },
    blast: {
      forward: (inPhase: BlastPhase) => {
        if (inPhase === "SEED" || inPhase === "UP_PROVENANCE") {
          return { weight: 1.0, nextPhase: "UP_PROVENANCE" };
        }
        return blastLeafSink();
      },
      reverse: (inPhase: BlastPhase) => {
        if (inPhase === "SEED" || inPhase === "DOWN_REALIZE" || inPhase === "DEP_IMPACT") {
          return { weight: 1.0, nextPhase: "LEAF_SINK" };
        }
        return blastLeafSink();
      },
      weights: {
        forward: {
          SEED: { weight: 1.0, nextPhase: "UP_PROVENANCE" },
          UP_PROVENANCE: { weight: 1.0, nextPhase: "UP_PROVENANCE" },
        },
        reverse: {
          SEED: { weight: 1.0, nextPhase: "LEAF_SINK" },
          DOWN_REALIZE: { weight: 1.0, nextPhase: "LEAF_SINK" },
          DEP_IMPACT: { weight: 1.0, nextPhase: "LEAF_SINK" },
        },
      },
    },
    aliases: ["asserts", "validates", "tests"],
    description: "Verification: automated test suite verifies implementation unit",
  },

  influences: {
    canonical: "influences",
    family: "contract",
    color: "#ec4899",
    layout: {
      strength: 0.5,
      idealLength: 90,
      presets: {
        doc: { strength: 0.9, idealLength: 70 },
        spec: { strength: 0.75, idealLength: 80 },
        code: { strength: 0.35, idealLength: 100 },
        directory: { strength: 0.25, idealLength: 100 },
        coupled: { strength: 0.5, idealLength: 90 },
      },
    },
    render: {
      prominence: 0.75,
      strokeWidth: 1.5,
      opacity: 0.8,
    },
    blast: {
      forward: (inPhase: BlastPhase, includeReflected = false) => {
        if (inPhase === "SEED" || inPhase === "DOWN_REALIZE") {
          return { weight: 0.95, nextPhase: "DOWN_REALIZE" };
        }
        if (includeReflected && inPhase === "UP_PROVENANCE") {
          return { weight: 0.75, nextPhase: "DOWN_REALIZE" };
        }
        return blastLeafSink();
      },
      reverse: (inPhase: BlastPhase) => {
        if (inPhase === "SEED" || inPhase === "UP_PROVENANCE") {
          return { weight: 0.92, nextPhase: "UP_PROVENANCE" };
        }
        return blastLeafSink();
      },
      weights: {
        forward: {
          SEED: { weight: 0.95, nextPhase: "DOWN_REALIZE" },
          DOWN_REALIZE: { weight: 0.95, nextPhase: "DOWN_REALIZE" },
        },
        reverse: {
          SEED: { weight: 0.92, nextPhase: "UP_PROVENANCE" },
          UP_PROVENANCE: { weight: 0.92, nextPhase: "UP_PROVENANCE" },
        },
      },
    },
    aliases: ["governs", "guides", "adr_influences"],
    description: "Architectural governance: Architectural Decision Record governs specifications",
  },

  documents: {
    canonical: "documents",
    family: "association",
    color: "#a855f7",
    layout: {
      strength: 0.3,
      idealLength: 110,
      presets: {
        doc: { strength: 0.9, idealLength: 70 },
        spec: { strength: 0.7, idealLength: 90 },
        code: { strength: 0.3, idealLength: 120 },
        directory: { strength: 0.2, idealLength: 120 },
        coupled: { strength: 0.3, idealLength: 110 },
      },
    },
    render: {
      prominence: 0.6,
      strokeWidth: 1.2,
      opacity: 0.7,
    },
    blast: {
      forward: (inPhase: BlastPhase) => {
        if (inPhase === "SEED") {
          return { weight: 0.9, nextPhase: "UP_PROVENANCE" };
        }
        return blastLeafSink();
      },
      reverse: (inPhase: BlastPhase) => {
        if (inPhase === "SEED" || inPhase === "DOWN_REALIZE" || inPhase === "DEP_IMPACT") {
          return { weight: 0.85, nextPhase: "LEAF_SINK" };
        }
        return blastLeafSink();
      },
      weights: {
        forward: { SEED: { weight: 0.9, nextPhase: "UP_PROVENANCE" } },
        reverse: {
          SEED: { weight: 0.85, nextPhase: "LEAF_SINK" },
          DOWN_REALIZE: { weight: 0.85, nextPhase: "LEAF_SINK" },
          DEP_IMPACT: { weight: 0.85, nextPhase: "LEAF_SINK" },
        },
      },
    },
    aliases: ["explains", "describes"],
    description: "Documentation: developer guides or notes explaining a subsystem",
  },

  uses: {
    canonical: "uses",
    family: "dependency",
    color: "#fbbf24",
    layout: {
      strength: 0.5,
      idealLength: 50,
      presets: {
        code: { strength: 0.85, idealLength: 45 },
        spec: { strength: 0.35, idealLength: 65 },
        doc: { strength: 0.3, idealLength: 70 },
        directory: { strength: 0.35, idealLength: 65 },
        coupled: { strength: 0.5, idealLength: 50 },
      },
    },
    render: {
      prominence: 0.65,
      strokeWidth: 1.3,
      opacity: 0.75,
    },
    blast: {
      forward: (inPhase: BlastPhase) => {
        if (inPhase === "SEED" || inPhase === "DOWN_REALIZE" || inPhase === "DEP_PREREQ") {
          return { weight: 0.78, nextPhase: "DEP_PREREQ" };
        }
        return blastLeafSink();
      },
      reverse: (inPhase: BlastPhase) => {
        if (inPhase === "SEED" || inPhase === "DEP_IMPACT") {
          return { weight: 0.88, nextPhase: "DEP_IMPACT" };
        }
        return blastLeafSink();
      },
      weights: {
        forward: {
          SEED: { weight: 0.78, nextPhase: "DEP_PREREQ" },
          DOWN_REALIZE: { weight: 0.78, nextPhase: "DEP_PREREQ" },
          DEP_PREREQ: { weight: 0.78, nextPhase: "DEP_PREREQ" },
        },
        reverse: {
          SEED: { weight: 0.88, nextPhase: "DEP_IMPACT" },
          DEP_IMPACT: { weight: 0.88, nextPhase: "DEP_IMPACT" },
        },
      },
    },
    aliases: ["imports", "consumes", "produces", "configures"],
    description: "Direct runtime invocation or symbol usage",
  },

  calls: {
    canonical: "calls",
    family: "dependency",
    color: "#fbbf24",
    layout: {
      strength: 0.5,
      idealLength: 50,
      presets: {
        code: { strength: 0.85, idealLength: 45 },
        spec: { strength: 0.35, idealLength: 65 },
        doc: { strength: 0.3, idealLength: 70 },
        directory: { strength: 0.35, idealLength: 65 },
        coupled: { strength: 0.5, idealLength: 50 },
      },
    },
    render: {
      prominence: 0.65,
      strokeWidth: 1.3,
      opacity: 0.75,
    },
    blast: {
      forward: (inPhase: BlastPhase) => {
        if (inPhase === "SEED" || inPhase === "DOWN_REALIZE" || inPhase === "DEP_PREREQ") {
          return { weight: 0.78, nextPhase: "DEP_PREREQ" };
        }
        return blastLeafSink();
      },
      reverse: (inPhase: BlastPhase) => {
        if (inPhase === "SEED" || inPhase === "DEP_IMPACT") {
          return { weight: 0.88, nextPhase: "DEP_IMPACT" };
        }
        return blastLeafSink();
      },
      weights: {
        forward: {
          SEED: { weight: 0.78, nextPhase: "DEP_PREREQ" },
          DOWN_REALIZE: { weight: 0.78, nextPhase: "DEP_PREREQ" },
          DEP_PREREQ: { weight: 0.78, nextPhase: "DEP_PREREQ" },
        },
        reverse: {
          SEED: { weight: 0.88, nextPhase: "DEP_IMPACT" },
          DEP_IMPACT: { weight: 0.88, nextPhase: "DEP_IMPACT" },
        },
      },
    },
    aliases: ["invokes"],
    description: "Function or method call execution edge",
  },

  depends_on: {
    canonical: "depends_on",
    family: "dependency",
    color: "#fbbf24",
    layout: {
      strength: 0.5,
      idealLength: 50,
      presets: {
        code: { strength: 0.85, idealLength: 45 },
        spec: { strength: 0.35, idealLength: 65 },
        doc: { strength: 0.3, idealLength: 70 },
        directory: { strength: 0.35, idealLength: 65 },
        coupled: { strength: 0.5, idealLength: 50 },
      },
    },
    render: {
      prominence: 0.65,
      strokeWidth: 1.3,
      opacity: 0.75,
    },
    blast: {
      forward: (inPhase: BlastPhase) => {
        if (inPhase === "SEED" || inPhase === "DOWN_REALIZE" || inPhase === "DEP_PREREQ") {
          return { weight: 0.78, nextPhase: "DEP_PREREQ" };
        }
        return blastLeafSink();
      },
      reverse: (inPhase: BlastPhase) => {
        if (inPhase === "SEED" || inPhase === "DEP_IMPACT") {
          return { weight: 0.88, nextPhase: "DEP_IMPACT" };
        }
        return blastLeafSink();
      },
      weights: {
        forward: {
          SEED: { weight: 0.78, nextPhase: "DEP_PREREQ" },
          DOWN_REALIZE: { weight: 0.78, nextPhase: "DEP_PREREQ" },
          DEP_PREREQ: { weight: 0.78, nextPhase: "DEP_PREREQ" },
        },
        reverse: {
          SEED: { weight: 0.88, nextPhase: "DEP_IMPACT" },
          DEP_IMPACT: { weight: 0.88, nextPhase: "DEP_IMPACT" },
        },
      },
    },
    aliases: ["depends on", "depends-on", "requires"],
    description: "Module or package level structural dependency",
  },

  references: {
    canonical: "references",
    family: "association",
    color: "#64748b",
    layout: {
      strength: 0.1,
      idealLength: 150,
      presets: {
        code: { strength: 0.1, idealLength: 150 },
        spec: { strength: 0.1, idealLength: 150 },
        doc: { strength: 0.45, idealLength: 120 },
        directory: { strength: 0.05, idealLength: 160 },
        coupled: { strength: 0.1, idealLength: 150 },
      },
    },
    render: {
      prominence: 0.3,
      strokeWidth: 0.8,
      opacity: 0.45,
    },
    blast: {
      forward: (inPhase: BlastPhase) => {
        if (inPhase === "SEED") {
          return { weight: 0.55, nextPhase: "LEAF_SINK" };
        }
        return blastLeafSink();
      },
      reverse: () => blastLeafSink(),
      weights: {
        forward: { SEED: { weight: 0.55, nextPhase: "LEAF_SINK" } },
      },
    },
    aliases: ["mentions", "ref", "links_to"],
    description: "Loose lexical mention without direct call coupling",
  },

  transitive: {
    canonical: "transitive",
    family: "contract",
    color: "#f97316",
    layout: {
      strength: 0.0,
      idealLength: 150,
      presets: {
        directory: { strength: 0.0, idealLength: 150 },
        code: { strength: 0.0, idealLength: 150 },
        spec: { strength: 0.0, idealLength: 150 },
        doc: { strength: 0.0, idealLength: 150 },
        coupled: { strength: 0.0, idealLength: 150 },
      },
    },
    render: {
      prominence: 0.25,
      strokeWidth: 0.8,
      opacity: 0.35,
    },
    blast: {
      forward: () => blastLeafSink(),
      reverse: () => blastLeafSink(),
    },
    aliases: ["transitive_uses", "indirect"],
    description: "Indirect transitive shortcut across filtered nodes; zero layout attraction",
  },
};

/** Normalizes relation strings, synonyms, and aliases into canonical relation keys. */
export function normalizeRelation(rel: string | undefined | null): CanonicalRelation {
  if (!rel) return "uses";
  const raw = rel.trim().toLowerCase();
  const cleaned = raw.replace(/[\s-]+/g, "_");

  if (cleaned in RELATIONS) {
    return cleaned as CanonicalRelation;
  }

  // Lookup in alias dictionary
  for (const [key, def] of Object.entries(RELATIONS)) {
    if (def.aliases && (def.aliases.includes(raw) || def.aliases.includes(cleaned))) {
      return key as CanonicalRelation;
    }
  }

  // Default fallback for unrecognized verbs
  return "uses";
}

/**
 * Cosine degree normalization for edge layout attraction:
 *   weight = strength / sqrt(degU * degV)
 *
 * Automatically weakens high-degree hub dominance without ad-hoc clipping.
 */
export function normalizedEdgeWeight(
  rel: string,
  degU: number,
  degV: number,
  preset: EdgeContractionMode = "coupled",
): number {
  const norm = normalizeRelation(rel);
  const def = RELATIONS[norm] ?? RELATIONS.uses;
  const strength = def.layout.presets?.[preset]?.strength ?? def.layout.strength;
  if (strength <= 0) return 0;

  const dU = Math.max(1, degU);
  const dV = Math.max(1, degV);
  const weight = strength / Math.sqrt(dU * dV);
  return Number(weight.toFixed(5));
}

/**
 * In-degree normalization variant for target fan-in (e.g. uses, calls, depends_on sinks):
 *   weight = strength / sqrt(inDeg(target))
 */
export function normalizedInDegreeWeight(
  rel: string,
  inDegTarget: number,
  preset: EdgeContractionMode = "coupled",
): number {
  const norm = normalizeRelation(rel);
  const def = RELATIONS[norm] ?? RELATIONS.uses;
  const strength = def.layout.presets?.[preset]?.strength ?? def.layout.strength;
  if (strength <= 0) return 0;

  const inDeg = Math.max(1, inDegTarget);
  const weight = strength / Math.sqrt(inDeg);
  return Number(weight.toFixed(5));
}

/**
 * Resolves ideal layout target distance for an edge type.
 *
 * Relative ordering invariant:
 *   implements <= 40 < covers <= 70 < verifies <= 70 < influences <= 110 < documents <= 110 < references >= 150
 */
export function idealEdgeLength(
  rel: string,
  preset?: EdgeContractionMode,
  intra = false,
): number {
  const norm = normalizeRelation(rel);
  const def = RELATIONS[norm] ?? RELATIONS.uses;
  let len = preset && def.layout.presets?.[preset]?.idealLength !== undefined
    ? def.layout.presets[preset]!.idealLength!
    : def.layout.idealLength;

  if (intra) {
    len = Math.round(len * 0.85);
  }
  return len;
}

/**
 * Computes topological support/utility sink score from in-degree fan-in and cross-cluster spread.
 */
export function supportScore(
  inDeg: number,
  outDeg = 0,
  sourceClusters = 1,
): number {
  if (inDeg <= 0) return 0;
  const ratio = inDeg / (Math.max(0, outDeg) + 1);
  const clusterFactor = Math.log2(Math.max(1, sourceClusters) + 1);
  return Number((ratio * clusterFactor).toFixed(4));
}

/** Resolves family from canonical relation registry. */
export function famOf(rel: string): Family {
  const norm = normalizeRelation(rel);
  return RELATIONS[norm]?.family ?? "association";
}

/** Returns chip grouping label for toolbar badges. */
export function chipKey(rel: string): string {
  if (famOf(rel) === "structure") return "part of";
  if (rel === "calls" || rel === "uses" || rel === "depends_on" || rel === "imports") return "uses";
  return rel.replace(/_/g, " ");
}

/** Color palette map derived from registry and legacy verbs. */
export const RELATION_COLORS: Record<string, string> = {
  "part of": RELATIONS.part_of.color,
  part_of: RELATIONS.part_of.color,
  contains: RELATIONS.contains.color,
  uses: RELATIONS.uses.color,
  calls: RELATIONS.calls.color,
  depends_on: RELATIONS.depends_on.color,
  imports: "#f59e0b",
  produces: "#f97316",
  configures: "#fb923c",
  validates: "#34d399",
  covers: RELATIONS.covers.color,
  verifies: RELATIONS.verifies.color,
  binds: "#059669",
  defines: RELATIONS.defines.color,
  documents: RELATIONS.documents.color,
  influences: RELATIONS.influences.color,
  extends: RELATIONS.extends.color,
  implements: RELATIONS.implements.color,
  transitive: RELATIONS.transitive.color,
  references: RELATIONS.references.color,
};

/** Returns display color for a relation verb. */
export function relationColor(rel: string): string {
  const key = chipKey(rel);
  return RELATION_COLORS[key] ?? RELATION_COLORS[rel] ?? RELATIONS[normalizeRelation(rel)]?.color ?? "#71828a";
}

export const SUPPORT_CLASS_EDGE_WEIGHT = 0.15;

/** Legacy semantic relation attraction weights table. */
export const SEMANTIC_RELATION_WEIGHTS: Record<string, { intra: number; inter: number }> = {
  implements: { intra: 3.0, inter: 2.6 },
  extends: { intra: 3.0, inter: 2.6 },
  defines: { intra: 2.8, inter: 2.2 },
  covers: { intra: 2.5, inter: 2.2 },
  verifies: { intra: 2.5, inter: 2.2 },
  documents: { intra: 2.0, inter: 1.8 },
  influences: { intra: 2.0, inter: 1.8 },
  part_of: { intra: 1.4, inter: 0.5 },
  contains: { intra: 1.4, inter: 0.5 },
  uses: { intra: 1.8, inter: 0.6 },
  calls: { intra: 1.8, inter: 0.6 },
  depends_on: { intra: 1.8, inter: 0.6 },
  references: { intra: 0.45, inter: 0.25 },
};

/** Legacy Cosmos relation weights table with per-mode overrides. */
export const COSMOS_RELATION_WEIGHTS: Partial<Record<EdgeContractionMode, Record<string, { intra: number; inter: number }>>> = {
  code: {
    implements: { intra: 3.4, inter: 2.8 },
    extends: { intra: 3.4, inter: 2.8 },
    uses: { intra: 2.6, inter: 1.4 },
    calls: { intra: 2.6, inter: 1.4 },
    depends_on: { intra: 2.6, inter: 1.4 },
    defines: { intra: 2.6, inter: 2.0 },
    part_of: { intra: 1.8, inter: 0.7 },
    contains: { intra: 1.8, inter: 0.7 },
    covers: { intra: 0.9, inter: 0.75 },
    verifies: { intra: 0.9, inter: 0.75 },
    documents: { intra: 0.7, inter: 0.55 },
    influences: { intra: 0.7, inter: 0.55 },
    references: { intra: 0.3, inter: 0.15 },
  },
  spec: {
    covers: { intra: 3.6, inter: 3.2 },
    verifies: { intra: 3.6, inter: 3.2 },
    defines: { intra: 3.2, inter: 2.8 },
    implements: { intra: 2.4, inter: 2.0 },
    extends: { intra: 2.4, inter: 2.0 },
    influences: { intra: 2.4, inter: 2.1 },
    documents: { intra: 2.4, inter: 2.1 },
    part_of: { intra: 1.1, inter: 0.4 },
    contains: { intra: 1.1, inter: 0.4 },
    uses: { intra: 0.9, inter: 0.35 },
    calls: { intra: 0.9, inter: 0.35 },
    depends_on: { intra: 0.9, inter: 0.35 },
    references: { intra: 0.45, inter: 0.3 },
  },
  doc: {
    documents: { intra: 3.6, inter: 3.3 },
    influences: { intra: 3.6, inter: 3.3 },
    defines: { intra: 3.0, inter: 2.6 },
    references: { intra: 1.8, inter: 1.4 },
    covers: { intra: 2.0, inter: 1.7 },
    verifies: { intra: 2.0, inter: 1.7 },
    implements: { intra: 1.5, inter: 1.1 },
    extends: { intra: 1.5, inter: 1.1 },
    part_of: { intra: 1.0, inter: 0.4 },
    contains: { intra: 1.0, inter: 0.4 },
    uses: { intra: 0.75, inter: 0.25 },
    calls: { intra: 0.75, inter: 0.25 },
    depends_on: { intra: 0.75, inter: 0.25 },
  },
};

/** Legacy edge contraction profile presets. */
export const EDGE_CONTRACTION_WEIGHTS: Record<EdgeContractionMode, EdgeContractionProfile> = {
  coupled: {
    structure: 0.9,
    dependency: 1.6,
    contract: 2.4,
    association: 2.1,
    intraClusterMultiplier: 1.8,
    interClusterMultiplier: 0.85,
    transitiveScale: 0.45,
  },
  code: {
    structure: 1.8,
    dependency: 3.0,
    contract: 0.85,
    association: 0.65,
    intraClusterMultiplier: 1.8,
    interClusterMultiplier: 0.85,
    transitiveScale: 0.45,
  },
  spec: {
    structure: 1.1,
    dependency: 0.8,
    contract: 3.5,
    association: 2.2,
    intraClusterMultiplier: 1.8,
    interClusterMultiplier: 0.85,
    transitiveScale: 0.45,
  },
  doc: {
    structure: 1.0,
    dependency: 0.65,
    contract: 1.85,
    association: 3.5,
    intraClusterMultiplier: 1.8,
    interClusterMultiplier: 0.85,
    transitiveScale: 0.45,
  },
  directory: {
    structure: 2.8,
    dependency: 1.0,
    contract: 1.1,
    association: 1.0,
    intraClusterMultiplier: 3.5,
    interClusterMultiplier: 0.25,
    transitiveScale: 0.35,
  },
};
