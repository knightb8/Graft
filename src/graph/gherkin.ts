import { AstBuilder, GherkinClassicTokenMatcher, Parser } from "@cucumber/gherkin";
import { IdGenerator } from "@cucumber/messages";
import * as fs from "node:fs";
import { type NodeV1, type EdgeV1 } from "./types.js";
import type { RawEdge } from "./extract.js";

/** Extract nodes and edges from a Gherkin .feature file. */
export function extractGherkin(
  path: string,
  content: string,
): { nodes: NodeV1[]; rawEdges: RawEdge[] } {
  const nodes: NodeV1[] = [];
  const edges: RawEdge[] = [];
  const lines = content.split("\n");

  const uuidFn = IdGenerator.uuid();
  const builder = new AstBuilder(uuidFn);
  const matcher = new GherkinClassicTokenMatcher();
  const parser = new Parser(builder, matcher);

  let gherkinDocument;
  try {
    gherkinDocument = parser.parse(content);
  } catch (e) {
    // If it fails to parse, return what we have (nothing)
    return { nodes, rawEdges: edges };
  }

  if (!gherkinDocument.feature) return { nodes, rawEdges: edges };
  const feature = gherkinDocument.feature;

  // Top level feature node
  const featureId = `${path}#${feature.name}`;
  const endLine = feature.location.line + 1; // roughly, or just find last line
  nodes.push({
    id: featureId,
    name: feature.name,
    kind: "module",
    path: path,
    span: `L${feature.location.line}-L${feature.location.line}`,
    signature: `Feature: ${feature.name}`,
    exported: true,
    origin: "ast",
    body_hash: "", // Will be set by caller or hashing logic
    summary_state: "pending",
    summary: null,
    crux: null,
  });

  // Helper: extract markdown links [text](target)
  const extractMarkdownLinks = (sourceId: string, text: string) => {
    if (!text) return;
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    while ((match = linkRegex.exec(text)) !== null) {
      const target = match[2].trim();
      if (!target || target.startsWith("http://") || target.startsWith("https://") || target.startsWith("#")) {
        continue;
      }
      let relation: "influences" | "references" = "references";
      if (target.includes("adr/") || target.includes("ADR")) {
        relation = "influences";
      }
      edges.push({
        source: sourceId,
        specifier: target,
        relation,
        file: path,
      });
    }
  };

  // Helper: extract references from tags like @adr:..., @covers:..., @ref:...
  const extractTagRefs = (sourceId: string, tags?: readonly { name: string }[]) => {
    if (!tags) return;
    for (const tag of tags) {
      const name = tag.name.replace(/^@/, "");
      if (name.startsWith("adr:")) {
        edges.push({
          source: sourceId,
          specifier: name.slice(4),
          relation: "influences",
          file: path,
        });
      } else if (name.startsWith("covers:")) {
        edges.push({
          source: sourceId,
          specifier: name.slice(7),
          relation: "covers",
          file: path,
        });
      } else if (name.startsWith("ref:") || name.startsWith("references:")) {
        const prefix = name.startsWith("ref:") ? 4 : 11;
        edges.push({
          source: sourceId,
          specifier: name.slice(prefix),
          relation: "references",
          file: path,
        });
      }
    }
  };

  // 1. Feature description markdown links & tags
  extractMarkdownLinks(featureId, feature.description);
  extractTagRefs(featureId, feature.tags);

  for (const child of feature.children) {
    if (child.scenario) {
      const scenario = child.scenario;
      const scenarioId = `${path}#${scenario.name}`;
      
      nodes.push({
        id: scenarioId,
        name: scenario.name,
        kind: "function", // using function/method for scenarios
        path: path,
        span: `L${scenario.location.line}-L${scenario.location.line}`,
        signature: `Scenario: ${scenario.name}`,
        exported: true,
        origin: "ast",
        body_hash: "",
        summary_state: "pending",
        summary: null,
        crux: null,
      });

      edges.push({
        source: featureId,
        targetId: scenarioId,
        relation: "contains",
        file: path,
      });

      // Scenario description & tags
      extractMarkdownLinks(scenarioId, scenario.description);
      extractTagRefs(scenarioId, scenario.tags);

      for (const step of scenario.steps) {
        // Step calls as reference calls
        edges.push({
          source: scenarioId,
          name: step.text,
          relation: "calls",
          file: path,
        });

        // 3. Quoted file paths inside steps: e.g. "path/to/file.ext"
        const quotedFileRegex = /"([^"\r\n]+\.[a-zA-Z0-9]+)"/g;
        let match;
        while ((match = quotedFileRegex.exec(step.text)) !== null) {
          const possiblePath = match[1].trim();
          if (possiblePath.includes("/") || possiblePath.includes(".")) {
            edges.push({
              source: scenarioId,
              specifier: possiblePath,
              relation: "references",
              file: path,
            });
          }
        }
      }
    }
  }

  return { nodes, rawEdges: edges };
}
