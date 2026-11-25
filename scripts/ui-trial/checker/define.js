// The `kit/define` a UI trial hand-in imports: the real kit/define, plus a `defineUI` that only records its
// arguments. The draft UI API is not built; the checker judges the recorded declaration afterwards.

export * from "../../../kit/define/index.js";
import { session } from "./session.js";

/**
 * Records one `defineUI(builder, decl)` call and returns a stand-in for the UI.
 * @param {unknown} builder @param {unknown} decl
 */
export function defineUI(builder, decl) {
  session.calls.push({ builder, decl });
  return Object.freeze({ ui: true });
}
