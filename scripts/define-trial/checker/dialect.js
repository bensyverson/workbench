// defineDialect's checks: D001–D008, D011–D013 as rules.md defines them, every violation collected.

import { checkKeys, checkType, describe, didYouMean, kindOf, listed } from "./common.js";
import { isPlainObject } from "./tags.js";
import { parseRuntime } from "./lambda.js";

/** @import { Problem } from "./session.js" */
/** @import { TypeScope } from "./common.js" */

export const DIALECT_KEYS = Object.freeze(["name", "numberType", "types", "spaces", "objects", "globals", "intrinsics", "library", "conversions", "list", "queries", "targets", "slots", "environment"]);
export const DIALECT_REQUIRED = Object.freeze(["name", "numberType", "spaces", "targets", "slots"]);
const INTRINSIC_KEYS = Object.freeze(["params", "returns", "numeric", "componentwise", "ref", "spell", "minArgs", "rest"]);
const SIGNATURE_KEYS = Object.freeze(["params", "returns", "minArgs", "rest"]);

/**
 * The entries of an optional table key: [] when absent, and a D011 when it is not an object.
 * @param {Record<string, unknown>} def
 * @param {string} key
 * @param {Problem[]} out
 * @returns {Array<[string, unknown]>}
 */
function table(def, key, out) {
  const v = def[key];
  if (v === undefined) return [];
  if (!isPlainObject(v)) {
    out.push({ code: "D011", path: [key], message: `${key} must be an object of named entries, not ${describe(v)}.`, fix: `write ${key}: { name: … }` });
    return [];
  }
  return Object.entries(v);
}

/**
 * Every problem in a Dialect definition.
 * @param {unknown} def
 * @returns {Problem[]}
 */
