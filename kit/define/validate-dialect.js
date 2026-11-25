// defineDialect's checks: every problem in a Dialect definition, collected (D001–D008, D011, D013, D020; D012,
// D021 and D022, the per-slot effects checks, are effects.js's).

import { didYouMean } from "./codes.js";
import { checkKeys, checkType, checkMember, checkSignature, listed, BUILTIN_TYPES, SIGNATURE_KEYS } from "./types.js";
import { validateEffects } from "./effects.js";
import { isPlainObject, kindOf, describe } from "./tags.js";
import { parseLambda, checkSubset } from "../parse/index.js";

/** @import { Problem, TypeScope } from "./types.js" */
/** @import * as T from "./define.js" */

export const DIALECT_KEYS = Object.freeze(["name", "numberType", "types", "spaces", "objects", "globals", "intrinsics", "library", "conversions", "list", "queries", "targets", "slots", "constants", "environment", "text", "params", "helpers"]);
/** What `constants.calls` may say: a constant calls nothing, or pure helpers. */
export const CONSTANT_CALLS = Object.freeze(["none", "pure"]);
const DIALECT_REQUIRED = Object.freeze(["name", "numberType", "spaces", "targets", "slots"]);
const INTRINSIC_KEYS = Object.freeze(["params", "returns", "numeric", "componentwise", "ref", "spell", "minArgs", "rest"]);
const QUERIES = Object.freeze(["filter", "find", "some", "every", "reduce"]);
/** Conventions the kit makes (units), or that lowering reads specially (methods). */
export const KIT_CONVENTIONS = Object.freeze(["helper", "const", "method"]);

/**
 * Parses a Runtime Subset source: a lambda, or (`expression`) a constant's initializer.
 * @param {string} src @param {boolean} expression
 */
export function parseSource(src, expression) {
  const text = expression ? `() => (${src}\n)` : src;
  const r = parseLambda(text);
  if (!r.ok) return { ast: null, diagnostics: r.diagnostics };
  return { ast: r.ast, diagnostics: checkSubset(r.ast, text) };
}

/**
 * The entries of an optional table key: [] when absent, and a D011 when it is not an object.
 * @param {Record<string, unknown>} def @param {string} key @param {Problem[]} out
 * @returns {Array<[string, any]>}
 */
function table(def, key, out) {
  const v = def[key];
  if (v === undefined) return [];
  if (!isPlainObject(v)) { out.push({ code: "D011", path: [key], message: `${key} must be an object of named entries, not ${describe(v)}.`, tip: `write ${key}: { name: … }` }); return []; }
  return Object.entries(v);
}

/**
 * A nominal scalar in types: backed by "f64", with an optional { note } saying what the number holds.
 * @param {string} n @param {T.ScalarTag} v @param {Array<string | number>} path @param {Problem[]} out
 */
function checkScalar(n, v, path, out) {
  if (v.of !== "f64") out.push({ code: "D002", path, message: `scalar ${n}: its backing type ${describe(v.of)} must be "f64".`, tip: `${n}: scalar("f64", { note: "…" })` });
  const o = v.options;
  if (o !== undefined && !(isPlainObject(o) && Object.keys(o).every((k) => k === "note") && (o.note === undefined || typeof o.note === "string"))) {
    out.push({ code: "D011", path, message: `scalar ${n}: its options must be { note }, a string saying what the number holds.`, tip: `${n}: scalar("f64", { note: "milliseconds since 1970-01-01, UTC" })` });
  }
}

/**
 * A Dialect's `params`: the object a lambda reads the Program's params through, the name it reads it by (for a
 * message), and the members that exist only at run time, which build-time code may not read (B014).
 * @param {unknown} p @param {Array<[string, unknown]>} objects @param {Problem[]} out
 */
