// The handles every generated builder has (the seams draft's "Handles"): `.out.<port>`, `.in.<port>`,
// `.frame.<name>` and `.param.<name>` (a declared param, the target of a param wire), read-only, on any builder of
// a Program's chain. A handle names a port or a frame of one part
// for kit/compose's `.wire` and `.frame`; it is not a value. Reading one as a number or a string (arithmetic, a
// comparison, a template) records where on its Program, which kit/compose reports as S301. A handle tested as a
// condition cannot be caught this way (an object is always truthy); kit/compose's scanGlue finds it in the glue's text.
// The handles live here, inside kit/define, so a builder diagnostic still points at the author's line (site.js
// skips this folder's frames); a wrapper around the builder would move every one into the wrapper's file.

import { callSite } from "./site.js";

/** @import { Seams } from "./define.js" */
/** @import { Loc } from "../parse/ast.js" */

const HANDLE = Symbol("kit/define handle");
/** The sides a builder answers. */
export const SIDES = Object.freeze(/** @type {const} */ (["out", "in", "frame", "param"]));

/**
 * A handle: the part (its Program and name), its Dialect, which side, which name, and whether the part has it.
 * A port's carries its seam type's text, a frame's its dims, a param's the seam its declaration's value gives (when it
 * has one: `paramSeam`); `known` is false for a name the part lacks, which kit/compose reports (S111) with what the
 * part does have.
 * @typedef {{ readonly program: object, readonly part: string, readonly dialect: string, readonly side: "out" | "in" | "frame" | "param", readonly name: string, readonly known: boolean, readonly seam?: string, readonly dims?: number }} Handle
 */

/** @param {unknown} v @returns {v is Handle} */
export const isHandle = (v) => v !== null && typeof v === "object" && /** @type {any} */ (v)[HANDLE] === true;

/** A handle as messages write it: `level.out.picked`. @param {Handle} h */
export const handleText = (h) => `${h.part}.${h.side}.${h.name}`;

/** Properties a handle may lack (`seam` on a frame, `dims` on a port) and the one promises probe: reading them is not a mistake. */
const OPTIONAL = new Set(["seam", "dims", "then"]);

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
 * One handle, frozen; reading a property it lacks throws S301, and reading it as a number or string records where.
 * @param {object} program @param {string} part @param {string} dialect @param {Handle["side"]} side @param {string} name
 * @param {boolean} known @param {string | null} seam @param {number} [dims] @returns {Handle}
 */
function makeHandle(program, part, dialect, side, name, known, seam, dims) {
  const text = `${part}.${side}.${name}`;
  const handle = Object.freeze({
    [HANDLE]: true, program, part, dialect, side, name, known,
    ...(seam !== null ? { seam } : {}),
    ...(dims !== undefined ? { dims } : {}),
    [Symbol.toPrimitive]() {
      const list = reads.get(program) ?? [];
      reads.set(program, list);
      list.push({ handle: text, ...callSite() });
      return Number.NaN;
    },
    toString() { return `[handle ${text}]`; },
    toJSON() { return `[handle ${text}]`; },
  });
  // A property the handle lacks would read as undefined, so `a.out.x.y` in a test takes a branch silently: it throws.
  return new Proxy(handle, {
    get(t, prop, receiver) {
      if (typeof prop === "symbol" || prop in t || OPTIONAL.has(prop)) return Reflect.get(t, prop, receiver);
      const { file, loc } = callSite();
      throw Object.assign(new Error(`${text}.${prop} is read at build time; a handle is not a value: it only names a port, a frame or a param, for .wire and .frame (S301 at ${file}:${loc.start.line})`), { code: "S301", file, loc });
    },
  });
}

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
    const port = side === "frame" ? undefined : known ? /** @type {any} */ (declared)[name] : undefined;
    const frame = side === "frame" && known ? seams.frames[name] : undefined;
    return makeHandle(program, part, dialect, side, name, known, port ? /** @type {string} */ (port.seamText) : null, frame ? frame.dims : undefined);
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

/**
 * The seam a param's declaration gives a wire into it: its value's type, `f64` for a number, `bool`, `str`, or the
 * enum of its `options` for a string that has them; null for a declaration a wire cannot set (a date, an object).
 * @param {unknown} decl @returns {string | null}
 */
export function paramSeam(decl) {
  if (decl === null || typeof decl !== "object") return null;
  const d = /** @type {{ value?: unknown, options?: unknown, kind?: unknown }} */ (decl);
  if (d.kind !== undefined) return null;
  if (typeof d.value === "number") return "f64";
  if (typeof d.value === "boolean") return "bool";
  if (typeof d.value !== "string") return null;
  return Array.isArray(d.options) && d.options.length && d.options.every((o) => typeof o === "string") ? d.options.map((o) => `'${o}'`).join(" | ") : "str";
}

/** Each Program's param handles, by name and whether it was declared when first read. @type {WeakMap<object, Map<string, Handle>>} */
const paramHandles = new WeakMap();

/**
 * A Program's param side: `<part>.param.<name>` for each param it declares (`declared()`, read at each access, since
 * the chain declares them as it goes), and a `known: false` handle for any other name. With `method` (the Grammar's
 * param slot is itself named `param`), the side is that method too: calling it declares a param, and the method's
 * own properties (`call`, `bind` …) answer as a function's unless a param of that name is declared.
 * @param {{ declared(): Map<string, unknown> }} program @param {string} part @param {string} dialect @param {Function} [method]
 * @returns {object}
 */
export function paramSideOf(program, part, dialect, method) {
  const cache = paramHandles.get(program) ?? new Map();
  paramHandles.set(program, cache);
  /** @param {string} name */
  const handle = (name) => {
    const decl = program.declared().get(name);
    const known = program.declared().has(name);
    const k = `${known}:${name}`;
    let h = cache.get(k);
    if (!h) cache.set(k, (h = makeHandle(program, part, dialect, "param", name, known, known ? paramSeam(decl) : null)));
    return h;
  };
  return new Proxy(method ?? Object.create(null), {
    get(t, prop, receiver) {
      if (typeof prop === "symbol") return method ? Reflect.get(t, prop, receiver) : undefined;
      if (program.declared().has(prop)) return handle(prop);
      if (method && prop in t) return Reflect.get(t, prop, receiver);
      if (!method && prop === "then") return undefined;
      return handle(prop);
    },
    set() { return false; },
  });
}
