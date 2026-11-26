// Argument values against their specs: a data shape (B004), a lambda's source (B007), the refs and lambdas a
// value holds. One walk serves the call (checking), the record (lambdas become source text) and lowering.

import { TAG, tagged, isPlainObject, describe } from "./tags.js";
import { parseLambda } from "../parse/index.js";
import { an } from "./codes.js";

/** @import { ArrowFunctionExpression, Expression, Loc } from "../parse/ast.js" */
/** @import * as T from "./define.js" */

/**
 * @typedef {object} Found
 * @property {Array<{ code: string, path: Array<string | number>, message: string, lambda?: LambdaAt, severity?: "warning", tip?: string, finite?: true, value?: number }>} errors  errors, and warnings that do not refuse the call; `finite` marks a number that is not finite (`value`), which still fits its shape's type
 * @property {Array<{ ns: string, value: string, path: Array<string | number>, kind?: string }>} refs  `kind`: what ref("in", { kind }) asks for
 * @property {Array<{ convention: string, src: string, ast: ArrowFunctionExpression, path: Array<string | number>, key?: string }>} lambdas
 */

/**
 * The lambda a diagnostic is about: its source and, when known, the place inside that source.
 * @typedef {{ src: string, loc?: Loc }} LambdaAt
 */

/** @returns {Found} */
export const found = () => ({ errors: [], refs: [], lambdas: [] });

/** What refuses the value: the errors that are not warnings. @param {Found} o */
export const refusals = (o) => o.errors.filter((e) => e.severity !== "warning");

/** Whether a value fits a `oneOf` branch's form: nothing refuses it but a number that is not finite. @param {Found} o */
const fitsType = (o) => refusals(o).every((e) => e.finite);

/**
 * A Runtime Lambda's source: a string as is, an arrow function's text; B007 otherwise or when it does not parse.
 * @param {unknown} v
 * @returns {{ src: string, ast: ArrowFunctionExpression } | { error: string, src?: string, loc?: Loc }}
 */
export function lambdaSource(v) {
  if (typeof v !== "string" && typeof v !== "function") return { error: `a Runtime Lambda is an arrow function or its source text, not ${describe(v)}` };
  const src = String(v);
  if (typeof v === "function" && /\{\s*\[native code\]\s*\}\s*$/.test(src)) return { error: "a bound function has no source text to compile: write an arrow function" };
  const r = parseLambda(src);
  if (r.ok) return { src, ast: r.ast };
  const kind = /^\s*(async\s+)?function\b/.test(src) ? "a function expression" : typeof v === "function" && !/=>/.test(src.split("{")[0]) ? "a method shorthand" : null;
  return { src, loc: kind ? undefined : r.diagnostics[0]?.loc, error: kind ? `${kind} is not a Runtime Lambda: write an arrow function` : `the lambda does not parse: ${r.diagnostics[0]?.code} ${r.diagnostics[0]?.message}` };
}

/**
 * A constant's initializer: an expression as text, or an arrow function `() => expr`, whose body is the expression.
 * @param {unknown} v
 * @returns {{ src: string, ast: ArrowFunctionExpression } | { error: string }}
 */
export function constSource(v) {
  if (typeof v === "function") {
    const l = lambdaSource(v);
    if ("error" in l) return l;
    if (l.ast.params.length || l.ast.body.type === "BlockStatement") return { error: "a constant given as a function must be () => expression" };
    const body = /** @type {Expression} */ (l.ast.body);
    return constSource(l.src.slice(body.range[0], body.range[1]));
  }
  if (typeof v !== "string" || v.trim() === "") return { error: `a constant's initializer is an expression as text, not ${describe(v)}` };
  const r = parseLambda(`() => (${v}\n)`);
  return r.ok ? { src: v, ast: r.ast } : { error: `the constant does not parse: ${r.diagnostics[0]?.code} ${r.diagnostics[0]?.message}` };
}

/**
 * B004 for Infinity, -Infinity or NaN where a number stands. It carries the value, so a call that receives a
 * param's refused declared value can be told from one that writes its own.
 * @param {number} v @param {Array<string | number>} path
 * @returns {Found["errors"][number]}
 */
const nonFinite = (v, path) => ({ code: "B004", path, message: `${where(path)}: ${v} is not a finite number, and a record holds finite numbers only`, finite: true, value: v });

/** @param {Array<string | number>} path */
export const where = (path) => path.map((p, i) => (typeof p === "number" ? `${i === 0 ? "argument" : "item"} ${p + 1}` : `key '${p}'`)).join(", ");

/**
 * A shape in a few words, for a message: `{ value: number, min?: number }`, `string[]`, a tag by its kind.
 * @param {unknown} shape
 * @returns {string}
 */
