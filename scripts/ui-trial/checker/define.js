// The `kit/define` a UI trial hand-in imports: the real kit/define, with a `defineUI` that calls the kit's own
// and keeps what it saw. A refusal is recorded, not thrown, so the hand-in file still loads and the checker
// reports every problem with its line.

import { defineUI as kitDefineUI, DefinitionError } from "../../../kit/define/index.js";
import { session } from "./session.js";

export * from "../../../kit/define/index.js";

/**
 * Records one `defineUI(builder, decl)` call (and the kit's refusal, if any) and returns the UI, or a stand-in
 * for it when the kit refused.
 * @param {any} builder @param {any} decl
 */
export function defineUI(builder, decl) {
  /** @type {DefinitionError | null} */
  let refusal = null;
  /** @type {object} */
  let ui = Object.freeze({ ui: true });
  try {
    ui = kitDefineUI(builder, decl, { moduleText: session.moduleText });
  } catch (e) {
    if (!(e instanceof DefinitionError)) throw e;
    refusal = e;
  }
  session.calls.push({ builder, decl, refusal });
  return ui;
}
