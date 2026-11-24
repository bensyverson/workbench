import { program } from "../data.grammar.js";

// Partly fits. The source takes its schema from the author: the kit has no file input, and types are not inferred.
// REFUSED: B001 for wb.csv(...) (no file input), for .view(...) (no rendering) and for built.schema() / built.run() (host tools).
export default ($) => program("first-look")
  .source("sales", { date: "date", region: "str", units: "f64", price: "f64" });
