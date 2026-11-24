import { program } from "../data.grammar.js";

// The source declares its raw columns, as the CSV header spells them.
export default program("clean-sales")
  .source("raw", { csv: "data/sales.csv", header: true, columns: { date: "string", region: "string", units: "string", "Unit Price": "string" } })
  .table("sales", "raw")
    .rename({ "Unit Price": "price" })
    .cast({ date: "date", units: "number", price: "number" })
    .trim("region")
    .replace("region", { "N.": "North", "S.": "South" })
    .dropNulls(["date", "units"])
    .dedupe(["date", "region"])
    .derive("revenue", "number", (row) => row.units * row.price);

// The typo, as the author would write it:
//   .table("bad", "sales").derive("margin", "number", (row) => row.revnue - row.cost)
// L002  a row of sales (row) has no member "revnue"; did you mean "revenue"?
// L002  a row of sales (row) has no member "cost"
// (The draft's L002 gives a "did you mean"; it does not promise the list of columns the Dream Code shows.)
