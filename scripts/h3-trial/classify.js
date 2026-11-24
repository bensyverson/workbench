// Tallies a trial log (the JSONL check.js appends to): every diagnostic by code, and which of them come
// from expecting plain-JS semantics of a vector.
//   node scripts/h3-trial/classify.js <log.jsonl> [--json]
//
// "Expecting plain JS" is decided from the diagnostic's code and message (RULES, in order; the first match wins):
//   L003  an operator on mismatched types ("takes two vec2s, not a vec2 and f32": `uv + 1`)
//   L003  `==`, `<` or a condition on a vector ("does not compare vectors", "does not order vectors")
//   L003  `+` as concatenation or on non-numbers ("needs numbers or vectors, not \"a\" and vec2")
//   L003  an f32 mixed with an f64, or two vector types mixed ("vec3 and color")
//   L003  any other L003 on a vector operator (`%`, `**`, bitwise)
//   L001  `Math` or another global a plain-JS author reaches for
//   L002  a member plain JS or GLSL would have on a vector (`.xy`, `.length`)
//   L015  a vector built from the wrong count of components (`vec2(1)`, `vec3(c)`)
//   STYLE the call style's own rule broken: an operator on vectors
// Everything else (parse errors S0xx, L012, L007 loops, L014, L013 ...) and LOAD errors are "other".

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * @typedef {object} Rule
 * @property {string} code
 * @property {RegExp} message
 * @property {string} reason
 */

/** The diagnostics that come from expecting plain-JS semantics, first match wins. */
export const RULES = /** @type {Rule[]} */ ([
  { code: "L003", message: /does not (compare|order) vectors|vector.*(condition|truth)|cannot be used as a condition/i, reason: "a vector compared, ordered or used as a condition" },
  { code: "L003", message: /needs numbers or vectors, not/, reason: "`+` or another operator on strings or non-numbers" },
  { code: "L003", message: /\bf32\b.*\bf64\b|\bf64\b.*\bf32\b/, reason: "f32 and f64 mixed" },
  { code: "L003", message: /\bvec\d\b.*\b(color)\b|\b(color)\b.*\bvec\d\b|\bvec[234]s?\b.*\bvec[234]\b/, reason: "two vector types mixed" },
  { code: "L003", message: /not a (vec\d|color|f32).* and (a )?(vec\d|color|f32)|takes two/, reason: "an operator on mismatched types (vector and scalar)" },
  { code: "L003", message: /vector/, reason: "another operator on a vector" },
  { code: "L001", message: /'Math' is not declared/, reason: "Math (plain-JS globals)" },
  { code: "L002", message: /(vec\d|color) has no member/, reason: "a member a vector does not have (swizzle, length)" },
  { code: "L015", message: /^(vec\d|color) got/, reason: "a vector built from the wrong number of components" },
  { code: "STYLE", message: /./, reason: "an operator on vectors in the call style" },
]);

/**
 * Whether a diagnostic comes from expecting plain-JS semantics.
 * @param {{ code: string, message: string }} d
 * @returns {string | null}  The reason, or null for any other diagnostic.
 */
export function plainJsReason(d) {
  return RULES.find((r) => r.code === d.code && r.message.test(d.message))?.reason ?? null;
}

/** Replaces the parts of a message that differ between occurrences, so the same mistake counts once. */
const template = (/** @type {string} */ m) => m.replace(/"[^"]*"|'[^']*'|\b\d+(\.\d+)?\b/g, "_").slice(0, 100);

/**
 * @typedef {object} Row
 * @property {string} style
 * @property {string} file
 * @property {string} code
 * @property {string} message
 * @property {string | null} reason  Why it is plain-JS expectation, or null.
 */

/**
 * @param {string} text  The JSONL.
 */
export function classify(text) {
  const records = text.split("\n").filter((l) => l.trim()).map((l) => /** @type {Record<string, any>} */ (JSON.parse(l)));
  /** @type {Row[]} */
  const rows = [];
  for (const r of records) {
    for (const d of r.diagnostics ?? []) rows.push({ style: r.style, file: r.file, code: d.code, message: d.message, reason: plainJsReason(d) });
    for (const n of r.styleNotes ?? []) rows.push({ style: r.style, file: r.file, code: "STYLE", message: `an operator (${n.op}) on vectors at line ${n.line}`, reason: plainJsReason({ code: "STYLE", message: "operator on vectors" }) });
    if (r.loadError) rows.push({ style: r.style, file: r.file, code: "LOAD", message: r.loadError, reason: null });
  }
  /** @param {Row[]} rs */
  const tally = (rs) => {
    /** @type {Record<string, number>} */
    const byCode = {};
    /** @type {Record<string, number>} */
    const byReason = {};
    /** @type {Record<string, number>} */
    const byTemplate = {};
    let plain = 0;
    for (const x of rs) {
      byCode[x.code] = (byCode[x.code] ?? 0) + 1;
      const t = `${x.code} ${template(x.message)}${x.reason ? `  [plain-JS: ${x.reason}]` : ""}`;
      byTemplate[t] = (byTemplate[t] ?? 0) + 1;
      if (x.reason) { plain++; byReason[x.reason] = (byReason[x.reason] ?? 0) + 1; }
    }
    return { total: rs.length, plainJs: plain, other: rs.length - plain, byCode, byReason, byTemplate };
  };
  /** @param {string} style */
  const runs = (style) => {
    const mine = records.filter((r) => r.style === style);
    /** @type {Map<string, Array<Record<string, any>>>} */
    const byFile = new Map();
    for (const r of mine) byFile.set(r.file, [...(byFile.get(r.file) ?? []), r]);
    const sketches = [...byFile.values()].map((rs) => {
      const first = rs.findIndex((r) => r.ok);
      return { file: rs[0].file, invocations: rs.length, firstSuccess: first < 0 ? null : first + 1, finalOk: rs[rs.length - 1].ok === true };
    });
    return { invocations: mine.length, sketches };
  };
  const styles = [...new Set(records.map((r) => r.style))].sort();
  return {
    invocations: records.length,
    all: tally(rows),
    byStyle: Object.fromEntries(styles.map((s) => [s, { ...tally(rows.filter((x) => x.style === s)), ...runs(s) }])),
  };
}

/** @param {ReturnType<typeof classify>} c */
export function format(c) {
  const out = [`${c.invocations} invocations, ${c.all.total} diagnostics (${c.all.plainJs} from expecting plain-JS semantics, ${c.all.other} other)`];
  for (const [style, s] of Object.entries(c.byStyle)) {
    out.push("", `== ${style}: ${s.invocations} invocations, ${s.total} diagnostics, ${s.plainJs} plain-JS expectation, ${s.other} other`);
    out.push("by code: " + (Object.entries(s.byCode).map(([k, v]) => `${k} ${v}`).join(", ") || "none"));
    for (const [k, v] of Object.entries(s.byReason)) out.push(`  plain-JS: ${k}: ${v}`);
    for (const [k, v] of Object.entries(s.byTemplate).sort((a, b) => b[1] - a[1])) out.push(`  ${v}x ${k}`);
    for (const k of s.sketches) out.push(`  sketch ${k.file}: ${k.invocations} checks, first success at ${k.firstSuccess ?? "never"}, final ${k.finalOk ? "ok" : "FAILING"}`);
  }
  return out.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) { console.error("usage: node scripts/h3-trial/classify.js <log.jsonl> [--json]"); process.exit(2); }
  const c = classify(readFileSync(file, "utf8"));
  console.log(process.argv.includes("--json") ? JSON.stringify(c, null, 2) : format(c));
}
