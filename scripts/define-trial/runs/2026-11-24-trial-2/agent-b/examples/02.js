import { program } from "../data.grammar.js";

// The typo demo (row.revnue) is left out so the file checks clean; it is tried in the report.
export default program("clean-sales")
  .source("raw", { csv: "data/sales.csv", header: true, columns: { date: "date", region: "str", units: "f64", "Unit Price": "f64" } })
  .table("sales", "raw")
  .rename({ "Unit Price": "price" })
  .cast({ date: "date", units: "f64", price: "f64" })
  .trim("region")
  .replace("region", { "N.": "North", "S.": "South" })
  .dropNulls(["date", "units"])
  .dedupe(["date", "region"])
  .derive("revenue", row => row.units * row.price);
