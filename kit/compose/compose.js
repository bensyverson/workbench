// compose(name): a glue program's composition. `.part(builder)`, `.frame(a, b, edge | "fit")`,
// `.wire(out, in, { rename?, set?, delay?, overflow? })`, `.wire(out, <part>.param.<name>)` and `.show(part)` (or
// `.show(<output>, <output>, ...)`, a layer named `layers`: layer.js) record
// calls with the glue's line; `.check(options)` gives every S diagnostic at once, `.build(options)` the composed
// record (or throws ComposeError), `.plan()` each wire's conversions as text. Each part is a whole Program, built
// and lowered by its own Grammar; nothing runs here.

import { analyze } from "./analyze.js";
import { glueSite } from "./site.js";
import { formatDiagnostic } from "./format.js";
import { makeLayer, SHORTHAND } from "./layer.js";

/** @import { Loc } from "../parse/ast.js" */

/**
 * One side of a wire, an edge or a part: the part, its Dialect and package version (when the host gave it), the
 * port (`out.picked`) or frame and its seam type or dims; for a name the part lacks, what it has.
 * @typedef {{ part: string, dialect: string, version?: string, port?: string, frame?: string, seam?: string, dims?: number, has?: string[] }} Side
 */
/**
 * One diagnostic of a composition: at the glue's line (or a part's own, for a part's diagnostic), with the sides.
 * @typedef {{ code: string, severity: "error" | "warning", message: string, file: string, loc: Loc, from?: Side, to?: Side, fix: string }} ComposeDiagnostic
 */
/** @typedef {{ field: string, kind: "point" | "vector" | "quantity" | "draw", rate?: true, from: string, to: string, fromId: string, toId: string, scale: number[], offset: number[] }} Conversion */
// `from` and `to` are the frames as messages print them (<dialect>.<frame>); `fromId` and `toId` are their ids in the frame graph (<part>.<frame>, or s), which replan reads: a printed name may hold dots.
/**
 * The composed record: what the scheduler runs. Each wire's conversions, renames, delay, dropped fields, the
 * consumer's defaults it fills (`fill`, only when the producer's record lacks a defaulted field), its constants
 * (`set`) and (for an Event) the consumer's delivery are data. A param wire's `to` is `<part>.param.<name>`. The renderer profile `check`/`build` was given (resolved from its name) is `profile`; the glue's edges are `frames`.
 * @typedef {{ name: string, parts: Array<{ name: string, dialect: string, version?: string, record: Record<string, any>, layer?: { inputs: string[], max: number, frame: string }, controls?: Record<string, import("./page.js").PageControl>, pointer?: Record<string, string> }>, wires: Array<{ from: string, to: string, convert: Conversion[], rename: Record<string, string>, delay: boolean, overflow?: "keepLast" | "keepFirst", dropped: string[], fill?: Record<string, unknown>, set?: Record<string, unknown>, delivery?: import("../define/define.js").Delivery }>, frames: GlueFrame[], show: string | null, view?: string, profile?: import("../draw/profiles.js").Profile }} Composed
 */
/**
 * One glue `.frame` call that planned, in glue order: its two frames (`<part>.<frame>`), its line, the edge as written
 * (normalized per axis, or "fit") and the edge computed for the records the composition was built with. kit/run plans
 * the edges again from these after a rebuild (replan.js).
 * @typedef {{ from: string, to: string, line: number, given: import("./edges.js").Given, edge: import("../seam/frames.js").Edge }} GlueFrame
 */
/**
 * What `.check` and `.build` take: the loaded packages (for each part's version: kit/package's loadPackage results,
 * or `{ name, version }`), and the build options each part is built with (its module scope).
 * With `runtimes` (kit/define's defineRuntime results, matched to parts by Dialect name), each reliable Event wire's queue
 * is sized (S116), a frame consumer's by `catchUp`, the most workbench time one display frame may cover (seconds,
 * default 1/15).
 * @typedef {{ packages?: Array<{ name: string, version?: string, dialect?: unknown, ui?: unknown }>, build?: import("../define/define.js").BuildOptions, runtimes?: import("../define/runtime.js").Runtime[], catchUp?: number, profile?: import("../draw/profiles.js").Profile | string }} ComposeOptions
 */
/** @typedef {{ kind: "part", value: unknown } | { kind: "frame", a: unknown, b: unknown, edge: unknown } | { kind: "wire", from: unknown, to: unknown, options: unknown } | { kind: "show", value: unknown }} GlueCall */

/** A composition that does not build: every diagnostic. */
export class ComposeError extends Error {
  /** @param {ComposeDiagnostic[]} diagnostics */
  constructor(diagnostics) {
    super(diagnostics.map((d) => formatDiagnostic(d)).join("\n"));
    this.name = "ComposeError";
    this.diagnostics = diagnostics;
  }
}

/** What compose() made, so a host can tell a composition from a look-alike. */
const MADE = new WeakSet();
/** @param {unknown} v */
export const isComposition = (v) => v !== null && typeof v === "object" && MADE.has(v);

/** Each composition's calls, so a host can reach its parts' Programs (callGlue's args). @type {WeakMap<object, Array<{ kind: string, value?: unknown }>>} */
const CALLS = new WeakMap();
/** The values a composition's .part calls were given, in order. @param {object} composition */
export const partsOf = (composition) => (CALLS.get(composition) ?? []).filter((c) => c.kind === "part").map((c) => c.value);

/**
 * Starts a composition. Its name is the workbench's, in addresses (`lab:<name>#level.out.picked`).
 * @param {string} name
 */
export function compose(name) {
  const start = glueSite();
  /** @type {Array<GlueCall & { at: { file: string, loc: Loc } }>} */
  const calls = [];
  const push = (/** @type {GlueCall} */ c) => { calls.push({ ...c, at: glueSite() }); return api; };
  const run = (/** @type {ComposeOptions | undefined} */ o) => analyze(name, start, calls, o ?? {});
  const api = Object.freeze({
    /** @param {unknown} builder */
    part: (builder) => push({ kind: "part", value: builder }),
    /** @param {unknown} a @param {unknown} b @param {unknown} edge */
    frame: (a, b, edge) => push({ kind: "frame", a, b, edge }),
    /** @param {unknown} from @param {unknown} to @param {unknown} [options] */
    wire: (from, to, options) => push({ kind: "wire", from, to, options }),
    /** A part or a layer; or two or more Draw outputs, bottom first, which make a layer named `layers`. @param {...unknown} shown */
    show: (...shown) => push({ kind: "show", value: shown.length === 1 ? shown[0] : makeLayer(SHORTHAND, shown, glueSite(), shown.length === 0 ? ".show()" : `.show(${shown.length} outputs)`) }),
    /** Every S diagnostic, and the parts' own. @param {ComposeOptions} [o] @returns {ComposeDiagnostic[]} */
    check: (o) => run(o).diagnostics,
    /** The composed record; throws ComposeError with every diagnostic (warnings included) when any is an error. @param {ComposeOptions} [o] @returns {Composed} */
    build: (o) => {
      const a = run(o);
      if (a.diagnostics.some((d) => d.severity === "error")) throw new ComposeError(a.diagnostics);
      return a.record;
    },
    /** Each checked wire and its conversions, as text: `level.out.picked → fx.in.burst: at: maze.cell → particles.px, point, ×32 +16`. @param {ComposeOptions} [o] */
    plan: (o) => run(o).plan,
  });
  MADE.add(api);
  CALLS.set(api, calls);
  return api;
}
