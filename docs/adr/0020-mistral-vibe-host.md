# ADR 0020: Mistral Vibe Host

## Status
Accepted (2026-10-25)

## Context & Problem Statement
Graft's multi-host layer (`src/hosts/`) wires AI coding agents with a marker-fenced
instruction section plus an MCP server registration. Every host in `HOSTS`
(`agents`, `adal`, `cursor`, `gemini`, `grok`, `hermes`, `antigravity`, `copilot`,
`kiro`, `windsurf`) gets that treatment; Claude Code gets a deeper integration.

**Mistral Vibe** (the CLI agent) was absent. Vibe users had to register the graft
MCP server by hand (`vibe mcp add graft --transport stdio --command graft --arg mcp`)
and never received the instruction section that teaches the agent to prefer the
graph over grep.

Two Vibe specifics shape the wiring:

1. **Instructions**: Vibe reads `AGENTS.md` (repo root, inherited down the tree) —
   the same shared file the `agents`, `hermes`, and `antigravity` hosts already
   section into.
2. **MCP config**: Vibe keeps MCP servers in the *user-level* `~/.vibe/config.toml`
   as a `[[mcp_servers]]` array of tables (`name`, `transport`, `command`, `args`) —
   not the keyed `[mcp_servers.graft]` table Codex uses, and not JSON.

## Decision Outcome & Architecture

### 1. Registry entry
Add a `vibe` host to `HOSTS`: `kind: 'section'`, `relPath: 'AGENTS.md'`,
`content: instructionBody`, detected via `~/.vibe`. Sharing `AGENTS.md` with the
other section hosts is safe: one marker-fenced region, identical content, idempotent
upsert — the same precedent set by `hermes` and `antigravity`.

### 2. MCP target: a second TOML shape
`mcpTargets()` gains a `vibe` case pointing at `~/.vibe/config.toml`, scope
`global` (it affects every project), gated on `~/.vibe` existing — the same
out-of-repo posture as the Codex `~/.codex/config.toml` target, so `--no-global`
suppresses it and a plan never offers a write a real run would skip.

Because Vibe's config is an **array of tables**, the existing `upsertCodexToml`
writer cannot be reused. A new line-based writer/stripper pair handles
`[[mcp_servers]]` blocks named `graft`:

- `stripVibeServer(text)` removes every `[[mcp_servers]]` block whose body carries
  `name = "graft"`, preserving all other servers and settings byte for byte.
- The writer strips, then re-appends the canonical block
  (`name`/`transport = "stdio"`/`command`/`args` from `serverEntry()`), so
  re-runs converge on the current launch command instead of freezing whatever the
  first init wrote. A hand-added entry (e.g. from `vibe mcp add`) is recognized by
  its `name` key and replaced, not duplicated.

`McpTarget.format` gains `'toml-array'` so the writer, the planner, and retraction
all agree on which stripper a path needs — one source of truth, like every other
format.

### 3. Retraction
`retract.ts` derives its target list from the same registries, so the vibe host is
retractable for free: the `[[mcp_servers]]` graft block is stripped (file deleted
if nothing but graft's entry remained — no orphan shells), and the shared
`AGENTS.md` block is removed per the existing section logic.

## Consequences
- `graft init` offers Vibe whenever `~/.vibe` exists; `--agents vibe` wires it
  explicitly; `--no-global` withholds the config write but keeps the repo section.
- The Vibe TOML writer is line-based, deliberately: a real TOML
  parse-and-reserialize would reformat the user's whole config file.
- No Vibe-specific hooks layer in this phase — instructions + MCP only, the same
  integration depth as Gemini CLI.
