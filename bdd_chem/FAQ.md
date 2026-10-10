# BDD Layout FAQ & Edge Cases

When adopting this nested BDD layout, teams often run into a few common edge cases or conceptual questions. Here are the most likely questions to arise and how to handle them:

## 1. "What do we do if a feature spans multiple domains or layers?"
**Answer:** BDD scenarios should be as focused as possible. If a feature spans multiple layers (e.g., a new UI button that requires a new API endpoint), you should generally split it:
*   Create `features/domain/api/new_endpoint-10.feature` to test the backend logic thoroughly.
*   Create `features/domain/web/ui_button-10.feature` to test the user's interaction with the button.
If a feature truly spans multiple *domains*, place it in the domain where the primary business value is being delivered.

## 2. "What happens when we reach counter 90 and the next is 100? Does it break file sorting?"
**Answer:** In older or strictly lexical file explorers, `100.feature` might sort before `20.feature`. Most modern IDEs (VS Code, IntelliJ) use natural number sorting and will handle it correctly. 
However, reaching `100` (meaning you have 10 different aspect files in a single layer directory) is usually a "code smell". It suggests your domain is too broad and should be broken down into sub-domains (e.g., splitting `users` into `auth` and `profiles`). Sub-domains are simply new top-level domain directories (e.g., `features/auth/core/...`), not deeper nesting.

## 3. "How do we handle shared setup or state across different domains?"
**Answer:** The file structure dictates *documentation*, but state management happens in your test runner's context (e.g., a shared `TestContext` struct in Go, or a `World` object in Cucumber). 
Do not try to force shared state through the file directory hierarchy. Use the `Background:` keyword within individual `.feature` files for file-level setup, and use your language's native state management in the step definitions for global setup (like database seeding). See [STEP_DEFINITIONS.md](./STEP_DEFINITIONS.md) for detailed patterns.

## 4. "What if I need to insert a feature between 10 and 20?"
**Answer:** The convention of incrementing by 10 leaves gaps specifically for this purpose. Simply use any integer between them (e.g., `15`). If you find yourself filling all 9 gaps between two counters, you should re-evaluate whether the new file actually needs to be inserted chronologically there, or if appending to the end of the current counter sequence (e.g., `80`) is more appropriate.

## 5. "Should our Step Definition files (the actual code) follow this nested structure too?"
**Answer:** Generally, no. `.feature` files are deeply nested because they serve as *Living Documentation* for stakeholders, making it easy to browse domains. Step definition files (e.g., `api_steps.go`, `web_steps.go`) are just developer glue code. It is entirely acceptable (and usually preferred) to keep step definitions relatively flat or grouped by technical capability rather than business domain, as steps are meant to be highly reusable across multiple domains. See [STEP_DEFINITIONS.md](./STEP_DEFINITIONS.md) for detailed guidance.

## 6. "Where does the feature index live?"
**Answer:** The auto-generated index (`INDEX.md`) and the human-curated documentation (`README.md`) are kept as separate files in the `features/` directory. The script owns `INDEX.md`; humans own `README.md`. This way the index can be regenerated at any time without wiping out curated content. See [INDEX_STRATEGY.md](./INDEX_STRATEGY.md) for details.
