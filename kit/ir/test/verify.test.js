// The IR verifier: each invariant the IR states, broken on its own in an otherwise
// valid Kernel, gives exactly its own code; valid Kernels give none; nothing throws.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verify, VERIFY_CODES } from "../verify.js";

/** @import { Kernel, Expr, Type } from "../ir.js" */

const GOLDEN = new URL("../../../scripts/dmg-lower/test/golden/", import.meta.url);
/** @param {string} name @returns {Kernel} */
const golden = (name) => JSON.parse(readFileSync(new URL(`${name}.json`, GOLDEN), "utf8"));

const SRC = "x".repeat(200);
/** @type {[number, number]} */
const S = [0, 10];
const W = /** @type {Type} */ ({ obj: "World" });
const MOLE = /** @type {Type} */ ({ ref: "Mole" });
const BOARD = /** @type {Type} */ ({ list: MOLE, max: 9, with: "Board" });

/** @returns {Expr} */ const num = (/** @type {number} */ v) => ({ k: "num", v, t: "f64", span: S });
/** @returns {Expr} */ const local = (/** @type {string} */ name, /** @type {Type} */ t) => ({ k: "local", name, t, span: S });
/** @returns {Expr} */ const op = (/** @type {import("../ir.js").Op} */ o, /** @type {Type} */ t, /** @type {Expr[]} */ ...args) => ({ k: "op", op: o, args, t, span: S });
const up = () => /** @type {Expr} */ ({ k: "load", place: { recv: local("m", MOLE), owner: "Mole", name: "up", t: "bool", store: { type: "bool" } }, t: "bool", span: S });

/**
 * A hand-built Kernel that uses every expression and statement kind M1 lowers to.
 * @returns {Kernel}
 */
function rich() {
  const xs = /** @type {Type} */ ({ list: "f64", max: 2, len: 2 });
  const p = /** @type {Type} */ ({ struct: { x: "f64" } });
  return {
    ir: "kernel", name: "timer(rich)", slot: "timer", space: "tick",
    params: [{ name: "w", t: W, kind: "param" }],
    returns: "void",
    locals: [
      { name: "t0", t: { list: MOLE, max: 9 }, kind: "temp" },
      { name: "m", t: MOLE, kind: "const" },
      { name: "i", t: "f64", kind: "let" },
      { name: "xs", t: xs, kind: "const" },
      { name: "p", t: p, kind: "const" },
      { name: "a", t: { opt: "f64" }, kind: "const" },
      { name: "t1", t: "f64", kind: "temp" },
      { name: "f", t: { opt: MOLE }, kind: "const" },
    ],
    body: [
      { k: "let", name: "t0", t: { list: MOLE, max: 9 }, value: { k: "list", t: { list: MOLE, max: 9 }, span: S }, span: S, effects: [] },
      {
        k: "each", name: "m", t: MOLE, max: 9, span: S, effects: [],
        list: { k: "load", place: { recv: local("w", W), owner: "World", name: "board", t: BOARD }, t: BOARD, span: S },
        body: [{ k: "if", test: op("not", "bool", up()), then: [{ k: "push", name: "t0", value: local("m", MOLE), span: S, effects: [] }], else: [{ k: "break", span: S, effects: [] }], span: S, effects: ["read Mole.up"] }],
      },
      {
        k: "for", name: "i", init: num(0), test: op("lt", "bool", local("i", "f64"), num(3)), bound: "const 3", span: S, effects: [],
        update: [{ k: "set", name: "i", value: op("add", "f64", local("i", "f64"), num(1)), span: S, effects: [] }],
        body: [
          { k: "do", value: { k: "call", fn: "Rng.int", recv: { k: "load", place: { recv: local("w", W), owner: "World", name: "rng", t: { obj: "Rng" } }, t: { obj: "Rng" }, span: S }, args: [local("i", "f64")], effects: ["rng"], t: "f64", span: S }, span: S, effects: ["rng"] },
          { k: "continue", span: S, effects: [] },
        ],
      },
      { k: "let", name: "xs", t: xs, value: { k: "array", items: [num(1), num(2)], t: xs, span: S }, span: S, effects: [] },
      { k: "let", name: "p", t: p, value: { k: "struct", fields: { x: { k: "index", of: local("xs", xs), index: num(0), t: "f64", span: S } }, t: p, span: S }, span: S, effects: [] },
      { k: "let", name: "a", t: { opt: "f64" }, value: { k: "index", of: local("xs", xs), index: { k: "call", fn: "Math.max", recv: { k: "global", name: "Math", t: { obj: "Math" }, span: S }, args: [], effects: [], t: "f64", span: S }, t: { opt: "f64" }, span: S }, span: S, effects: [] },
      { k: "let", name: "t1", t: "f64", value: { k: "cond", test: op("truthy", "bool", local("a", { opt: "f64" })), then: { k: "field", of: local("p", p), name: "x", t: "f64", span: S }, else: num(0), t: "f64", span: S }, span: S, effects: [] },
      { k: "do", value: { k: "method", owner: "World", name: "award", recv: local("w", W), args: [local("t1", "f64")], effects: ["call World.award", "write World.score"], t: "void", span: S }, span: S, effects: ["call World.award", "write World.score"] },
      { k: "let", name: "f", t: { opt: MOLE }, value: { k: "undef", t: { opt: MOLE }, span: S }, span: S, effects: [] },
      { k: "if", test: op("present", "bool", local("f", { opt: MOLE })), then: [{ k: "store", place: { recv: local("f", MOLE), owner: "Mole", name: "up", t: "bool", store: { type: "bool" } }, value: { k: "bool", v: true, t: "bool", span: S }, span: S, effects: ["write Mole.up"] }], else: [], span: S, effects: [] },
      { k: "do", value: { k: "helper", name: "clamp", args: [{ k: "str", v: "a", t: { enum: ["a"] }, span: S }], effects: ["call clamp"], t: "f64", span: S }, span: S, effects: ["call clamp"] },
      { k: "return", value: null, span: S, effects: [] },
    ],
    effects: ["read Mole.up", "rng", "call World.award", "write World.score", "write Mole.up", "call clamp"], needs: [],
    src: SRC,
    span: [0, 200],
  };
}

