# BDD Step Definitions Guide

Step definitions are the glue code that connect business-readable `.feature` files to the underlying test automation code. This guide outlines language-agnostic best practices for organizing, managing state, and structuring step definition code.

## 1. File Organization

Step definition files should be kept **FLAT** in a single directory, rather than nested to mirror the structure of your feature files.

**Group step definitions by technical capability** (e.g., `api_steps`, `web_steps`, `database_steps`, `cli_steps`) rather than by business domain.

**Why?**
Step definitions are meant to be highly reusable across multiple business domains and feature files. A step like `Given the user is logged in` might be used in a billing feature, a user profile feature, and a settings feature. Grouping them by technical concern makes it easier to find, reuse, and maintain the underlying automation code, preventing duplication.

## 2. Shared Test Context Pattern

To pass state between individual steps within a single scenario, use a shared context object or struct. This is commonly referred to as a `TestContext`, `World`, or a context fixture depending on the framework.

This shared context must be initialized fresh for every scenario to ensure test isolation. It typically holds common state such as temporary directory paths, HTTP responses, captured errors, or browser page handles.

### Minimal Examples

**Go (Godog / Ginkgo)**
```go
type TestContext struct {
	TempDir      string
	HTTPResponse *http.Response
	Page         *browser.Page
	Errors       []error
}

// Typically instantiated in a Before scenario hook
func NewTestContext() *TestContext {
	return &TestContext{
		Errors: make([]error, 0),
	}
}
```

**Python (Behave / Pytest-BDD)**
```python
# In Behave, the `context` object is automatically passed and cleared by the framework.
# Variables are attached directly to it.
def before_scenario(context, scenario):
    context.temp_dir = None
    context.http_response = None
    context.page = None
    context.errors = []
```

**JavaScript/TypeScript (Cucumber-JS)**
```javascript
const { setWorldConstructor } = require('@cucumber/cucumber');

class CustomWorld {
    constructor(options) {
        this.tempDir = null;
        this.httpResponse = null;
        this.page = null;
        this.errors = [];
    }
}

setWorldConstructor(CustomWorld);
```

## 3. Lifecycle Hooks

Lifecycle hooks (`Before` and `After` scenarios) are critical for managing the test context and external resources reliably.

### Before Hooks
Before hooks run prior to each scenario and should:
*   **Reset all mutable state:** Ensure the shared test context is completely clean to prevent cross-scenario pollution.
*   **Handle conditional setup:** Check tags or directives on the scenario to conditionally set up expensive resources. For example, only launch a headless browser if the scenario is tagged with `@web` or `@ui`.

### After Hooks
After hooks run after each scenario completes, regardless of whether it passed or failed. They should:
*   **Clean up temporary files:** Recursively delete any temporary directories or scratch files created during the scenario's execution.
*   **Close resources:** Close browser contexts, database connections, or file handles.
*   **Shut down mock servers:** Stop any background services, proxies, or mock servers started specifically for the scenario.

## 4. Step Registration Pattern

To avoid creating a massive, monolithic file containing all step definitions, adopt a pattern of registering steps from separate capability files into a central runner.

Use modular registration functions (e.g., `registerApiSteps`, `registerWebSteps`) that take the runner or context registry as an argument.

**Conceptual Pattern:**

```javascript
// web_steps.js
export function registerWebSteps(runner) {
    runner.Given('the user navigates to the homepage', async function() {
        // 'this' refers to the CustomWorld/TestContext
        await this.page.goto('/');
    });
}

// api_steps.js
export function registerApiSteps(runner) {
    runner.When('an API request is made', async function() {
        this.httpResponse = await makeRequest();
    });
}

// main_runner.js
import { registerWebSteps } from './web_steps';
import { registerApiSteps } from './api_steps';

function initializeRunner(runner) {
    // Keep the runner clean by delegating to capability-specific modules
    registerWebSteps(runner);
    registerApiSteps(runner);
}
```

This pattern keeps the main runner configuration clean, prevents merge conflicts, and distributes the step logic into manageable, domain-agnostic capability files.
