import { program } from "../data.grammar.js";

// Column types are declared on the source, not inferred from the file: the raw file reads as text.
export default ($) => program("clean-sales")
  .source("raw", { csv: "data/sales.csv", header: true, columns: { date: "str", region: "str", units: "str", "Unit Price": "str" } })
  .table("sales", "raw")
  .rename({ "Unit Price": "price" })
  .cast({ date: "date", units: "f64", price: "f64" })
  .trim("region")
  .replace("region", { "N.": "North", "S.": "South" })
  .dropNulls("date", "units")
  .dedupe("date", "region")
  .derive("revenue", (row) => row.units * row.price);

// The typo case, as a second table, is refused when lowered (L002 on row.revnue, with "did you mean
// 'revenue'", and on row.cost):
//   .table("bad", "sales").derive("margin", (row) => row.revnue - row.cost)