/**
 * A deep copy of `k`, changed by `fn`.
 * @param {Kernel} k
 * @param {(k: any) => void} fn
 * @returns {Kernel}
 */
function broken(k, fn) {
  const copy = structuredClone(k);
  fn(copy);
  return copy;
}

/** @param {unknown} k */
const codes = (k) => [...new Set(verify(/** @type {Kernel} */ (k)).map((d) => d.code))].sort();

test("the M1 goldens and the hand-built kernel verify clean", () => {
  for (const k of [golden("04-mole-onframe"), golden("04-timer-spawn"), rich()]) assert.deepEqual(verify(k), [], k.name);
});

test("every code is documented, and each diagnostic names its code, a message, a path and a span", () => {
  assert.deepEqual(Object.keys(VERIFY_CODES), ["V001", "V002", "V003", "V004", "V005", "V006", "V007", "V008", "V009", "V010", "V011", "V012", "V013"]);
  const d = verify(broken(rich(), (k) => { k.body[0].value.t = "f64"; }));
  assert.equal(d[0].code, "V002");
  assert.match(d[0].message, /list/);
  assert.equal(d[0].path, "body[0].value");
  assert.deepEqual(d[0].span, S);
});

test("never throws: not a kernel, a cycle, a hole", () => {
  for (const k of [null, undefined, 3, "kernel", {}, { ir: "kernel" }, []]) assert.deepEqual(codes(k), ["V001"], String(k));
  const cyc = rich();
  /** @type {any} */ (cyc.body[0]).value.self = cyc.body[0];
  assert.ok(codes(cyc).includes("V012"));
  const hole = broken(rich(), (k) => { k.body[1].body[0] = null; });
  assert.deepEqual(codes(hole), ["V001"]);
});

test("a concat part whose item type is unknown is refused, and says so", () => {
  const unk = { list: "unknown", max: 2, len: 2 };
  const k = broken(rich(), (kk) => {
    const arr = kk.body[3].value;
    arr.t = unk;
    kk.body[3].value = { k: "concat", parts: [arr], t: unk, span: S };
    kk.locals[3].t = unk;
  });
  assert.ok(verify(k).some((d) => d.path === "body[3].value" && /item type/.test(d.message)), JSON.stringify(verify(k)));
});

