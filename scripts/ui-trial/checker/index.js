// The UI trial checker's library: loads a hand-in's `<lang>.ui.js` with the real kit/define (plus a defineUI that
// records its arguments), then judges the recorded declaration against docs/ui-draft.md and docs/rules.md.

import { readFileSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { installHooks } from "./hooks.js";
import { session, begin } from "./session.js";
import { validate } from "./validate.js";
import { locatePos, lambdaLine, lineAt } from "./locate.js";
import { blank } from "../../../kit/parse/blank.js";
import { LOAD } from "./codes.js";
import { TAG } from "../../../kit/define/tags.js";

/** @import { UIDiagnostic } from "./codes.js" */

/** A hand-in that cannot be checked at all: no directory, no UI file or no Grammar file. */
export class CheckTargetError extends Error {}

/** @typedef {{ ok: boolean, diagnostics: UIDiagnostic[], files: Record<string, string> }} CheckResult */

/** Whether `path` is a readable regular file. @param {string} path */
function isFile(path) {
  try { return statSync(path).isFile(); } catch { return false; }
}

/**
 * Where a load failure points: the first stack frame inside the hand-in's directory (a file of the hand-in, not the
 * checker's hooks or a kit file), else the UI file's first line.
 * @param {unknown} stack @param {string} dirUrl @param {string} fallback
 * @returns {{ file: string, line: number }}
 */
function loadSite(stack, dirUrl, fallback) {
  for (const m of String(stack ?? "").matchAll(/(file:\/\/[^\s()]*?)(?:\?run=\d+)?:(\d+)(?::\d+)?(?=[\s)]|$)/g)) {
    if (!m[1].startsWith(dirUrl)) continue;
    return { file: decodeURIComponent(m[1].slice(dirUrl.length)), line: Number(m[2]) };
  }
  return { file: fallback, line: 1 };
}

/** Text of a package file that reaches Node's built-ins without an import the hooks see: a deferred import(), process.getBuiltinModule.
 * @type {Array<[RegExp, string]>} */
