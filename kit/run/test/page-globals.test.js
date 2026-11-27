// A Dialect global is the run's value, read through the part's current globals, unless it is on the kit's explicit
// list of page globals (PAGE_GLOBALS: Math), which a Kernel reads from the page. A name the host happens to have (a
// browser's `status`, `screen`, `name`, `top`, `origin`, `event`) is not on the list, so the same Dialect compiles
// and lowers alike in every host (leaf 9t99go).

import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, defineRuntime, exact, name, lambda } from "../../define/index.js";
import { PAGE_GLOBALS } from "../../define/page-globals.js";
import { compilePart } from "../compile.js";

/** Runs `fn` with `globalThis[n]` stubbed as a browser global would be, then removes it. @param {string} n @param {() => void} fn */
function withHostGlobal(n, fn) {
  assert.equal(n in globalThis, false, `the test host already has '${n}'`);
  /** @type {any} */ (globalThis)[n] = { n: 99 };
  try { fn(); } finally { delete (/** @type {any} */ (globalThis))[n]; }
}

test("the page globals are one frozen, explicit list", () => {
  assert.deepEqual([...PAGE_GLOBALS], ["Math"]);
  assert.ok(Object.isFrozen(PAGE_GLOBALS));
});

test("a Dialect global named like a host global reads the run's value, not the host's", () => {
  withHostGlobal("status", () => {
    const dialect = defineDialect(/** @type {any} */ ({
      name: "hosted", numberType: "f64", text: () => "",
      spaces: { s: { pure: true } },
      objects: { Status: { label: "the status (status)", members: { n: "f64" } } },
      globals: { status: "Status" },
      targets: { js: { accepts: "*", compare: exact() } },
      slots: { k: { params: [], returns: "f64", space: "s" } },
      state: { t: "f64" },
    }));
    const grammar = defineGrammar(dialect, { root: "hosted", constructs: { hosted: { opens: [name()], slots: { k: { kind: "decl", args: [lambda("k")] } } } } });
    const runtime = defineRuntime(grammar, { clock: () => ({ tick: 1 }), init: () => ({ t: 0 }), step: (/** @type {any} */ s) => s });
    const record = /** @type {any} */ (grammar)("h").k("() => status.n").build();
    const c = /** @type {any} */ (compilePart(runtime, record));
    assert.equal(c.ok, true);
    c.globals.current = { status: { n: 5 } };
    const k = Object.entries(c.kernels).find(([id]) => id.startsWith("h.k"));
    assert.ok(k, Object.keys(c.kernels).join());
    assert.equal(/** @type {any} */ (k[1])(), 5);
  });
});
