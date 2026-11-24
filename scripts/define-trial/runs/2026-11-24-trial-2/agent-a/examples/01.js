import { program } from "../data.grammar.js";

// Column types are declared (not inferred from the file); "int" becomes f64. The view is a head step.
export default program("first-look")
  .source("sales", { csv: "data/sales.csv", columns: { date: "date", region: "str", units: "f64", price: "f64" } })
  .table("first20", "sales")
  .head(20);
// REFUSED (part): `.view(...)`, `built.schema(...)`, `built.run()`: no views, no built object (B009 for .view)
