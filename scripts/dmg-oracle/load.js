// Loads the DMG Workbench's DSL core straight out of its archived HTML, so the repo never holds a copy of that
// code (the core ends by assigning itself to `module.exports`, which makes it loadable headless), and its presets
// from the maintained `presets.json`. The HTML keeps the original presets as the dated record: `originalPresets`
// reads them, for checking a rewrite against the original on the same runtime.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

/** @import { DmgDSL, DmgBuild, DmgPreset } from "./dmg.js" */

const DEFAULT_HTML = fileURLToPath(new URL("../../project/2026-11-23-dmg-workbench.html", import.meta.url));
const DEFAULT_PRESETS = fileURLToPath(new URL("./presets.json", import.meta.url));
const CORE_START = "var DSL = (function";
const CORE_END = 'if (typeof module !== "undefined") module.exports = DSL;';
const PRESETS_PREFIX = "window.DMG_PRESETS = ";

/**
 * The presets the archived HTML ships, as they were written.
 * @param {string} [htmlPath]
 * @returns {DmgPreset[]}
 */
export function originalPresets(htmlPath = DEFAULT_HTML) {
  const html = readFileSync(htmlPath, "utf8");
  const presetLine = html.split("\n").find((l) => l.includes(PRESETS_PREFIX));
  if (!presetLine) throw new Error(`${htmlPath}: cannot find "${PRESETS_PREFIX}"`);
  const json = presetLine.slice(presetLine.indexOf(PRESETS_PREFIX) + PRESETS_PREFIX.length).replace(/;?\s*(<\/script>)?\s*$/, "");
  return /** @type {DmgPreset[]} */ (JSON.parse(json));
}

/**
 * The maintained presets: a JSON array of the HTML's preset objects, except that `code` is an array of lines
 * (joined with a newline here), so a rewrite shows in a diff line by line.
 * @param {string} [presetsPath]
 * @returns {DmgPreset[]}
 */
export function maintainedPresets(presetsPath = DEFAULT_PRESETS) {
  const rows = /** @type {Array<Omit<DmgPreset, "code"> & { code: string | string[] }>} */ (JSON.parse(readFileSync(presetsPath, "utf8")));
  return rows.map((p) => ({ ...p, code: Array.isArray(p.code) ? p.code.join("\n") : p.code }));
}

/**
 * Reads the DMG Workbench's DSL at `htmlPath` and returns it with helpers to build the maintained presets.
 * @param {string} [htmlPath]
 * @param {DmgPreset[]} [presets]  Defaults to the maintained presets.
 */
export function loadDmg(htmlPath = DEFAULT_HTML, presets = maintainedPresets()) {
  const html = readFileSync(htmlPath, "utf8");
  const start = html.indexOf(CORE_START);
  const end = html.indexOf(CORE_END);
  if (start < 0 || end < 0) throw new Error(`${htmlPath}: cannot find the DSL core (looked for "${CORE_START}" … "${CORE_END}")`);
  const core = html.slice(start, end + CORE_END.length);

  const mod = { exports: /** @type {unknown} */ (undefined) };
  const fn = vm.compileFunction(core, ["module"], { filename: "dmg-dsl-core.js" });
  fn(mod);
  const DSL = /** @type {DmgDSL} */ (mod.exports);

  /** @param {string} id */
  const preset = (id) => {
    const p = presets.find((q) => q.id === id);
    if (!p) throw new Error(`no preset '${id}'; presets are ${presets.map((q) => q.id).join(", ")}`);
    return p;
  };

  /**
   * Builds a preset by id, or raw program source, into a fresh build with its own closures.
   * @param {string} idOrCode
   * @returns {DmgBuild}
   */
  const build = (idOrCode) => {
    const code = /^\d\d$/.test(idOrCode) ? preset(idOrCode).code : idOrCode;
    const result = DSL.run(code);
    if (!result.build) throw new Error(`build failed: ${result.error?.message ?? "no build produced"}`);
    // The program's source stays with the build, so tooling can read its top-level helpers.
    return Object.assign(result.build, { code });
  };

  return { DSL, presets, preset, build };
}
