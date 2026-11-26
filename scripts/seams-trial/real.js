// The relay's hand-ins on the real kit (leaf CelvhJ): each recorded leg is copied, given only the massage the
// 2026-11-26 rulings force, re-hashed, and checked with the real kit/define and kit/compose; no stand-in. A package
// leg goes through the package trial's checker (kit/package's loadPackage and checkExamples, the defineUI checks),
// whose `kit/define` is the real one. A compose leg loads both packages with kit/package, reads the glue's imports
// with kit/compose's scanGlue, imports it with each bare package name resolved to that package's Grammar entry,
// and checks the composition it returns.

import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, realpathSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerHooks } from "node:module";
import { KIT_VERSION } from "../../kit/define/index.js";
import { loadPackage, checkExamples, MANIFEST_PATH } from "../../kit/package/index.js";
import { scanGlue, isComposition, formatDiagnostic } from "../../kit/compose/index.js";
import { installHooks } from "../ui-trial/checker/hooks.js";
import { session, begin } from "../ui-trial/checker/session.js";
import { readPackageDir, hashDir } from "../pkg/dir.js";
import { checkPackageDir } from "../pkg-trial/checker/index.js";
import { scopeModules, buildOptions } from "../pkg-trial/checker/scope.js";

const RUNS_DIR = fileURLToPath(new URL("./runs/2026-11-25/", import.meta.url));
const COMPOSE_URL = new URL("../../kit/compose/index.js", import.meta.url).href;

/** An Event output's `from`, removed: a runtime pushes its records (the clocks draft's question 3, ruled 2026-11-26). */
const EVENT_FROM = "an Event output's from removed";

/**
 * The nine recorded legs and the massage each needs, as `file:line: what` (the line in the recorded file).
 * @type {Array<{ leg: string, role: "maze" | "particles" | "compose", massage: string[] }>}
 */
