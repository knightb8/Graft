/**
 * AsciiDoc (.adoc, .asciidoc) AST & directive extractor.
 *
 * Extracts:
 * 1. File node for the document.
 * 2. Section headings (= Title, == Section, === Subsection, ==== Sub-subsection)
 *    as `kind: "module"` nodes carrying exact L<start>-L<end> spans and containment edges.
 * 3. Include directives: `include::target[options]` -> raw edges (documents / influences).
 * 4. Cross references: `xref:target[label]`, `<<target,label>>`, `<<target>>` -> raw edges.
 * 5. Link directives: `link:target[label]` -> raw edges.
 */
import { basename } from "node:path";
import { contentHash } from "../util/id.js";
import type { NodeV1, Relation } from "./types.js";
import type { ExtractResult, RawEdge } from "./extract.js";

interface Section {
  level: number;
  id: string;
  name: string;
  startLine: number;
  endLine: number;
  signature: string;
  parentId: string;
}

export function extractAsciiDoc(rel: string, source: string): ExtractResult {
  const lines = source.split("\n");
  const nodes: NodeV1[] = [];
  const rawEdges: RawEdge[] = [];

  // File node
  const fileNodeId = rel;
  nodes.push({
    id: fileNodeId,
    name: basename(rel),
    kind: "file",
    path: rel,
    span: `L1-L${Math.max(1, lines.length)}`,
    signature: null,
    exported: true,
    origin: "ast",
    body_hash: contentHash(source),
    chars: source.length,
    summary_state: "pending",
    summary: null,
    crux: null,
  });

  const sections: Section[] = [];
  const sectionRegex = /^(=+)\s+(.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(sectionRegex);
    if (match) {
      const level = match[1].length; // number of '='
      const rawTitle = match[2].trim();
      const title = rawTitle.replace(/\s+\[.*?\]$/, "").trim();
      const lineNum = i + 1;

      // Close previous sections at the same or deeper level
      for (let s = sections.length - 1; s >= 0; s--) {
        if (sections[s].level >= level && sections[s].endLine === lines.length) {
          sections[s].endLine = Math.max(sections[s].startLine, lineNum - 1);
        }
      }

      // Find immediate parent section (closest previous section with lower level)
      let parentId = fileNodeId;
      for (let s = sections.length - 1; s >= 0; s--) {
        if (sections[s].level < level) {
          parentId = sections[s].id;
          break;
        }
      }

      const sectionId = `${rel}#${title}`;
      sections.push({
        level,
        id: sectionId,
        name: title,
        startLine: lineNum,
        endLine: lines.length, // updated when next section or EOF is reached
        signature: line.trim(),
        parentId,
      });
    }
  }

  // Finalize spans for sections
  for (const sec of sections) {
    nodes.push({
      id: sec.id,
      name: sec.name,
      kind: "module",
      path: rel,
      span: `L${sec.startLine}-L${sec.endLine}`,
      signature: sec.signature,
      exported: true,
      origin: "ast",
      body_hash: contentHash(sec.signature),
      summary_state: "pending",
      summary: null,
      crux: null,
    });

    rawEdges.push({
      source: sec.parentId,
      targetId: sec.id,
      relation: "contains",
      file: rel,
    });
  }

  // Find enclosing section for any line number (1-based)
  const enclosingSectionId = (lineNum: number): string => {
    let best: Section | null = null;
    for (const sec of sections) {
      if (lineNum >= sec.startLine && lineNum <= sec.endLine) {
        if (!best || sec.level > best.level) {
          best = sec;
        }
      }
    }
    return best ? best.id : fileNodeId;
  };

  // Helper to add reference edge
  const addRefEdge = (target: string, lineNum: number, defaultRel: Relation = "documents") => {
    const cleanTarget = target.trim();
    if (!cleanTarget) return;
    if (
      cleanTarget.startsWith("http://") ||
      cleanTarget.startsWith("https://") ||
      cleanTarget.startsWith("mailto:")
    ) {
      return;
    }

    let rel: Relation = defaultRel;
    if (cleanTarget.includes("adr/") || cleanTarget.includes("ADR")) {
      rel = "influences";
    }

    rawEdges.push({
      source: enclosingSectionId(lineNum),
      relation: rel,
      specifier: cleanTarget,
      file: rel,
    });
  };

  // Regex patterns for AsciiDoc directives and references
  const includeRegex = /include::([^\[]+)\[(.*?)\]/g;
  const xrefRegex = /xref:([^\[]+)\[(.*?)\]/g;
  const angleXrefRegex = /<<([^>,]+)(?:,([^>]*))?>>/g;
  const linkRegex = /link:([^\[]+)\[(.*?)\]/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (line.trimStart().startsWith("//")) continue;

    // Check includes
    let m: RegExpExecArray | null;
    includeRegex.lastIndex = 0;
    while ((m = includeRegex.exec(line)) !== null) {
      addRefEdge(m[1], lineNum, "documents");
    }

    // Check xref:
    xrefRegex.lastIndex = 0;
    while ((m = xrefRegex.exec(line)) !== null) {
      addRefEdge(m[1], lineNum, "documents");
    }

    // Check <<...>>
    angleXrefRegex.lastIndex = 0;
    while ((m = angleXrefRegex.exec(line)) !== null) {
      addRefEdge(m[1], lineNum, "documents");
    }

    // Check link:
    linkRegex.lastIndex = 0;
    while ((m = linkRegex.exec(line)) !== null) {
      addRefEdge(m[1], lineNum, "documents");
    }
  }

  return { nodes, rawEdges };
}
