import { program } from "../data.grammar.js";

// The typo diagnostic (E-COL-UNKNOWN) would be an L-code from lowering: row.revnue is not a member of Row.
// REFUSED (part): cast to "date" and "int" (no such types), and a typo-checked Row per table (one shared Row object).
export default program("clean-sales")
  .source("raw", { csv: "data/sales.csv", header: true })
  .table("sales", "raw")
    .rename({ "Unit Price": "price" })
    .cast({ date: "str", units: "f64", price: "f64" })
    .trim("region")
    .replace("region", { "N.": "North", "S.": "South" })
    .dropNulls(["date", "units"])
    .dedupe(["date", "region"])
    .derive("revenue", row => row.units * row.price);
