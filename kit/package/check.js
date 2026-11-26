// checkPackage: every check that needs only the files (no import, no I/O).

import { diag } from "./codes.js";
import { hashText } from "./hash.js";
import { scanImports } from "./imports.js";
import { checkManifest, MANIFEST_PATH } from "./manifest.js";

/**
 * Checks a package held as a { path: text } map: the manifest, the kit version, that the files and the manifest's
 * `files` list the same set, each file's hash, and the imports of every .js file.
 * @param {Record<string, string>} files
 * @param {{ kitVersion: string }} options  the Definition API version this kit has (KIT_VERSION)
 * @returns {Promise<{ manifest: import("./package.js").Manifest | null, diagnostics: import("./package.js").PackageDiagnostic[] }>}
 */
export async function checkPackage(files, { kitVersion }) {
  if (!Object.hasOwn(files, MANIFEST_PATH)) {
    return { manifest: null, diagnostics: [diag("K001", `the package has no ${MANIFEST_PATH}`, `add ${MANIFEST_PATH} (node scripts/pkg/hash.js <dir> rewrites its "files")`)] };
  }
  const { manifest, diagnostics } = checkManifest(files[MANIFEST_PATH]);
  if (!manifest) return { manifest, diagnostics };
  if (manifest.kit !== kitVersion) {
    diagnostics.push(diag("K003", `package ${manifest.name} ${manifest.version} was written for kit ${manifest.kit}; this kit is ${kitVersion}, and before 1.0 a kit supports only its own version`, `port the package to kit ${kitVersion} and set "kit": "${kitVersion}", or load it with a kit that is ${manifest.kit}`, MANIFEST_PATH));
  }
  for (const p of Object.keys(manifest.files).sort()) {
    if (!Object.hasOwn(files, p)) diagnostics.push(diag("K004", `${p} is listed in ${MANIFEST_PATH} but the package does not hold it`, `add the file, or run node scripts/pkg/hash.js <dir> to rewrite "files"`, p));
    else {
      const h = await hashText(files[p]);
      if (h !== manifest.files[p]) diagnostics.push(diag("K006", `${p} does not match its hash in ${MANIFEST_PATH} (the file is ${h}, the manifest says ${manifest.files[p]})`, `run node scripts/pkg/hash.js <dir> if the change is intended; otherwise restore the file`, p));
    }
  }
  const paths = Object.keys(files).filter((p) => p !== MANIFEST_PATH).sort();
  for (const p of paths) {
    if (!Object.hasOwn(manifest.files, p)) diagnostics.push(diag("K005", `${p} is in the package but not listed in ${MANIFEST_PATH}`, `run node scripts/pkg/hash.js <dir> to list it, or remove the file`, p));
  }
  for (const p of paths) if (p.endsWith(".js")) diagnostics.push(...scanImports(p, files[p], paths).diagnostics);
  return { manifest, diagnostics };
}
