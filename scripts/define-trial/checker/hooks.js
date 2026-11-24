// Supplies `kit/define` to a candidate's files through Node's in-thread module hooks, and gives every
// candidate file a per-check query string so a second check of the same directory loads it afresh.

import { registerHooks } from "node:module";
import { session } from "./session.js";

export const DEFINE_SPECIFIER = "kit/define";
const DEFINE_URL = new URL("./define.js", import.meta.url).href;

let installed = false;

/** Installs the hooks once per process. */
export function installHooks() {
  if (installed) return;
  installed = true;
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier === DEFINE_SPECIFIER) return { url: DEFINE_URL, format: "module", shortCircuit: true };
      const r = next(specifier, context);
      if (session.dirUrl && r.url.startsWith(session.dirUrl) && !r.url.includes("?")) return { ...r, url: `${r.url}?run=${session.run}` };
      return r;
    },
  });
}
