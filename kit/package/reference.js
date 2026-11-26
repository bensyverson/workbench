// A package's generated reference: what a composer reads to decide what to wire, without running the package's
// code (the seams draft's question 7). For now it holds the package's seams only: each output, input and frame,
// with its seam type, note, default or required, and delivery. Constructs and slots are not printed yet.

/** @import { Seams, InPort } from "../define/define.js" */

/** A sentence's end: the note with a final period. @param {string | null | undefined} note */
const said = (note) => (note ? `: ${note.trim().replace(/[.;:,]?$/, ".")}` : ".");

/** @param {InPort} p */
function inputTerms(p) {
  /** @type {string[]} */
  const terms = [];
  if (p.seam.kind === "event") {
    const d = p.delivery ?? "reliable";
    terms.push(`delivery ${typeof d === "string" ? d : `{ keepLast: ${d.keepLast} }`}`);
    if (p.record) terms.push(`its record read as \`${p.record.name}\` in ${p.record.slots.join(", ")} lambdas`);
  } else terms.push(p.required ? "required" : `default ${JSON.stringify(p.default)}`);
  return terms;
}

/**
 * The reference of a loaded package (what kit/package's loadPackage returned, or `{ name, version, dialect }`), as
 * Markdown.
 * @param {{ name: string, version: string, dialect: { seams?: Seams } }} pkg
 * @returns {string}
 */
export function packageReference(pkg) {
  const seams = pkg.dialect.seams;
  const lines = [`# ${pkg.name} ${pkg.version}`, ""];
  const out = Object.values(seams?.out ?? {}), inp = Object.values(seams?.in ?? {}), frames = Object.values(seams?.frames ?? {});
  if (!out.length && !inp.length && !frames.length) return [...lines, "No ports or frames: nothing can be wired to this package.", ""].join("\n");
  if (out.length) {
    lines.push("## Outputs", "");
    for (const p of out) lines.push(`- \`${p.name}\`: \`${p.seamText}\`${said(p.note)}${p.seam.kind === "event" ? " Its runtime pushes the records each step." : ""}`);
    lines.push("");
  }
  if (inp.length) {
    lines.push("## Inputs", "");
    for (const p of inp) lines.push(`- \`${p.name}\`: \`${p.seamText}\`, ${inputTerms(p).join(", ")}${said(p.note)}`);
    lines.push("");
  }
  lines.push("## Frames", "");
  for (const f of frames) lines.push(`- \`${f.name}\`: ${f.dims} dims${f.extent ? ", with an extent (\"fit\" can use it)" : ""}${said(f.note)}`);
  lines.push("- the kit's `s`: seconds, the same in every package (`f64@s`, and rates such as `vec2@px/s`).", "");
  return lines.join("\n");
}