function checkParams(p, objects, out) {
  const tip = `params: { object: "Params", name: "$", runtime: ["t"] }`;
  if (!isPlainObject(p)) { out.push({ code: "D011", path: ["params"], message: `params must be { object, name, runtime? }, not ${describe(p)}.`, tip }); return; }
  checkKeys(p, ["object", "name", "runtime"], ["object", "name"], ["params"], "params", out);
  const obj = objects.find(([n]) => n === p.object);
  if (!obj) out.push({ code: "D011", path: ["params", "object"], message: `params.object ${describe(p.object)} is not one of the Dialect's objects.${typeof p.object === "string" ? didYouMean(p.object, objects.map(([n]) => n)) : ""}`, tip });
  if ("name" in p && !(typeof p.name === "string" && /^[A-Za-z_$][\w$]*$/.test(p.name))) out.push({ code: "D011", path: ["params", "name"], message: `params.name must be the name a lambda reads the params by, an identifier, not ${describe(p.name)}.`, tip: `name: "$"` });
  if (p.runtime === undefined) return;
  const members = obj && isPlainObject(obj[1]) && isPlainObject(obj[1].members) ? Object.keys(obj[1].members) : [];
  if (!Array.isArray(p.runtime) || !p.runtime.every((m) => typeof m === "string")) out.push({ code: "D011", path: ["params", "runtime"], message: "params.runtime must be a list of the object's member names.", tip });
  else for (const m of p.runtime) if (obj && !members.includes(m)) out.push({ code: "D011", path: ["params", "runtime"], message: `params.runtime names '${m}', which is not a member of ${String(p.object)}.${didYouMean(m, members)}`, tip: `declare it in objects.${String(p.object)}.members, or leave it out` });
}

/**
 * @param {unknown} def
 * @returns {Problem[]}
 */
