// The handles every generated builder has (the seams draft's "Handles"): `.out.<port>`, `.in.<port>` and
// `.frame.<name>`, read-only, on any builder of a Program's chain. A handle names a port or a frame of one part
// for kit/compose's `.wire` and `.frame`; it is not a value. Reading one as a number or a string (arithmetic, a
// comparison, a template) records where on its Program, which kit/compose reports as S301. A handle tested as a
// condition cannot be caught this way: an object is always truthy.
// The handles live here, inside kit/define, so a builder diagnostic still points at the author's line (site.js
// skips this folder's frames); a wrapper around the builder would move every one into the wrapper's file.

import { callSite } from "./site.js";

/** @import { Seams } from "./define.js" */
/** @import { Loc } from "../parse/ast.js" */

const HANDLE = Symbol("kit/define handle");
/** The three sides a builder answers. */
export const SIDES = Object.freeze(/** @type {const} */ (["out", "in", "frame"]));

/**
 * A handle: the part (its Program and name), its Dialect, which side, which name, and whether the part has it.
 * A port's carries its seam type's text, a frame's its dims; `known` is false for a name the part lacks, which
 * kit/compose reports (S111) with what the part does have.
 * @typedef {{ readonly program: object, readonly part: string, readonly dialect: string, readonly side: "out" | "in" | "frame", readonly name: string, readonly known: boolean, readonly seam?: string, readonly dims?: number }} Handle
 */

/** @param {unknown} v @returns {v is Handle} */
export const isHandle = (v) => v !== null && typeof v === "object" && /** @type {any} */ (v)[HANDLE] === true;

/** A handle as messages write it: `level.out.picked`. @param {Handle} h */
export const handleText = (h) => `${h.part}.${h.side}.${h.name}`;

/** Each Program's sides, made once. @type {WeakMap<object, Partial<Record<"out" | "in" | "frame", object>>>} */
const made = new WeakMap();
/** Where each Program's handles were read as values. @type {WeakMap<object, Array<{ handle: string, file: string, loc: Loc }>>} */
const reads = new WeakMap();

/**
 * Where a Program's handles were read as values at build time, in order.
 * @param {object | undefined} program
 * @returns {ReadonlyArray<{ handle: string, file: string, loc: Loc }>}
 */
export const valueReadsOf = (program) => (program ? reads.get(program) ?? [] : []);

/**
 * One side of a Program: a read-only object of its handles. Its own keys are the names the Dialect declares
 * (so Object.keys lists them); any other name gives a handle with `known: false`, for kit/compose to report.
 * @param {object} program @param {"out" | "in" | "frame"} side @param {Seams} seams @param {string} part @param {string} dialect
 * @returns {object}
 */
export function sideOf(program, side, seams, part, dialect) {
  const all = made.get(program) ?? {};
  made.set(program, all);
  const done = all[side];
  if (done) return done;
  const declared = side === "out" ? seams.out : side === "in" ? seams.in : seams.frames;
  /** @param {string} name @param {boolean} known @returns {Handle} */
  const make = (name, known) => {
    const text = `${part}.${side}.${name}`;
    const port = side === "frame" ? undefined : known ? /** @type {any} */ (declared)[name] : undefined;
    const frame = side === "frame" && known ? seams.frames[name] : undefined;
    return Object.freeze({
      [HANDLE]: true, program, part, dialect, side, name, known,
      ...(port ? { seam: /** @type {string} */ (port.seamText) } : {}),
      ...(frame ? { dims: frame.dims } : {}),
      [Symbol.toPrimitive]() {
        const list = reads.get(program) ?? [];
        reads.set(program, list);
        list.push({ handle: text, ...callSite() });
        return Number.NaN;
      },
      toString() { return `[handle ${text}]`; },
      toJSON() { return `[handle ${text}]`; },
    });
  };
  const target = Object.freeze(Object.assign(Object.create(null), Object.fromEntries(Object.keys(declared).map((n) => [n, make(n, true)]))));
  /** @type {Map<string, Handle>} */
  const unknown = new Map();
  const proxy = new Proxy(target, {
    get(t, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      if (Object.hasOwn(t, prop)) return t[prop];
      let h = unknown.get(prop);
      if (!h) unknown.set(prop, (h = make(prop, false)));
      return h;
    },
    set() { return false; },
  });
  all[side] = proxy;
  return proxy;
}
