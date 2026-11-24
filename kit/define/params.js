// Binding-time parameters (project/2026-11-24-binding-time-design.md, Option A as ruled): a Program file exports
// a function of its params, `($) => program(…)…`, and `run` calls it with a recording `$`. Build-time code that
// reads `$.topN` gets a plain value, which the record keeps where it went (the record is folded), and the read is
// kept in the record's `reads`, placed before the builder call that came next. The same param read inside a lambda
// is a Kernel read, a uniform. Lowering reports each param's binding time (`bindings`), `bindingText` prints it,
// and `needsRebuild` says whether a change of values needs `run` again. Builds are synchronous, so one open run
// at a time is safe.

import { callSite } from "./site.js";
import { didYouMean } from "./codes.js";
import { PROBES, OBJECT_PROBES } from "./validate-grammar.js";
import { BuildError, programOf } from "./grammar.js";

/** @import * as T from "./define.js" */
/** @import { Loc } from "../parse/ast.js" */

/**
 * One build-time read of a param: its name, the value build-time code got, the builder call made next after it
 * (null when none came after; it orders the read, not who used the value) and where the read was.
 * @typedef {{ param: string, value: unknown, by: string | null, file: string, loc: Loc }} Read
 */

/**
 * What a run's Program tells the run: its params as declared so far, and its Dialect's params convention.
 * @typedef {{ declared(): Map<string, unknown>, paramSlot(): string | undefined, dialectParams(): T.DialectDef["params"] }} RunProgram
 */

/**
 * One run: the host's values, the reads so far, the Program once it opens, and every refusal the recording `$`
 * made (each is thrown into build-time code and also kept here, so code that catches one does not make the run
 * succeed). `early` holds reads made before the Program opened of a name some Dialect knows only at run time:
 * whether such a read is B014 or B003 depends on the Program's Dialect, so it is decided when the Program opens.
 * @typedef {{ values: Record<string, unknown>, reads: Read[], pending: Array<Omit<Read, "by">>, program: RunProgram | null, closed: boolean, refusals: T.BuildDiagnostic[], early: Array<{ prop: string, diagnostic: T.BuildDiagnostic }> }} Run
 */

/** The open run, while `programFn` runs. @type {Run | null} */
let current = null;

const RUN_KEYS = ["values", "scope", "sources", "buildTime"];

/**
 * A Program opened its root: the first one in a run is the run's Program.
 * @param {RunProgram} program
 */
export function noteRoot(program) {
  if (!current || current.program) return;
  current.program = program;
  settleEarly(current);
}

/**
 * Decides each read made before the Program opened: B014 when the Program's Dialect knows the name only at run
 * time, else B003 (read before declared), worded for no Dialect when no Program opened. Each is then a refusal.
 * @param {Run} run
 */
function settleEarly(run) {
  const conv = run.program?.dialectParams();
  for (const { prop, diagnostic } of run.early) {
    if (conv?.runtime?.includes(prop)) Object.assign(diagnostic, runtimeOnly(conv, prop, diagnostic));
    run.refusals.push(diagnostic);
  }
  run.early = [];
}

/**
 * Keeps a refusal on the run and returns it as the error to throw into build-time code.
 * @param {Run} run @param {T.BuildDiagnostic} d
 */
