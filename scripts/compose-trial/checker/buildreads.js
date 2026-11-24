// S301 for the build-time reads a Proxy cannot see. An output handle traps arithmetic, ordering comparisons,
// loops and member reads (handles.js), but JavaScript gives a program no hook on `if (x)`, `!x`, `x ? a : b`,
// `x && y` or `x === y`, which all see an object. So program.js's text is scanned for a part's output
// (`name.out.<x>`) outside every runtime lambda, next to one of those operators. Only the operators are
// matched: an alias (`const o = game.out`) is not followed, and an output passed to a call is a connection,
// which is allowed.

import { session } from "./session.js";
import { blank } from "./source.js";
import { buildReadFix } from "./handles.js";

/** An operator that follows the output and tests it (`===` and `==` also catch `!==` and `!=`). */
const AFTER = /^(?:[=!]==?|&&|\|\||\?\?|\?(?!\.))/;
/** What precedes the output when it is a condition or negated. */
const BEFORE = /(?:!|\b(?:if|while)\s*\()$/;

/** The runtime lambdas recorded in program.js, each blanked out of `code` so only build-time text remains. @param {string} text @param {string} code */
function withoutLambdas(text, code) {
  let out = code;
  for (const rec of session.lambdas) {
    if (rec.site.file !== "program.js") continue;
    const src = String(rec.fn);
    const from = text.split("\n").slice(0, rec.site.line - 1).reduce((n, l) => n + l.length + 1, 0);
    let at = text.indexOf(src, from);
    if (at < 0) at = text.indexOf(src);
    if (at >= 0) out = out.slice(0, at) + src.replace(/[^\n]/g, " ") + out.slice(at + src.length);
  }
  return out;
}

/** Reports S301 for each test of an output at build time that the handle could not trap. */
export function staticBuildReads() {
  const text = session.sources["program.js"] ?? "";
  const names = session.parts.map((p) => p.binding).filter((b) => b !== null);
  if (!names.length) return;
  const code = withoutLambdas(text, blank(text));
  const out = new RegExp(`(?<![\\w$.])(${names.map((n) => n.replace(/\$/g, "\\$")).join("|")})\\s*\\.\\s*out\\s*\\.\\s*([A-Za-z_$][\\w$]*)`, "g");
  for (const m of code.matchAll(out)) {
    const index = m.index ?? 0;
    const before = code.slice(0, index).trimEnd();
    const after = code.slice(index + m[0].length).trimStart();
    const how = AFTER.test(after) ? "in a comparison, a condition or a ternary" : BEFORE.test(before) ? "as a condition or negated" : null;
    if (!how) continue;
    const site = { file: "program.js", line: code.slice(0, index).split("\n").length };
    if (session.has(site, "S301")) continue;
    const what = `${m[1]}.out.${m[2]}`;
    session.add("S301", site, `${what} is known only at run time, but it was read at build time (${how}).`, buildReadFix(site, what));
  }
}
