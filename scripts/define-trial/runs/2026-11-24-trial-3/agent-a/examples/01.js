import { program } from "../data.grammar.js";

// The view (a 20-row grid) is layout and rendering, refused by .view (B009); the host's text
// view shows a table's first 20 rows, so the Program names the table to look at instead.
export default ($) => program("first-look")
  .source("sales", { csv: "data/sales.csv", columns: { date: "date", region: "str", units: "f64", price: "f64" } })
  .table("look", "sales")
  .limit(20);
