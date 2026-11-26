// compose(name): a glue program's composition. `.part(builder)`, `.frame(a, b, edge | "fit")`,
// `.wire(out, in, { rename?, delay? })` and `.show(part)` record calls with the glue's line; `.check(options)` gives
// every S diagnostic at once, `.build(options)` the composed record (or throws ComposeError), `.plan()` each wire's
// conversions as text. Each part is a whole Program, built and lowered by its own Grammar; nothing runs here.

import { analyze } from "./analyze.js";
import { glueSite } from "./site.js";
import { formatDiagnostic } from "./format.js";

/** @import { Loc } from "../parse/ast.js" */

/**
 * One side of a wire, an edge or a part: the part, its Dialect and package version (when the host gave it), the
 * port (`out.picked`) or frame and its seam type or dims; for a name the part lacks, what it has.
 * @typedef {{ part: string, dialect: string, version?: string, port?: string, frame?: string, seam?: string, dims?: number, has?: string[] }} Side
 */
/**
 * One diagnostic of a composition: at the glue's line (or a part's own, for a part's diagnostic), with the sides.
 * @typedef {{ code: string, severity: "error", message: string, file: string, loc: Loc, from?: Side, to?: Side, fix: string }} ComposeDiagnostic
 */
/** @typedef {{ field: string, kind: "point" | "vector" | "quantity", rate?: true, from: string, to: string, scale: number[], offset: number[] }} Conversion */
/**
 * The composed record: what the scheduler runs. Each wire's conversions, renames, delay, dropped fields, the
 * consumer's defaults it fills (`fill`, only when the producer's record lacks a defaulted field) and (for an Event)
 * the consumer's delivery are data.
 * @typedef {{ name: string, parts: Array<{ name: string, dialect: string, version?: string, record: Record<string, any> }>, wires: Array<{ from: string, to: string, convert: Conversion[], rename: Record<string, string>, delay: boolean, dropped: string[], fill?: Record<string, unknown>, delivery?: import("../define/define.js").Delivery }>, show: string | null }} Composed
 */
/**
 * What `.check` and `.build` take: the loaded packages (for each part's version: kit/package's loadPackage results,
 * or `{ name, version }`), and the build options each part is built with (its module scope).
 * With `runtimes` (kit/define's defineRuntime results, matched to parts by Dialect name), each reliable Event wire's queue
 * is sized (S116), a frame consumer's by `catchUp`, the most workbench time one display frame may cover (seconds,
 * default 1/15).
 * @typedef {{ packages?: Array<{ name: string, version: string, dialect?: unknown }>, build?: import("../define/define.js").BuildOptions, runtimes?: import("../define/runtime.js").Runtime[], catchUp?: number }} ComposeOptions
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
    /** @param {unknown} part */
    show: (part) => push({ kind: "show", value: part }),
    /** Every S diagnostic, and the parts' own. @param {ComposeOptions} [o] @returns {ComposeDiagnostic[]} */
    check: (o) => run(o).diagnostics,
    /** The composed record; throws ComposeError with every diagnostic when there are any. @param {ComposeOptions} [o] @returns {Composed} */
    build: (o) => {
      const a = run(o);
      if (a.diagnostics.length) throw new ComposeError(a.diagnostics);
      return a.record;
    },
    /** Each checked wire and its conversions, as text: `level.out.picked → fx.in.burst: at: maze.cell → particles.px, point, ×32 +16`. @param {ComposeOptions} [o] */
    plan: (o) => run(o).plan,
  });
  MADE.add(api);
  return api;
}
