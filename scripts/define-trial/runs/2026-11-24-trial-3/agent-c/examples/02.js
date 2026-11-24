import { program } from "../data.grammar.js";

// Partly fits. The raw source takes a declared schema. "int" is written as f64: there is no integer type.
// Refused: wb.csv(..., { header: true }) (no file input), and dropNulls on nulls (the types have no null).
// The typo check in the Dream Code (row.revnue) is an error at build time, not part of this Program.
export default ($) => program("clean-sales")
  .source("raw", { date: "str", region: "str", units: "str", "Unit Price": "str" })
  .table("sales", "raw")
  .rename({ "Unit Price": "price" })
  .cast({ date: "date", units: "f64", price: "f64" })
  .trim("region")
  .replace("region", { "N.": "North", "S.": "South" })
  .dropNulls(["date", "units"])
  .dedupe(["date", "region"])
  .derive("revenue", (row) => row.units * row.price);
