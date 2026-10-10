import { test } from "node:test";
import * as assert from "node:assert";
import type { Relation } from "../src/graph/types.js";

test("Tripartite Semantic Edges are part of the core Relation taxonomy", () => {
  // A simple type assertion test. If the type is wrong, TS fails the build.
  // We can also verify this at runtime by just creating Edge objects.
  
  const specifiesEdge: Relation = "specifies";
  const bindsEdge: Relation = "binds";
  const verifiesEdge: Relation = "verifies";
  const documentsEdge: Relation = "documents";

  assert.strictEqual(specifiesEdge, "specifies");
  assert.strictEqual(bindsEdge, "binds");
  assert.strictEqual(verifiesEdge, "verifies");
  assert.strictEqual(documentsEdge, "documents");
});
