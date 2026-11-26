// A package module's imports, found in its syntax tree before the module runs. A module that does not parse is
// refused, so what the check cannot read never runs.

import { diag } from "./codes.js";
import { parseModule, walkNodes } from "./parse-module.js";
import { isModulePath, resolveRelative } from "./paths.js";

export const KIT_SPECIFIER = "kit/define";

const FIX_STATIC = `import the module statically, with a relative path or "${KIT_SPECIFIER}"`;

/**
 * Finds the static imports and re-exports of a module and refuses what a package may not import: anything but
 * `kit/define` and a relative path to a file of the package, every dynamic import expression, every
 * `import.<name>` but `import.meta`, and a module that does not parse (K007 with the line of the error).
 * @param {string} path  the module's path in the package
 * @param {string} text
 * @param {Iterable<string>} files  the package's file paths, for the existence check
 * @returns {{ imports: import("./package.js").ModuleImport[], diagnostics: import("./package.js").PackageDiagnostic[] }}
 */
export function scanImports(path, text, files) {
  const have = new Set(files);
  /** @type {import("./package.js").ModuleImport[]} */
  const imports = [];
  /** @type {import("./package.js").PackageDiagnostic[]} */
  const diagnostics = [];
  /** @type {ReturnType<typeof parseModule>} */
  let tree;
  try {
    tree = parseModule(text);
  } catch (e) {
    const line = /** @type {{ loc?: { line?: number } }} */ (e).loc?.line;
    const why = e instanceof Error ? e.message.replace(/\s*\(\d+:\d+\)$/, "") : String(e);
    diagnostics.push(diag("K007", `${path} does not parse as a module (${why}), so its imports cannot be checked`, "fix the syntax error", path, line));
    return { imports, diagnostics };
  }
  walkNodes(tree, (n) => {
    const line = n.loc?.start.line ?? 1;
    if (n.type === "ImportExpression") {
      diagnostics.push(diag("K007", `${path} uses a dynamic import expression, which a package may not`, FIX_STATIC, path, line));
    } else if (n.type === "MetaProperty") {
      const m = /** @type {import("../vendor/acorn/acorn.mjs").MetaProperty} */ (n);
      if (m.meta.name === "import" && m.property.name !== "meta") diagnostics.push(diag("K007", `${path} uses import.${m.property.name}, which a package may not; only import.meta is allowed`, FIX_STATIC, path, line));
    } else if (n.type === "ImportDeclaration" || n.type === "ExportAllDeclaration" || n.type === "ExportNamedDeclaration") {
      const source = /** @type {{ source?: import("../vendor/acorn/acorn.mjs").Literal | null }} */ (n).source;
      if (!source || typeof source.value !== "string") return;
      const specifier = source.value;
      const why = refusal(path, specifier, have);
      /** @type {string | null} */
      let resolved = null;
      if (why === null) resolved = specifier === KIT_SPECIFIER ? KIT_SPECIFIER : /** @type {string} */ (resolveRelative(path, specifier));
      else diagnostics.push(diag("K007", `${path} imports ${JSON.stringify(specifier)}, which ${why}; a package imports only "${KIT_SPECIFIER}" and its own files`, `remove the import, or import a file of the package by a relative path ("./x.js")`, path, line));
      imports.push({ specifier, resolved, line, start: source.start + 1, end: source.end - 1 });
    }
  });
  return { imports, diagnostics };
}

/** Why a package module at `path` may not import `specifier`, or null when it may. @param {string} path @param {string} specifier @param {Set<string>} have */
function refusal(path, specifier, have) {
  if (specifier === KIT_SPECIFIER) return null;
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return `is not "${KIT_SPECIFIER}" or a relative path`;
  const to = resolveRelative(path, specifier);
  if (to === null) return "leaves the package or is not a normalized path (no trailing \"/\" or empty part)";
  if (!isModulePath(to)) return `names ${to}, which does not end in ".js": a package's modules are exactly its .js files`;
  if (!have.has(to)) return `names ${to}, which is not a file of the package`;
  return null;
}
