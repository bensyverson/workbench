import { program } from "../data.grammar.js";

export default program("clean-sales")
  .source("raw", { csv: "data/sales.csv", header: true, columns: { date: "str", region: "str", units: "str", "Unit Price": "str" } })
  .table("sales", "raw")
  .rename({ "Unit Price": "price" })
  .cast({ date: "date", units: "f64", price: "f64" })
  .trim("region")
  .replace("region", { "N.": "North", "S.": "South" })
  .dropNulls("date", "units")
  .dedupe("date", "region")
  .derive("revenue", row => row.units * row.price);
// REFUSED (part): the deliberate typo table (row.revnue) is a lowering error, not a Program that checks (L-code at the lambda).
