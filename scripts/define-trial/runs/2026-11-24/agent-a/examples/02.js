import { program } from "../data.grammar.js";

// .cast cannot name "date" or "int": the column types are f64, str and bool only.
// .derive declares the new column's type ("f64") because environment(program) runs before the lambda
// is type-checked and so cannot learn the type the body returns; later steps need it.
export default program("clean-sales")
  .source("raw", {
    csv: "data/sales.csv", header: true,
    columns: { date: "str", region: "str", units: "str", "Unit Price": "str" },
  })
  .table("sales", "raw")
  .rename({ "Unit Price": "price" })
  .cast({ date: "str", units: "f64", price: "f64" })
  .trim("region")
  .replace("region", { "N.": "North", "S.": "South" })
  .dropNulls(["date", "units"])
  .dedupe(["date", "region"])
  .derive("revenue", "f64", (row) => row.units * row.price);

// The typo, as another table on the same Program:
//   .table("bad", "sales").derive("margin", "f64", (row) => row.revnue - row.cost)
// L002  02.js  a row of table "bad" at step 1 has no member "revnue"; did you mean "revenue"?
// L002  02.js  a row of table "bad" at step 1 has no member "cost"
//   (the "columns: date, region, …" list of the Dream Code depends on the kit's L002 text; I cannot add it)
