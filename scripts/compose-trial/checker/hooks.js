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
      if (session.dirUrl && r.url.startsWith(session.dirUrl) && !r.url.includes("?")) return { ...r, url: `${r.url}?run=${session.run}` };
      return r;
    },
  });
}
