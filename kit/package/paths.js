// Package paths: relative, `/`-separated, normalized. No Node built-ins (the kit also runs in the page).

/** Whether `p` is a normalized relative path: no leading `/`, no `.` or `..` or empty part, no backslash. @param {string} p */
export function isPackagePath(p) {
  return p !== "" && !p.includes("\\") && p.split("/").every((s) => s !== "" && s !== "." && s !== "..");
}

/** The path a relative specifier names from the file at `from`, or null when it leaves the package. @param {string} from @param {string} specifier */
export function resolveRelative(from, specifier) {
  const parts = from.split("/").slice(0, -1);
  for (const s of specifier.split("/")) {
    if (s === "" || s === ".") continue;
    if (s === "..") { if (!parts.length) return null; parts.pop(); } else parts.push(s);
  }
  return parts.length ? parts.join("/") : null;
}
