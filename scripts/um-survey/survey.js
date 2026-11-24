// Inventory of the Uncommon Math book's sketches: which are fragment-style, and what each one uses.
// Usage: node scripts/um-survey/survey.js [--book <path>] [--kind frag|pixel-loop|canvas] [--sketch <id>] [--detail] [--json]
import { loadBook, DEFAULT_BOOK } from "./book.js";
import { analyze } from "./analyze.js";

const args = process.argv.slice(2);
const opt = (/** @type {string} */ name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const book = loadBook(opt("--book") ?? DEFAULT_BOOK);
const kindFilter = opt("--kind"), only = opt("--sketch");

const rows = Object.entries(book.sketches)
  .filter(([id]) => !only || id === only)
  .map(([id, s]) => ({ id, ...analyze(s.src), title: s.title, chapter: s.chapter, about: s.about }))
  .filter((r) => !kindFilter || r.kind === kindFilter);

if (args.includes("--json")) {
  console.log(JSON.stringify(rows, null, 2));
} else if (only || args.includes("--detail")) {
  for (const r of rows) printDetail(r);
} else {
  const counts = new Map();
  for (const r of rows) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
  console.log(`${Object.keys(book.sketches).length} sketches, ${book.chapters.length} chapters, ${Object.keys(book.demos).length} demos, ${countGlsl(book)} glsl listings in chapter text`);
  console.log([...counts].map(([k, n]) => `${k} ${n}`).join(", "));
  console.log("");
  console.log("id".padEnd(36), "kind".padEnd(10), "fns".padStart(3), "subset".padEnd(9), "loops".padEnd(22), "noise tex state ints  Math");
  for (const r of rows) {
    console.log(
      r.id.padEnd(36), r.kind.padEnd(10), String(r.functions.length).padStart(3),
      `${r.fit.clean}/${r.fit.total}`.padEnd(9), r.loops.join(" ").slice(0, 21).padEnd(22),
      flag(r.noise), flag(r.texture), flag(r.state), flag(r.integer), " ", r.math.join(","),
    );
  }
}

if (!only && !args.includes("--json")) {
  /** @type {Map<string, Set<string>>} */ const byCode = new Map();
  let fns = 0, clean = 0;
  for (const r of rows) for (const f of r.functions) {
    if (!f.kernel) continue;
    fns++;
    if (f.codes.length === 0) clean++;
    for (const c of f.codes) (byCode.get(c) ?? byCode.set(c, new Set()).get(c))?.add(`${r.id}:${f.name}`);
  }
  console.log(`\nkernel-candidate functions (everything but draw, setup and meta): ${fns}, ${clean} clean under kit/parse`);
  for (const [c, s] of [...byCode].sort()) console.log(`  ${c}  ${String(s.size).padStart(3)} functions`);
}

/** @param {boolean} b */
function flag(b) { return (b ? "x" : ".").padEnd(5); }

/** @param {{ chapters: { body: string }[] }} b */
function countGlsl(b) { return b.chapters.reduce((n, c) => n + (c.body.match(/```glsl/g) ?? []).length, 0); }

/** @param {ReturnType<typeof analyze> & { id: string, title: string, chapter: string, about: string }} r */
function printDetail(r) {
  console.log(`${r.id}  [${r.kind}]  chapter ${r.chapter}  ${r.title}`);
  console.log(`  ${r.about}`);
  console.log(`  params: ${r.params.join(", ") || "none"}   exports: ${r.exports.join(", ")}`);
  console.log(`  Math: ${r.math.join(", ") || "none"}   loops: ${r.loops.join(" ") || "none"}`);
  console.log(`  noise/hash ${r.noise}  texture ${r.texture}  state ${r.state}  integer ops ${r.integer}`);
  for (const f of r.functions) {
    console.log(`  ${f.name}(${f.params}) L${f.line}  ${f.lines} lines  ${f.ok ? (f.codes.length ? f.codes.join(",") : "clean") : "parse failed: " + f.codes.join(",")}  ${f.calls.join(",")}`);
  }
}
