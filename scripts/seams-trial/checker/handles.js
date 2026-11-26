// The handles every generated builder gains (the draft's "Handles"): `.out.<port>`, `.in.<port>` and
// `.frame.<name>` on any builder in a Program's chain. The kit's builder is a Proxy that refuses an unknown
// member at once (B001), so the stand-in wraps every builder the chain hands back in one that answers those three
// and passes everything else through, the Program symbol `run()` reads included.
// A handle is not a value: reading one as a number or a string records S301 (a condition cannot be trapped at run
// time; the compose check finds those in the glue's text).

import { programOf } from "../../../kit/define/grammar.js";
import { registry } from "./registry.js";
import { siteIn } from "./stack.js";

export const HANDLE = Symbol("seams handle");
export const SIDES = /** @type {const} */ (["out", "in", "frame"]);

/**
 * A handle: which Program (the part), which side and which name. `known` is false for a name the part does not
 * have, which `.wire` and `.frame` report as S111.
 * @typedef {{ [HANDLE]: true, program: object, side: "out" | "in" | "frame", name: string, known: boolean }} Handle
 */

/** @param {unknown} v @returns {v is Handle} */
export const isHandle = (v) => v !== null && typeof v === "object" && /** @type {any} */ (v)[HANDLE] === true;

/** The root's opening name: the part's name. @param {any} program */
export const partName = (program) => {
  const a = program?.root?.openCall?.args?.[0];
  return typeof a === "string" ? a : "(unnamed)";
};

/** The handles of each Program, by side, made once. @type {WeakMap<object, Record<string, object>>} */
const made = new WeakMap();

/**
 * The `.out`, `.in` or `.frame` of one Program: a read-only object of handles.
 * @param {object} program @param {"out" | "in" | "frame"} side @param {string[]} names  what the Dialect declares on that side
 */
function sideOf(program, side, names) {
  const all = made.get(program) ?? {};
  made.set(program, all);
  if (all[side]) return all[side];
  /** @type {Map<string, Handle>} */
  const cache = new Map();
  const handle = (/** @type {string} */ name) => {
    let h = cache.get(name);
    if (!h) {
      const text = `${partName(program)}.${side}.${name}`;
      h = /** @type {Handle} */ (Object.freeze({
        [HANDLE]: true, program, side, name, known: names.includes(name),
        [Symbol.toPrimitive]() {
          const at = siteIn(registry.dirUrl);
          if (at) registry.valueReads.push({ ...at, handle: text });
          return Number.NaN;
        },
        toString() { return `[handle ${text}]`; },
        toJSON() { return `[handle ${text}]`; },
      }));
      cache.set(name, h);
    }
    return h;
  };
  all[side] = new Proxy(Object.freeze(Object.create(null)), {
    get(_, prop) { return typeof prop === "symbol" || prop === "then" ? undefined : handle(prop); },
    has(_, prop) { return typeof prop === "string" && names.includes(prop); },
    ownKeys() { return []; },
    set() { return false; },
  });
  return all[side];
}

/**
 * Wraps a builder of the kit's (any construct's, in a Program's chain) so it answers the handles.
 * @param {any} inner @param {{ out: string[], in: string[], frame: string[] }} names
 * @returns {any}
 */
export function wrapChain(inner, names) {
  const program = programOf(inner);
  if (!program) return inner;
  return new Proxy(inner, {
    get(target, prop) {
      if (prop === "out" || prop === "in" || prop === "frame") return sideOf(program, prop, names[prop]);
      const v = target[prop];
      if (typeof v !== "function") return v;
      return (/** @type {unknown[]} */ ...args) => {
        const r = v(...args);
        return programOf(r) === program ? wrapChain(r, names) : r;
      };
    },
  });
}
