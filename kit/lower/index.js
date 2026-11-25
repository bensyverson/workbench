// Lowering: one runtime lambda's syntax tree to an IR kernel, resolved and typed
// against a environment, or coded diagnostics saying why not.

import { parseLambda, checkSubset } from "../parse/index.js";
import { Lowerer, dedupe } from "./lowerer.js";
import { statements, statement, effect, inferredReturn } from "./stmt.js";
import { check } from "./expr.js";
import { reachable } from "./call.js";
import { joinCallSites } from "./callsites.js";
import { HELPER_OWNER } from "./codes.js";
import { verify } from "../ir/verify.js";
import { showType } from "../ir/types.js";

export { LOWER_CODES, HELPER_OWNER } from "./codes.js";

/**
 * Lowering's switches. With `verify` on, every kernel lowering makes goes through the IR
 * verifier (kit/ir/verify.js), and a broken invariant is a V… error: the result has no kernel.
 * Off by default; the test suite turns it on (`--import ./kit/test/verify-lowering.js`).
 */
export const switches = { verify: false };

/** @import { Diagnostic, ArrowFunctionExpression, Expression } from "../parse/ast.js" */
/** @import { Kernel, Type, Effect, Stmt, Local } from "../ir/ir.js" */
/** @import { Environment, SlotRef, SlotDecl, SlotParam, Signatures, HelperDecl, HelperSource, CallSite } from "./environment.js" */

/**
 * @typedef {object} LowerResult
 * @property {boolean} ok
 * @property {Kernel | null} kernel  Null when any diagnostic is an error.
 * @property {Diagnostic[]} diagnostics  Parser, subset and lowering diagnostics, in source order.
 * @property {Array<{ name: string, t: Type }>} emits  Event payloads this lambda sends.
 * @property {CallSite[]} calls  Program methods and helpers it calls, with argument types.
 * @property {Type} returns  What it returns (inferred for methods), even when it failed.
 * @property {Effect[]} effects
 * @property {Type[]} params  Its parameters' types.
 * @property {number | null} arity  The parameters it declares after the slot's own; null when it did not parse.
 */

/**
 * @param {Record<string, HelperDecl>} [helpers]
 * @returns {Signatures}
 */
const noSignatures = (helpers = {}) => ({ events: {}, methods: {}, helpers });

/** The short names slot parameters go by, for messages. */
const PARAM_NAMES = /** @type {Record<string, string>} */ ({ World: "w", At: "at" });

/**
 * How a slot parameter reads in a signature: an object by the short name its label ends in, else a known
 * short name, else its lowercased name; anything else by its type.
 * @param {SlotParam} g
 */
function paramName(g) {
  if (g === "payload") return "data";
  if (typeof g === "string") return g;
  if ("ref" in g) return "self";
  if ("obj" in g) return /\((\w+)\)$/.exec(g.obj)?.[1] ?? PARAM_NAMES[g.obj] ?? g.obj.toLowerCase();
  return showType(g);
}

/**
 * Lowers one lambda, given its source and the slot it fills.
 * @param {Environment} environment
 * @param {string} src
 * @param {SlotRef} slot
 * @param {Signatures} [sigs]  What the program inferred; `lowerProgram` supplies it.
 * @returns {LowerResult}
 */
