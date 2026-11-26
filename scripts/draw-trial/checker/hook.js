// Points every `kit/define` import at the draw trial's stand-in (define.js), ahead of the UI trial's hook: Node runs
// the hooks registered last first, so this one is registered after the UI trial's.

import { registerHooks } from "node:module";
import { installHooks } from "../../ui-trial/checker/hooks.js";

const SHIM_URL = new URL("./define.js", import.meta.url).href;
let installed = false;

/** Installs the hooks once per process. */
export function installDrawHooks() {
  installHooks();
  if (installed) return;
  installed = true;
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "kit/define") return { url: SHIM_URL, format: "module", shortCircuit: true };
      return next(specifier, context);
    },
  });
}