function refuse(run, d) {
  run.refusals.push(d);
  return new BuildError([d]);
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

/** The params conventions of every Dialect a Grammar was defined over, for a read made before a Program opens. */
const conventions = /** @type {Set<NonNullable<T.DialectDef["params"]>>} */ (new Set());

/**
 * A Grammar was defined over a Dialect: its params convention, if any, names run-time-only members that a read
 * before any Program opens can still be told about (B014, not B003).
 * @param {T.DialectDef["params"]} conv
 */
export function noteConvention(conv) {
  if (conv) conventions.add(conv);
}

/**
 * B014 for a read of a run-time-only member through `conv`, at the read's place (`at`, else here).
 * @param {NonNullable<T.DialectDef["params"]>} conv @param {string} prop @param {T.BuildDiagnostic} [at]
 * @returns {T.BuildDiagnostic}
 */
function runtimeOnly(conv, prop, at) {
  const via = conv.name;
  const d = refusal("B014", `${via}.${prop} is known only while the Program runs, not when it is built: build-time code cannot read it`, `read it inside the lambda: (…) => … ${via}.${prop} …`);
  return { ...d, ...(at ? { loc: at.loc, file: at.file } : {}), fix: `${via}.${prop}` };
}

/**
 * B015: the params read other than by name (`in`, spread, Object.keys, JSON.stringify, a rest pattern), which a
 * recording `$` could neither answer truly nor record.
 * @param {Run} run @param {string} how @param {string} [prop]
 */
function notByName(run, how, prop) {
  if (run.closed) throw new Error(`the params were read (${how}) after run() returned: read them while the Program is built`);
  const via = run.program?.dialectParams()?.name ?? "$";
  const fix = prop === undefined ? undefined : `${via}.${prop}`;
  return refuse(run, { ...refusal("B015", `build-time code reads the params ${how}: only a read of one param by name is answered and recorded`, `read each param by name, ${fix ?? `${via}.name`}`), ...(fix ? { fix } : {}) });
}

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isObject = (v) => v !== null && typeof v === "object";

/** "a number", "a string" … for a refusal. @param {unknown} v */
const typeName = (v) => (v === null ? "null" : typeof v === "object" ? "an object" : `a ${typeof v}`);

/**
 * Why a value does not fit the param's declaration, or null: it must have the declared value's type, be finite
 * when a number, lie inside `min..max` and be one of `options` when the declaration has them. The builder holds
 * the declared value itself to the same rules (B004 at the param's call).
 * @param {unknown} value @param {Record<string, unknown>} decl
 * @returns {string | null}
 */
export function misfit(value, decl) {
  if (typeof value !== typeof decl.value) return `is ${typeName(decl.value)} param, not ${typeName(value)}`;
  if (typeof value === "number" && !Number.isFinite(value)) return `takes a finite number, not ${value}`;
  const { min, max, options } = decl;
  if (typeof value === "number" && ((typeof min === "number" && value < min) || (typeof max === "number" && value > max))) return `takes a value inside ${typeof min === "number" ? min : "-∞"}..${typeof max === "number" ? max : "∞"}, not ${value}`;
  if (Array.isArray(options) && !options.includes(value)) return `takes one of ${options.map((o) => JSON.stringify(o)).join(", ")}, not ${JSON.stringify(value)}`;
  return null;
}

/** The errors checkValue threw: the host's own mistake, never a knock-on of a refusal, so run() lets them through. */
const HOST_ERRORS = new WeakSet();

/**
 * Throws when a host value does not fit its declaration (a host's mistake, not the Program's).
 * @param {string} name @param {unknown} value @param {Record<string, unknown>} decl
 */
function checkValue(name, value, decl) {
  const why = misfit(value, decl);
  if (!why) return;
  const e = new TypeError(`run({ values }): '${name}' ${why}`);
  HOST_ERRORS.add(e);
  throw e;
}

/**
 * The `$` build-time code reads: a param's value (the host's, else the declared one), each read recorded. Only a
 * read by name is answered; `in`, spread, Object.keys and the like are B015.
 * @param {Run} run
 */
function paramsProxy(run) {
  return new Proxy({}, {
    get(_, prop) {
      if (prop === Symbol.toPrimitive) return () => "[the params]";
      if (typeof prop === "symbol") return undefined;
      // a probe is answered with nothing, unless it is Object.prototype's and the Program declares a param of it
      if (PROBES.includes(prop) && !(OBJECT_PROBES.includes(prop) && !run.closed && run.program?.declared().has(prop))) return undefined;
      if (run.closed) throw new Error(`the params were read (.${prop}) after run() returned: read them while the Program is built`);
      const program = run.program;
      if (!program) {
        const early = refusal("B003", `build-time code reads the param '${prop}' before the Program declares it`, `open the Program and declare it first, .param("${prop}", { value: … }), then read it`);
        // A name some Dialect knows only at run time: B014 or B003 depends on the Program's Dialect, decided when
        // it opens. The read answers nothing meanwhile; the run fails either way.
        if ([...conventions].some((c) => c.runtime?.includes(prop))) { run.early.push({ prop, diagnostic: early }); return undefined; }
        throw refuse(run, early);
      }
      const conv = program.dialectParams();
      if (conv?.runtime?.includes(prop)) throw refuse(run, runtimeOnly(conv, prop));
      const declared = program.declared();
      const decl = declared.get(prop);
      const slot = program.paramSlot() ?? "param";
      if (!declared.has(prop)) throw refuse(run, refusal("B003", `there is no param '${prop}' declared before this read.${didYouMean(prop, [...declared.keys()])}`, `declare it before reading it: .${slot}("${prop}", { value: … })`));
      const own = Object.hasOwn(run.values, prop);
      const value = own ? run.values[prop] : isObject(decl) ? decl.value : undefined;
      if (own && isObject(decl)) checkValue(prop, value, decl);
      const at = callSite();
      run.pending.push({ param: prop, value, file: at.file, loc: at.loc });
      return value;
    },
    has(_, prop) {
      if (typeof prop === "symbol") return false;
      // before the Program opens its Dialect is unknown, and B015 holds for any Dialect
      const conv = run.program?.dialectParams();
      if (!run.closed && conv?.runtime?.includes(prop)) throw refuse(run, runtimeOnly(conv, prop));
      throw notByName(run, `with \`"${prop}" in …\``, prop);
    },
    ownKeys() { throw notByName(run, "as a whole (a spread, Object.keys, JSON.stringify or a rest pattern lists them)"); },
    getOwnPropertyDescriptor(_, prop) { throw notByName(run, "through a property descriptor", typeof prop === "string" ? prop : undefined); },
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
  const ctx = { values, reads: [], pending: [], program: null, closed: false, refusals: [], early: [] };
  current = ctx;
  /** @type {unknown} */
  let out;
  /**
   * The run stopped at these refusals, with no record.
   * @param {T.BuildDiagnostic[]} diagnostics @param {unknown} [cause]
   */
  const stopped = (diagnostics, cause) => {
    // The host's typo is still its own mistake, though the Program stopped before declaring every param (so a
    // param declared after the stop is reported too; the message says where the code stopped).
    const declared = ctx.program?.declared() ?? new Map();
    const unknown = Object.keys(values).find((k) => !declared.has(k));
    if (ctx.program && unknown !== undefined) throw new TypeError(`run({ values }): the Program declares no param '${unknown}'.${didYouMean(unknown, [...declared.keys()])} (Its code stopped at ${diagnostics.map((d) => d.code).join(", ")} before declaring any more: ${diagnostics[0]?.message})`, { cause });
    return { record: null, diagnostics };
  };
  try {
    out = programFn(paramsProxy(ctx));
  } catch (e) {
    settleEarly(ctx);
    if (e instanceof BuildError) return stopped([...ctx.refusals, ...e.diagnostics.filter((d) => !ctx.refusals.includes(d))], e);
    if (e !== null && typeof e === "object" && HOST_ERRORS.has(e)) throw e;
    // an exception after a refusal (one build-time code caught, or a read before the Program opened, which
    // answered nothing) follows from it: the refusal is what to fix
    if (ctx.refusals.length) return stopped(ctx.refusals, e);
    throw e;
  } finally {
    current = null;
    ctx.closed = true;
  }
  settleEarly(ctx);
  // build-time code caught a refusal and went on: the run still fails with it
  if (ctx.refusals.length) return stopped(ctx.refusals);
  const program = programOf(out);
  if (!program || program !== ctx.program) throw new TypeError(`run(programFn): programFn($) must return the Program's builder chain (without .build()), not ${out === null || typeof out !== "object" ? String(out) : "an object"}`);
  for (const r of ctx.pending) ctx.reads.push({ ...r, by: null });
  const declared = program.declared();
  for (const [k, v] of Object.entries(values)) {
    if (!declared.has(k)) throw new TypeError(`run({ values }): the Program declares no param '${k}'.${didYouMean(k, [...declared.keys()])}`);
    const decl = declared.get(k);
    if (isObject(decl)) checkValue(k, v, decl); // a malformed declaration is the Program's B004, found below
  }
  program.useValues(values);
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
 * One param's binding time: the build-time reads (each with the builder call made next) and the Kernels that read it.
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
 * Kernel listings: where each build-time read was and the builder call made next, then the Kernels that read it.
 * `topN   folded at build, read at 05-query.js:22 (before top.limit#5)`, `year   uniform, read by top.filter#0`.
 * @param {{ params: Record<string, Binding> }} lowered  what a Grammar's lower() returned
 */
export function bindingText(lowered) {
  const entries = Object.entries(lowered.params ?? {});
  const width = Math.max(0, ...entries.map(([n]) => n.length));
  return entries.map(([n, b]) => {
    const at = [...new Set(b.build.map((r) => `${r.file.replace(/^.*\//, "")}:${r.loc.start.line} (${r.by ? `before ${r.by}` : "after the last builder call"})`))];
    const text = at.length
      ? `folded at build, read at ${at.join(", ")}${b.kernels.length ? `; also read by ${b.kernels.join(", ")}` : ""}`
      : b.kernels.length ? `uniform, read by ${b.kernels.join(", ")}` : "uniform, not read";
    return `${n.padEnd(width)}   ${text}`;
  }).join("\n");
}
