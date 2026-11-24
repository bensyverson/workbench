// Partly fits. The source declares its columns (the API cannot read a CSV or infer types).
// REFUSED: B009 for .view(...): views render, which is outside this language (rule R8).
import { program } from "../data.grammar.js";

export default program("first-look")
  .source("sales", { date: "str", region: "str", units: "f64", price: "f64" });