function describeShape(shape) {
  if (typeof shape === "string") return shape;
  if (isPlainObject(shape)) return `{ ${Object.entries(shape).map(([k, x]) => `${k}: ${describeShape(x)}`).join(", ")} }`;
  const t = tagged(shape);
  if (t?.[TAG] === "data") {
    const o = /** @type {Record<string, unknown>} */ (t.opts ?? {});
    const bounds = ["min", "max", "whole"].filter((k) => o[k] !== undefined).map((k) => `${k}: ${o[k]}`);
    return `${describeShape(t.shape)}${bounds.length ? ` (${bounds.join(", ")})` : ""}`;
  }
  return t ? String(t[TAG]) : "a value";
}

/**
 * Whether a oneOf's record form (`hit.value`, its lambdas as text) would be read as a branch with its lambdas in
 * other places than the branch the call took: a function only a lambda form takes can steer the call to a
 * later branch that the text then ties with an earlier one. Lowering re-reads the record, so they must agree.
 * @param {unknown[]} alts @param {{ o: Found, value: unknown }} hit @param {Array<string | number>} path @param {string} [key]
 */
function recordPicksOther(alts, hit, path, key) {
  const fits = alts.map((alt) => { const o = found(); matchShape(alt, hit.value, path, o, key); return o; }).filter(fitsType);
  const best = fits.reduce((/** @type {Found | undefined} */ b, o) => (!b || o.lambdas.length > b.lambdas.length ? o : b), undefined);
  const places = (/** @type {Found} */ o) => JSON.stringify(o.lambdas.map((l) => l.path));
  return best !== undefined && places(best) !== places(hit.o);
}

/**
 * Matches `v` against a shape, collecting into `out`; returns the value with lambdas as source text.
 * @param {unknown} shape @param {unknown} v @param {Array<string | number>} path @param {Found} out @param {string} [key]
 * @returns {unknown}
 */
