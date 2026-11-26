// The stand-in's own frames, hidden from stack traces. kit/define places every diagnostic at "the innermost frame
// outside kit/define" (kit/define/site.js); the stand-in's wrappers of defineGrammar's builder and its chain sit
// between the kit and the author's file, so without this every builder diagnostic would point into this folder.
// Hiding them makes the wrappers as invisible to callSite as kit/define's own files are.

const HERE = new URL(".", import.meta.url).href;
/** The stand-in modules whose frames are hidden: the define and compose stand-ins and the handle wrappers. */
const HIDDEN = ["define.js", "handles.js", "compose.js"].map((f) => HERE + f);

let installed = false;

/** Installs the filter once per process. Every other frame is printed as V8 prints it. */
export function hideStandInFrames() {
  if (installed) return;
  installed = true;
  const previous = Error.prepareStackTrace;
  Error.prepareStackTrace = (err, frames) => {
    const keep = frames.filter((f) => {
      const file = f.getFileName() ?? "";
      return !HIDDEN.some((h) => file === h || file.startsWith(`${h}?`));
    });
    if (previous) return previous(err, keep);
    let head;
    try { head = Error.prototype.toString.call(err); } catch { head = "Error"; }
    return `${head}${keep.map((f) => `\n    at ${f}`).join("")}`;
  };
}

/**
 * The first frame on the current stack inside `dirUrl` (a hand-in's folder, as a file URL ending in /), as a path
 * relative to it and a line; null when none is.
 * @param {string} dirUrl
 * @returns {{ file: string, line: number } | null}
 */
export function siteIn(dirUrl) {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 50;
  const stack = new Error().stack ?? "";
  Error.stackTraceLimit = limit;
  for (const m of stack.matchAll(/(file:\/\/[^\s()]*?)(?:\?[^\s():]*)?:(\d+):\d+/g)) {
    if (m[1].startsWith(dirUrl)) return { file: decodeURIComponent(m[1].slice(dirUrl.length)), line: Number(m[2]) };
  }
  return null;
}
