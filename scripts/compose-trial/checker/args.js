// Argument checks the stand-in dialects share. Each reports at the builder call and returns whether the
// argument is usable; an output handle in a slot that does not connect is a binding-time error (S301/S302),
// not a type error.

import { session } from "./session.js";
import { unwrap, isPoison, OutHandle, LAMBDA_SLOTS } from "./handles.js";
import { callArgs } from "./source.js";

/** @import { Ctx } from "./handles.js" */

/** @param {Ctx} ctx */
const where = (ctx) => `${ctx.owner.label}.${ctx.method}()`;

/**
 * An output handle given to a slot that takes a plain value: S301 when the slot has a lambda form, S302 when
 * it is fixed at build. Returns true when it was one (and so reported).
 * @param {unknown} v @param {Ctx} ctx
 */
function handleInPlainSlot(v, ctx) {
  const h = unwrap(v);
  if (!(h instanceof OutHandle)) return false;
  if (LAMBDA_SLOTS.has(ctx.method)) {
    const args = callArgs(session.lineText(ctx.site), ctx.method) ?? h.text;
    session.add("S301", ctx.site, `${h.text} is known only at run time, but ${where(ctx)} got it at build time.`, `write the argument as a lambda: .${ctx.method}(() => ${args})`);
  } else {
    session.add("S302", ctx.site, `${where(ctx)} is fixed at build and cannot depend on ${h.text}, which is known only at run time.`, "use a parameter or a constant here");
  }
  h.reported = true;
  return true;
}

/**
 * An integer (or, with `lambda`, a runtime lambda).
 * @param {unknown} v @param {Ctx} ctx @param {string} what
 * @param {{ min?: number, max?: number, lambda?: boolean, integer?: boolean }} [o]
 * @returns {boolean}
 */
export function num(v, ctx, what, o = {}) {
  if (isPoison(v) || handleInPlainSlot(v, ctx)) return false;
  if (o.lambda && typeof v === "function") return true;
  const integer = o.integer ?? true;
  const ok = typeof v === "number" && Number.isFinite(v) && (!integer || Number.isInteger(v)) && (o.min === undefined || v >= o.min) && (o.max === undefined || v <= o.max);
  if (!ok) {
    const range = o.min !== undefined && o.max !== undefined ? ` from ${o.min} to ${o.max}` : "";
    session.add("D002", ctx.site, `${where(ctx)}: ${what} must be ${integer ? "an integer" : "a number"}${range}${o.lambda ? " or a lambda () => …" : ""}; got ${show(v)}.`, `pass ${integer ? "an integer" : "a number"}${range}`);
  }
  return ok;
}

/** A runtime lambda. @param {unknown} v @param {Ctx} ctx @param {string} what @param {string} shape */
export function fn(v, ctx, what, shape) {
  if (isPoison(v)) return false;
  if (typeof v === "function") return true;
  if (unwrap(v) instanceof OutHandle) {
    session.add("D002", ctx.site, `${where(ctx)}: ${what} must be a lambda ${shape}; got the output handle ${/** @type {OutHandle} */ (unwrap(v)).text}.`, `wrap it: ${shape}`);
    return false;
  }
  session.add("D002", ctx.site, `${where(ctx)}: ${what} must be a lambda ${shape}; got ${show(v)}.`, `pass ${shape}`);
  return false;
}

/** A string matching a pattern. @param {unknown} v @param {Ctx} ctx @param {string} what @param {RegExp} [re] */
export function str(v, ctx, what, re = /./) {
  if (isPoison(v) || handleInPlainSlot(v, ctx)) return false;
  if (typeof v === "string" && re.test(v)) return true;
  session.add("D002", ctx.site, `${where(ctx)}: ${what} must be a string${re.source === "." ? "" : ` matching ${re}`}; got ${show(v)}.`, `pass ${what} as a string`);
  return false;
}

/** A plain object. @param {unknown} v @param {Ctx} ctx @param {string} what @returns {v is Record<string, unknown>} */
export function obj(v, ctx, what) {
  if (isPoison(v) || handleInPlainSlot(v, ctx)) return false;
  if (typeof v === "object" && v !== null && !Array.isArray(v) && !unwrap(v)) return true;
  session.add("D002", ctx.site, `${where(ctx)}: ${what} must be an object { … }; got ${show(v)}.`, `pass ${what} as an object literal`);
  return false;
}

/**
 * The keys of an options object must be among `allowed`.
 * @param {Record<string, unknown>} o @param {Ctx} ctx @param {string[]} allowed
 */
export function keys(o, ctx, allowed) {
  let ok = true;
  for (const k of Object.keys(o)) {
    if (!allowed.includes(k)) { session.add("D002", ctx.site, `${where(ctx)} takes no option '${k}'; its options are ${allowed.join(", ")}.`, `remove '${k}'`); ok = false; }
  }
  return ok;
}

/**
 * An output handle, connected to this slot. Its type is checked once the build is done.
 * @param {unknown} v @param {Ctx} ctx @param {string} what @param {string} type  as the reference writes it
 * @returns {OutHandle | null}
 */
export function connect(v, ctx, what, type) {
  if (isPoison(v)) return null;
  const h = unwrap(v);
  if (h instanceof OutHandle) { h.reported = true; return h; }
  session.add("D002", ctx.site, `${where(ctx)}: ${what} must be another part's output of type ${type}; got ${show(v)}.`, `pass an output handle such as part.out.<name>`);
  return null;
}

/** @param {unknown} v */
export function show(v) {
  if (typeof v === "function") return "a function";
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return "an array";
  if (v === null || v === undefined) return String(v);
  if (typeof v === "object") return unwrap(v) ? "a part or handle" : "an object";
  return String(v);
}
