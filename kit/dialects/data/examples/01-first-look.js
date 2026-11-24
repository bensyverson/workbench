// @ts-nocheck: written the way an author writes a Program; the builder checks it.
// Dream Code example 1 (project/2026-11-24-data-tools-dream-code.md): load a CSV and look at it. A source
// declares its schema (the kit infers no types from a CSV: a source without `columns` is T006); the view is
// named and shows one table, `.view("first", "sales").head(20)`, not a lambda over the tables (a lambda there
// is layout, T007). `built.schema("sales")` is `program.lower(record).states.sales.columns`, and `.run()` is
// the host's: both are refused as B009.
import { program } from "../grammar.js";

export default ($) => program("first-look")
  .source("sales", { csv: "data/sales.csv", columns: { date: "date", region: "str", units: "f64", price: "f64" } })
  .view("first", "sales")
  .head(20);
