// The relay's hand-ins on the real kit (leaf CelvhJ): each recorded leg is copied, given only the massage the
// 2026-11-26 rulings force, re-hashed, and checked with the real kit/define and kit/compose; no stand-in. A package
// leg goes through the package trial's checker (kit/package's loadPackage and checkExamples, the defineUI checks),
// whose `kit/define` is the real one. A compose leg loads both packages with kit/package, reads the glue's imports
// with kit/compose's scanGlue, imports it with each bare package name resolved to that package's Grammar entry,
// and checks the composition it returns.

import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { hashDir } from "../pkg/dir.js";
import { checkPackageDir } from "../pkg-trial/checker/index.js";
import { loadCompose } from "./checker/load.js";

const RUNS_DIR = fileURLToPath(new URL("./runs/2026-11-25/", import.meta.url));

/** An Event output's `from`, removed: a runtime pushes its records (the clocks draft's question 3, ruled 2026-11-26). */
const EVENT_FROM = "an Event output's from removed";

/** The massage declared Controls force (leaf FhnOhO, 2026-11-27): KIT_VERSION 0.5, `elements` renamed `modules`, a UI's retired `inputs` and `emits`. */
const KIT_RAISED = "the kit version raised to 0.5 (declared Controls)";
const ELEMENTS_RENAMED = "elements renamed modules";
const INPUTS_TO_PAD = "inputs replaced by the package's declared pad Control";
const INPUTS_REMOVED = "inputs removed (its Dialect has no Event input for a Control)";
const EMITS_REMOVED = "emits removed (an element dispatches wb-control)";
const PAD_DECLARED = "the page's pad, which the kit no longer provides, declared as the package's own pad Control";
/**
 * The nine recorded legs and the massage each needs, as `file:line: what` (the line in the recorded file).
 * @type {Array<{ leg: string, role: "maze" | "particles" | "compose", massage: string[] }>}
 */
export const RUNS = [
  { leg: "r1-maze", role: "maze", massage: ["maze.dialect.js:81: " + EVENT_FROM, "maze.dialect.js:82: " + EVENT_FROM, "maze.dialect.js:83: " + EVENT_FROM, "maze.dialect.js:84: " + EVENT_FROM, "wb-package.json:4: " + KIT_RAISED, "maze.ui.js:6: " + INPUTS_REMOVED] },
  { leg: "r1-particles", role: "particles", massage: ["wb-package.json:4: " + KIT_RAISED, "wb-package.json:11: " + ELEMENTS_RENAMED, "particles.ui.js:6: " + EMITS_REMOVED] },
  { leg: "r1-compose", role: "compose", massage: ["maze/maze.dialect.js:81: " + EVENT_FROM, "maze/maze.dialect.js:82: " + EVENT_FROM, "maze/maze.dialect.js:83: " + EVENT_FROM, "maze/maze.dialect.js:84: " + EVENT_FROM, "maze/wb-package.json:4: " + KIT_RAISED, "particles/wb-package.json:4: " + KIT_RAISED, "particles/wb-package.json:11: " + ELEMENTS_RENAMED, "maze/maze.ui.js:6: " + INPUTS_REMOVED, "particles/particles.ui.js:6: " + EMITS_REMOVED] },
  { leg: "r2-maze", role: "maze", massage: ["maze.dialect.js:71: " + EVENT_FROM, "wb-package.json:4: " + KIT_RAISED, "maze.ui.js:6: " + INPUTS_REMOVED] },
  { leg: "r2-particles", role: "particles", massage: ["wb-package.json:4: " + KIT_RAISED, "wb-package.json:11: " + ELEMENTS_RENAMED, "particles.ui.js:6: " + EMITS_REMOVED] },
  { leg: "r2-compose", role: "compose", massage: ["maze/maze.dialect.js:71: " + EVENT_FROM, "maze/wb-package.json:4: " + KIT_RAISED, "particles/wb-package.json:4: " + KIT_RAISED, "particles/wb-package.json:11: " + ELEMENTS_RENAMED, "maze/maze.ui.js:6: " + INPUTS_REMOVED, "particles/particles.ui.js:6: " + EMITS_REMOVED] },
  { leg: "r3-maze", role: "maze", massage: ["maze.dialect.js:79: " + EVENT_FROM, "maze.dialect.js:84: " + EVENT_FROM, "maze.dialect.js:89: " + EVENT_FROM, "wb-package.json:4: " + KIT_RAISED, "maze.ui.js:6: " + INPUTS_REMOVED] },
  { leg: "r3-particles", role: "particles", massage: ["wb-package.json:4: " + KIT_RAISED, "wb-package.json:11: " + ELEMENTS_RENAMED, "particles.ui.js:6: " + EMITS_REMOVED] },
  { leg: "r3-compose", role: "compose", massage: ["maze/maze.dialect.js:79: " + EVENT_FROM, "maze/maze.dialect.js:84: " + EVENT_FROM, "maze/maze.dialect.js:89: " + EVENT_FROM, "maze/wb-package.json:4: " + KIT_RAISED, "particles/wb-package.json:4: " + KIT_RAISED, "particles/wb-package.json:11: " + ELEMENTS_RENAMED, "maze/maze.ui.js:6: " + INPUTS_REMOVED, "particles/particles.ui.js:6: " + EMITS_REMOVED] },
];