test("V001: a node of no known kind, or missing a field its kind has", () => {
  assert.deepEqual(codes(broken(rich(), (k) => { k.body[3].value.k = "tuple"; })), ["V001"]);
  assert.deepEqual(codes(broken(rich(), (k) => { k.body[5].k = "var"; })), ["V001"]);
  assert.deepEqual(codes(broken(rich(), (k) => { delete k.body[2].update; })), ["V001"]);
  assert.deepEqual(codes(broken(rich(), (k) => { k.body[3].value.items = "1, 2"; })), ["V001"]);
  assert.deepEqual(codes(broken(rich(), (k) => { delete k.body[0].effects; })), ["V001"]);
  assert.deepEqual(codes(broken(rich(), (k) => { k.ir = "lir"; })), ["V001"]);
});

test("V002: an expression's type disagrees with its operands or its kind", () => {
  const g = golden("04-mole-onframe");
  assert.deepEqual(codes(broken(g, (k) => { k.body[0].then[0].value.args[1].t = "bool"; })), ["V002"], "a num typed bool");
  assert.deepEqual(codes(broken(g, (k) => { k.body[0].then[0].value.args[1] = { k: "bool", v: true, t: "bool", span: [31, 41] }; })), ["V002"], "sub of a bool");
  assert.deepEqual(codes(broken(g, (k) => { k.body[0].then[0].value.t = "bool"; })), ["V002"], "sub typed bool, so the let's value disagrees too");
  assert.deepEqual(codes(broken(g, (k) => { k.body[0].then[2].test.args.pop(); })), ["V002"], "eq with one operand");
  assert.deepEqual(codes(broken(g, (k) => { k.body[0].then[2].test.op = "spaceship"; })), ["V002"], "no such operator");
  assert.deepEqual(codes(broken(g, (k) => { k.body[0].test.t = "f64"; k.body[0].test.place.t = "f64"; k.body[0].test.place.store = { type: "f64" }; })), ["V002"], "an if tests an f64");
  assert.deepEqual(codes(broken(g, (k) => { k.body[0].test.t = "f64"; })), ["V002"], "a load's type is its place's");
  assert.deepEqual(codes(broken(g, (k) => { k.body[0].test.place.store = { type: "u8" }; })), ["V002"], "a bool place stored as u8");
  assert.deepEqual(codes(broken(g, (k) => { k.body[0].test.place.owner = "Spark"; })), ["V002", "V007"], "a Mole field owned by Spark (its read is recorded as Mole.up)");
  assert.deepEqual(codes(broken(g, (k) => { k.body[0].then[1].value = { k: "bool", v: true, t: "bool", span: [31, 41] }; })), ["V002"], "a bool stored into an f64 place");
  assert.deepEqual(codes(broken(g, (k) => { k.body[0].then[1].place.recv.t = MOLE; k.body[0].then[1].place.recv.k = "local"; k.body[0].then[1].place.recv.name = "t0"; })), ["V002"], "a local typed other than its binding");
  const r = rich();
  assert.deepEqual(codes(broken(r, (k) => { k.body[4].value.fields.x.t = { opt: "f64" }; })), ["V002"], "index below len is not empty");
  assert.deepEqual(codes(broken(r, (k) => { k.body[5].value.t = "f64"; })), ["V002"], "index of a non-constant is possibly empty");
  assert.deepEqual(codes(broken(r, (k) => { k.body[3].value.items.push(num(3)); })), ["V002"], "an array of 3 typed len 2");
  assert.deepEqual(codes(broken(r, (k) => { k.body[3].value.items[1] = { k: "str", v: "a", t: { enum: ["a"] }, span: S }; })), ["V002"], "an array item of another type");
  assert.deepEqual(codes(broken(r, (k) => { k.body[4].value.t = { struct: { y: "f64" } }; k.body[4].t = k.body[4].value.t; k.locals[4].t = k.body[4].value.t; k.body[6].value.then.t = "f64"; k.body[6].value.then.of.t = k.body[4].value.t; })), ["V002"], "a struct typed with other fields, and a field it lacks");
  assert.deepEqual(codes(broken(r, (k) => { k.body[6].value.then.t = "bool"; })), ["V002"], "a field typed other than the struct's field");
  assert.deepEqual(codes(broken(r, (k) => { k.body[6].value.t = "bool"; k.body[6].t = "bool"; k.locals[6].t = "bool"; k.body[7].value.args[0].t = "bool"; })), ["V002"], "a cond typed other than its arms");
  assert.deepEqual(codes(broken(r, (k) => { k.body[5].value = num(1); })), ["V002"], "a let typed wider than its value");
  assert.deepEqual(codes(broken(r, (k) => { k.body[2].body.unshift({ k: "let", name: "s", t: "str", value: { k: "str", v: "a", t: { enum: ["a"] }, span: S }, span: S, effects: [] }); k.locals.push({ name: "s", t: "str", kind: "let" }); })), [], "a let holds any string, so it may widen a string literal to str");
  assert.deepEqual(codes(broken(r, (k) => { const o = { opt: "f64" }; k.body[6].value.t = o; k.body[6].t = o; k.locals[6].t = o; k.body[7].value.args[0].t = o; })), ["V002"], "a cond typed wider than the join of its arms");
  assert.deepEqual(codes(broken(r, (k) => { k.body[6].value.test = local("t1", "f64"); })), ["V002", "V004"], "a cond tests an f64 (and t1 is not bound yet)");
  assert.deepEqual(codes(broken(r, (k) => { k.body[9].test.op = "truthy"; k.body[9].test.args[0] = num(1); k.body[9].test.args[0].t = "void"; })), ["V002"], "truthy of void");
  assert.deepEqual(codes(broken(r, (k) => { k.body[9].test.args[0] = num(1); })), ["V002"], "present of a number");
  assert.deepEqual(codes(broken(r, (k) => { k.body[8].value.t = "f64"; })), ["V002"], "undef typed as never empty");
  assert.deepEqual(codes(broken(r, (k) => { k.body[11].value = num(1); })), ["V002"], "a value returned from a void kernel");
  assert.deepEqual(codes(broken(r, (k) => { k.body[1].t = "f64"; k.locals[1].t = "f64"; k.body[1].body[0].then[0].value.t = "f64"; k.body[1].body[0].test.args[0].place.recv.t = "f64"; })), ["V002"], "each binds other than the list's item");
  assert.deepEqual(codes(broken(r, (k) => { k.body[1].body[0].then[0].value = num(1); })), ["V002"], "a number pushed onto a list of Moles");
  assert.deepEqual(codes(broken(r, (k) => { k.body[0].value.t = { list: MOLE, max: 9, len: 0 }; k.body[0].t = k.body[0].value.t; k.locals[0].t = k.body[0].value.t; })), ["V002"], "a new list with a fixed length");
  assert.deepEqual(codes(broken(r, (k) => { k.body[7].value.owner = "Mole"; })), ["V002", "V007"], "a World method owned by Mole (its call is recorded as World.award)");
  assert.deepEqual(codes(broken(r, (k) => { k.body[4].value.fields.x.index = { k: "str", v: "a", t: { enum: ["a"] }, span: S }; })), ["V002"], "a list indexed by a string");
});