export const RUNS = [
  { leg: "r1-maze", role: "maze", massage: ["maze.dialect.js:82: " + EVENT_FROM, "maze.dialect.js:83: " + EVENT_FROM, "maze.dialect.js:84: " + EVENT_FROM, "maze.dialect.js:85: " + EVENT_FROM] },
  { leg: "r1-particles", role: "particles", massage: [] },
  { leg: "r1-compose", role: "compose", massage: ["maze/maze.dialect.js:82: " + EVENT_FROM, "maze/maze.dialect.js:83: " + EVENT_FROM, "maze/maze.dialect.js:84: " + EVENT_FROM, "maze/maze.dialect.js:85: " + EVENT_FROM] },
  { leg: "r2-maze", role: "maze", massage: ["maze.dialect.js:72: " + EVENT_FROM] },
  { leg: "r2-particles", role: "particles", massage: [] },
  { leg: "r2-compose", role: "compose", massage: ["maze/maze.dialect.js:72: " + EVENT_FROM] },
  { leg: "r3-maze", role: "maze", massage: ["maze.dialect.js:80: " + EVENT_FROM, "maze.dialect.js:85: " + EVENT_FROM, "maze.dialect.js:90: " + EVENT_FROM] },
  { leg: "r3-particles", role: "particles", massage: [] },
  { leg: "r3-compose", role: "compose", massage: ["maze/maze.dialect.js:80: " + EVENT_FROM, "maze/maze.dialect.js:85: " + EVENT_FROM, "maze/maze.dialect.js:90: " + EVENT_FROM] },
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

/** The glue's bare package names, resolved for the glue only. */
/** @type {{ url: string, packages: Record<string, string> }} */
const glue = { url: "", packages: {} };
let hooked = false;
function installGlueHooks() {
  installHooks();
  if (hooked) return;
  hooked = true;
  registerHooks({
    resolve(specifier, context, next) {
      if (!glue.url || (context.parentURL ?? "").replace(/\?.*$/, "") !== glue.url) return next(specifier, context);
      if (specifier === "kit/compose") return { url: COMPOSE_URL, format: "module", shortCircuit: true };
      if (Object.hasOwn(glue.packages, specifier)) return { url: glue.packages[specifier], format: "module", shortCircuit: true };
      return next(specifier, context);
    },
  });
}

/**
 * A compose leg: both packages loaded and their examples checked by kit/package, the glue's imports scanned, the
 * glue run with an empty frozen `$`, and its composition checked with each part's module scope.
 * @param {string} dir  holds workbench.js, maze/ and particles/
 * @returns {Promise<{ diagnostics: Found[], plan: string[] }>}
 */
export async function checkComposeReal(dir) {
  const r = await loadComposeReal(dir);
  return { diagnostics: r.diagnostics, plan: r.plan };
}

/**
 * What checkComposeReal checks, with what a run needs besides: the loaded packages (each with its runtime when its
 * manifest names one), the composition and the options it was checked with. `composition` is null when a package
 * or the glue was refused before the glue ran.
 * @param {string} dir  holds workbench.js, maze/ and particles/
 * @returns {Promise<{ diagnostics: Found[], plan: string[], loaded: any[], composition: any, options: any }>}
 */
export async function loadComposeReal(dir) {
  installGlueHooks();
  const dirUrl = pathToFileURL(realpathSync(dir)).href + "/";
  begin(dirUrl);
  /** @type {Found[]} */
  const found = [];
  /** @type {any[]} */
  const loaded = [];
  for (const name of ["maze", "particles"]) {
    const files = readPackageDir(join(dir, name));
    const base = `${dirUrl}${name}/`;
    // what the defineUI stand-in reads a UI's element modules from: this package's files
    session.moduleText = (path) => files[path.replace(/^\.\//, "")] ?? null;
    const importModule = (/** @type {string} */ path) => import(`${base}${path}?run=${session.run}`);
    const pkg = await loadPackage(files, { kitVersion: KIT_VERSION, importModule });
    for (const d of pkg.diagnostics) found.push({ file: `${name}/${d.file ?? MANIFEST_PATH}`, line: d.line ?? 1, code: d.code, message: d.message, fix: d.fix });
    if (pkg.diagnostics.length) continue;
    scopeModules(base, [...pkg.examples, ...pkg.refusals.map((r) => r.module)], files);
    for (const d of await checkExamples(pkg, { importModule, buildOptions })) found.push({ file: `${name}/${d.file ?? MANIFEST_PATH}`, line: d.line ?? 1, code: d.code, message: d.message, fix: d.fix });
    const manifest = JSON.parse(files[MANIFEST_PATH]);
    glue.packages[name] = `${base}${manifest.entry.grammar}?run=${session.run}`;
    loaded.push(pkg);
  }
  if (found.length) return { diagnostics: found, plan: [], loaded, composition: null, options: null };
  const text = readFileSync(join(dir, "workbench.js"), "utf8");
  const scanned = scanGlue(text, ["maze", "particles"]);
  for (const d of scanned.diagnostics) found.push({ file: "workbench.js", line: d.line ?? 1, code: d.code, message: d.message, fix: d.fix });
  if (found.length) return { diagnostics: found, plan: [], loaded, composition: null, options: null };
  glue.url = `${dirUrl}workbench.js`;
  try {
    scopeModules(dirUrl, ["workbench.js"], { "workbench.js": text });
    const mod = await import(`${glue.url}?run=${session.run}`);
    const c = mod.default(Object.freeze({}));
    if (!isComposition(c)) return { diagnostics: [{ file: "workbench.js", line: 1, code: "LOAD", message: "the default export does not return a composition" }], plan: [], loaded, composition: null, options: null };
    const options = { packages: loaded, build: buildOptions("workbench.js", mod) };
    for (const d of c.check(options)) {
      const [file, line] = formatDiagnostic(d, dirUrl).split("\n")[0].split(":");
      const sides = formatDiagnostic(d, dirUrl).split("\n").slice(1).join(" / ");
      found.push({ file, line: Number(line), code: d.code, message: sides ? `${d.message} [${sides}]` : d.message });
    }
    return { diagnostics: found, plan: found.length ? [] : c.plan(options), loaded, composition: c, options };
  } finally { glue.url = ""; glue.packages = {}; }
}
