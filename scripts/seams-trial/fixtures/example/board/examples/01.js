import { board } from "../board.grammar.js";

// A strip of 32 lamps; each flash lights its lamp as bright as the record says.
export default ($) => board("strip")
  .lamps(32)
  .glow((l) => { l.level = hit.strength; });