export function validateDialect(def) {
  /** @type {Problem[]} */
  const out = [];
  if (!isPlainObject(def)) {
    out.push({ code: "D011", path: [], message: `defineDialect takes one object, not ${describe(def)}.`, fix: "write defineDialect({ name, numberType, spaces, targets, slots, … })" });
    return out;
  }
  checkKeys(def, DIALECT_KEYS, DIALECT_REQUIRED, [], "defineDialect", out);
  if ("name" in def && !(typeof def.name === "string" && def.name.length > 0)) out.push({ code: "D011", path: ["name"], message: "name must be a non-empty string.", fix: `name: "data"` });
  if ("numberType" in def && def.numberType !== "f32" && def.numberType !== "f64") out.push({ code: "D002", path: ["numberType"], message: `numberType must be "f32" or "f64", not ${describe(def.numberType)}.`, fix: `numberType: "f64"` });

  const types = table(def, "types", out), spaces = table(def, "spaces", out), objects = table(def, "objects", out);
  const globals = table(def, "globals", out), intrinsics = table(def, "intrinsics", out), library = table(def, "library", out);
  const targets = table(def, "targets", out), slots = table(def, "slots", out);
  table(def, "conversions", out);
  table(def, "list", out);
  if (def.queries !== undefined && !Array.isArray(def.queries)) out.push({ code: "D011", path: ["queries"], message: "queries must be a list.", fix: "queries: [ … ]" });
  if (def.environment !== undefined && typeof def.environment !== "function") out.push({ code: "D011", path: ["environment"], message: "environment must be a function of the program record.", fix: "environment(program) { return { objects, globals }; }" });

  /** @type {TypeScope} */
  const scope = { vectors: new Set(types.map(([n]) => n)), objects: new Set(objects.map(([n]) => n)) };
  const spaceNames = spaces.map(([n]) => n);

  for (const [n, v] of types) {
    const path = ["types", n];
    if (kindOf(v) !== "vector") { out.push({ code: "D011", path, message: `types.${n} is ${describe(v)}; types holds vectors only.`, fix: `${n}: vector(2, "f32")` }); continue; }
    const vec = /** @type {import("./tags.js").VectorTag} */ (v);
    if (!(vec.n === 2 || vec.n === 3 || vec.n === 4)) out.push({ code: "D011", path, message: `vector ${n} has ${describe(vec.n)} components; a vector has 2, 3 or 4.`, fix: `vector(3, "f32")` });
    if (vec.elem !== "f32" && vec.elem !== "f64") out.push({ code: "D002", path, message: `vector ${n}: its component type ${describe(vec.elem)} must be "f32" or "f64".`, fix: `vector(${typeof vec.n === "number" ? vec.n : 2}, "f32")` });
    if (vec.options !== undefined) {
      if (!isPlainObject(vec.options)) out.push({ code: "D011", path, message: `vector ${n}: its options must be { aliases: { … } }.`, fix: `vector(3, "f32", { aliases: { r: "x", g: "y", b: "z" } })` });
      else {
        checkKeys(vec.options, ["aliases"], [], path, `vector ${n}'s options`, out);
        const a = vec.options.aliases;
        const comps = ["x", "y", "z", "w"].slice(0, typeof vec.n === "number" ? vec.n : 4);
        if (a !== undefined && !(isPlainObject(a) && Object.values(a).every((c) => typeof c === "string" && comps.includes(c)))) out.push({ code: "D011", path, message: `vector ${n}: each alias must name one of its components (${comps.join(", ")}).`, fix: `aliases: { r: "x", g: "y", b: "z" }` });
      }
    }
  }

  for (const [n, v] of spaces) {
    const path = ["spaces", n];
    if (!isPlainObject(v)) { out.push({ code: "D012", path, message: `space '${n}' must be { pure: true }.`, fix: `${n}: { pure: true }` }); continue; }
    checkKeys(v, ["pure"], [], path, `space '${n}'`, out);
    if (v.pure !== true) out.push({ code: "D012", path: [...path, "pure"], message: `space '${n}' is not pure; every space must be pure in this draft (effects are not part of the API yet).`, fix: `${n}: { pure: true }, and refuse or report what needed the effect` });
  }

  for (const [n, v] of objects) {
    const path = ["objects", n];
    if (!isPlainObject(v)) { out.push({ code: "D011", path, message: `object '${n}' must be { label, members }.`, fix: `${n}: { label: "…", members: { … } }` }); continue; }
    checkKeys(v, ["label", "members"], [], path, `object '${n}'`, out);
    if (v.members === undefined) continue;
    if (!isPlainObject(v.members)) { out.push({ code: "D011", path: [...path, "members"], message: `object '${n}': members must be an object.`, fix: `members: { t: "f32" }` }); continue; }
    for (const [m, t] of Object.entries(v.members)) checkMember(t, scope, [...path, "members", m], `member ${n}.${m}`, out);
  }

  for (const [n, t] of globals) checkType(t, scope, {}, ["globals", n], `global '${n}'`, out);

  const targetNames = targets.map(([n]) => n);
  /** @type {string[]} */
  const spelled = [];
  for (const [n, v] of targets) {
    const path = ["targets", n];
    if (!isPlainObject(v)) { out.push({ code: "D011", path, message: `target '${n}' must be { accepts, compare }.`, fix: `${n}: { accepts: "*", compare: exact() }` }); continue; }
    checkKeys(v, ["accepts", "compare"], [], path, `target '${n}'`, out);
    const acc = v.accepts;
    if (acc === "*") spelled.push(n);
    else if (Array.isArray(acc)) {
      if (acc.length > 0) spelled.push(n);
      for (const s of acc) {
        if (typeof s !== "string" || !spaceNames.includes(s)) out.push({ code: "D006", path: [...path, "accepts"], message: `target '${n}' accepts ${describe(s)}, which is not a declared space.${typeof s === "string" ? didYouMean(s, spaceNames) : ""}`, fix: `accept "*" or declared spaces only (${listed(spaceNames)}), or declare the space` });
      }
    } else out.push({ code: "D006", path: [...path, "accepts"], message: `target '${n}': accepts must be "*" or a list of declared spaces, not ${describe(acc)}.`, fix: `accepts: "*" or accepts: [${spaceNames.map((s) => `"${s}"`).join(", ")}]` });
    const c = v.compare, k = kindOf(c);
    const figure = k === "tolerance" ? /** @type {import("./tags.js").ToleranceTag} */ (c).figure : undefined;
    if (!(k === "exact" || (k === "tolerance" && typeof figure === "number" && Number.isFinite(figure) && figure > 0))) {
      out.push({ code: "D008", path: [...path, "compare"], message: `target '${n}': compare is ${k === "tolerance" ? `tolerance(${describe(figure)})` : describe(c)}; it must be exact() or tolerance(figure) with a positive figure.`, fix: "compare: exact() or compare: tolerance(1e-3)" });
    }
  }

  for (const [n, v] of intrinsics) {
    const path = ["intrinsics", n];
    if (!isPlainObject(v)) { out.push({ code: "D004", path, message: `intrinsic '${n}' must be an object with params, returns, ref and spell.`, fix: `${n}: { params: ["f32"], returns: "f32", ref: (x) => …, spell: { … } }` }); continue; }
    checkKeys(v, INTRINSIC_KEYS, [], path, `intrinsic '${n}'`, out);
    const missing = ["ref", "params", "returns"].filter((k) => !(k in v));
    if (missing.length) out.push({ code: "D004", path, message: `intrinsic '${n}' has no ${missing.join(", ")}.`, fix: `add ${missing.map((k) => ({ ref: "ref: (…) => … (the reference implementation)", params: `params: ["f32"]`, returns: `returns: "f32"` })[k]).join(", ")}` });
    if ("ref" in v && typeof v.ref !== "function") out.push({ code: "D004", path: [...path, "ref"], message: `intrinsic '${n}': ref must be a function (the reference implementation), not ${describe(v.ref)}.`, fix: "ref: (x) => …" });
    checkSignature(v, scope, path, `intrinsic '${n}'`, out);
    if (v.numeric !== undefined && v.numeric !== "number" && v.numeric !== "vector") out.push({ code: "D011", path: [...path, "numeric"], message: `intrinsic '${n}': numeric must be "number" or "vector", not ${describe(v.numeric)}.`, fix: `numeric: "number"` });
    if (v.componentwise !== undefined && typeof v.componentwise !== "boolean") out.push({ code: "D011", path: [...path, "componentwise"], message: `intrinsic '${n}': componentwise must be true or false.`, fix: "componentwise: true" });
    const spell = isPlainObject(v.spell) ? v.spell : {};
    if (v.spell !== undefined && !isPlainObject(v.spell)) out.push({ code: "D003", path: [...path, "spell"], message: `intrinsic '${n}': spell must be an object with one entry per target.`, fix: `spell: { ${targetNames.map((t) => `${t}: "…($0)"`).join(", ")} }` });
    for (const [t, s] of Object.entries(spell)) {
      if (!targetNames.includes(t)) out.push({ code: "D001", path: [...path, "spell", t], message: `intrinsic '${n}' spells '${t}', which is not a target.${didYouMean(t, targetNames)}`, fix: `spell only declared targets (${listed(targetNames)})` });
      if (typeof s === "string") continue;
      if (isPlainObject(s)) {
        checkKeys(s, ["call", "prelude"], ["call"], [...path, "spell", t], `intrinsic '${n}''s ${t} spelling`, out);
        if ("call" in s && typeof s.call !== "string") out.push({ code: "D011", path: [...path, "spell", t], message: `intrinsic '${n}': the ${t} spelling's call must be a string.`, fix: `${t}: { call: "f($0)", prelude: "…" }` });
      } else out.push({ code: "D003", path: [...path, "spell", t], message: `intrinsic '${n}': the ${t} spelling must be a string or { call, prelude }, not ${describe(s)}.`, fix: `${t}: "f($0)"` });
    }
    const unspelled = spelled.filter((t) => !(t in spell));
    if (unspelled.length) out.push({ code: "D003", path: [...path, "spell"], message: `intrinsic '${n}' has no spelling for ${unspelled.map((t) => `'${t}'`).join(", ")}; every target that accepts a space must spell every intrinsic.`, fix: `add ${unspelled.map((t) => `${t}: "…($0)"`).join(", ")} to its spell` });
  }

  for (const [n, v] of library) {
    const path = ["library", n];
    const keys = isPlainObject(v) ? Object.keys(v) : [];
    const kind = keys.length === 1 && (keys[0] === "fn" || keys[0] === "const") ? keys[0] : null;
    const src = kind && isPlainObject(v) ? v[kind] : undefined;
    if (!kind || typeof src !== "string") {
      out.push({ code: "D013", path, message: `library entry '${n}' must be { fn: src } or { const: src }, with the source as a string; it is ${describe(v)}${keys.length ? ` with keys ${listed(keys)}` : ""}.`, fix: `${n}: { fn: "(x) => …" } or ${n}: { const: "…" }` });
      continue;
    }
    const r = parseRuntime(src, { expression: kind === "const" });
    const errors = r.diagnostics.filter((d) => d.severity === "error");
    if (errors.length) out.push({ code: "D013", path: [...path, kind], message: `library ${kind} '${n}' does not parse in the Runtime Subset: ${errors.map((d) => `${d.code} ${d.message}`).join("; ")}`, fix: errors[0].tip || "fix the source text" });
  }

  for (const [n, v] of slots) {
    const path = ["slots", n];
    if (typeof v === "function") continue;
    if (!isPlainObject(v)) { out.push({ code: "D011", path, message: `slot convention '${n}' must be { params, returns, space } or a function (ref, program) => convention.`, fix: `${n}: { params: ["vec2"], returns: "infer", space: "${spaceNames[0] ?? "…"}" }` }); continue; }
    checkKeys(v, ["params", "returns", "space"], ["params", "returns"], path, `slot convention '${n}'`, out);
    if (v.params !== undefined) {
      if (!Array.isArray(v.params)) out.push({ code: "D011", path: [...path, "params"], message: `slot convention '${n}': params must be a list of types.`, fix: `params: ["vec2"]` });
      else v.params.forEach((t, i) => checkType(t, scope, {}, [...path, "params"], `slot convention '${n}', param ${i + 1}`, out));
    }
    if (v.returns !== undefined) checkType(v.returns, scope, { infer: true }, [...path, "returns"], `slot convention '${n}', returns`, out);
    if (typeof v.space !== "string" || !spaceNames.includes(v.space)) out.push({ code: "D005", path: [...path, "space"], message: `slot convention '${n}' runs in ${v.space === undefined ? "no space" : `space ${describe(v.space)}`}, which is not declared.${typeof v.space === "string" ? didYouMean(v.space, spaceNames) : ""}`, fix: `space: one of ${listed(spaceNames)}, or declare the space in spaces` });
  }

  /** @type {Map<string, string>} */
  const seen = new Map();
  for (const [kind, entries] of /** @type {Array<[string, Array<[string, unknown]>]>} */ ([["intrinsics", intrinsics], ["globals", globals], ["library", library], ["objects", objects]])) {
    for (const [n] of entries) {
      const first = seen.get(n);
      if (first) out.push({ code: "D007", path: [kind, n], message: `'${n}' is declared in both ${first} and ${kind}.`, fix: `rename one of them; intrinsics, globals, library and objects share one namespace` });
      else seen.set(n, kind);
    }
  }
  return out;
}

