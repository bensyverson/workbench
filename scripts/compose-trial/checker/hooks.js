// Supplies the stand-in `kit`, `cave`, `tiles` and `glow` to a candidate's files through Node's in-thread
// module hooks, and gives every candidate file a per-check query string so a second check loads it afresh.

import { registerHooks } from "node:module";
import { session } from "./session.js";

/** The modules a program may import by bare name, and the stand-in behind each. */
export const STUBS = Object.freeze({
  kit: new URL("./stubs/kit.js", import.meta.url).href,
  cave: new URL("./stubs/cave.js", import.meta.url).href,
  tiles: new URL("./stubs/tiles.js", import.meta.url).href,
  glow: new URL("./stubs/glow.js", import.meta.url).href,
});

/**
 * R2: program.js imports the four modules and ./lib/ files; a lib/ file imports other lib/ files.
 * @param {string} file @param {string} specifier
 */
export function isAllowedImport(file, specifier) {
  return file === "program.js" ? Object.hasOwn(STUBS, specifier) || /^\.\/lib\/[\w.-]+\.js$/.test(specifier) : /^\.\/[\w.-]+\.js$/.test(specifier);
}

/** @param {string} file @param {string} specifier */
export function importMessage(file, specifier) {
  return `${file} imports "${specifier}"; ${file === "program.js" ? 'only "kit", "cave", "tiles", "glow" and ./lib/ files' : "a lib/ file may import only other lib/ files"} may be imported.`;
}

let installed = false;

/** Installs the hooks once per process. */
export function installHooks() {
  if (installed) return;
  installed = true;
  registerHooks({
    resolve(specifier, context, next) {
      const fromCandidate = !!session.dirUrl && (context.parentURL ?? "").startsWith(session.dirUrl);
      if (fromCandidate && Object.hasOwn(STUBS, specifier)) return { url: STUBS[/** @type {keyof typeof STUBS} */ (specifier)], format: "module", shortCircuit: true };
      const r = next(specifier, context);
      // The static scan catches literal imports before the file runs; this catches the rest (a computed
      // specifier) as the module system resolves it.
      const file = session.relative(context.parentURL);
      if (file !== null && !isAllowedImport(file, specifier)) {
        const text = session.sources[file] ?? "";
        const at = text.indexOf(specifier);
        const site = { file, line: at < 0 ? 1 : text.slice(0, at).split("\n").length };
        if (at < 0) { const m = /\bimport\s*\(/.exec(text); if (m) site.line = text.slice(0, m.index).split("\n").length; }
        session.add("C003", site, importMessage(file, specifier), "remove the import");
      }
      if (session.dirUrl && r.url.startsWith(session.dirUrl) && !r.url.includes("?")) return { ...r, url: `${r.url}?run=${session.run}` };
      return r;
    },
  });
}
