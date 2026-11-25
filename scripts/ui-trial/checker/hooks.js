// Supplies `kit/define` (with the defineUI stand-in) to a hand-in's files through Node's in-thread module hooks,
// records any other import from outside the hand-in (C006), and gives each hand-in file a per-check query string.

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
      const parent = context.parentURL ?? "";
      if (session.dirUrl && parent.startsWith(session.dirUrl)) {
        if (!r.url.startsWith(session.dirUrl)) session.imports.push({ parentURL: parent, specifier });
        else {
          session.loaded.add(r.url.replace(/\?.*$/, ""));
          if (!r.url.includes("?")) return { ...r, url: `${r.url}?run=${session.run}` };
        }
      }
      return r;
    },
  });
}
