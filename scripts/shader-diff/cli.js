// The comparison harness from Node: `check` runs the standard cases through the interpreter, the JS backend and
// (through sleepy) GLSL; `stress` the edge of the sketches' ranges; `faults` the planted faults. A thin adapter over kit/harness.

import { fileURLToPath } from "node:url";
import { standardCases, stressCase, runCase, runFaults, faultProblems, tally, glslFigure, FAULT_SCALE } from "../../kit/harness/index.js";
import { probeSleepy, sleepyRender } from "./sleepy.js";

/** @import { CaseResult, PairResult } from "../../kit/harness/run.js" */
/** @import { Render } from "../../kit/harness/run.js" */

const USAGE = `shader-diff: the fields comparison harness, interpreter against emitted JS and emitted GLSL.

  check  [--scale 1] [--no-glsl] [--json]   swirl, bulge and domain-warp over the recorded grids and param sets
  stress [--scale 1] [--no-glsl] [--json]   domain-warp at the edge of its ranges (how much headroom the tolerance has)
  faults [--scale 0.49] [--no-glsl] [--json] planted faults in each backend; which are caught and which escape
  renderer                                  what WebGL reports for the page's context (vendor, renderer)

JS is held to identical bits; GLSL to ${glslFigure()} per color component, the figure its target declares (a case may override it, and says why; --tolerance <n> overrides every figure).
GLSL runs through \`sleepy\` (headless WebKit), outside the sandbox; with no sleepy the GLSL half is skipped with a message.
Exit codes: 0 all as expected, 1 a pair differs / a fault not marked as an escape was missed, 2 usage error or sleepy missing for a run that needs it.`;

/**
 * @param {string} label
 * @param {PairResult} p
 * @param {string} tolerance
 * @returns {string[]}
 */
function describePair(label, p, tolerance) {
  const w = p.worst;
  const verdict = p.exact ? "identical" : p.over === 0 ? "within tolerance" : `${p.over} component(s) over`;
  const lines = [`  ${label.padEnd(15)} worst ${w.diff.toExponential(2)}  ${verdict}  (${tolerance})`];
  if (!p.exact) {
    const setLabel = p.sets.length > 1 ? `set ${w.set}` : "";
    lines.push(`    at pixel (${w.pixel[0]}, ${w.pixel[1]}) channel ${"rgb"[w.channel]} ${setLabel}: reference ${w.ref}, got ${w.got}`);
    if (p.at) lines.push(`    pixel came from ${p.at.kernel} line ${p.at.line}: ${p.at.text}  (JS line ${p.at.jsLine}, GLSL line ${p.at.glslLine})`);
  }
  return lines;
}

/**
 * One line for a case that overrode the figure: the override's, and the figure used when the caller's replaced it.
 * @param {{ case: string, figure: number, reason: string, held: number }} o
 * @returns {string}
 */
export const overrideLine = (o) => `override: ${o.case} is held to ${o.held}${o.held === o.figure ? "" : ` by --tolerance (its override is ${o.figure})`}: ${o.reason}`;

/**
 * @param {CaseResult} r
 * @param {import("../../kit/harness/cases.js").Case} c
 * @param {number} tolerance
 * @returns {string[]}
 */
export function describeCase(r, c, tolerance) {
  const sets = c.sets.map((s) => s.label).join("; ");
  const out = [`${r.name}  ${c.width}x${c.height} pixels, ${c.sets.length} param sets (${sets})`];
  out.push(...describePair("JS vs interp", r.jsVsInterp, "exact"));
  if (r.override) out.push(`  GLSL figure overridden to ${r.override.figure} for this case: ${r.override.reason}${tolerance !== r.override.figure ? `; held to ${tolerance} by --tolerance` : ""}`);
  if (r.glslError) out.push(`  GLSL did not run: ${r.glslError}`);
  else if (r.glslVsInterp) out.push(...describePair("GLSL vs interp", r.glslVsInterp, `tolerance ${tolerance}`));
  return out;
}

/**
 * @param {string[]} flags
 * @returns {{ render: Render | undefined, note: string | null }}
 */
