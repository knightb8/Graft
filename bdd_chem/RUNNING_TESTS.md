# Running Tests

This guide explains how to execute BDD tests when using the nested directory layout. The directory structure is designed to leverage path-based and tag-based filtering, allowing you to run specific subsets of tests efficiently.

## 1. Running the Full Suite

Executing the entire test suite varies slightly depending on your chosen framework. Here are examples for common languages:

**Go (godog)**
```bash
# From the project root or test directory
go test ./... -v
```

**JavaScript (Cucumber)**
```bash
# Using npm scripts or npx
npx cucumber-js
```

**Python (Behave)**
```bash
behave
```

## 2. Path-Based Filtering

A major benefit of the nested directory layout is the ability to target tests by specifying a subdirectory. This allows you to run tests for a specific domain or architectural layer without loading the entire suite.

**Run all tests for a specific domain (e.g., `billing`)**
* Go: `go test ./tests/features/billing/...`
* JS: `npx cucumber-js tests/features/billing/`
* Python: `behave tests/features/billing/`

**Run only tests for a specific layer within a domain (e.g., `api`)**
* Go: `go test ./tests/features/billing/api/...`
* JS: `npx cucumber-js tests/features/billing/api/`
* Python: `behave tests/features/billing/api/`

**Run a single feature file**
* Go: `godog tests/features/billing/api/process_payment.feature`
* JS: `npx cucumber-js tests/features/billing/api/process_payment.feature`
* Python: `behave tests/features/billing/api/process_payment.feature`

## 3. Tag-Based Filtering

Use tags (e.g., `@core`, `@frontend`, `@wip`) to filter tests based on their characteristics or requirements.

**Run only `@core` tests (e.g., fast backend tests)**
* Go: `godog --tags="@core"`
* JS: `npx cucumber-js --tags "@core"`
* Python: `behave --tags=@core`

**Exclude `@wip` (Work In Progress) tests**
* Go: `godog --tags="~@wip"`
* JS: `npx cucumber-js --tags "not @wip"`
* Python: `behave --tags=~@wip`

## 4. Combining Path and Tag Filters

You can combine path and tag filters for highly targeted test execution. For example, to run only fast API tests in the billing domain, ignoring work-in-progress:

* Go: `godog --tags="@core && ~@wip" tests/features/billing/api/`
* JS: `npx cucumber-js --tags "@core and not @wip" tests/features/billing/api/`
* Python: `behave --tags=@core --tags=~@wip tests/features/billing/api/`

## 5. Test Result Artifacts for Multi-Agent Handover

In multi-agent architectures or automated tool-chains, test results must not be printed solely to `stdout` where they are lost to downstream processes. Instead, test runs should output machine-readable artifacts.

This approach ensures:
* A downstream agent or process can read test outcomes without needing to re-execute the suite.
* Results serve as verifiable evidence during a 'task handover' between autonomous agents or pipeline stages.
* CI/CD pipelines can archive results for later analysis.

### Recommended Convention

* **Artifact Location**: Log results to a well-known temporary directory, such as `scratch/bdd_results/` or `.bdd_results/`.
* **Output Format**: Always output JSON for machine parsing, alongside any human-readable HTML or text summaries.
* **File Naming**: Include a timestamp or unique run ID in the filename (e.g., `results_2026-07-25T21-30-00.json`) to preserve history and prevent accidental overwrites.

### Example: Generating JSON Output

**JavaScript (Cucumber)**
```bash
# Create the results directory
mkdir -p scratch/bdd_results/

# Run tests and output JSON
npx cucumber-js --format json:scratch/bdd_results/results_$(date +%Y-%m-%dT%H-%M-%S).json
```

**Go (godog)**
```bash
mkdir -p scratch/bdd_results/
godog --format=cucumber > scratch/bdd_results/results_$(date +%Y-%m-%dT%H-%M-%S).json
```

### Checking for Existing Artifacts

Before initiating a new test run, autonomous agents or scripts should inspect the results directory (`scratch/bdd_results/`) for recent artifacts. If a valid, up-to-date result file exists for the relevant context, the agent can parse it directly, saving time and computational resources.