export function lowerLambda(environment, src, slot, sigs = noSignatures()) {
  const failed = (/** @type {Diagnostic[]} */ diagnostics) => ({ ok: false, kernel: null, diagnostics, emits: [], calls: [], returns: /** @type {Type} */ ("unknown"), effects: [], params: [], arity: null });
  const parsed = parseLambda(src);
  if (!parsed.ok) return failed(parsed.diagnostics);
  const subset = checkSubset(parsed.ast, src);
  if (subset.some((d) => d.severity === "error")) return failed(subset);
  const decl = environment.slot(slot);
  if (typeof decl === "string") throw new Error(`cannot lower ${slot.id}: ${decl}`);

  const ast = parsed.ast;
  const L = new Lowerer(environment, src, slot, decl, sigs, ast);
  const params = bindParams(L, ast, decl);
  const body = L.capture(() => lowerBody(L, ast, decl)).stmts;
  const returns = decl.returns === "infer" ? inferredReturn(L, body) : decl.returns;
  const effects = dedupe(collectEffects(body));
  /** @type {Kernel | null} */
  const made = L.failed ? null : {
    ir: "kernel", name: slot.id, slot: slot.kind, space: decl.space,
    params, returns, locals: L.locals.filter((l) => l.kind !== "param"), body, effects, src, span: [ast.range[0], ast.range[1]],
  };
  if (made && switches.verify) {
    // Partial: a lambda lowered alone, or before the program's inference settles, may hold `unknown`.
    for (const d of verify(made, { partial: true })) {
      const [start, end] = d.span ?? made.span;
      L.diagnostics.push({ code: d.code, severity: "error", message: d.message, tip: `This is a bug in the kit, not in the program (at ${d.path || "the kernel"}).`, loc: { start: L.lines.at(start), end: L.lines.at(end) }, range: [start, end] });
    }
  }
  const kernel = L.failed ? null : made;
  const diagnostics = [...subset, ...L.diagnostics].sort((a, b) => a.range[0] - b.range[0]);
  return { ok: !L.failed, kernel, diagnostics, emits: L.emits, calls: L.calls, returns, effects, params: params.map((p) => p.t), arity: Math.max(0, ast.params.length - decl.params.length) };
}

/**
 * Binds the lambda's parameters to what its slot passes.
 * @param {Lowerer} L
 * @param {ArrowFunctionExpression} ast
 * @param {SlotDecl} decl
 * @returns {Local[]}
 */
function bindParams(L, ast, decl) {
  const method = decl.inferParams ? L.sigs.methods[`${L.slot.on}.${L.slot.key}`] : undefined;
  /** @type {Local[]} */
  const out = [];
  ast.params.forEach((p, i) => {
    if (p.type !== "Identifier") { L.error("L012", p, "A destructured parameter is not lowered yet.", "Take the parameter whole and read its fields."); return; }
    const given = decl.params[i];
    if (given === undefined && !decl.inferParams) {
      const names = decl.params.map(paramName);
      L.error("L010", p, `A ${L.slot.kind} passes ${decl.params.length} parameter${decl.params.length === 1 ? "" : "s"}; '${p.name}' gets nothing.`, `This slot passes (${names.join(", ")}); drop '${p.name}'.`);
      return;
    }
    /** @type {Type} */
    let t = "unknown";
    /** @type {import("./lowerer.js").Binding["pending"]} */
    let pending;
    if (given === "payload") {
      const known = L.sigs.events[L.slot.key ?? ""];
      if (known) t = known;
      else pending = { code: "L014", message: `Nothing in this program emits '${L.slot.key}', so its payload's fields are unknown.`, tip: `Emit it with an object literal payload, as in w.emit("${L.slot.key}", { … }).` };
    } else if (given !== undefined) {
      t = given;
    } else {
      const inferred = method?.params[i - decl.params.length];
      if (inferred) t = inferred;
      else pending = { code: "L014", message: `The type of '${p.name}' cannot be inferred: no call to ${L.slot.on}.${L.slot.key} passes it.`, tip: "Call the method somewhere in the program with this argument, or drop the parameter." };
    }
    const name = L.declare(p.name, t, "param", { pending });
    out.push({ name, t, kind: "param" });
  });
  return out;
}

/**
 * @param {Lowerer} L
 * @param {ArrowFunctionExpression} ast
 * @param {SlotDecl} decl
 */
function lowerBody(L, ast, decl) {
  if (ast.body.type === "BlockStatement") { statements(L, ast.body.body); return; }
  const body = /** @type {Expression} */ (ast.body);
  const span = /** @type {[number, number]} */ ([body.range[0], body.range[1]]);
  if (decl.returns === "void") { effect(L, body); return; }
  if (decl.returns === "infer") { statement(L, { type: "ReturnStatement", argument: body, loc: body.loc, range: body.range }); return; }
  L.emit({ k: "return", value: check(L, body, decl.returns, `a ${L.slot.kind}'s result`), span });
}

/**
 * Every statement's effects, depth first.
 * @param {Stmt[]} stmts
 * @returns {Effect[]}
 */