test("V003: a type no Kernel may hold", () => {
  const r = rich();
  assert.deepEqual(codes(broken(r, (k) => { k.body[10].value.t = "unknown"; })), ["V003"], "unknown, as a helper call with no signature gives");
  assert.deepEqual(codes(broken(r, (k) => { k.params[0].t = { tvar: "T" }; for (const s of [k.body[1].list.place.recv, k.body[2].body[0].value.recv.place.recv, k.body[7].value.recv]) s.t = { tvar: "T" }; })), ["V003", "V002"].sort(), "a type variable (and loads off it no longer agree)");
  assert.deepEqual(codes(broken(r, (k) => { for (const t of [k.locals[3], k.body[3], k.body[3].value, k.body[4].value.fields.x.of, k.body[5].value.of]) t.t = { list: "f64", max: 2, len: 3 }; })), ["V002", "V003"], "len past max (and the array no longer agrees)");
  assert.deepEqual(codes(broken(r, (k) => { for (const t of [k.locals[0], k.body[0], k.body[0].value]) t.t = { list: MOLE, max: 1.5 }; })), ["V003"], "a fractional max");
  assert.deepEqual(codes(broken(r, (k) => { k.body[11].value = null; k.returns = { enum: [] }; })), ["V003", "V002"].sort(), "an empty enum (and a bare return of it)");
  assert.deepEqual(codes(broken(r, (k) => { k.body[10].value.t = { union: ["f64"] }; })), ["V003"], "a union of one");
  assert.deepEqual(codes(broken(r, (k) => { k.body[10].value.t = { opt: { opt: "f64" } }; })), ["V003"], "an optional of an optional");
  assert.deepEqual(codes(broken(r, (k) => { k.body[10].value.t = { struct: { x: "f64" }, optional: ["y"] }; })), ["V003"], "an optional field the struct lacks");
});

