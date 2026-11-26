// Expressions. Operands are evaluated left to right; `and`, `or` and `cond` are lazy. The
// result of every node is rounded to its type (an f32 stays an f32) and reported to the hook.

import { applyOp, fit, COMPONENTS } from "./values.js";
import { callIntrinsic, callHost, callHelper, callMethod } from "./calls.js";
import { report } from "./frame.js";

/** @import { Expr } from "../ir/ir.js" */
/** @import { Frame } from "./frame.js" */
/** @import { Value } from "./interp.js" */

/**
 * Evaluates `e`; `path` says where it is in its kernel.
 * @param {Frame} f
 * @param {Expr} e
 * @param {string} path
 * @returns {Value}
 */
export function evalExpr(f, e, path) {
  const v = fit(compute(f, e, path), e.t);
  report(f, e, false, v, path);
  return v;
}

/**
 * @param {Frame} f
 * @param {Expr[]} es
 * @param {string} path
 * @returns {Value[]}
 */
export function evalAll(f, es, path) {
  return es.map((x, i) => evalExpr(f, x, `${path}[${i}]`));
}

/**
 * @param {Frame} f
 * @param {Expr} e
 * @param {string} path
 * @returns {Value}
 */
function compute(f, e, path) {
  switch (e.k) {
    case "num": case "str": case "bool": return e.v;
    case "null": return null;
    case "undef": return undefined;
    case "local": return f.scope.get(e.name);
    case "global": {
      const g = f.m.env.globals;
      if (!g || !Object.hasOwn(g, e.name)) throw new Error(`global '${e.name}' is not in the environment`);
      return g[e.name];
    }
    case "load": {
      const recv = /** @type {Record<string, Value> | null | undefined} */ (evalExpr(f, e.place.recv, `${path}.place.recv`));
      if (recv === null || recv === undefined) throw new Error(`read of ${e.place.owner}.${e.place.name} from ${recv}`);
      return recv[e.place.name];
    }
    case "op": {
      if (e.op === "and" || e.op === "or") {
        const [l, r] = e.args;
        const left = evalExpr(f, l, `${path}.args[0]`);
        if (e.op === "and" ? !left : !!left) return left;
        return evalExpr(f, r, `${path}.args[1]`);
      }
      return applyOp(e.op, evalAll(f, e.args, `${path}.args`));
    }
    case "cond": return evalExpr(f, e.test, `${path}.test`) ? evalExpr(f, e.then, `${path}.then`) : evalExpr(f, e.else, `${path}.else`);
    case "call": {
      const impl = f.m.env.intrinsics?.[e.fn];
      // Lowering gives a dialect's bare function (`length(v)`) a `global` receiver of its own name: not a value.
      const bare = e.recv?.k === "global" && e.recv.name === e.fn;
      if (bare && !impl) throw new Error(`intrinsic '${e.fn}' has no reference implementation in the environment`);
      const recv = e.recv && !bare ? evalExpr(f, e.recv, `${path}.recv`) : undefined;
      const args = evalAll(f, e.args, `${path}.args`);
      if (impl) return callIntrinsic(e.fn, impl, args, e.t);
      if (!e.recv) throw new Error(`intrinsic '${e.fn}' has no reference implementation in the environment`);
      return callHost(recv, e.fn, args);
    }
    case "method": {
      const recv = evalExpr(f, e.recv, `${path}.recv`);
      return callMethod(f, e, recv, evalAll(f, e.args, `${path}.args`));
    }
    case "helper": return callHelper(f, e.name, evalAll(f, e.args, `${path}.args`));
    case "struct": return Object.fromEntries(Object.entries(e.fields).map(([k, x]) => [k, evalExpr(f, x, `${path}.fields.${k}`)]));
    case "field": {
      const of = evalExpr(f, e.of, `${path}.of`);
      if (typeof e.of.t === "object" && "vec" in e.of.t) return /** @type {number[]} */ (of)[COMPONENTS.indexOf(e.name)];
      return /** @type {Record<string, Value>} */ (of)[e.name];
    }
    case "index": return /** @type {Value[]} */ (evalExpr(f, e.of, `${path}.of`))[/** @type {number} */ (evalExpr(f, e.index, `${path}.index`))];
    case "array": return evalAll(f, e.items, `${path}.items`);
    case "concat": return evalAll(f, e.parts, `${path}.parts`).flat(1);
    case "list": return [];
    case "vec": return evalAll(f, e.items, `${path}.items`);
  }
}
