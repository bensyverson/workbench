// Per-Program state in a run (Ben's ruling 2, 2026-11-26): the fields a Program declares extend the Dialect's
// extensible state struct, a runtime keeps them across steps, and the run checks a step's state against the
// extended shape: a field the Program does not declare is memory outside its state (N003), as a step that changes
// the state it was handed is. The content key and replay cover the fields, since they are part of the record.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, replay } from "../index.js";
import { defineDialect, defineGrammar, defineRuntime, exact, list, struct, name, data, lambda } from "../../define/index.js";
import { compose } from "../../compose/index.js";

/** A Dialect whose items each carry the fields a Program declares, and a runtime that steps them. @param {Function} [step] */
function swarmKit(step) {
  const dialect = defineDialect(/** @type {any} */ ({
    name: "swarm", numberType: "f64", text: () => "",
    spaces: { s: { pure: true } },
    targets: { js: { accepts: "*", compare: exact() } },
    slots: { k: { params: [], returns: "f64", space: "s" } },
    environment(/** @type {any} */ program) {
      /** @type {Record<string, string>} */
      const state = {};
      for (const n of Object.keys(program.fields ?? {})) state[n] = "f64";
      return { state };
    },
    state: { t: "f64", items: list(struct({ x: "f64" }, { extensible: true }), 100) },
  }));
  const grammar = defineGrammar(dialect, { root: "swarm", constructs: { swarm: { opens: [name()], slots: {
    field: { kind: "decl", args: [name("field"), data({ value: "number", grow: "number" })], as: "fields" },
    k: { kind: "decl", args: [lambda("k")] },
  } } } });
  const runtime = defineRuntime(grammar, {
    clock: () => ({ tick: 1 / 4 }),
    init: (/** @type {any} */ r) => {
      /** @type {Record<string, number>} */
      const item = { x: 0 };
      for (const [n, f] of Object.entries(r.fields ?? {})) item[n] = /** @type {any} */ (f).value;
      return { t: 0, items: [item] };
    },
    step: /** @type {any} */ (step ?? ((/** @type {any} */ s, /** @type {any} */ ctx) => ({
      t: s.t + ctx.dt,
      items: s.items.map((/** @type {any} */ it) => {
        const next = { ...it, x: it.x + 1 };
        for (const [n, f] of Object.entries(ctx.record.fields ?? {})) next[n] = it[n] + /** @type {any} */ (f).grow;
        return next;
      }),
    }))),
  });
  return { grammar, runtime };
}

/** A one-part composition of a swarm Program. @param {ReturnType<typeof swarmKit>} kit @param {(b: any) => any} declare */
function oneSwarm(kit, declare) {
  const part = declare(/** @type {any} */ (kit.grammar)("flock").k("() => 1"));
  return compose("solo").part(part).build({ runtimes: [kit.runtime] });
}

test("a Program's two declared fields live in the state, and the runtime reads and writes them across steps", () => {
  const kit = swarmKit();
  const composed = oneSwarm(kit, (b) => b.field("heat", { value: 1, grow: 2 }).field("spin", { value: 10, grow: -1 }));
  const run = createRun(composed, { runtimes: [kit.runtime] });
  run.runUntil(0.75); // steps at T = 0, 1/4, 1/2 and 3/4
  assert.deepEqual(run.diagnostics, []);
  assert.deepEqual(run.state("flock").items, [{ x: 4, heat: 9, spin: 6 }]);
});

test("N003: a step that keeps a field the Program does not declare in the extensible struct", () => {
  const kit = swarmKit((/** @type {any} */ s) => ({ ...s, items: s.items.map((/** @type {any} */ it) => ({ ...it, x: it.x + 1, spare: 1 })) }));
  const composed = oneSwarm(kit, (b) => b.field("heat", { value: 1, grow: 0 }).field("spin", { value: 0, grow: 0 }));
  const run = createRun(composed, { runtimes: [kit.runtime] });
  run.step();
  assert.deepEqual(run.diagnostics.map((/** @type {any} */ d) => d.code), ["N003"]);
  assert.match(run.diagnostics[0].message, /items\[0\]\.spare: not a field the Program declares/);
  assert.equal(run.diagnostics[0].part, "flock");
  // a declared field written with the wrong type is still a state that does not fit
  const typed = swarmKit((/** @type {any} */ s) => ({ ...s, items: s.items.map((/** @type {any} */ it) => ({ ...it, heat: "hot" })) }));
  const r2 = createRun(oneSwarm(typed, (b) => b.field("heat", { value: 1, grow: 0 })), { runtimes: [typed.runtime] });
  r2.step();
  assert.deepEqual(r2.diagnostics.map((/** @type {any} */ d) => d.code), ["N002"]);
});

