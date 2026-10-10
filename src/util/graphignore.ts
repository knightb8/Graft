/**
 * Parser and matcher for `.graphignore` files.
 *
 * Modeled after `.gitignore` pattern rules:
 * - Blank lines and lines starting with `#` are ignored.
 * - Leading `!` indicates negation (un-ignore).
 * - Trailing `/` matches directories and all files within them.
 * - Patterns without `/` match against the basename or relative path segments.
 * - Leading `/` anchors pattern to the repo root.
 * - Wildcards `*` and `**` match paths and path segments.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { matchesGlob } from "node:path";
import { toPosixPath } from "./paths.js";

export const GRAPHIGNORE_FILENAME = ".graphignore";

interface IgnoreRule {
  raw: string;
  negation: boolean;
  matchDirOnly: boolean;
  test: (relPosix: string) => boolean;
}

export class GraphIgnore {
  private rules: IgnoreRule[] = [];

  constructor(rules: IgnoreRule[] = []) {
    this.rules = rules;
  }

  /**
   * Test whether a repo-relative path (always posix) is ignored.
   * Last matching rule wins (standard gitignore semantics).
   */
  ignores(relPath: string): boolean {
    const posix = toPosixPath(relPath).replace(/^\/+/, "");
    if (!posix) return false;

    let ignored = false;
    for (const rule of this.rules) {
      if (rule.test(posix)) {
        ignored = !rule.negation;
      }
    }
    return ignored;
  }

  /**
   * Filter an array of repo-relative or absolute paths given a repo root.
   */
  filter<T extends string>(paths: T[], repoRoot: string, toRel?: (p: T) => string): T[] {
    if (this.rules.length === 0) return paths;
    return paths.filter((p) => {
      const rel = toRel ? toRel(p) : toPosixPath(p);
      return !this.ignores(rel);
    });
  }

  get size(): number {
    return this.rules.length;
  }
}

/**
 * Compile a single .gitignore pattern into a matcher function.
 */
function compileRule(rawLine: string): IgnoreRule | null {
  let line = rawLine.trim();
  if (!line || line.startsWith("#")) return null;

  let negation = false;
  if (line.startsWith("!")) {
    negation = true;
    line = line.slice(1).trim();
    if (!line) return null;
  }

  const matchDirOnly = line.endsWith("/");
  if (matchDirOnly) {
    line = line.slice(0, -1);
  }

  const isRooted = line.startsWith("/");
  if (isRooted) {
    line = line.slice(1);
  }

  const hasSlash = line.includes("/");

  return {
    raw: rawLine,
    negation,
    matchDirOnly,
    test: (target: string) => {
      // Direct exact match or prefix directory match
      if (target === line || target.startsWith(`${line}/`)) {
        return true;
      }

      // If pattern has slash or was rooted: match against full relative path
      if (isRooted || hasSlash) {
        if (matchesGlob(target, line)) return true;
        if (matchesGlob(target, `${line}/**`)) return true;
        return false;
      }

      // Pattern without slash: can match any filename or any directory segment
      const segments = target.split("/");
      const filename = segments[segments.length - 1];

      if (matchesGlob(filename, line)) return true;
      if (matchesGlob(target, `**/${line}/**`)) return true;
      if (matchesGlob(target, `**/${line}`)) return true;

      return false;
    },
  };
}

/**
 * Parse `.graphignore` file content into a GraphIgnore instance.
 */
export function parseGraphIgnore(content: string): GraphIgnore {
  const rules: IgnoreRule[] = [];
  for (const line of content.split(/\r?\n/)) {
    const rule = compileRule(line);
    if (rule) rules.push(rule);
  }
  return new GraphIgnore(rules);
}

/**
 * Load `.graphignore` from the root of a repo. Returns empty GraphIgnore if missing.
 */
export function loadGraphIgnore(repoRoot: string): GraphIgnore {
  const filePath = join(repoRoot, GRAPHIGNORE_FILENAME);
  if (!existsSync(filePath)) {
    return new GraphIgnore();
  }
  try {
    const content = readFileSync(filePath, "utf8");
    return parseGraphIgnore(content);
  } catch {
    return new GraphIgnore();
  }
}