const ESCAPES = [
  [/(?<![\w$.])import\s*\(/g, "a deferred import()"],
  [/getBuiltinModule/g, "process.getBuiltinModule"],
];

/** The files one package's UI check reads. @param {string} lang */
export function packageFiles(lang) {
  if (!/^[a-z][a-z0-9]*$/.test(lang)) throw new Error(`'${lang}' is not a package name (lowercase letters and digits)`);
  return { ui: `${lang}.ui.js`, grammar: `${lang}.grammar.js`, dialect: `${lang}.dialect.js` };
}

/**
 * Checks `<dir>/<lang>.ui.js`.
 * @param {string} dir @param {{ lang: string }} options @returns {Promise<CheckResult>}
 */
export async function checkDir(dir, { lang }) {
  const root = resolve(dir);
  const names = packageFiles(lang);
  for (const f of [names.ui, names.grammar]) if (!isFile(join(root, f))) throw new CheckTargetError(`${join(dir, f)} does not exist (or is not a file)`);
  installHooks();
  // Node resolves through symlinks (macOS tmp is /private/var), so the hooks compare against the real path.
  const dirUrl = pathToFileURL(realpathSync(root)).href + "/";
  begin(dirUrl);
  const src = readFileSync(join(root, names.ui), "utf8");
  /** @type {Record<string, string>} */
  const files = { [names.ui]: src };
  /** @type {UIDiagnostic[]} */
  const diagnostics = [];
  const add = (/** @type {string} */ file, /** @type {number} */ line, /** @type {string} */ code, /** @type {string} */ message, /** @type {string} */ fix) => diagnostics.push({ file, line, code, severity: "error", message, fix });
  const done = () => ({ ok: diagnostics.length === 0, diagnostics, files });

  /** @type {Record<string, unknown>} */
  let grammarExports = {};
  try {
    grammarExports = await import(`${dirUrl}${names.grammar}?run=${session.run}`);
    await import(`${dirUrl}${names.ui}?run=${session.run}`);
  } catch (e) {
    const err = /** @type {Error & { problems?: Array<{ code: string, message: string }> }} */ (e);
    const detail = err.problems?.length ? err.problems.map((p) => `${p.code} ${p.message}`).join("; ") : err.message;
    const where = loadSite(err.stack, dirUrl, names.ui);
    add(where.file, where.line, LOAD, `the package does not load: ${detail}`, `fix the file so it loads; run node on it to see the error`);
    return done();
  }
  for (const { parentURL, specifier } of session.imports) {
    const file = decodeURIComponent(parentURL.slice(dirUrl.length)).replace(/\?.*$/, "");
    const text = file === names.ui ? src : readFileSync(join(root, file), "utf8");
    const at = text.indexOf(`"${specifier}"`) >= 0 ? text.indexOf(`"${specifier}"`) : text.indexOf(`'${specifier}'`);
    add(file, at < 0 ? 1 : lineAt(text, at), "C006", `${file} imports '${specifier}'; only "kit/define" and the package's own files may be imported`, "remove the import (rules.md R1)");
  }
  // Code that reaches a built-in without a static import the hooks see. A lexical scan of every package file that
  // loaded: it finds the plain spellings, not a computed one (README, "What it does not do").
  const own = [names.ui, names.grammar, ...[...session.loaded].map((u) => decodeURIComponent(u.slice(dirUrl.length)))];
  for (const file of new Set(own)) {
    const text = file === names.ui ? src : readFileSync(join(root, file), "utf8");
    const code = blank(text);
    for (const [re, what] of ESCAPES) {
      for (const m of code.matchAll(re)) {
        const line = lineAt(text, m.index);
        if (diagnostics.some((d) => d.code === "C006" && d.file === file && d.line === line)) continue;
        add(file, line, "C006", `${file} uses ${what}; only "kit/define" and the package's own files may be imported`, "remove it (rules.md R1)");
      }
    }
  }
  if (session.calls.length !== 1) {
    add(names.ui, Math.max(1, src.indexOf("defineUI(") >= 0 ? lineAt(src, src.indexOf("defineUI(")) : 1), "C001", `${names.ui} calls defineUI ${session.calls.length} times; it calls it once`, `export const ${lang}UI = defineUI(${lang}, { state, … });`);
    return done();
  }
  const { builder, decl } = session.calls[0];
  const callLine = lineAt(src, Math.max(0, src.indexOf("defineUI(")));
  const b = /** @type {any} */ (builder);
  if (typeof b !== "function" || !b.dialect || !b.grammar || !Object.values(grammarExports).includes(b)) {
    add(names.ui, callLine, "U013", "defineUI's first argument is not the package's Grammar builder", `import the builder from "./${names.grammar}" and pass it: defineUI(${Object.keys(grammarExports)[0] ?? lang}, { … })`);
    return done();
  }
  const dialect = /** @type {Record<string, any>} */ (b.dialect.def);
  if (typeof dialect.text !== "function") add(names.dialect, 1, "U013", "the Dialect has no text(state): the stage's required fallback", "add text(state) to the Dialect");

  const free = new Set([
    ...Object.keys(dialect.globals ?? {}), ...Object.keys(dialect.intrinsics ?? {}), ...Object.keys(dialect.library ?? {}),
    ...Object.entries(dialect.types ?? {}).filter(([, t]) => /** @type {any} */ (t)?.[TAG] === "vector").map(([n]) => n),
  ]);
  const problems = validate(decl, {
    pkg: String(dialect.name),
    objects: dialect.objects ?? {},
    globalObjects: Object.fromEntries(Object.entries(dialect.globals ?? {}).filter(([, o]) => typeof o === "string" && Object.hasOwn(dialect.objects ?? {}, o)).map(([n, o]) => [n, dialect.objects[/** @type {string} */ (o)]])),
    free,
    moduleText(path) {
      const f = join(root, path);
      if (!isFile(f)) return null;
      const text = readFileSync(f, "utf8");
      files[path.replace(/^\.\//, "")] = text;
      return text;
    },
  });
  for (const p of problems) {
    let line = 0;
    const pos = p.at.length ? locatePos(src, p.at, decl) : 0;
    if (p.fn) { const l = lambdaLine(src, p.fn, pos); if (l) line = l + (p.inner ?? 1) - 1; }
    if (!line) line = p.at.length ? lineAt(src, pos) : callLine;
    add(names.ui, line, p.code, p.message, p.fix);
  }
  diagnostics.sort((x, y) => (x.file === y.file ? x.line - y.line : x.file < y.file ? -1 : 1));
  return done();
}