/**
 * An object member: a type, or { value, size }, { fn: signature }, { keyed: { what, keys } }.
 * @param {unknown} t @param {TypeScope} scope @param {Array<string | number>} path @param {string} where @param {Problem[]} out
 */
function checkMember(t, scope, path, where, out) {
  if (!isPlainObject(t)) { checkType(t, scope, {}, path, where, out); return; }
  if ("value" in t) {
    checkKeys(t, ["value", "size"], [], path, where, out);
    checkType(t.value, scope, {}, path, where, out);
    if (t.size !== undefined && t.size !== true) out.push({ code: "D011", path, message: `${where}: size must be true when present.`, fix: `{ value: "f64", size: true }` });
  } else if ("fn" in t) {
    checkKeys(t, ["fn"], [], path, where, out);
    if (!isPlainObject(t.fn)) out.push({ code: "D011", path, message: `${where}: fn must be { params, returns }.`, fix: `{ fn: { params: ["f64"], returns: "f64" } }` });
    else { checkKeys(t.fn, SIGNATURE_KEYS, ["params", "returns"], [...path, "fn"], `${where}'s fn`, out); checkSignature(t.fn, scope, [...path, "fn"], where, out); }
  } else if ("keyed" in t) {
    checkKeys(t, ["keyed"], [], path, where, out);
    const k = t.keyed;
    if (!isPlainObject(k)) { out.push({ code: "D011", path, message: `${where}: keyed must be { what, keys }.`, fix: `{ keyed: { what: "column", keys: { … } } }` }); return; }
    checkKeys(k, ["what", "keys"], ["what", "keys"], [...path, "keyed"], `${where}'s keyed`, out);
    if (k.keys !== undefined && !isPlainObject(k.keys)) out.push({ code: "D011", path: [...path, "keyed", "keys"], message: `${where}: keyed.keys must be an object of signatures.`, fix: `keys: { revenue: { params: [], returns: "f64" } }` });
    else if (isPlainObject(k.keys)) {
      for (const [key, sig] of Object.entries(k.keys)) {
        const p = [...path, "keyed", "keys", key];
        if (!isPlainObject(sig)) { out.push({ code: "D011", path: p, message: `${where}: key '${key}' must be a signature { params, returns }.`, fix: `${key}: { params: [], returns: "f64" }` }); continue; }
        checkKeys(sig, SIGNATURE_KEYS, ["params", "returns"], p, `${where}, key '${key}'`, out);
        checkSignature(sig, scope, p, `${where}, key '${key}'`, out);
      }
    }
  } else {
    checkKeys(t, ["value", "size", "fn", "keyed"], [], path, where, out);
    out.push({ code: "D011", path, message: `${where} is an object without value, fn or keyed.`, fix: `write a type name, { value, size: true }, { fn: { params, returns } } or { keyed: { what, keys } }` });
  }
}

/**
 * params, returns, minArgs and rest of an intrinsic or method; type variables are allowed.
 * @param {Record<string, unknown>} sig @param {TypeScope} scope @param {Array<string | number>} path @param {string} where @param {Problem[]} out
 */
function checkSignature(sig, scope, path, where, out) {
  if (sig.params !== undefined) {
    if (!Array.isArray(sig.params)) out.push({ code: "D011", path: [...path, "params"], message: `${where}: params must be a list of types.`, fix: `params: ["f32"]` });
    else sig.params.forEach((t, i) => checkType(t, scope, { typeVars: true }, [...path, "params"], `${where}, param ${i + 1}`, out));
  }
  if (sig.returns !== undefined) checkType(sig.returns, scope, { typeVars: true }, [...path, "returns"], `${where}, returns`, out);
  if (sig.rest !== undefined) checkType(sig.rest, scope, { typeVars: true }, [...path, "rest"], `${where}, rest`, out);
  if (sig.minArgs !== undefined && !(typeof sig.minArgs === "number" && Number.isInteger(sig.minArgs) && sig.minArgs >= 0)) out.push({ code: "D011", path: [...path, "minArgs"], message: `${where}: minArgs must be a whole number.`, fix: "minArgs: 1" });
}
