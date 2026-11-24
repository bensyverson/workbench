// Binding-time parameters (project/2026-11-24-binding-time-design.md, Option A as ruled): a Program file exports
// a function of its params, `($) => program(…)…`, and `run` calls it with a recording `$`. Build-time code that
// reads `$.topN` gets a plain value, which the record keeps where it went (the record is folded), and the read is
// kept in the record's `reads`, landing on the builder call that came next. The same param read inside a lambda
// is a Kernel read, a uniform. Lowering reports each param's binding time (`bindings`), `bindingText` prints it,
// and `needsRebuild` says whether a change of values needs `run` again. Builds are synchronous, so one open run
// at a time is safe.

import { callSite } from "./site.js";
import { didYouMean } from "./codes.js";
import { PROBES } from "./validate-grammar.js";
import { BuildError, programOf } from "./grammar.js";

/** @import * as T from "./define.js" */
/** @import { Loc } from "../parse/ast.js" */

/**
 * One build-time read of a param: its name, the value build-time code got, the builder call it landed on (null
 * when no call came after it) and where the read was.
 * @typedef {{ param: string, value: unknown, by: string | null, file: string, loc: Loc }} Read
 */

/**
 * What a run's Program tells the run: its params as declared so far, and its Dialect's params convention.
 * @typedef {{ declared(): Map<string, Record<string, unknown>>, paramSlot(): string | undefined, dialectParams(): T.DialectDef["params"] }} RunProgram
 */

/** @typedef {{ values: Record<string, unknown>, reads: Read[], pending: Array<Omit<Read, "by">>, program: RunProgram | null, closed: boolean }} Run */

/** The open run, while `programFn` runs. @type {Run | null} */
let current = null;

const RUN_KEYS = ["values", "scope", "sources", "buildTime"];

/**
 * A Program opened its root: the first one in a run is the run's Program.
 * @param {RunProgram} program
 */
export function noteRoot(program) {
  if (current && !current.program) current.program = program;
}

/**
 * A builder call of `program`: the reads made since the last call land on it.
 * @param {RunProgram} program @param {string} by
 */
export function noteCall(program, by) {
  if (!current || current.program !== program) return;
  for (const r of current.pending) current.reads.push({ ...r, by });
  current.pending = [];
}

/**
 * @param {string} code @param {string} message @param {string} tip
 * @returns {T.BuildDiagnostic}
 */
function refusal(code, message, tip) {
  const at = callSite();
  return { code, severity: "error", message, tip, loc: at.loc, range: [0, 0], file: at.file };
}

/**
 * The `$` build-time code reads: a param's value (the host's, else the declared one), each read recorded.
 * @param {Run} run
 */
function paramsProxy(run) {
  return new Proxy({}, {
    get(_, prop) {
      if (prop === Symbol.toPrimitive) return () => "[the params]";
      if (typeof prop === "symbol" || PROBES.includes(prop)) return undefined;
      if (run.closed) throw new Error(`the params were read (.${prop}) after run() returned: read them while the Program is built`);
      const program = run.program;
      if (!program) throw new BuildError([refusal("B003", `build-time code reads the param '${prop}' before the Program declares it`, `open the Program and declare it first, .param("${prop}", { value: … }), then read it`)]);
      const conv = program.dialectParams();
      const via = conv?.name ?? "$";
      if (conv?.runtime?.includes(prop)) {
        throw new BuildError([{ ...refusal("B014", `${via}.${prop} is known only while the Program runs, not when it is built: build-time code cannot read it`, `read it inside the lambda: (…) => … ${via}.${prop} …`), fix: `${via}.${prop}` }]);
      }
      const declared = program.declared();
      const decl = declared.get(prop);
      const slot = program.paramSlot() ?? "param";
      if (!decl) throw new BuildError([refusal("B003", `there is no param '${prop}' declared before this read.${didYouMean(prop, [...declared.keys()])}`, `declare it before reading it: .${slot}("${prop}", { value: … })`)]);
      const own = Object.hasOwn(run.values, prop);
      const value = own ? run.values[prop] : decl.value;
      if (own && typeof value !== typeof decl.value) throw new TypeError(`run({ values }): '${prop}' is ${typeof decl.value === "object" ? "an object" : `a ${typeof decl.value}`} param, not ${typeof value}`);
      const at = callSite();
      run.pending.push({ param: prop, value, file: at.file, loc: at.loc });
      return value;
    },
  });
}

/**
 * Builds a Program file's default export, a function of its params: calls it with a recording `$`, then checks
 * and builds the Program it returns with the module scope in `options`. A refusal (thrown at a call, as B001 is,
 * or collected) comes back in `diagnostics`, with no record. The record keeps the values build-time code read
 * where they went, and the reads under `reads`.
 * @param {(params: any) => unknown} programFn
 * @param {{ values?: Record<string, unknown> } & T.BuildOptions} [options]  `values` replace the params' declared values
 * @returns {{ record: Record<string, any> | null, diagnostics: T.BuildDiagnostic[] }}
 */
