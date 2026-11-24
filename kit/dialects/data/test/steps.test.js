// Table steps that name columns in their data rather than as refs (cast, rename) and joins that bring columns
// over: an unknown column is refused with a did-you-mean, and no step gives two columns one name. From the
// review of 62bec66 (its probe: local/rev-data-probes/data-steps.test.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { program } from "../index.js";

const base = () => program("p")
  .source("orders", { csv: "o.csv", columns: { id: "f64", customer_id: "f64", placed_at: "date", amount: "f64" } })
  .source("customers", { csv: "c.csv", columns: { id: "str", name: "str", segment: "str" } });

/** Lowering's diagnostics and states for a builder that passes `.check()`. @param {any} b */
function lower(b) {
  assert.deepEqual(b.check(), []);
  return program.lower(b.build());
}

test("a cast of a column the table lacks is T009 with the did-you-mean, and adds no column", () => {
  const { diagnostics, states } = lower(base().table("t", "orders").cast({ amout: "f64" }));
  assert.deepEqual(diagnostics.map((d) => d.code), ["T009"]);
  assert.match(diagnostics[0].message, /amout.*Did you mean 'amount'/);
  assert.deepEqual(Object.keys(/** @type {any} */ (states).t.columns), ["id", "customer_id", "placed_at", "amount"]);
  // a cast of a column it has still applies
  assert.deepEqual(/** @type {any} */ (lower(base().table("t", "orders").cast({ amount: "str" })).states).t.columns.amount, "str");
});

test("a rename of a column the table lacks is T009 with the did-you-mean", () => {
  const { diagnostics } = lower(base().table("t", "orders").rename({ amout: "x" }));
  assert.deepEqual(diagnostics.map((d) => d.code), ["T009"]);
  assert.match(diagnostics[0].message, /Did you mean 'amount'/);
});

test("a rename onto a column the table keeps is T010; a swap is fine", () => {
  const onto = lower(base().table("t", "orders").rename({ amount: "id" })).diagnostics;
  assert.deepEqual(onto.map((d) => d.code), ["T010"]);
  const swap = lower(base().table("t", "orders").rename({ amount: "id", id: "amount" }));
  assert.deepEqual(swap.diagnostics, []);
  assert.deepEqual(/** @type {any} */ (swap.states).t.columns, { amount: "f64", customer_id: "f64", placed_at: "date", id: "f64" });
});

test("a rename reads only its own keys: a column named constructor keeps its name", () => {
  const b = program("p").source("s", { csv: "s", columns: { constructor: "f64", b: "f64" } }).table("t", "s").rename({ b: "c" });
  const { diagnostics, states } = lower(b);
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(/** @type {any} */ (states).t.columns, { constructor: "f64", c: "f64" });
});

test("a join that takes a column the table already has is T010, and keeps the table's type", () => {
  const { diagnostics, states } = lower(base().table("t", "orders").cast({ customer_id: "str" }).join("customers", { on: { customer_id: "id" }, take: ["id", "name"] }));
  assert.deepEqual(diagnostics.map((d) => d.code), ["T010"]);
  assert.match(diagnostics[0].tip, /rename/);
  assert.equal(/** @type {any} */ (states).t.columns.id, "f64");
  // by default a join takes only the columns the table lacks
  assert.deepEqual(lower(base().table("t", "orders").cast({ customer_id: "str" }).join("customers", { on: { customer_id: "id" } })).diagnostics, []);
});
