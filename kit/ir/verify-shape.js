// The verifier's first pass (V001): every node is an object of a known kind with the
// fields that kind has, so the later rules can read it without guarding each field.
// Spans are not checked here; they are V011.

/**
 * What a field holds: an expression, an optional one (`expr?`), one or null (`expr|null`),
 * a list of expressions or statements, a record of expressions, a place, a type, strings
 * (effects), or a JavaScript primitive.
 * @typedef {"expr" | "expr?" | "expr|null" | "exprs" | "stmts" | "record" | "place" | "type" | "strings" | "needs" | "string" | "number" | "boolean"} Field
 */

/** @type {Record<string, Record<string, Field>>} */
const EXPR = {
  num: { v: "number" }, str: { v: "string" }, bool: { v: "boolean" }, null: {}, undef: {},
  local: { name: "string" }, global: { name: "string" },
  load: { place: "place" },
  op: { op: "string", args: "exprs" },
  cond: { test: "expr", then: "expr", else: "expr" },
  call: { fn: "string", recv: "expr?", args: "exprs", effects: "strings" },
  method: { owner: "string", name: "string", recv: "expr", args: "exprs", effects: "strings" },
  helper: { name: "string", args: "exprs", effects: "strings" },
  struct: { fields: "record" },
  field: { of: "expr", name: "string" },
  index: { of: "expr", index: "expr" },
  array: { items: "exprs" },
  concat: { parts: "exprs" },
  list: {},
  vec: { items: "exprs" },
};

/** @type {Record<string, Record<string, Field>>} */
const STMT = {
  let: { name: "string", t: "type", value: "expr|null" },
  set: { name: "string", value: "expr" },
  store: { place: "place", value: "expr" },
  bump: { place: "place", value: "expr" },
  do: { value: "expr" },
  if: { test: "expr", then: "stmts", else: "stmts" },
  for: { name: "string", init: "expr", test: "expr", update: "stmts", body: "stmts", bound: "string" },
  each: { name: "string", t: "type", list: "expr", max: "number", body: "stmts" },
  push: { name: "string", value: "expr" },
  return: { value: "expr|null" },
  break: {}, continue: {},
};

/** @type {Record<string, Field>} */
const KERNEL = { name: "string", slot: "string", space: "string", returns: "type", body: "stmts", effects: "strings", needs: "needs", src: "string" };

/** @type {Record<string, Field>} */
const PLACE = { recv: "expr", owner: "string", name: "string", t: "type" };

/** The kinds a local may be, besides a parameter. */
const LOCAL_KINDS = new Set(["const", "let", "temp"]);

/** @typedef {{ message: string, path: string }} Problem */

/**
 * @param {unknown} v
 * @returns {v is Record<string, any>}
 */
const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Every V001 problem in `kernel`, outermost first. Never throws on well-founded data.
 * @param {unknown} kernel
 * @returns {Problem[]}
 */
export function shapeProblems(kernel) {
  /** @type {Problem[]} */
  const out = [];
  if (!isObject(kernel) || kernel.ir !== "kernel") return [{ message: `This is not a kernel: its ir is ${isObject(kernel) ? JSON.stringify(kernel.ir) : "missing"}.`, path: "" }];
  fields(kernel, KERNEL, "", out);
  for (const key of ["params", "locals"]) {
    const ls = kernel[key];
    if (!Array.isArray(ls)) { out.push({ message: `A kernel's ${key} is a list.`, path: key }); continue; }
    ls.forEach((l, i) => {
      const path = `${key}[${i}]`;
      if (!isObject(l) || typeof l.name !== "string" || !isType(l.t)) { out.push({ message: "A local has a name and a type.", path }); return; }
      if (key === "params" ? l.kind !== "param" : !LOCAL_KINDS.has(l.kind)) out.push({ message: `A ${key === "params" ? "parameter's kind is param" : "local's kind is const, let or temp"}, not ${JSON.stringify(l.kind)}.`, path });
    });
  }
  return out;
}

/** @param {unknown} t */
const isType = (t) => typeof t === "string" || isObject(t);

/**
 * Checks `node`'s fields against `spec`, recursing into child nodes.
 * @param {Record<string, any>} node
 * @param {Record<string, Field>} spec
 * @param {string} path
 * @param {Problem[]} out
 */
function fields(node, spec, path, out) {
  for (const [key, f] of Object.entries(spec)) field(node[key], f, path ? `${path}.${key}` : key, out);
}

/**
 * @param {unknown} v
 * @param {Field} f
 * @param {string} path
 * @param {Problem[]} out
 */
function field(v, f, path, out) {
  const bad = (/** @type {string} */ what) => out.push({ message: `This is ${what}, not ${v === undefined ? "missing" : JSON.stringify(v) ?? typeof v}.`, path });
  switch (f) {
    case "expr": return expr(v, path, out);
    case "expr?": if (v !== undefined) expr(v, path, out); return;
    case "expr|null": if (v !== null) expr(v, path, out); return;
    case "exprs": if (!Array.isArray(v)) return bad("a list of expressions"); v.forEach((x, i) => expr(x, `${path}[${i}]`, out)); return;
    case "stmts": if (!Array.isArray(v)) return bad("a list of statements"); v.forEach((x, i) => stmt(x, `${path}[${i}]`, out)); return;
    case "record": if (!isObject(v)) return bad("a record of expressions"); for (const [k, x] of Object.entries(v)) expr(x, `${path}.${k}`, out); return;
    case "place":
      if (!isObject(v)) return bad("a place");
      fields(v, PLACE, path, out);
      if (v.store !== undefined && !(isObject(v.store) && typeof v.store.type === "string")) out.push({ message: "A place's store rule names its type.", path: `${path}.store` });
      return;
    case "type": if (!isType(v)) bad("a type"); return;
    case "needs":
      if (!Array.isArray(v) || !v.every((n) => isObject(n) && typeof n.need === "string" && Array.isArray(n.span) && (n.via === undefined || typeof n.via === "string"))) bad("a list of needs, each { need, span, via? }");
      return;
    case "strings": if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) bad("a list of effects"); return;
    default: if (typeof v !== f) bad(`a ${f}`);
  }
}

/**
 * @param {unknown} e
 * @param {string} path
 * @param {Problem[]} out
 */
function expr(e, path, out) {
  if (!isObject(e) || !Object.hasOwn(EXPR, e.k)) { out.push({ message: `This is not an expression: its kind is ${isObject(e) ? JSON.stringify(e.k) : JSON.stringify(e) ?? "missing"}.`, path }); return; }
  if (!isType(e.t)) out.push({ message: "An expression has a type.", path: `${path}.t` });
  fields(e, EXPR[e.k], path, out);
}

/**
 * @param {unknown} s
 * @param {string} path
 * @param {Problem[]} out
 */
function stmt(s, path, out) {
  if (!isObject(s) || !Object.hasOwn(STMT, s.k)) { out.push({ message: `This is not a statement: its kind is ${isObject(s) ? JSON.stringify(s.k) : JSON.stringify(s) ?? "missing"}.`, path }); return; }
  field(s.effects, "strings", `${path}.effects`, out);
  fields(s, STMT[s.k], path, out);
}
