// @ts-nocheck: a lambda names the Dialect's free names ($, intrinsics), which TypeScript cannot see; the builder checks them (B008).
// Dream Code example 2 (project/2026-11-24-data-tools-dream-code.md): clean the data, with a runtime lambda.
// A source declares its schema (the kit infers no types from a CSV); `units` is an f64, since there is no
// integer type (`"int"` is T001 with the fix); `dropNulls` and `dedupe` take the columns as arguments, not an array.
import { program } from "../grammar.js";

export default () => program("clean-sales")
  .source("raw", { csv: "data/sales.csv", header: true, columns: { date: "str", region: "str", units: "str", "Unit Price": "str" } })
  .table("sales", "raw")
  .rename({ "Unit Price": "price" })
  .cast({ date: "date", units: "f64", price: "f64" })
  .trim("region")
  .replace("region", { "N.": "North", "S.": "South" })
  .dropNulls("date", "units")
  .dedupe("date", "region")
  .derive("revenue", (row) => row.units * row.price);
