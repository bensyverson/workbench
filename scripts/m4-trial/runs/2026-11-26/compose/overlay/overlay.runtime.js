import { defineRuntime } from "kit/define";
import { overlay } from "./overlay.grammar.js";

// Nothing to keep: the run rebuilds the picture when a wired one changes.
export const overlayRuntime = defineRuntime(overlay, {
  clock: () => ({ demand: true }),
  init: (record) => ({ width: record.size.width, height: record.size.height }),
  step: (state) => state,
});