test("a partial kernel, lowered outside its program, may hold unknown but nothing else V003 rejects", () => {
  const unknown = broken(rich(), (k) => { k.body[10].value.t = "unknown"; });
  assert.deepEqual(verify(unknown, { partial: true }), []);
  const fractional = broken(rich(), (k) => { for (const t of [k.locals[0], k.body[0], k.body[0].value]) t.t = { list: MOLE, max: 1.5 }; });
  assert.deepEqual([...new Set(verify(fractional, { partial: true }).map((d) => d.code))], ["V003"]);
  const nested = broken(rich(), (k) => { for (const t of [k.locals[5], k.body[5], k.body[5].value, k.body[6].value.test.args[0]]) t.t = { opt: "unknown" }; });
  assert.deepEqual([...new Set(verify(nested, { partial: true }).map((d) => d.code))].sort(), ["V002", "V003"], "an index typed {opt: unknown} is ill-formed even when partial, and is not its list's item");
  assert.deepEqual([...new Set(verify(broken(rich(), (k) => { k.body[2].bound = ""; }), { partial: true }).map((d) => d.code))], ["V009"]);
});

test("V004: a name used where nothing binds it", () => {
  const r = rich();
  assert.deepEqual(codes(broken(r, (k) => { k.body[7].value.args[0].name = "nope"; k.body[7].value.args[0].t = "f64"; })), ["V004"], "never bound");
  assert.deepEqual(codes(broken(r, (k) => { const [s] = k.body.splice(6, 1); k.body.splice(7, 0, s); })), ["V004"], "used before its let");
  assert.deepEqual(codes(broken(r, (k) => { k.body[7].value.args[0] = local("m", MOLE); })), ["V004"], "an each's binding used after the loop");
  assert.deepEqual(codes(broken(r, (k) => { k.body[1].body[0].then[0].name = "nope"; })), ["V004"], "a push to nothing");
  assert.deepEqual(codes(broken(r, (k) => { k.body[1].name = "q"; })), ["V004"], "a binding not in the kernel's locals, so m is unbound");
});

test("V005: a name bound twice", () => {
  const r = rich();
  assert.deepEqual(codes(broken(r, (k) => { k.body.splice(1, 0, structuredClone(k.body[0])); })), ["V005"], "two lets");
  assert.deepEqual(codes(broken(r, (k) => { k.locals.push({ name: "w", t: W, kind: "const" }); })), ["V005"], "a local named like a param");
});

test("V006: an assignment to a name or place that cannot change", () => {
  const r = rich();
  assert.deepEqual(codes(broken(r, (k) => { k.body.splice(4, 0, { k: "set", name: "xs", value: local("xs", k.locals[3].t), span: S, effects: [] }); })), ["V006"], "a const");
  assert.deepEqual(codes(broken(r, (k) => { k.body.splice(1, 0, { k: "set", name: "w", value: local("w", W), span: S, effects: [] }); })), ["V006"], "a param");
  assert.deepEqual(codes(broken(golden("04-mole-onframe"), (k) => { delete k.body[0].then[1].place.store; })), ["V006"], "a place with no store rule");
});

test("V007: a statement whose recorded effects miss what it does", () => {
  const g = golden("04-mole-onframe");
  assert.deepEqual(codes(broken(g, (k) => { k.body[0].then[0].effects = []; k.effects = ["read Mole.up", "write Mole.ttl", "write Mole.up"]; })), ["V007"], "a load of state with no read");
  assert.deepEqual(codes(broken(g, (k) => { k.body[0].then[1].effects = []; k.effects = ["read Mole.up", "read Mole.ttl", "write Mole.up"]; })), ["V007"], "a store with no write");
  const r = rich();
  assert.deepEqual(codes(broken(r, (k) => { k.body[2].body[0].effects = []; k.effects = k.effects.filter((/** @type {string} */ e) => e !== "rng"); })), ["V007"], "a call's effects not on its statement");
  assert.deepEqual(codes(broken(r, (k) => { k.body[7].value.effects = ["write World.score"]; k.body[7].effects = ["write World.score"]; k.effects = k.effects.filter((/** @type {string} */ e) => e !== "call World.award"); })), ["V007"], "a method call without its call effect");
  assert.deepEqual(codes(broken(r, (k) => { k.body[10].value.effects = []; k.body[10].effects = []; k.effects.pop(); })), ["V007"], "a helper call without its call effect");
  assert.deepEqual(codes(broken(r, (k) => { k.body[7].effects = ["call World.award", "explode"]; k.effects.splice(3, 1, "explode"); })), ["V007"], "an effect with no known verb");
});

