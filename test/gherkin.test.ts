import { test } from "node:test";
import * as assert from "node:assert";
import { extractGherkin } from "../src/graph/gherkin.js";
import { extractFile } from "../src/graph/extract.js";

test("Scenario 1: Registering feature extension", () => {
  const result = extractFile("features/test.feature", "Feature: Example\nScenario: A test\n  Given a step", "gherkin");
  assert.ok(result);
});

test("Scenario 2: Extracting Feature and Scenario definition symbols", () => {
  const content = `
Feature: Login
  Scenario: Success
    Given I have an account
  `;
  const result = extractGherkin("features/login.feature", content);
  const modules = result.nodes.filter((n) => n.kind === "module");
  assert.strictEqual(modules.length, 1);
  assert.strictEqual(modules[0].name, "Login");

  const scenarios = result.nodes.filter((n) => n.kind === "function");
  assert.strictEqual(scenarios.length, 1);
  assert.strictEqual(scenarios[0].name, "Success");
  
  assert.ok(result.rawEdges.find((e) => e.source === modules[0].id && e.targetId === scenarios[0].id && e.relation === "contains"));
});

test("Scenario 3: Extracting Step calls as graph references", () => {
  const content = `
Feature: Checkout
  Scenario: Add to cart
    Given I select an item
    When I click add
    Then the item is in my cart
  `;
  const result = extractGherkin("features/checkout.feature", content);
  const scenario = result.nodes.find((n) => n.name === "Add to cart")!;
  const calls = result.rawEdges.filter((e) => e.source === scenario.id && e.relation === "calls");
  
  assert.strictEqual(calls.length, 3);
  assert.strictEqual((calls[0] as any).name, "I select an item");
  assert.strictEqual((calls[1] as any).name, "I click add");
  assert.strictEqual((calls[2] as any).name, "the item is in my cart");
});

test("Scenario 4: Extracting file references from markdown links, tags, and step strings", () => {
  const content = `
@adr:docs/adr/0001-init.md
@ref:features/billing.feature
Feature: Order Checkout
  Governed by [ADR](docs/adr/0004.md).

  @covers:src/billing/checkout.ts
  Scenario: Process payment
    Given the config file "config/app.json"
    When I submit payment
  `;
  const result = extractGherkin("features/checkout.feature", content);
  const edges = result.rawEdges;

  // Tag @adr:... -> influences
  const adrTag = edges.find((e) => e.relation === "influences" && e.specifier === "docs/adr/0001-init.md");
  assert.ok(adrTag, "must extract @adr:... tag as influences edge");

  // Tag @ref:... -> references
  const refTag = edges.find((e) => e.relation === "references" && e.specifier === "features/billing.feature");
  assert.ok(refTag, "must extract @ref:... tag as references edge");

  // Markdown link in description -> influences
  const mdLink = edges.find((e) => e.relation === "influences" && e.specifier === "docs/adr/0004.md");
  assert.ok(mdLink, "must extract markdown ADR link as influences edge");

  // Scenario tag @covers:... -> covers
  const coversTag = edges.find((e) => e.relation === "covers" && e.specifier === "src/billing/checkout.ts");
  assert.ok(coversTag, "must extract @covers:... tag as covers edge");

  // Quoted file path in step -> references
  const stepFile = edges.find((e) => e.relation === "references" && e.specifier === "config/app.json");
  assert.ok(stepFile, "must extract quoted file in step as references edge");
});

test("Scenario 5: Resolving influences and covers edges against whole-repo index", async () => {
  const { resolveEdges } = await import("../src/graph/resolve.js");
  const featureContent = `
@adr:docs/adr/0001-init.md
Feature: Checkout
  @covers:src/billing/checkout.ts
  Scenario: Pay
    Given step
  `;
  const result = extractGherkin("features/checkout.feature", featureContent);
  const repoNodes = [
    ...result.nodes,
    {
      id: "docs/adr/0001-init.md",
      name: "0001-init.md",
      kind: "file" as const,
      path: "docs/adr/0001-init.md",
      span: "L1-L10",
      signature: null,
      exported: true,
      origin: "ast" as const,
      body_hash: "",
      summary_state: "ready" as const,
      summary: null,
      crux: null,
    },
    {
      id: "src/billing/checkout.ts",
      name: "checkout.ts",
      kind: "file" as const,
      path: "src/billing/checkout.ts",
      span: "L1-L20",
      signature: null,
      exported: true,
      origin: "ast" as const,
      body_hash: "",
      summary_state: "ready" as const,
      summary: null,
      crux: null,
    },
  ];

  const resolved = resolveEdges(repoNodes, result.rawEdges, { goModules: [] });
  const influencesEdge = resolved.find((e) => e.relation === "influences");
  assert.ok(influencesEdge, "must resolve influences edge");
  assert.equal(influencesEdge.target, "docs/adr/0001-init.md");

  const coversEdge = resolved.find((e) => e.relation === "covers");
  assert.ok(coversEdge, "must resolve covers edge");
  assert.equal(coversEdge.target, "src/billing/checkout.ts");
});