export function matchShape(shape, v, path, out, key) {
  const fail = (/** @type {string} */ m) => { out.errors.push({ code: "B004", path, message: `${where(path)}: ${m}` }); return v; };
  if (typeof shape === "string") {
    const ok = shape === "number" ? typeof v === "number" : shape === "string" ? typeof v === "string" : shape === "boolean" ? typeof v === "boolean"
      : Array.isArray(v) && v.every((x) => typeof x === (shape === "string[]" ? "string" : "number"));
    if (!ok) return fail(`expected ${shape === "string[]" ? "a list of strings" : shape === "number[]" ? "a list of numbers" : `a ${shape}`}, got ${describe(v)}`);
    // A record holds finite numbers only: no target, nor the IR's JSON form, can hold Infinity or NaN.
    (Array.isArray(v) ? v.map((x, i) => [x, [...path, i]]) : [[v, path]]).forEach(([x, at]) => { if (typeof x === "number" && !Number.isFinite(x)) out.errors.push(nonFinite(x, at)); });
    return Array.isArray(v) ? [...v] : v;
  }
  if (isPlainObject(shape)) {
    if (!isPlainObject(v) || typeof v === "function") return fail(`expected an object, got ${describe(v)}`);
    const keys = Object.keys(shape).map((k) => [k.replace(/\?$/, ""), k.endsWith("?")]);
    /** @type {Record<string, unknown>} */
    const made = {};
    for (const [k, optional] of /** @type {Array<[string, boolean]>} */ (keys)) {
      if (!(k in v) || (optional && v[k] === undefined)) { if (!optional) fail(`missing the key '${k}'`); continue; }
      made[k] = matchShape(shape[optional ? `${k}?` : k], v[k], [...path, k], out);
    }
    for (const k of Object.keys(v)) if (!keys.some(([s]) => s === k)) fail(`has the key '${k}', which this shape does not take (it takes ${keys.map(([s, o]) => `'${s}'${o ? "?" : ""}`).join(", ")})`);
    return made;
  }
  const s = /** @type {T.Tagged} */ (tagged(shape));
  switch (s[TAG]) {
    case "oneOf": {
      const tries = s.of.map((alt) => { const o = found(); return { o, value: matchShape(alt, v, path, o, key) }; });
      // The record keeps a lambda as text, which a "string" branch also takes, so a call and a later re-match
      // of its record must agree: among the branches that fit, the one holding the most lambdas wins (the
      // first on a tie). At any depth, text that parses as an arrow function is then the lambda. A number
      // that is not finite still picks the number's branch, whose B004 then says what is wrong with it.
      const fits = tries.filter((t) => fitsType(t.o));
      const hit = fits.reduce((/** @type {(typeof fits)[number] | undefined} */ best, t) => (!best || t.o.lambdas.length > best.o.lambdas.length ? t : best), undefined);
      if (hit && hit.o.lambdas.length && recordPicksOther(s.of, hit, path, key)) {
        return fail(`once its lambdas are text, as the record keeps them, it fits another of its forms with lambdas in other places, which the record would be read as; pass every lambda of it as a function, or as text, so the call and its record agree`);
      }
      if (hit) {
        out.refs.push(...hit.o.refs);
        out.lambdas.push(...hit.o.lambdas);
        out.errors.push(...hit.o.errors);
        // Text that looks like an arrow function but does not parse stays text; say so, since the author
        // most likely meant the lambda.
        const broken = hit.o.lambdas.length === 0 && typeof v === "string" && /=>/.test(v) ? tries.flatMap((t) => refusals(t.o)).find((e) => e.code === "B007" && e.lambda) : undefined;
        if (broken) out.errors.push({ ...broken, severity: "warning", message: `${broken.message.replace(/\.$/, "")}; it is taken as text, not as a lambda`, tip: "fix the arrow function so it parses, if a lambda was meant" });
        return hit.value;
      }
      // A function can only have meant a lambda branch: keep that branch's B007 and its detail.
      const lambdaTries = typeof v === "function" ? tries.filter((t) => refusals(t.o).some((e) => e.code === "B007")) : [];
      if (lambdaTries.length === 1) { out.errors.push(...lambdaTries[0].o.errors); return v; }
      // Name the nearest form only when it is the unique best; on a tie list the forms (a few, shortened).
      const least = Math.min(...tries.map((t) => refusals(t.o).length));
      const best = tries.filter((t) => refusals(t.o).length === least);
      if (best.length === 1) return fail(`fits none of its ${s.of.length} forms; nearest: ${refusals(best[0].o)[0].message}`);
      const shown = s.of.slice(0, 4).map((alt) => describeShape(alt));
      return fail(`fits none of its ${s.of.length} forms: ${shown.join(" | ")}${s.of.length > 4 ? " | …" : ""}`);
    }
    case "enum": return /** @type {unknown[]} */ (s.values).includes(v) ? v : fail(`expected one of ${/** @type {unknown[]} */ (s.values).map((x) => JSON.stringify(x)).join(", ")}, got ${describe(v)}`);
    case "recordOf": {
      if (!isPlainObject(v)) return fail(`expected an object, got ${describe(v)}`);
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, matchShape(s.of, x, [...path, k], out, k)]));
    }
    case "listOf": return Array.isArray(v) ? v.map((x, i) => matchShape(s.of, x, [...path, i], out, key)) : fail(`expected a list, got ${describe(v)}`);
    case "ref":
      if (typeof v !== "string") return fail(`expected the name of ${an(/** @type {string} */ (s.ns))}, got ${describe(v)}`);
      { const kind = /** @type {any} */ (s).opts?.kind; out.refs.push({ ns: /** @type {string} */ (s.ns), value: v, path, ...(typeof kind === "string" ? { kind } : {}) }); }
      return v;
    case "data": {
      // data(shape, { min, max, whole }): the shape, then a number shape's bounds
      const before = refusals(out).length;
      const made = matchShape(/** @type {T.DataTag} */ (s).shape, v, path, out, key);
      const o = /** @type {Record<string, unknown> | undefined} */ (/** @type {T.DataTag} */ (s).opts);
      if (refusals(out).length > before || typeof v !== "number" || !o) return made;
      if (typeof o.min === "number" && !(v >= o.min)) return fail(`${v} is below its min, ${o.min}`);
      if (typeof o.max === "number" && !(v <= o.max)) return fail(`${v} is above its max, ${o.max}`);
      if (o.whole === true && !Number.isInteger(v)) return fail(`${v} is not a whole number (whole: true)`);
      return made;
    }
    case "lambda": {
      const l = lambdaSource(v);
      if ("error" in l) { out.errors.push({ code: "B007", path, message: `${where(path)}: ${l.error}`, ...(l.src !== undefined ? { lambda: { src: l.src, ...(l.loc ? { loc: l.loc } : {}) } } : {}) }); return v; }
      out.lambdas.push({ convention: /** @type {string} */ (s.convention), src: l.src, ast: l.ast, path, ...(key !== undefined ? { key } : {}) });
      return l.src;
    }
  }
  return fail("is not checkable");
}

/**
 * Matches one argument against its spec (name and opt/rest are handled by the caller).
 * @param {T.Tagged} spec @param {unknown} v @param {number} i @param {Found} out
 */
export function matchArg(spec, v, i, out) {
  switch (spec[TAG]) {
    case "data": case "ref": case "lambda": return matchShape(spec, v, [i], out);
  }
  return v;
}