function collectEffects(stmts) {
  /** @type {Effect[]} */
  const out = [];
  for (const s of stmts) {
    out.push(...s.effects);
    if (s.k === "if") out.push(...collectEffects(s.then), ...collectEffects(s.else));
    if (s.k === "for") out.push(...collectEffects(s.update), ...collectEffects(s.body));
    if (s.k === "each") out.push(...collectEffects(s.body));
  }
  return out;
}

/**
 * @typedef {object} HelperResult
 * @property {string} name
 * @property {"fn" | "const"} kind
 * @property {LowerResult} result  A function's kernel is a `helper` slot; a constant's returns its value.
 */

/**
 * The slot a top-level helper or constant fills.
 * @param {HelperSource} h
 * @returns {SlotRef}
 */
const helperSlot = (h) => ({ id: h.name, kind: h.kind === "fn" ? "helper" : "const", on: HELPER_OWNER, key: h.name });

/**
 * Lowers each constant, in order, to the expression every use of it is replaced by. A
 * constant is lowered as `() => (init)`, so it is held to the subset and may use only
 * literals, `Math`, the constants before it and (where its convention allows a call) the
 * helpers, typed by `sigs`: it is lowered again in each inference pass, so a helper's result
 * type reaches it, and its calls count as call sites.
 * @param {Environment} environment
 * @param {HelperSource[]} sources
 * @param {Record<string, HelperDecl>} decls  Every helper's name; updated with each constant's value.
 * @param {Signatures} sigs  The helper signatures inferred so far.
 * @returns {Map<string, LowerResult>}
 */
function lowerConstants(environment, sources, decls, sigs) {
  /** @type {Map<string, LowerResult>} */
  const out = new Map();
  // A constant sees only the constants before it, in every pass: a later one's value from the last pass would
  // let a forward reference through whenever a helper forces another pass.
  for (const h of sources) if (h.kind === "const") decls[h.name] = { kind: "const", value: null };
  for (const h of sources) {
    if (h.kind !== "const") continue;
    const r = lowerLambda(environment, `() => (${h.src})`, helperSlot(h), { ...sigs, helpers: decls });
    const k = r.kernel;
    const only = k && k.body.length === 1 && k.body[0].k === "return" && k.locals.length === 0 ? k.body[0].value : null;
    if (r.ok && !only) {
      r.diagnostics.push({ code: "L012", severity: "error", message: `The constant '${h.name}' is not a single expression.`, tip: "Write it as one expression of literals, Math and earlier constants.", loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } }, range: [0, 0] });
      r.ok = false;
      r.kernel = null;
    }
    decls[h.name] = { kind: "const", value: r.ok ? only : null, calls: r.calls.map((c) => c.key) };
    out.set(h.name, r);
  }
  return out;
}

/**
 * Lowers every lambda of a program, inferring event payloads (from emit sites) and
 * method and helper signatures (parameters from call sites, results and effects from
 * bodies) until they stop changing. A top-level helper function is lowered like a
 * method that has no `self`; a top-level constant is baked into each use.
 * @param {Environment} environment
 * @param {Array<{ src: string, slot: SlotRef }>} lambdas
 * @param {HelperSource[]} [helperSources]
 * @returns {{ results: LowerResult[], sigs: Signatures, helpers: HelperResult[] }}
 */
