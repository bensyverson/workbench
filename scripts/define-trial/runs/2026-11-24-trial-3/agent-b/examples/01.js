import { program } from "../data.grammar.js";

// The view (a 20-row grid) is rendering and is not in the language; .limit(20) is the table half of it.
// Column types cannot be inferred from the CSV, so they are declared.
export default ($) => program("first-look")
  .source("sales", { csv: "data/sales.csv", columns: { date: "date", region: "str", units: "f64", price: "f64" } })
  .table("head", "sales")
  .limit(20);