export function validateDialect(def) {
  /** @type {Problem[]} */
  const out = [];
  if (!isPlainObject(def)) return [{ code: "D011", path: [], message: `defineDialect takes one object, not ${describe(def)}.`, tip: "write defineDialect({ name, numberType, spaces, targets, slots, … })" }];
  checkKeys(def, DIALECT_KEYS, DIALECT_REQUIRED, [], "defineDialect", out);
  if ("name" in def && !(typeof def.name === "string" && def.name.length > 0)) out.push({ code: "D011", path: ["name"], message: "name must be a non-empty string.", tip: `name: "data"` });
  if ("numberType" in def && def.numberType !== "f32" && def.numberType !== "f64") out.push({ code: "D002", path: ["numberType"], message: `numberType must be "f32" or "f64", not ${describe(def.numberType)}.`, tip: `numberType: "f64"` });

  const types = table(def, "types", out), spaces = table(def, "spaces", out), objects = table(def, "objects", out);
  const globals = table(def, "globals", out), intrinsics = table(def, "intrinsics", out), library = table(def, "library", out);
  const targets = table(def, "targets", out), slots = table(def, "slots", out), conversions = table(def, "conversions", out);
  const list = table(def, "list", out);
  if (def.queries !== undefined && !(Array.isArray(def.queries) && def.queries.every((q) => QUERIES.includes(q)))) out.push({ code: "D011", path: ["queries"], message: `queries must be a list of ${listed([...QUERIES])}.`, tip: `queries: ["filter"]` });
  if (def.constants !== undefined) {
    if (!isPlainObject(def.constants)) out.push({ code: "D011", path: ["constants"], message: `constants must be { calls }, not ${describe(def.constants)}.`, tip: `constants: { calls: "pure" }` });
    else {
      checkKeys(def.constants, ["calls"], ["calls"], ["constants"], "constants", out);
      if ("calls" in def.constants && !CONSTANT_CALLS.includes(/** @type {any} */ (def.constants.calls))) out.push({ code: "D011", path: ["constants", "calls"], message: `constants.calls must be ${listed([...CONSTANT_CALLS])}, not ${describe(def.constants.calls)}.`, tip: `calls: "pure" lets a constant call a pure helper` });
    }
  }
  // Every Dialect has a text view: what a model reads of its screen and state (architecture synthesis §3.3).
  if (typeof def.text !== "function") out.push({ code: "D020", path: ["text"], message: def.text === undefined ? "a Dialect needs text(state), its text view: its screen and state as characters, sized for a model." : `text must be a function of the Dialect's state, not ${describe(def.text)}.`, tip: "text(state) { return `…`; }, where state is what your Dialect's host shows (fields: a frame; data: a table)" });
  if (def.environment !== undefined && typeof def.environment !== "function") out.push({ code: "D011", path: ["environment"], message: "environment must be a function of the program record.", tip: "environment(program) { return { objects, globals }; }" });

  if (def.params !== undefined) checkParams(def.params, objects, out);

  /** @type {TypeScope} */
  const scope = { types: new Set(), objects: new Set(objects.map(([n]) => n)) };
  const spaceNames = spaces.map(([n]) => n);

  for (const [n, v] of types) {
    const path = ["types", n];
    // a type named like a built-in or a type variable would take that name over everywhere it is written
    if ([...BUILTIN_TYPES, "unknown"].includes(n) || /^[A-Z]$/.test(n)) {
      out.push({ code: "D007", path, message: `'${n}' is ${/^[A-Z]$/.test(n) ? "a type variable" : "a built-in type"}; a type named so would take its place everywhere it is written.`, tip: `rename it (${n === "T" || /^[A-Z]$/.test(n) ? "one capital letter is a type variable; use a longer name" : `the built-ins are ${[...BUILTIN_TYPES, "unknown"].join(", ")}`})` });
      continue;
    }
    if (kindOf(v) === "scalar") { scope.types.add(n); checkScalar(n, /** @type {T.ScalarTag} */ (v), path, out); continue; }
    if (kindOf(v) !== "vector") { out.push({ code: "D011", path, message: `types.${n} is ${describe(v)}; types holds vectors and scalars.`, tip: `${n}: vector(2, "f32"), or ${n}: scalar("f64", { note: "…" })` }); continue; }
    scope.types.add(n);
    if (!(v.n === 2 || v.n === 3 || v.n === 4)) out.push({ code: "D011", path, message: `vector ${n} has ${describe(v.n)} components; a vector has 2, 3 or 4.`, tip: `vector(3, "f32")` });
    if (v.elem !== "f32" && v.elem !== "f64") out.push({ code: "D002", path, message: `vector ${n}: its component type ${describe(v.elem)} must be "f32" or "f64".`, tip: `vector(2, "f32")` });
    if (v.options !== undefined) {
      const comps = ["x", "y", "z", "w"].slice(0, typeof v.n === "number" ? v.n : 4);
      const a = isPlainObject(v.options) ? v.options.aliases : undefined;
      if (!isPlainObject(v.options) || Object.keys(v.options).some((k) => k !== "aliases") || !(isPlainObject(a) && Object.values(a).every((c) => typeof c === "string" && comps.includes(c)))) {
        out.push({ code: "D011", path, message: `vector ${n}: its options must be { aliases }, each alias naming one of its components (${comps.join(", ")}).`, tip: `vector(3, "f32", { aliases: { r: "x", g: "y", b: "z" } })` });
      }
    }
  }

  // Whether a space is pure or an instance space is D012, in effects.js.
  for (const [n, v] of spaces) if (isPlainObject(v)) checkKeys(v, ["pure", "instance"], [], ["spaces", n], `space '${n}'`, out);

  for (const [n, v] of objects) {
    const path = ["objects", n];
    if (!isPlainObject(v)) { out.push({ code: "D011", path, message: `object '${n}' must be { label, members }.`, tip: `${n}: { label: "…", members: { … } }` }); continue; }
    checkKeys(v, ["label", "members", "call", "effects"], [], path, `object '${n}'`, out);
    if (v.label !== undefined && typeof v.label !== "string") out.push({ code: "D011", path: [...path, "label"], message: `object '${n}': label must be a string.`, tip: `label: "the uniforms (u)"` });
    if (v.call !== undefined) {
      if (!isPlainObject(v.call)) out.push({ code: "D011", path: [...path, "call"], message: `object '${n}': call must be { params, returns }, the signature of calling the object.`, tip: `call: { params: [], returns: "f64" }` });
      else { checkKeys(v.call, SIGNATURE_KEYS, ["params", "returns"], [...path, "call"], `object '${n}''s call`, out); checkSignature(v.call, scope, [...path, "call"], `object '${n}''s call`, out); }
    }
    if (v.members === undefined) continue;
    if (!isPlainObject(v.members)) { out.push({ code: "D011", path: [...path, "members"], message: `object '${n}': members must be an object.`, tip: `members: { t: "f32" }` }); continue; }
    for (const [m, t] of Object.entries(v.members)) checkMember(t, scope, [...path, "members", m], `member ${n}.${m}`, out, { effects: true });
  }

  for (const [n, t] of globals) checkType(t, scope, {}, ["globals", n], `global '${n}'`, out);
  for (const [n, t] of list) checkMember(t, scope, ["list", n], `list member '${n}'`, out);
  for (const [n, t] of conversions) if (t !== "f32" && t !== "f64") out.push({ code: "D002", path: ["conversions", n], message: `conversion '${n}' gives ${describe(t)}; a conversion gives "f32" or "f64".`, tip: `${n}: "f32"` });

  const targetNames = targets.map(([n]) => n);
  /** @type {string[]} */
  const spelled = [];
  for (const [n, v] of targets) {
    const path = ["targets", n];
    if (!isPlainObject(v)) { out.push({ code: "D011", path, message: `target '${n}' must be { accepts, compare }.`, tip: `${n}: { accepts: "*", compare: exact() }` }); continue; }
    checkKeys(v, ["accepts", "compare"], ["accepts", "compare"], path, `target '${n}'`, out);
    const acc = v.accepts;
    if (acc === "*") spelled.push(n);
    else if (Array.isArray(acc)) {
      if (acc.length > 0) spelled.push(n);
      for (const s of acc) if (typeof s !== "string" || !spaceNames.includes(s)) out.push({ code: "D006", path: [...path, "accepts"], message: `target '${n}' accepts ${describe(s)}, which is not a declared space.${typeof s === "string" ? didYouMean(s, spaceNames) : ""}`, tip: `accept "*" or declared spaces only (${listed(spaceNames)})` });
    } else if (acc !== undefined) out.push({ code: "D006", path: [...path, "accepts"], message: `target '${n}': accepts must be "*" or a list of declared spaces, not ${describe(acc)}.`, tip: `accepts: "*"` });
    const c = v.compare, k = kindOf(c);
    const figure = k === "tolerance" ? /** @type {any} */ (c).figure : undefined;
    if (c !== undefined && !(k === "exact" || (k === "tolerance" && typeof figure === "number" && Number.isFinite(figure) && figure > 0))) {
      out.push({ code: "D008", path: [...path, "compare"], message: `target '${n}': compare is ${k === "tolerance" ? `tolerance(${describe(figure)})` : describe(c)}; it must be exact() or tolerance(figure) with a positive figure.`, tip: "compare: exact() or compare: tolerance(1e-3)" });
    }
  }

  for (const [n, v] of intrinsics) {
    const path = ["intrinsics", n];
    if (!isPlainObject(v)) { out.push({ code: "D004", path, message: `intrinsic '${n}' must be an object with params, returns, ref and spell.`, tip: `${n}: { params: ["f32"], returns: "f32", ref: (x) => …, spell: { … } }` }); continue; }
    // effects on an intrinsic is D021 (an intrinsic is pure), not an unknown key
    checkKeys(v, [...INTRINSIC_KEYS, "effects"], [], path, `intrinsic '${n}'`, out);
    const missing = ["ref", "params", "returns"].filter((key) => !(key in v));
    if (missing.length) out.push({ code: "D004", path, message: `intrinsic '${n}' has no ${missing.join(", ")}.`, tip: `add ${missing.join(", ")}` });
    if ("ref" in v && typeof v.ref !== "function") out.push({ code: "D004", path: [...path, "ref"], message: `intrinsic '${n}': ref must be a function (the reference implementation), not ${describe(v.ref)}.`, tip: "ref: (x) => …" });
    checkSignature(v, scope, path, `intrinsic '${n}'`, out);
    if (v.numeric !== undefined && v.numeric !== "number" && v.numeric !== "vector") out.push({ code: "D011", path: [...path, "numeric"], message: `intrinsic '${n}': numeric must be "number" or "vector", not ${describe(v.numeric)}.`, tip: `numeric: "number"` });
    if (v.componentwise !== undefined && typeof v.componentwise !== "boolean") out.push({ code: "D011", path: [...path, "componentwise"], message: `intrinsic '${n}': componentwise must be true or false.`, tip: "componentwise: true" });
    const spell = isPlainObject(v.spell) ? v.spell : {};
    if (v.spell !== undefined && !isPlainObject(v.spell)) out.push({ code: "D003", path: [...path, "spell"], message: `intrinsic '${n}': spell must be an object with one entry per target.`, tip: `spell: { ${targetNames.map((t) => `${t}: "…($0)"`).join(", ")} }` });
    for (const [t, s] of Object.entries(spell)) {
      if (isPlainObject(def.targets) && !targetNames.includes(t)) out.push({ code: "D001", path: [...path, "spell", t], message: `intrinsic '${n}' spells '${t}', which is not a target.${didYouMean(t, targetNames)}`, tip: `spell only declared targets (${listed(targetNames)})` });
      if (typeof s === "string") continue;
      if (isPlainObject(s)) {
        checkKeys(s, ["call", "prelude"], ["call"], [...path, "spell", t], `intrinsic '${n}''s ${t} spelling`, out);
        if (("call" in s && typeof s.call !== "string") || ("prelude" in s && typeof s.prelude !== "string")) out.push({ code: "D011", path: [...path, "spell", t], message: `intrinsic '${n}': the ${t} spelling's call and prelude must be strings.`, tip: `${t}: { call: "f($0)", prelude: "…" }` });
      } else out.push({ code: "D003", path: [...path, "spell", t], message: `intrinsic '${n}': the ${t} spelling must be a string or { call, prelude }, not ${describe(s)}.`, tip: `${t}: "f($0)"` });
    }
    const unspelled = spelled.filter((t) => !(t in spell));
    if (unspelled.length) out.push({ code: "D003", path: [...path, "spell"], message: `intrinsic '${n}' has no spelling for ${listed(unspelled)}; every target that accepts a space must spell every intrinsic.`, tip: `add ${unspelled.map((t) => `${t}: "…($0)"`).join(", ")} to its spell` });
  }

  for (const [n, v] of library) {
    const path = ["library", n];
    const keys = isPlainObject(v) ? Object.keys(v) : [];
    const kind = keys.length === 1 && (keys[0] === "fn" || keys[0] === "const") ? keys[0] : null;
    const src = kind && isPlainObject(v) ? v[kind] : undefined;
    if (!kind || typeof src !== "string") { out.push({ code: "D013", path, message: `library entry '${n}' must be { fn: src } or { const: src }, with the source as a string.`, tip: `${n}: { fn: "(x) => …" } or ${n}: { const: "…" }` }); continue; }
    const errors = parseSource(src, kind === "const").diagnostics.filter((d) => d.severity === "error");
    if (errors.length) out.push({ code: "D013", path: [...path, kind], message: `library ${kind} '${n}' does not parse in the Runtime Subset: ${errors.map((d) => `${d.code} ${d.message}`).join("; ")}`, tip: errors[0].tip || "fix the source text" });
  }

  for (const [n, v] of slots) {
    const path = ["slots", n];
    if (KIT_CONVENTIONS.includes(n)) { out.push({ code: "D007", path, message: `slot convention '${n}' is one the kit makes${n === "method" ? " (lowering reads it as a program method)" : " for unit slots"}.`, tip: `rename the convention; .fn and .const units get their conventions from the kit` }); continue; }
    if (typeof v === "function") continue;
    if (!isPlainObject(v)) { out.push({ code: "D011", path, message: `slot convention '${n}' must be { params, returns, space } or a function (ref, program, state) => convention.`, tip: `${n}: { params: [], returns: "infer", space: "${spaceNames[0] ?? "…"}" }` }); continue; }
    checkKeys(v, ["params", "returns", "space", "may"], ["params", "returns", "space"], path, `slot convention '${n}'`, out);
    if (v.params !== undefined && !Array.isArray(v.params)) out.push({ code: "D011", path: [...path, "params"], message: `slot convention '${n}': params must be a list of types.`, tip: `params: ["vec2"]` });
    else if (Array.isArray(v.params)) v.params.forEach((t, i) => checkType(t, scope, {}, [...path, "params"], `slot convention '${n}', param ${i + 1}`, out));
    if (v.returns !== undefined) checkType(v.returns, scope, { infer: true }, [...path, "returns"], `slot convention '${n}', returns`, out);
    if (v.space !== undefined && (typeof v.space !== "string" || !spaceNames.includes(v.space))) out.push({ code: "D005", path: [...path, "space"], message: `slot convention '${n}' runs in space ${describe(v.space)}, which is not declared.${typeof v.space === "string" ? didYouMean(v.space, spaceNames) : ""}`, tip: `space: one of ${listed(spaceNames)}, or declare the space in spaces` });
  }

  // Two namespaces: names a lambda reads (vector constructors, intrinsics, globals, the Library, conversions)
  // and type names (vectors, objects, and intrinsics, which become callable objects). A global may share its
  // object's name, as `globals: { Math: "Math" }` does.
  const groups = /** @type {Array<[string, Array<[string, Array<[string, unknown]>]>]>} */ ([
    ["a lambda reaches each of these by one name", [["types", types], ["intrinsics", intrinsics], ["globals", globals], ["library", library], ["conversions", conversions]]],
    ["type names share one namespace", [["types", types], ["intrinsics", intrinsics], ["objects", objects]]],
  ]);
  for (const [why, kinds] of groups) {
    /** @type {Map<string, string>} */
    const seen = new Map();
    for (const [kind, entries] of kinds) {
      for (const [n] of entries) {
        const first = seen.get(n);
        if (first && !out.some((p) => p.code === "D007" && p.path[1] === n)) out.push({ code: "D007", path: [kind, n], message: `'${n}' is declared in both ${first} and ${kind}.`, tip: `rename one of them; ${why}` });
        else seen.set(n, kind);
      }
    }
  }
  out.push(...validateEffects(def));
  return out;
}