function renderer(flags) {
  if (flags.includes("--no-glsl")) return { render: undefined, note: "GLSL skipped (--no-glsl)" };
  const probe = probeSleepy();
  if (!probe.ok) return { render: undefined, note: `GLSL skipped: ${probe.why}` };
  return { render: sleepyRender(), note: `GLSL on ${probe.renderer.renderer} (${probe.renderer.vendor}), ${probe.renderer.version}` };
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>} exit code
 */
export async function main(argv) {
  const [verb, ...rest] = argv;
  if (!verb || verb === "--help" || verb === "help") { console.log(USAGE); return 0; }
  /** @param {string} name */
  const flag = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
  const json = rest.includes("--json");
  /** The caller's figure for every case; absent, each case is held to its target's (or its own override). */
  const tolerance = flag("--tolerance") !== undefined ? Number(flag("--tolerance")) : undefined;
  if (tolerance !== undefined && (Number.isNaN(tolerance) || tolerance < 0)) { console.error(`--tolerance needs a number of at least 0, got '${flag("--tolerance")}'`); return 2; }
  if (verb === "renderer") {
    const probe = probeSleepy();
    console.log(JSON.stringify(probe));
    return probe.ok ? 0 : 2;
  }
  const { render, note } = renderer(rest);
  if (!json) console.log(note);
  if (verb === "check" || verb === "stress") {
    const scale = Number(flag("--scale") ?? 1);
    const cases = verb === "check" ? standardCases(scale) : [stressCase(scale)];
    let failed = false;
    const all = [];
    for (const c of cases) {
      const r = await runCase(c, { ...(render ? { render } : {}), ...(tolerance !== undefined ? { tolerance } : {}) });
      all.push(r);
      if (!json) console.log(describeCase(r, c, r.tolerance).join("\n"));
      if (!r.jsVsInterp.exact || r.glslError || (r.glslVsInterp && r.glslVsInterp.over > 0)) failed = true;
    }
    if (json) console.log(JSON.stringify(all.map((r) => ({ ...r, shape: r.shape }))));
    // `stress` reports headroom, so GLSL over the tolerance is its result, not a failure; JS differing or a shader that does not build still is.
    const broken = all.some((r) => !r.jsVsInterp.exact || r.glslError);
    return (verb === "check" ? failed : broken) ? 1 : 0;
  }
  if (verb === "faults") {
    const scale = Number(flag("--scale") ?? FAULT_SCALE);
    const result = await runFaults({ ...(render ? { render } : {}), scale, ...(tolerance !== undefined ? { tolerance } : {}) });
    const t = tally(result.rows);
    const problems = faultProblems(result);
    if (json) { console.log(JSON.stringify({ ...result, tally: t, problems })); return problems.length ? 1 : 0; }
    console.log(`scale ${scale}; JS exact, GLSL tolerance ${result.tolerance}`);
    for (const o of result.overrides) console.log(overrideLine(o));
    for (const r of result.rows) {
      const state = !r.planted ? "NOT PLANTED" : r.caught === null ? (r.error ? "NO SHADER" : "skipped") : r.caught ? "caught" : "ESCAPED";
      console.log(`${r.id.padEnd(28)} ${r.target.padEnd(4)} ${state.padEnd(11)} worst ${r.worst === null ? "-" : r.worst.toExponential(2)}  ${r.what}`);
      if (r.error) console.log(`    shader error: ${r.error.slice(0, 160)}`);
      if (r.escape && r.caught === false) console.log(`    escape explained: ${r.escape}`);
    }
    for (const c of result.controls) console.log(`control ${c.case}: JS ${c.jsExact ? "exact" : "DIFFERS"}, GLSL worst ${c.glslWorst === null ? "-" : c.glslWorst.toExponential(2)}`);
    for (const target of /** @type {const} */ (["js", "glsl"])) {
      const x = t[target];
      console.log(`${target}: ${x.caught} of ${x.planted} planted faults caught${x.skipped ? `, ${x.skipped} skipped` : ""}; escaped: ${x.escaped.map((e) => e.id).join(", ") || "none"}${x.unplanted.length ? `; unplanted: ${x.unplanted.map((e) => e.id).join(", ")}` : ""}`);
    }
    for (const p of problems) console.log(`PROBLEM: ${p}`);
    return problems.length ? 1 : 0;
  }
  console.error(`unknown verb '${verb}'\n\n${USAGE}`);
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
