// Supplies the stand-ins to a hand-in's files through Node's in-thread module hooks: `kit/define` (the seams
// stand-in, over the UI trial's), `kit/compose`, and, for the glue program, each package by its bare name to the
// Grammar entry its manifest names. The UI trial's hooks are installed first, so these run before them (the
// last registered hook resolves first); a package's own files still get the UI trial's per-check query string.

import { registerHooks } from "node:module";
import { installHooks as installUIHooks } from "../../ui-trial/checker/hooks.js";
import { session as uiSession } from "../../ui-trial/checker/session.js";

const DEFINE_URL = new URL("./define.js", import.meta.url).href;
const COMPOSE_URL = new URL("./compose.js", import.meta.url).href;

/** The glue being checked: its URL and the packages its bare names resolve to. (What it may import is decided from its syntax tree, glue-scan.js.) */
export const glue = {
  /** The glue program's URL (no query), or "" when no glue is being checked. */
  url: "",
  /** Each package's Grammar entry by its bare name. @type {Record<string, string>} */
  packages: {},
};

export const GLUE_IMPORTS = Object.freeze(["kit/compose", "kit/define"]);

let installed = false;

/** Installs the hooks once per process. */
export function installHooks() {
  installUIHooks();
  if (installed) return;
  installed = true;
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "kit/define") return { url: DEFINE_URL, format: "module", shortCircuit: true };
      const fromGlue = glue.url !== "" && (context.parentURL ?? "").replace(/\?.*$/, "") === glue.url;
      if (specifier === "kit/compose") {
        if (!fromGlue) return next(specifier, context);
        return { url: COMPOSE_URL, format: "module", shortCircuit: true };
      }
      if (fromGlue) {
        if (Object.hasOwn(glue.packages, specifier)) return { url: `${glue.packages[specifier]}?run=${uiSession.run}`, format: "module", shortCircuit: true };
      }
      return next(specifier, context);
    },
  });
}