test("V008: kernel effects that are not the sum of its statements'", () => {
  const g = golden("04-mole-onframe");
  assert.deepEqual(codes(broken(g, (k) => { k.effects.pop(); })), ["V008"], "one missing");
  assert.deepEqual(codes(broken(g, (k) => { k.effects.push("rng"); })), ["V008"], "one extra");
  assert.deepEqual(codes(broken(g, (k) => { k.effects.reverse(); })), ["V008"], "out of first-seen order");
});

test("V009: a loop that is not bounded", () => {
  const r = rich();
  assert.deepEqual(codes(broken(r, (k) => { k.body[2].bound = ""; })), ["V009"], "no bound");
  assert.deepEqual(codes(broken(r, (k) => { k.body[2].bound = "const 4"; })), ["V009"], "a bound other than the test's");
  assert.deepEqual(codes(broken(r, (k) => { k.body[2].test.op = "gt"; })), ["V009"], "counting toward nothing");
  assert.deepEqual(codes(broken(r, (k) => { k.body[2].test.args[1] = local("t1", "f64"); k.body[2].bound = "const 3"; })), ["V004", "V009"], "a bound that is a local");
  assert.deepEqual(codes(broken(r, (k) => { k.body[2].update[0].value.args[1] = num(2); })), ["V009"], "a step of two");
  assert.deepEqual(codes(broken(r, (k) => { k.body[2].body.unshift({ k: "set", name: "i", value: num(0), span: S, effects: [] }); })), ["V009"], "the body resets the counter");
  assert.deepEqual(codes(broken(r, (k) => { k.body[2].init = num(0.5); })), ["V009"], "a fractional start");
  assert.deepEqual(codes(broken(r, (k) => { k.body[1].max = 10; })), ["V009"], "an each whose max is not its list's");
  assert.deepEqual(codes(broken(r, (k) => { k.body[1].max = 1e400; k.body[1].list.t = { list: MOLE, max: 1e400, with: "Board" }; k.body[1].list.place.t = k.body[1].list.t; })), ["V003", "V009", "V012"], "an each over an unbounded list (which JSON cannot hold either)");
});

test("V010: break or continue outside a loop", () => {
  assert.deepEqual(codes(broken(rich(), (k) => { k.body.splice(11, 0, { k: "break", span: S, effects: [] }); })), ["V010"]);
  assert.deepEqual(codes(broken(rich(), (k) => { k.body[9].then.push({ k: "continue", span: S, effects: [] }); })), ["V010"]);
});

test("V011: a node without a span inside the source", () => {
  const g = golden("04-mole-onframe");
  assert.deepEqual(codes(broken(g, (k) => { delete k.body[0].span; })), ["V011"], "a statement without one");
  assert.deepEqual(codes(broken(g, (k) => { delete k.body[0].test.place.recv.span; })), ["V011"], "an expression without one");
  assert.deepEqual(codes(broken(g, (k) => { k.body[0].test.span = [20, 70]; })), ["V011"], "past the end of src");
  assert.deepEqual(codes(broken(g, (k) => { k.body[0].test.span = [27, 20]; })), ["V011"], "reversed");
  assert.deepEqual(codes(broken(g, (k) => { k.body[0].test.span = [20.5, 27]; })), ["V011"], "fractional");
  assert.deepEqual(codes(broken(g, (k) => { k.span = [0, 99]; })), ["V011"], "the kernel's own, past src");
});

test("V012: a kernel whose JSON form does not read back the same", () => {
  const r = rich();
  assert.deepEqual(codes(broken(r, (k) => { k.body[3].value.items[0].v = Infinity; })), ["V002", "V012"], "Infinity reads back as null (and the num rule rejects it itself)");
  assert.deepEqual(codes(broken(r, (k) => { k.body[3].value.items[0].v = NaN; })), ["V002", "V012"], "NaN reads back as null (and the num rule rejects it itself)");
  assert.deepEqual(codes(broken(r, (k) => { k.body[3].value.items[0].v = -0; })), ["V002", "V012"], "-0 reads back as 0 (and the num rule rejects it itself)");
  const fn = rich();
  /** @type {any} */ (fn.body[0]).note = () => 1;
  assert.deepEqual(codes(fn), ["V012"], "a function is dropped");
});

test("a valid kernel is not changed by verifying it", () => {
  const r = rich();
  const before = JSON.stringify(r);
  verify(r);
  assert.equal(JSON.stringify(r), before);
});
