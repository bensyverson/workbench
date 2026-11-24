// @ts-nocheck: a lambda names the Dialect's free names ($, intrinsics), which TypeScript cannot see; the builder checks them (B008).
// Dream Code example 7, as far as the kit builds it: fragments are not built (`.fragment(…)` is B009, and a
// method only a fragment would add, `.winsorize`, throws B001), nor column attributes (`.column(…)` is B009)
// nor a chart's rule layer (`.rule(…)` is B009). So the winsorize is written out as a derive, its bounds
// params set by hand (quantiles need the data at build time); the z-score is left out (a row lambda sees one
// row, not the table's mean and spread, and the Dialect has no square root).
import { program } from "../grammar.js";

export default () => program("outliers")
  .source("sales", { csv: "data/sales.csv", columns: { price: "f64", weight: "f64" } })
  .param("lo", { value: 1, label: "Lowest price kept" })
  .param("hi", { value: 500, label: "Highest price kept" })
  .table("clean", "sales")
  .derive("price", (row) => min(max(row.price, $.lo), $.hi))
  .chart("dist", "clean")
  .mark("histogram")
  .x("price", { bins: 30 });