export function lowerProgram(environment, lambdas, helperSources = []) {
  const seen = new Set();
  for (const h of helperSources) {
    if (seen.has(h.name)) throw new Error(`'${h.name}' is declared twice among a program's helpers and constants; the later would silently replace the earlier`);
    seen.add(h.name);
  }
  /** @type {Record<string, HelperDecl>} */
  const decls = Object.fromEntries(helperSources.map((h) => [h.name, h.kind === "fn" ? { kind: "fn" } : { kind: "const", value: null }]));
  const fns = helperSources.filter((h) => h.kind === "fn");
  const constSources = helperSources.filter((h) => h.kind === "const");
  const all = [...lambdas, ...fns.map((h) => ({ src: h.src, slot: helperSlot(h) }))];
  let sigs = noSignatures(decls);
  /** @type {LowerResult[]} */
  let results = [];
  /** @type {Map<string, LowerResult>} */
  let consts = new Map();
  // Each pass can only add what the last one learned; a chain of n methods settles in n passes. Constants are
  // lowered first in each pass, with the signatures so far, and their calls are call sites like any lambda's.
  for (let pass = 0; pass <= all.length + constSources.length + 1; pass++) {
    consts = lowerConstants(environment, helperSources, decls, sigs);
    results = all.map((l) => lowerLambda(environment, l.src, l.slot, sigs));
    const next = infer([...all, ...constSources.map((h) => ({ slot: helperSlot(h) }))], [...results, ...constSources.map((h) => /** @type {LowerResult} */ (consts.get(h.name)))], decls);
    if (JSON.stringify(next) === JSON.stringify(sigs)) break;
    sigs = next;
  }
  const byName = new Map(fns.map((h, i) => [h.name, results[lambdas.length + i]]));
  const helpers = helperSources.map((h) => ({ name: h.name, kind: h.kind, result: /** @type {LowerResult} */ (h.kind === "fn" ? byName.get(h.name) : consts.get(h.name)) }));
  return { results: results.slice(0, lambdas.length), sigs, helpers };
}

/**
 * @param {Array<{ slot: SlotRef }>} lambdas
 * @param {LowerResult[]} results
 * @param {Record<string, HelperDecl>} decls
 * @returns {Signatures}
 */
function infer(lambdas, results, decls) {
  const sigs = noSignatures(decls);
  /** @type {Record<string, CallSite[]>} */
  const callArgs = {};
  for (const r of results) {
    for (const e of r.emits) if (!(e.name in sigs.events)) sigs.events[e.name] = e.t;
  }
  // A call site counts only when the code it is in is reached from a runtime lambda, so an unreached helper decides nothing.
  const live = liveCalls(lambdas, results);
  // A call inside a baked constant (`baked`) was typed where the constant was lowered: it joins no parameter.
  for (const r of results) for (const c of r.calls) if (live.has(c) && !c.baked) (callArgs[c.key] ??= []).push(c);
  /** @type {Record<string, boolean>} */
  const failed = {};
  lambdas.forEach((l, i) => {
    if (l.slot.kind !== "method" && l.slot.kind !== "helper") return;
    const key = `${l.slot.on}.${l.slot.key}`;
    const r = results[i];
    const calls = [...new Set(r.calls.map((c) => c.key))];
    const arity = r.arity ?? callArgs[key]?.[0]?.args.length ?? 0;
    const { params, conflicts } = joinCallSites(callArgs[key] ?? [], key, arity);
    sigs.methods[key] = { arity, params, ...(conflicts.length ? { conflicts } : {}), returns: r.returns, effects: r.effects, ...(calls.length ? { calls } : {}) };
    failed[key] = !r.ok;
  });
  for (const [key, sig] of Object.entries(sigs.methods)) {
    if (reachable(sigs, key).some((k) => failed[k] ?? true)) sig.partial = true;
  }
  return sigs;
}

/**
 * The call sites in code a runtime lambda reaches: those of every lambda that is not a
 * method or helper, and, transitively, of each method or helper those call.
 * @param {Array<{ slot: SlotRef }>} lambdas
 * @param {LowerResult[]} results
 * @returns {Set<CallSite>}
 */
function liveCalls(lambdas, results) {
  const callable = (/** @type {SlotRef} */ s) => s.kind === "method" || s.kind === "helper";
  const byKey = new Map(lambdas.flatMap((l, i) => (callable(l.slot) ? [[`${l.slot.on}.${l.slot.key}`, results[i]]] : [])));
  /** @type {Set<CallSite>} */
  const live = new Set();
  /** @type {LowerResult[]} */
  const stack = lambdas.flatMap((l, i) => (callable(l.slot) ? [] : [results[i]]));
  const done = new Set(stack);
  while (stack.length) {
    for (const c of /** @type {LowerResult} */ (stack.pop()).calls) {
      live.add(c);
      const callee = byKey.get(c.key);
      if (callee && !done.has(callee)) { done.add(callee); stack.push(callee); }
    }
  }
  return live;
}
