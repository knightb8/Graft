Feature: Persistent File Exclusion via .graphignore

  As a Graft user
  I want to specify ignore patterns in a .graphignore file at the root of my repository
  So that noisy, generated, or transient files are excluded from the context graph across all CLI commands, MCP sessions, and refresh hooks without passing CLI flags.

  Scenario: Exclude directories and glob patterns via .graphignore
    Given a repository with a ".graphignore" containing "docs/checkpoints" and "*.tmp.ts"
    And a git-tracked file "docs/checkpoints/run.log"
    And a git-tracked file "src/generated.tmp.ts"
    And a git-tracked file "src/core.ts"
    When I run "graft build"
    Then the context graph should index "src/core.ts"
    And the context graph should not index "docs/checkpoints/run.log"
    And the context graph should not index "src/generated.tmp.ts"

  Scenario: Negation rules in .graphignore
    Given a repository with a ".graphignore" containing "docs/*" and "!docs/adr"
    And a file "docs/notes.md"
    And a file "docs/adr/0001-init.md"
    When I run "graft build"
    Then the context graph should index "docs/adr/0001-init.md"
    And the context graph should not index "docs/notes.md"
