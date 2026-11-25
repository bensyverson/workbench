// The trial agent's tool: lowers a fields Program the way the Dialect does, prints each diagnostic as the
// author would see it, and on success shows the final color at a few sample pixels.
//   node scripts/h3-trial/check.js <typed|call> <sketch.js>
// The sketch is a JS module that exports a Program built with `field(...)` and imports it as
// `import { field } from "fields";` (this tool supplies that name). Every invocation is appended to the
// JSONL file named by the environment variable H3_LOG, if set (classify.js reads it).

import { readFileSync, appendFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { lowerField, INTRINSICS, LIBRARY } from "../../kit/dialects/fields/index.js";
import { run } from "../../kit/interp/index.js";
import { BuildError } from "../../kit/define/index.js";

/** @import { FieldProgram } from "../../kit/dialects/fields/decls.js" */
/** @import { Kernel } from "../../kit/ir/ir.js" */

export const STYLES = /** @type {const} */ (["typed", "call"]);
const FIELDS_INDEX = resolve(dirname(fileURLToPath(import.meta.url)), "../../kit/dialects/fields/index.js");

/** The pixels shown on success: the unit square with y up, plus the aspect they are shown at. */
export const SAMPLES = /** @type {const} */ ([[0.1, 0.1], [0.5, 0.5], [0.9, 0.2], [0.25, 0.75], [0.5, 0.95], [0.75, 0.5]]);
export const SAMPLE_ASPECT = 1.5;

/**
 * @typedef {object} Entry
 * @property {string} where  "pixel", "fn <name>" or, for a Library function that blocks the pixel, "library <name>": the Lambda the diagnostic is in.
 * @property {string} code
 * @property {"error" | "warning" | string} severity
 * @property {string} message
 * @property {string} tip
 * @property {number} line  Line within that Lambda's source; the line holding `(uv, u) =>` is line 1.
 * @property {string} text  That line's text.
 */

/**
 * Loads the Program a sketch file exports.
 * @param {string} file
 * @returns {Promise<FieldProgram>}
 */
export async function loadProgram(file) {
  const src = readFileSync(file, "utf8").replace(/(from\s+)(["'])fields\2/g, `$1"${pathToFileURL(FIELDS_INDEX).href}"`);
  const mod = await import(`data:text/javascript;base64,${Buffer.from(src).toString("base64")}`);
  const found = Object.values(/** @type {Record<string, unknown>} */ (mod)).find((v) => typeof v === "object" && v !== null && typeof (/** @type {{ pixel?: unknown }} */ (v)).pixel === "string");
  if (!found) throw new Error('the file exports no Program: end it with `export default field("name") … .build();`');
  return /** @type {FieldProgram} */ (found);
}

/**
 * Where a build diagnostic is: the lambda it is about, named as lowering names it.
 * @param {string} message
 */
const buildWhere = (message) => {
  const helper = /^the helper '([^']+)'/.exec(message) ?? /\.fn\('([^']+)'\)/.exec(message);
  return helper ? `fn ${helper[1]}` : "pixel";
};

/**
 * The entries for a refusal from the generated builder (B007, B008, the other B codes and the
 * Grammar's own F codes), which stops the
 * sketch at `.build()`, before lowering: each is shaped like a lowering diagnostic so the classifier reads it.
 * @param {unknown} e
 * @returns {Entry[] | null}  null when `e` is not a build refusal
 */
export function buildEntries(e) {
  if (!(e instanceof BuildError)) return null;
  return e.diagnostics.map((d) => {
    const lines = (d.lambda?.src ?? "").split("\n");
    const line = d.lambda?.loc?.start.line ?? 1;
    return { where: buildWhere(d.message), code: d.code, severity: d.severity, message: d.message, tip: d.tip ?? "", line, text: (lines[line - 1] ?? "").trim() };
  });
}

/** The result of a sketch that did not build. @param {Entry[]} entries */
const refused = (entries) => ({
  ok: false, entries,
  styleNotes: /** @type {Array<{ where: string, op: string, line: number, text: string, use: string }>} */ ([]),
  samples: /** @type {Array<{ uv: number[], color: number[] | null, error?: string }>} */ ([]),
});

/**
 * Builds a Program and checks it; a refusal at `.build()` is a failed check with its entries, not a throw.
 * @param {() => FieldProgram} make
 * @param {"typed" | "call"} style
 */
export function checkBuilt(make, style) {
  try { return check(make(), style); } catch (e) {
    const entries = buildEntries(e);
    if (!entries) throw e;
    return refused(entries);
  }
}

/** @param {Kernel["body"]} body @param {(e: Record<string, any>) => void} visit */
function walk(body, visit) {
  /** @param {unknown} v */
  const go = (v) => {
    if (Array.isArray(v)) v.forEach(go);
    else if (v && typeof v === "object") {
      const o = /** @type {Record<string, any>} */ (v);
      if (typeof o.k === "string") visit(o);
      for (const [key, x] of Object.entries(o)) if (key !== "t") go(x);
    }
  };
  go(body);
}

/**
 * The line (within `src`) of each arithmetic operator the Kernel applies to vectors, for the call style, which writes none.
 * @param {Kernel} kernel
 * @param {string} src
 * @returns {Array<{ op: string, line: number }>}
 */
export function vectorOperators(kernel, src) {
  /** @type {Array<{ op: string, line: number }>} */
  const found = [];
  walk(kernel.body, (e) => {
    if (e.k === "op" && ["add", "sub", "mul", "div", "neg", "pos"].includes(e.op) && e.t && typeof e.t === "object" && "vec" in e.t) {
      found.push({ op: e.op, line: src.slice(0, e.span?.[0] ?? 0).split("\n").length });
    }
  });
  return found;
}

const OP_CALL = /** @type {Record<string, string>} */ ({ add: "vadd(a, b)", sub: "vsub(a, b)", mul: "vmul(a, b) or vscale(v, s)", div: "vdiv(a, b) or vscale(v, 1 / s)", neg: "vneg(v)", pos: "the vector itself" });

/**
 * Every function that blocks a lowering, by name: those in its `blockedBy`, then theirs, once each.
 * @param {import("../../kit/lower/index.js").LowerResult} result
 * @param {import("../../kit/lower/index.js").HelperResult[]} helpers
 * @returns {string[]}
 */
export function blockers(result, helpers) {
  const out = [...(result.blockedBy ?? [])];
  for (let i = 0; i < out.length; i++) {
    for (const n of helpers.find((h) => h.name === out[i])?.result.blockedBy ?? []) if (!out.includes(n)) out.push(n);
  }
  return out;
}

/**
 * Lowers one Program and gathers everything the tool shows.
 * @param {FieldProgram} program
 * @param {"typed" | "call"} style
 */
export function check(program, style) {
  const lowered = lowerField(program);
  /** @type {Entry[]} */
  const entries = [];
  /** @param {string} where @param {string} src @param {import("../../kit/lower/index.js").LowerResult["diagnostics"]} ds */
  const add = (where, src, ds) => {
    const lines = src.split("\n");
    for (const d of ds) entries.push({ where, code: d.code, severity: d.severity, message: d.message, tip: d.tip ?? "", line: d.loc.start.line, text: (lines[d.loc.start.line - 1] ?? "").trim() });
  };
  add("pixel", program.pixel, lowered.diagnostics);
  const own = new Set(program.units.map((u) => u.name));
  for (const h of lowered.helpers) if (own.has(h.name)) add(`${h.kind} ${h.name}`, program.units.find((u) => u.name === h.name)?.src ?? "", h.result.diagnostics);
  // A caller of a function that does not lower is blocked with no diagnostic of its own, so a Library function
  // that blocks the pixel (directly or through the sketch's helpers) shows its diagnostics here.
  for (const name of blockers(lowered.pixel, lowered.helpers)) {
    if (own.has(name)) continue;
    const h = lowered.helpers.find((x) => x.name === name);
    if (h) add(`library ${name}`, LIBRARY.find((u) => u.name === name)?.src ?? "", h.result.diagnostics);
  }
  const ok = lowered.kernel !== null && !entries.some((e) => e.severity === "error") && lowered.helpers.every((h) => h.result.kernel);
  /** @type {Array<{ where: string, op: string, line: number, text: string, use: string }>} */
  const styleNotes = [];
  if (style === "call" && ok) {
    /** @param {string} where @param {Kernel | null | undefined} k @param {string} src */
    const scan = (where, k, src) => {
      if (!k) return;
      const lines = src.split("\n");
      for (const v of vectorOperators(k, src)) styleNotes.push({ where, op: v.op, line: v.line, text: (lines[v.line - 1] ?? "").trim(), use: OP_CALL[v.op] });
    };
    scan("pixel", lowered.kernel, program.pixel);
    for (const h of lowered.helpers) if (own.has(h.name)) scan(`${h.kind} ${h.name}`, h.result.kernel, program.units.find((u) => u.name === h.name)?.src ?? "");
  }
  /** @type {Array<{ uv: number[], color: number[] | null, error?: string }>} */
  const samples = [];
  if (ok && lowered.kernel) {
    const helpers = Object.fromEntries(lowered.helpers.filter((h) => h.kind === "fn" && h.result.kernel).map((h) => [h.name, /** @type {Kernel} */ (h.result.kernel)]));
    const u = { ...Object.fromEntries(Object.entries(program.params).map(([k, d]) => [k, d.value])), t: 0, aspect: SAMPLE_ASPECT };
    for (const uv of SAMPLES) {
      try {
        samples.push({ uv: [...uv], color: /** @type {number[]} */ (run(lowered.kernel, [[...uv], u], { helpers, intrinsics: INTRINSICS })) });
      } catch (e) {
        samples.push({ uv: [...uv], color: null, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  return { ok, entries, styleNotes, samples };
}

/** @param {number} x */
const show = (x) => (Number.isNaN(x) ? "NaN" : (Math.round(x * 10000) / 10000).toString());

/**
 * The text the agent reads.
 * @param {ReturnType<typeof check>} r
 * @param {string} name
 */
export function report(r, name) {
  const out = [];
  for (const e of r.entries) {
    out.push(`${e.severity} ${e.code} in ${e.where}, line ${e.line}: ${e.message}`, `    ${e.text}`, ...(e.tip ? [`    tip: ${e.tip}`] : []));
  }
  for (const n of r.styleNotes) out.push(`note in ${n.where}, line ${n.line}: this style writes vector math as calls, not operators; ${n.use} instead of '${n.op === "neg" ? "-" : { add: "+", sub: "-", mul: "*", div: "/", pos: "+" }[n.op]}' on vectors`, `    ${n.text}`);
  if (r.ok) {
    out.push(`${name}: lowers (the GLSL target's acceptance is not checked here). Final color (r, g, b) at sample pixels, with every param at its default, t = 0, aspect = ${SAMPLE_ASPECT}:`);
    for (const s of r.samples) out.push(`  uv (${s.uv.join(", ")}) -> ${s.color ? `(${s.color.map(show).join(", ")})${s.color.some(Number.isNaN) ? "  NaN: check for a division by zero or a sqrt or pow of a negative" : ""}` : `error: ${s.error}`}`);
  } else out.push(`${name}: does not lower.`);
  return out.join("\n");
}

/** @param {string[]} argv */
async function main(argv) {
  const [style, file] = argv;
  if (!STYLES.includes(/** @type {"typed" | "call"} */ (style)) || !file) {
    console.error("usage: node scripts/h3-trial/check.js <typed|call> <sketch.js>");
    return 2;
  }
  const log = process.env.H3_LOG;
  /** @type {Record<string, unknown>} */
  const record = { time: new Date().toISOString(), style, file: resolve(file), source: "" };
  try {
    record.source = readFileSync(file, "utf8");
    let name = "the sketch";
    /** @type {ReturnType<typeof check>} */
    let r;
    try {
      const program = await loadProgram(file);
      name = program.name;
      r = check(program, /** @type {"typed" | "call"} */ (style));
    } catch (e) {
      const entries = buildEntries(e);
      if (!entries) throw e;
      r = refused(entries);
    }
    console.log(report(r, name));
    Object.assign(record, { ok: r.ok, loadError: null, diagnostics: r.entries, styleNotes: r.styleNotes, samples: r.samples });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.log(`error LOAD: ${message}`);
    Object.assign(record, { ok: false, loadError: message, diagnostics: [], styleNotes: [], samples: [] });
  }
  if (log) appendFileSync(log, JSON.stringify(record) + "\n");
  return record.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
