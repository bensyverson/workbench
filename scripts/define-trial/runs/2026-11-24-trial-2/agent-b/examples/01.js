import { program } from "../data.grammar.js";

// "types inferred" and a 20-row grid are not expressible: the columns are declared, the grid is .limit(20).
export default program("first-look")
  .source("sales", { csv: "data/sales.csv", columns: { date: "date", region: "str", units: "f64", price: "f64" } })
  .table("head", "sales")
  .limit(20)
  .view("head");