/** Every *.dialect.js under `dir`, relative to it. @param {string} dir @returns {string[]} */
function dialectFiles(dir) {
  /** @type {string[]} */
  const out = [];
  const walk = (/** @type {string} */ d) => {
    for (const n of readdirSync(d).sort()) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (n.endsWith(".dialect.js")) out.push(relative(dir, p));
    }
  };
  walk(dir);
  return out;
}

/**
 * The forced massage, applied in place: on each line of a Dialect file whose port's seam is an Event (that line, or
 * the line before), its `from: "…"` is removed. Returns each edit as `file:line: what`.
 * @param {string} dir  the leg's package folder, or the compose leg's folder
 * @returns {string[]}
 */
export function massage(dir) {
  /** @type {string[]} */
  const edits = [];
  for (const file of dialectFiles(dir)) {
    const path = join(dir, file);
    const lines = readFileSync(path, "utf8").split("\n");
    /** @type {string[]} */
    const kept = [];
    lines.forEach((line, i) => {
      const event = /seam:\s*"Event</.test(line);
      if (event && /from:\s*"[^"]*",?\s*/.test(line)) { kept.push(line.replace(/,?\s*from:\s*"[^"]*"(,?)/, (_, comma) => comma)); edits.push(`${file}:${i + 1}: ${EVENT_FROM}`); return; }
      if (/^\s*from:\s*"[^"]*",?\s*$/.test(line) && i > 0 && /seam:\s*"Event</.test(lines[i - 1])) { edits.push(`${file}:${i + 1}: ${EVENT_FROM}`); return; }
      kept.push(line);
    });
    writeFileSync(path, kept.join("\n"));
  }
  edits.push(...controlsMassage(dir));
  return edits;
}

/** The pad Control a maze whose Dialect takes the pad declares. */
const PAD = `  controls: {
    pad: {
      kind: "buttons", label: "D-pad", buttons: ["up", "down", "left", "right"],
      grid: [[null, "up", null], ["left", null, "right"], [null, "down", null]],
      keys: { up: ["ArrowUp", "KeyW"], down: ["ArrowDown", "KeyS"], left: ["ArrowLeft", "KeyA"], right: ["ArrowRight", "KeyD"] },
    },
  },`;

/** Every file under `dir` whose name ends with `suffix`, relative to it. @param {string} dir @param {string} suffix @returns {string[]} */
function filesEnding(dir, suffix) {
  /** @type {string[]} */
  const out = [];
  const walk = (/** @type {string} */ d) => { for (const n of readdirSync(d).sort()) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (n.endsWith(suffix)) out.push(relative(dir, p)); } };
  walk(dir);
  return out;
}

/**
 * Declared Controls' forced massage, in place: each manifest's kit version and `elements`, each UI's `inputs` block
 * (a pad Control when the package's Dialect takes the four-direction pad, else nothing) and `emits`. Returns each edit
 * as `file:line: what`, the line in the recorded file.
 * @param {string} dir
 */