test("N003: a step that changes a declared field of the state it was handed", () => {
  const kit = swarmKit((/** @type {any} */ s) => { s.items[0].heat += 1; return s; });
  const run = createRun(oneSwarm(kit, (b) => b.field("heat", { value: 1, grow: 0 })), { runtimes: [kit.runtime] });
  run.step();
  assert.deepEqual(run.diagnostics.map((/** @type {any} */ d) => d.code), ["N003"]);
  assert.match(run.diagnostics[0].message, /changed the state it was handed/);
});

test("an init whose state lacks a declared field does not fit (N002), and one with a stray field kept memory outside (N003)", () => {
  const missing = swarmKit();
  const lacking = defineRuntime(missing.grammar, { clock: () => ({ tick: 1 / 4 }), init: () => ({ t: 0, items: [{ x: 0 }] }), step: (/** @type {any} */ s) => s });
  const r1 = createRun(oneSwarm({ ...missing, runtime: lacking }, (b) => b.field("heat", { value: 1, grow: 0 })), { runtimes: [lacking] });
  assert.deepEqual(r1.diagnostics.map((/** @type {any} */ d) => d.code), ["N002"]);
  const stray = defineRuntime(missing.grammar, { clock: () => ({ tick: 1 / 4 }), init: () => ({ t: 0, items: [{ x: 0, heat: 1, spare: 2 }] }), step: (/** @type {any} */ s) => s });
  const r2 = createRun(oneSwarm({ ...missing, runtime: stray }, (b) => b.field("heat", { value: 1, grow: 0 })), { runtimes: [stray] });
  assert.deepEqual(r2.diagnostics.map((/** @type {any} */ d) => d.code), ["N003"]);
});

test("a state that has a stray field and also misfits reports both, as N003", () => {
  const kit = swarmKit();
  const both = defineRuntime(kit.grammar, { clock: () => ({ tick: 1 / 4 }), init: () => ({ t: "bad", items: [{ x: 0, heat: 1, spare: 2 }] }), step: (/** @type {any} */ s) => s });
  const r = createRun(oneSwarm({ ...kit, runtime: both }, (b) => b.field("heat", { value: 1, grow: 0 })), { runtimes: [both] });
  assert.deepEqual(r.diagnostics.map((/** @type {any} */ d) => d.code), ["N003"]);
  const m = r.diagnostics[0].message;
  assert.match(m, /spare/);
  assert.match(m, /\bt\b/, m);
});

test("the content key and replay change when a declared field changes", () => {
  const kit = swarmKit();
  const a = oneSwarm(kit, (b) => b.field("heat", { value: 1, grow: 2 }));
  const b = oneSwarm(kit, (x) => x.field("heat", { value: 5, grow: 2 }));
  const c = oneSwarm(kit, (x) => x.field("heat", { value: 1, grow: 2 }).field("spin", { value: 0, grow: 0 }));
  const ra = createRun(a, { runtimes: [kit.runtime] }).runUntil(1);
  const rb = createRun(b, { runtimes: [kit.runtime] }).runUntil(1);
  const rc = createRun(c, { runtimes: [kit.runtime] }).runUntil(1);
  assert.notEqual(ra.key("flock"), rb.key("flock"), "a declared field's value is in the key");
  assert.notEqual(ra.key("flock"), rc.key("flock"), "a declared field added is in the key");
  assert.equal(replay(a, { runtimes: [kit.runtime] }, ra.record()).ok, true, "the same Program replays clean");
  const diverged = replay(b, { runtimes: [kit.runtime] }, ra.record());
  assert.equal(diverged.ok, false);
  assert.equal(diverged.diagnostics[0].code, "N005");
  assert.equal(replay(c, { runtimes: [kit.runtime] }, ra.record()).ok, false, "a field added changes the state hashes too");
});