export function run(programFn, options = {}) {
  if (typeof programFn !== "function") throw new TypeError("run(programFn): programFn is the Program file's default export, ($) => program(…)…, not a builder chain");
  if (options === null || typeof options !== "object" || Array.isArray(options)) throw new TypeError(`run(programFn, options): options are { ${RUN_KEYS.join(", ")} }`);
  for (const k of Object.keys(options)) if (!RUN_KEYS.includes(k)) throw new TypeError(`run(programFn, options): unknown key '${k}'; it takes { ${RUN_KEYS.join(", ")} }`);
  const { values = {}, ...build } = options;
  if (values === null || typeof values !== "object" || Array.isArray(values)) throw new TypeError("run({ values }): values are the params' values, by name");
  if (current) throw new Error("run() does not nest: a Program's code may not call run");
  /** @type {Run} */
  const ctx = { values, reads: [], pending: [], program: null, closed: false };
  current = ctx;
  /** @type {unknown} */
  let out;
  try {
    out = programFn(paramsProxy(ctx));
  } catch (e) {
    if (e instanceof BuildError) return { record: null, diagnostics: e.diagnostics };
    throw e;
  } finally {
    current = null;
    ctx.closed = true;
  }
  const program = programOf(out);
  if (!program || program !== ctx.program) throw new TypeError(`run(programFn): programFn($) must return the Program's builder chain (without .build()), not ${out === null || typeof out !== "object" ? String(out) : "an object"}`);
  for (const r of ctx.pending) ctx.reads.push({ ...r, by: null });
  const declared = program.declared();
  for (const k of Object.keys(values)) if (!declared.has(k)) throw new TypeError(`run({ values }): the Program declares no param '${k}'.${didYouMean(k, [...declared.keys()])}`);
  const diagnostics = program.analyze(build).diagnostics;
  if (diagnostics.some((d) => d.severity === "error")) return { record: null, diagnostics };
  const record = program.build(build);
  record.reads = ctx.reads;
  return { record, diagnostics };
}

/**
 * Whether a change to these params needs `run` again: true when build-time code read one of them. A param read
 * only inside lambdas is a uniform, which the host sets without a rebuild.
 * @param {Record<string, any>} record  what `run` built @param {string[]} changed
 */
export function needsRebuild(record, changed) {
  return (/** @type {Read[]} */ (record.reads ?? [])).some((r) => changed.includes(r.param));
}

/**
 * One param's binding time: the build-time reads (each landing on a builder call) and the Kernels that read it.
 * `live` (a uniform, changed without a rebuild) holds when build-time code did not read it.
 * @typedef {{ build: Array<{ by: string | null, file: string, loc: Loc }>, kernels: string[], live: boolean }} Binding
 */

/**
 * Each declared param's binding time, from the record's reads and the lowered Kernels' member reads of the
 * Dialect's params object.
 * @param {{ dialect: T.Dialect, def: Record<string, any>, root: { def: Record<string, any> } }} g
 * @param {Record<string, any>} record
 * @param {Array<{ id: string, kernel: unknown }>} kernels
 * @returns {Record<string, Binding>}
 */
export function bindings(g, record, kernels) {
  const slot = g.def.params?.slot;
  /** @type {string[]} */
  let names = [];
  if (slot) {
    const s = g.root.def.slots[slot];
    names = g.root.def.record === "calls"
      ? (record.calls ?? []).filter((/** @type {any} */ c) => c.slot === slot).map((/** @type {any} */ c) => c.args[0])
      : Object.keys(record[s.as ?? slot] ?? {});
  }
  const object = g.dialect.def.params?.object;
  /** @type {Record<string, Binding>} */
  const out = {};
  for (const n of names) {
    const build = (/** @type {Read[]} */ (record.reads ?? [])).filter((r) => r.param === n).map((r) => ({ by: r.by, file: r.file, loc: r.loc }));
    const by = object ? kernels.filter((k) => readsMember(k.kernel, object, n)).map((k) => k.id) : [];
    Object.defineProperty(out, n, { value: { build, kernels: by, live: build.length === 0 }, enumerable: true, writable: true, configurable: true });
  }
  return out;
}

/** Whether an IR value holds a load of `object.member`. @param {unknown} node @param {string} object @param {string} member @returns {boolean} */
function readsMember(node, object, member) {
  if (node === null || typeof node !== "object") return false;
  const n = /** @type {Record<string, any>} */ (node);
  if (n.k === "load" && n.place?.owner === object && n.place?.name === member) return true;
  return Object.values(n).some((v) => readsMember(v, object, member));
}

/**
 * One line per param: its name and its binding time, as a workbench page or an agent tool shows it beside the
 * Kernel listings. `topN   folded at build, read by top.limit#9 (05-query.js:21)`, `year   uniform, read by
 * top.filter#0`.
 * @param {{ params: Record<string, Binding> }} lowered  what a Grammar's lower() returned
 */
export function bindingText(lowered) {
  const entries = Object.entries(lowered.params ?? {});
  const width = Math.max(0, ...entries.map(([n]) => n.length));
  return entries.map(([n, b]) => {
    const at = [...new Set(b.build.map((r) => `${r.by ?? "build-time code"} (${r.file.replace(/^.*\//, "")}:${r.loc.start.line})`))];
    const text = at.length
      ? `folded at build, read by ${at.join(", ")}${b.kernels.length ? `; also read by ${b.kernels.join(", ")}` : ""}`
      : b.kernels.length ? `uniform, read by ${b.kernels.join(", ")}` : "uniform, not read";
    return `${n.padEnd(width)}   ${text}`;
  }).join("\n");
}
