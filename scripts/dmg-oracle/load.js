// Loads the DMG Workbench's DSL core and presets straight out of its HTML, so the
// repo never holds a copy of that code. The DSL core ends by assigning itself to
// `module.exports`, which is what makes it loadable headless.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

/** @import { DmgDSL, DmgBuild, DmgPreset } from "./dmg.js" */

const DEFAULT_HTML = fileURLToPath(new URL("../../project/2026-11-23-dmg-workbench.html", import.meta.url));
const CORE_START = "var DSL = (function";
const CORE_END = 'if (typeof module !== "undefined") module.exports = DSL;';
const PRESETS_PREFIX = "window.DMG_PRESETS = ";

/**
 * Reads the DMG Workbench at `htmlPath` and returns its DSL with helpers to build presets.
 * @param {string} [htmlPath]
 */
export function loadDmg(htmlPath = DEFAULT_HTML) {
  const html = readFileSync(htmlPath, "utf8");
  const start = html.indexOf(CORE_START);
  const end = html.indexOf(CORE_END);
  if (start < 0 || end < 0) throw new Error(`${htmlPath}: cannot find the DSL core (looked for "${CORE_START}" … "${CORE_END}")`);
  const core = html.slice(start, end + CORE_END.length);

  const mod = { exports: /** @type {unknown} */ (undefined) };
  const fn = vm.compileFunction(core, ["module"], { filename: "dmg-dsl-core.js" });
  fn(mod);
  const DSL = /** @type {DmgDSL} */ (mod.exports);

  const presetLine = html.split("\n").find((l) => l.includes(PRESETS_PREFIX));
  if (!presetLine) throw new Error(`${htmlPath}: cannot find "${PRESETS_PREFIX}"`);
  const json = presetLine.slice(presetLine.indexOf(PRESETS_PREFIX) + PRESETS_PREFIX.length).replace(/;?\s*(<\/script>)?\s*$/, "");
  const presets = /** @type {DmgPreset[]} */ (JSON.parse(json));

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
