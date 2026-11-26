import { arcade } from "../arcade.grammar.js";

// A screen the size of a handheld's, with its HUD.
export default ($) => arcade("cabinet")
  .screen({ width: 160, height: 144 })
  .title("ARCADE");
