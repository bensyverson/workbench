// REFUSED: B009 the tint language takes no shader text
// The Dream Code pastes GLSL; the grammar rejects `.shader` with "raw shader text is not an input language".
// The part that fits is the Program below.
import { program } from "../data.grammar.js";

export default ($) => program("pasted")
  .pixel("(uv, u) => color(uv.x, 0, 0)");