export function controlsMassage(dir) {
  /** @type {string[]} */
  const edits = [];
  for (const file of filesEnding(dir, "wb-package.json")) {
    const path = join(dir, file);
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (/"kit":\s*"0\.4"/.test(line)) { lines[i] = line.replace(/"0\.4"/, '"0.5"'); edits.push(`${file}:${i + 1}: ${KIT_RAISED}`); }
      if (/"elements":/.test(line)) { lines[i] = lines[i].replace('"elements":', '"modules":'); edits.push(`${file}:${i + 1}: ${ELEMENTS_RENAMED}`); }
    });
    writeFileSync(path, lines.join("\n"));
  }
  for (const file of filesEnding(dir, ".ui.js")) {
    const path = join(dir, file);
    const lines = readFileSync(path, "utf8").split("\n");
    const dialect = join(dir, file.replace(/\.ui\.js$/, ".dialect.js"));
    // the Event input that takes the four-direction pad, whatever the package named it
    let padName = null;
    try { padName = /(\w+):\s*\{\s*seam:\s*"Event<\{ up: bool, down: bool, left: bool, right: bool \}>"/.exec(readFileSync(dialect, "utf8"))?.[1] ?? null; } catch { padName = null; }
    const takesPad = padName !== null;
    const pad = PAD.replace("    pad: {", `    ${padName}: {`);
    /** @type {string[]} */
    const kept = [];
    // a UI on a Dialect that takes the pad, declaring none, played the kit's own pad: it now declares it
    const declares = lines.some((l) => /^\s*(inputs|controls):/.test(l));
    for (let i = 0; i < lines.length; i++) {
      if (takesPad && !declares && /defineUI\([^,]+,\s*\{\s*$/.test(lines[i])) { kept.push(lines[i], pad); edits.push(`${file}:${i + 1}: ${PAD_DECLARED}`); continue; }
      const open = /^(\s*)inputs:\s*\{\s*$/.exec(lines[i]);
      if (open) {
        let j = i + 1;
        while (j < lines.length && !new RegExp(`^${open[1]}\\},?\\s*$`).test(lines[j])) j++;
        if (takesPad) kept.push(pad);
        edits.push(`${file}:${i + 1}: ${takesPad ? INPUTS_TO_PAD : INPUTS_REMOVED}`);
        i = j;
        continue;
      }
      if (/,\s*emits:\s*\[[^\]]*\]/.test(lines[i])) { kept.push(lines[i].replace(/,\s*emits:\s*\[[^\]]*\]/, "")); edits.push(`${file}:${i + 1}: ${EMITS_REMOVED}`); continue; }
      kept.push(lines[i]);
    }
    writeFileSync(path, kept.join("\n"));
  }
  return edits;
}

/** @typedef {{ file: string, line: number, code: string, message: string, fix?: string }} Found */

/**
 * Checks one recorded leg on the real kit, in a massaged copy.
 * @param {{ leg: string, role: "maze" | "particles" | "compose" }} run
 * @returns {Promise<{ diagnostics: Found[], massage: string[], plan: string[] }>}
 */
export async function checkRunReal(run) {
  const tmp = mkdtempSync(join(tmpdir(), "CelvhJ-real-"));
  try {
    const dir = join(tmp, run.role);
    cpSync(join(RUNS_DIR, run.leg, run.role === "compose" ? "" : run.role), dir, { recursive: true });
    const edits = massage(dir);
    if (run.role === "compose") {
      for (const p of ["maze", "particles"]) await hashDir(join(dir, p));
      return { ...(await checkComposeReal(dir)), massage: edits };
    }
    await hashDir(dir);
    const r = await checkPackageDir(dir);
    return { diagnostics: r.diagnostics, massage: edits, plan: [] };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}


/**
 * A compose leg of the first relay: its maze and particles packages and workbench.js, checked by
 * checker/load.js's `loadCompose`.
 * @param {string} dir  holds workbench.js, maze/ and particles/
 * @returns {Promise<{ diagnostics: Found[], plan: string[] }>}
 */
export async function checkComposeReal(dir) {
  const r = await loadComposeReal(dir);
  return { diagnostics: r.diagnostics, plan: r.plan };
}

/**
 * What checkComposeReal checks, with what a run needs besides (checker/load.js's `loadCompose`).
 * @param {string} dir  holds workbench.js, maze/ and particles/
 */
export const loadComposeReal = (dir) => loadCompose(dir, ["maze", "particles"]);
