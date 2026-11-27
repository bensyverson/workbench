// @ts-nocheck: builder chains are generated, which TypeScript cannot see.
// kit/run binds a Program's params under the Dialect's params name (`params.name`, `$` by default), so a Kernel that
// reads them by another name (fields names them `u`) reads them in a run too (leaf daTVc3).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun } from "../index.js";
import { compose } from "../../compose/index.js";
import { tiny } from "./helpers.js";

/** A part whose step stores what its Kernel reads of the params, read by `paramsName`. @param {string} paramsName */
function gainPart(paramsName) {
  const t = tiny("amp", { state: { v: "f64" }, ports: {}, inputs: false, paramsName }, {
    clock: () => ({ tick: 1 / 4 }), init: () => ({ v: 0 }), step: (s, c) => ({ v: c.kernels["a.k#1"]() }),
  });
  const p = t.grammar("a").param("gain", { value: 3 }).k(`() => ${paramsName}.gain`);
  return { composed: compose("solo").part(p).build({ runtimes: [t.runtime] }), runtimes: [t.runtime] };
}

for (const paramsName of ["u", "$"]) {
  test(`a Kernel reads the params by the Dialect's params name, ${paramsName}`, () => {
    const { composed, runtimes } = gainPart(paramsName);
    const run = createRun(composed, { runtimes });
    run.runUntil(0.5);
    assert.deepEqual(run.diagnostics.filter((d) => d.severity === "error"), []);
    assert.equal(run.state("a").v, 3);
  });
}
