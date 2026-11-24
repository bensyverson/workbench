// Measures the two styles of each H3 sketch: lines, characters, tokens and nesting depth of the
// Program's own Lambdas (the pixel lambda and its helpers; the Library is not counted, it is the
// same in both). Run: node scripts/h3-styles/measure.js [--json]
import { swirl, bulge } from "../../kit/dialects/fields/programs/uv-remaps.js";
import { domainWarp } from "../../kit/dialects/fields/programs/domain-warp.js";
import { swirlCalls, bulgeCalls } from "../../kit/dialects/fields/programs/uv-remaps-calls.js";
import { domainWarpCalls } from "../../kit/dialects/fields/programs/domain-warp-calls.js";

/** @import { FieldProgram } from "../../kit/dialects/fields/decls.js" */

/** A JS token: a number, a name, a string, or one punctuation or operator. */
const TOKEN = /\d+\.?\d*(?:e[+-]?\d+)?|[A-Za-z_$][\w$]*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|===|!==|<=|>=|&&|\|\||\+\+|=>|[^\s\w]/g;

/**
 * @param {FieldProgram} p
 * @returns {string}  Every Lambda the author wrote, joined.
 */
const authored = (p) => [p.pixel, ...p.units.map((u) => u.src)].join("\n");

/**
 * Deepest nesting of parentheses (calls and groups) within one statement, and of braces over the whole text.
 * @param {string} src
 */
function depths(src) {
  let paren = 0, maxParen = 0, brace = 0, maxBrace = 0;
  for (const ch of src) {
    if (ch === "(") maxParen = Math.max(maxParen, ++paren);
    else if (ch === ")") paren--;
    else if (ch === "{") maxBrace = Math.max(maxBrace, ++brace);
    else if (ch === "}") brace--;
  }
  return { maxParen, maxBrace };
}

/** @param {FieldProgram} p */
export function measure(p) {
  const src = authored(p);
  const lines = src.split("\n").filter((l) => l.trim() !== "");
  return {
    lines: lines.length,
    chars: src.replace(/\s+/g, " ").trim().length,
    tokens: (src.match(TOKEN) ?? []).length,
    longestLine: Math.max(...lines.map((l) => l.trim().length)),
    ...depths(src),
  };
}

export const PAIRS = /** @type {const} */ ([
  ["swirl", swirl, swirlCalls],
  ["bulge", bulge, bulgeCalls],
  ["domain-warp", domainWarp, domainWarpCalls],
]);

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = PAIRS.map(([name, typed, calls]) => ({ name, typed: measure(typed), calls: measure(calls) }));
  if (process.argv.includes("--json")) console.log(JSON.stringify(rows, null, 2));
  else {
    const keys = /** @type {const} */ (["lines", "chars", "tokens", "longestLine", "maxParen"]);
    console.log(`| sketch | metric | typed | calls | calls / typed |\n|---|---|---|---|---|`);
    for (const r of rows) for (const k of keys) console.log(`| ${r.name} | ${k} | ${r.typed[k]} | ${r.calls[k]} | ${(r.calls[k] / r.typed[k]).toFixed(2)} |`);
  }
}
