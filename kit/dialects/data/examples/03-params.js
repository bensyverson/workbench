// @ts-nocheck: a lambda names the Dialect's free names ($, intrinsics), which TypeScript cannot see; the builder checks them (B008).
// Dream Code example 3: params that drive runtime lambdas. A select lists its options (a select `from` a
// build-time lambda is left out), a date param is a string value with `kind: "date"`, and the layout is left out.
import { program } from "../grammar.js";

export default ($) => program("filters")
  .source("sales", { csv: "data/sales.csv", columns: { date: "date", region: "str", units: "f64", price: "f64" } })
  .param("minUnits", { min: 0, max: 500, step: 10, value: 50, label: "Minimum units" })
  .param("region", { options: ["All", "North", "South"], value: "All" })
  .param("since", { value: "2026-01-01", kind: "date" })
  .table("picked", "sales")
  .filter((row) => row.units >= $.minUnits)
  .filter((row) => $.region === "All" || row.region === $.region)
  .filter((row) => row.date >= $.since);
