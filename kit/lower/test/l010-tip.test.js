// L010's tip reads like a signature: an object parameter by the short name its label ends in (or the
// label when it has none), a plain parameter by its type.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lowerLambda } from "../index.js";

/** @import { Environment, SlotRef } from "../environment.js" */

const MONTH = "the month (m)";
const FLOWS = "the flows declared so far in account 'a' (f)";

/** @type {Environment} */
const environment = {
  name: "l010 (test)",
  objects: {
    [MONTH]: { label: MONTH, members: {} },
    [FLOWS]: { label: FLOWS, members: {} },
    Plain: { label: "Plain", members: {} },
  },
  list: {},
  queries: [],
  globals: {},
  vectors: {},
  conversions: { f64: "f64" },
  slot: () => ({ params: [{ obj: MONTH }, { obj: FLOWS }, "f64", { obj: "Plain" }], returns: "f64", space: "month", forbid: [] }),
};

test("L010: the tip lists the convention's parameters as a signature, not by whole label", () => {
  const r = lowerLambda(environment, "(m, f, b, p, extra) => 1", /** @type {SlotRef} */ ({ id: "a.flow", kind: "flow", on: "a" }));
  const d = r.diagnostics.find((x) => x.code === "L010");
  assert.ok(d, "an L010");
  assert.equal(d.tip, "This slot passes (m, f, f64, plain); drop 'extra'.");
});
