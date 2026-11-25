// REFUSED: L004 (sow may write a plant's water and spot only, not its height)
import { garden } from "../garden.grammar.js";

export default ($) => garden("tallsow")
  .rain((t) => 1)
  .sow((pl, rng) => {
    pl.water = rng();
    pl.height = 1;
  });
