// A composition diagnostic as the seams draft prints it: the glue's line, one line per side, then the fix.
//
//   workbench.js:14: S251 level.out.picked cannot feed fx.in.burst: …
//     from: level.out.picked  Event<{ at: point2@cell }>  (maze 0.2.0)
//     to:   fx.in.burst       Event<{ at: point2@px }>    (particles 0.3.0)
//     fix: write .frame(level.frame.cell, fx.frame.px, "fit"), or …

/** @import { ComposeDiagnostic, Side } from "./compose.js" */

/** What a side's label prints: `level.out.picked`, `level.frame.cell`, or the part alone. @param {Side} s */
const label = (s) => (s.port !== undefined ? `${s.part}.${s.port}` : s.frame !== undefined ? `${s.part}.frame.${s.frame}` : s.part);
/** What a side's middle column prints: its seam, its dims, or what the part has. @param {Side} s */
const middle = (s) => (s.has ? `has ${s.has.join(", ") || "none"}` : s.seam ?? (s.dims !== undefined ? `${s.dims} dims` : ""));
/** @param {Side} s */
const pkg = (s) => `(${s.dialect}${s.version ? ` ${s.version}` : ""})`;

/**
 * The printed form of a diagnostic.
 * @param {ComposeDiagnostic} d @param {string} [base]  a URL or path prefix to drop from the file (the glue's folder)
 * @returns {string}
 */
export function formatDiagnostic(d, base) {
  let file = d.file.replace(/^file:\/\//, "");
  if (base) { const b = base.replace(/^file:\/\//, ""); if (file.startsWith(b)) file = file.slice(b.length).replace(/^\//, ""); }
  const lines = [`${file}:${d.loc.start.line}: ${d.code} ${d.message}`];
  const sides = /** @type {Array<[string, Side]>} */ ([["from:", d.from], ["to:  ", d.to]].filter(([, s]) => s));
  const width = Math.max(0, ...sides.map(([, s]) => label(s).length));
  const mid = Math.max(0, ...sides.map(([, s]) => middle(s).length));
  for (const [k, s] of sides) lines.push(`  ${k} ${label(s).padEnd(width)}  ${middle(s).padEnd(mid)}  ${pkg(s)}`.trimEnd());
  if (d.fix) lines.push(`  fix: ${d.fix}`);
  return lines.join("\n");
}
