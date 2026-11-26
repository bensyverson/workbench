// Package paths: relative, `/`-separated, normalized. No Node built-ins (the kit also runs in the page).

/** A package's modules are exactly its files whose names end in this, lowercase. */
export const MODULE_SUFFIX = ".js";

/** Whether `p` is a package module: a file name ending in `.js`. @param {string} p */
export const isModulePath = (p) => p.endsWith(MODULE_SUFFIX);

/** Whether a part of `p` starts with `.`: such a path (`.DS_Store`, `.git/config`) is never part of a package. @param {string} p */
export const isDotPath = (p) => p.split("/").some((s) => s.startsWith("."));

/**
 * Whether `p` is a normalized relative path: no leading `/`, no `.` or `..` or empty part, no backslash, no
 * control character, no `:` (so no drive letter or scheme), no part with a leading or trailing space.
 * @param {string} p
 */
export function isPackagePath(p) {
  return p !== "" && !p.includes("\\") && !p.includes(":") && !/[\u0000-\u001f\u007f]/.test(p) && p.split("/").every((s) => s !== "" && s !== "." && s !== ".." && s === s.trim());
}

/** The path a relative specifier names from the file at `from`, or null when it leaves the package or is not normalized (a trailing `/` or an empty part). @param {string} from @param {string} specifier */
export function resolveRelative(from, specifier) {
  const parts = from.split("/").slice(0, -1);
  for (const s of specifier.split("/")) {
    if (s === "") return null;
    if (s === ".") continue;
    if (s === "..") { if (!parts.length) return null; parts.pop(); } else parts.push(s);
  }
  return parts.length ? parts.join("/") : null;
}
