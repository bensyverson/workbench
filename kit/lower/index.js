// Lowering: one runtime lambda's syntax tree to an IR kernel, resolved and typed
// against a dialect, or coded diagnostics saying why not.

import { parseLambda, checkSubset } from "../parse/index.js";
import { Lowerer, dedupe } from "./lowerer.js";
import { statements, statement, effect, inferredReturn } from "./stmt.js";
import { check } from "./expr.js";

export { LOWER_CODES } from "./codes.js";

/** @import { Diagnostic, ArrowFunctionExpression, Expression } from "../parse/ast.js" */
/** @import { Kernel, Type, Effect, Stmt, Local } from "../ir/ir.js" */
/** @import { Dialect, SlotRef, SlotDecl, Signatures } from "./dialect.js" */

/**
 * @typedef {object} LowerResult
 * @property {boolean} ok
 * @property {Kernel | null} kernel  Null when any diagnostic is an error.
 * @property {Diagnostic[]} diagnostics  Parser, subset and lowering diagnostics, in source order.
 * @property {Array<{ name: string, t: Type }>} emits  Event payloads this lambda sends.
 * @property {Array<{ key: string, args: Type[] }>} calls  Program methods it calls, with argument types.
 * @property {Type} returns  What it returns (inferred for methods), even when it failed.
 * @property {Effect[]} effects
 * @property {Type[]} params  Its parameters' types.
 */

/** @returns {Signatures} */
const noSignatures = () => ({ events: {}, methods: {} });

/** The short names slot parameters go by, for messages. */
const PARAM_NAMES = /** @type {Record<string, string>} */ ({ World: "w", At: "at" });

/**
 * Lowers one lambda, given its source and the slot it fills.
 * @param {Dialect} dialect
 * @param {string} src
 * @param {SlotRef} slot
 * @param {Signatures} [sigs]  What the program inferred; `lowerProgram` supplies it.
 * @returns {LowerResult}
 */
export function lowerLambda(dialect, src, slot, sigs = noSignatures()) {
  const failed = (/** @type {Diagnostic[]} */ diagnostics) => ({ ok: false, kernel: null, diagnostics, emits: [], calls: [], returns: /** @type {Type} */ ("unknown"), effects: [], params: [] });
  const parsed = parseLambda(src);
  if (!parsed.ok) return failed(parsed.diagnostics);
  const subset = checkSubset(parsed.ast, src);
  if (subset.some((d) => d.severity === "error")) return failed(subset);
  const decl = dialect.slot(slot);
  if (typeof decl === "string") throw new Error(`cannot lower ${slot.id}: ${decl}`);

  const ast = parsed.ast;
  const L = new Lowerer(dialect, src, slot, decl, sigs, ast);
  const params = bindParams(L, ast, decl);
  const body = L.capture(() => lowerBody(L, ast, decl)).stmts;
  const returns = decl.returns === "infer" ? inferredReturn(L, body) : decl.returns;
  const effects = dedupe(collectEffects(body));
  const diagnostics = [...subset, ...L.diagnostics].sort((a, b) => a.range[0] - b.range[0]);
  /** @type {Kernel | null} */
  const kernel = L.failed ? null : {
    ir: "kernel", name: slot.id, slot: slot.kind, domain: decl.domain,
    params, returns, locals: L.locals.filter((l) => l.kind !== "param"), body, effects, src, span: [ast.range[0], ast.range[1]],
  };
  return { ok: !L.failed, kernel, diagnostics, emits: L.emits, calls: L.calls, returns, effects, params: params.map((p) => p.t) };
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
      const names = decl.params.map((g) => (g === "payload" ? "data" : typeof g === "object" && "ref" in g ? "self" : typeof g === "object" && "obj" in g ? PARAM_NAMES[g.obj] ?? g.obj.toLowerCase() : "x"));
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
 * Lowers every lambda of a program, inferring event payloads (from emit sites) and
 * method signatures (parameters from call sites, results and effects from bodies)
 * until they stop changing.
 * @param {Dialect} dialect
 * @param {Array<{ src: string, slot: SlotRef }>} lambdas
 * @returns {{ results: LowerResult[], sigs: Signatures }}
 */
export function lowerProgram(dialect, lambdas) {
  let sigs = noSignatures();
  /** @type {LowerResult[]} */
  let results = [];
  // Each pass can only add what the last one learned; a chain of n methods settles in n passes.
  for (let pass = 0; pass <= lambdas.length + 1; pass++) {
    results = lambdas.map((l) => lowerLambda(dialect, l.src, l.slot, sigs));
    const next = infer(lambdas, results);
    if (JSON.stringify(next) === JSON.stringify(sigs)) break;
    sigs = next;
  }
  return { results, sigs };
}

/**
 * @param {Array<{ slot: SlotRef }>} lambdas
 * @param {LowerResult[]} results
 * @returns {Signatures}
 */
function infer(lambdas, results) {
  const sigs = noSignatures();
  /** @type {Record<string, Type[]>} */
  const callArgs = {};
  for (const r of results) {
    for (const e of r.emits) if (!(e.name in sigs.events)) sigs.events[e.name] = e.t;
    for (const c of r.calls) if (!(c.key in callArgs)) callArgs[c.key] = c.args;
  }
  lambdas.forEach((l, i) => {
    if (l.slot.kind !== "method") return;
    const key = `${l.slot.on}.${l.slot.key}`;
    const r = results[i];
    sigs.methods[key] = { params: callArgs[key] ?? [], returns: r.returns, effects: r.effects };
  });
  return sigs;
}
