// What a run accepts as a time and as a checkpoint interval: a run time is at least 0 (an input's stamp already was),
// and a checkpoint interval is above 0, since one of 0 would checkpoint at every instant forever.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun } from "../index.js";
import { bursts, rightAt } from "./helpers.js";

const fresh = (/** @type {any} */ options = {}) => { const { composed, runtimes } = bursts(); return createRun(composed, { runtimes, ...options }); };
const NEGATIVE = [-1, "-1/2", { n: -1, d: 2 }];

test("a negative time is refused by runUntil, advance, rewind and why(since); 0 and positive times still run", () => {
  for (const t of NEGATIVE) {
    for (const method of ["runUntil", "advance", "rewind"]) assert.throws(() => /** @type {any} */ (fresh())[method](t), /at least 0/, `${method}(${JSON.stringify(t)})`);
    assert.throws(() => fresh().why(undefined, /** @type {any} */ (t)), /at least 0/, `why(${JSON.stringify(t)})`);
  }
  for (const t of [0, "0", { n: 0, d: 1 }, 0.5, "1/2"]) assert.doesNotThrow(() => fresh().runUntil(/** @type {any} */ (t)), `runUntil(${JSON.stringify(t)})`);
  assert.throws(() => fresh().input({ ...rightAt(0), T: -1 }), /at least 0/);
});

test("checkpointEvery must be above 0; a positive interval still runs", () => {
  for (const every of [0, -1, "0", "-1/2", { n: 0, d: 1 }]) {
    assert.throws(() => fresh({ checkpointEvery: every }), /checkpointEvery/, `checkpointEvery ${JSON.stringify(every)}`);
  }
  assert.doesNotThrow(() => fresh({ checkpointEvery: 0.25 }).runUntil(1));
  assert.doesNotThrow(() => fresh({ checkpointEvery: "1/4" }).runUntil(1));
});
