import { program } from "../data.grammar.js";

// REFUSED: B009 for program.fragment(…): "fragments are not part of this language: a table's methods are
// fixed", tip "write the steps out on the table". So winsorize and zscore are not methods; below, their
// expansion is written out by hand for "price", with the table-wide statistics computed as one-group
// aggregates (a constant key k) joined back onto every row. The column attributes (currency, unit) have
// no counterpart: a column carries only its type. The chart's .rule(3) (a layered mark) is not offered.
export default ($) => program("outliers")
  .source("sales", { csv: "data/sales.csv", columns: { date: "date", region: "str", units: "f64", price: "f64", weight: "f64" } })
  // winsorize("price"): clamp to the 1st and 99th percentiles
  .table("bounds", "sales")
  .derive("k", (row) => 0)
  .groupBy("k")
  .agg({ lo: (g) => g.quantile("price", 0.01), hi: (g) => g.quantile("price", 0.99) })
  .table("winsorized", "sales")
  .derive("k", (row) => 0)
  .join("bounds", { on: { k: "k" }, take: ["lo", "hi"] })
  .derive("price", (row) => min(max(row.price, row.lo), row.hi))
  // zscore("price"): (price - mean) / sd, over the winsorized prices
  .table("moments", "winsorized")
  .groupBy("k")
  .agg({ mean: (g) => g.mean("price"), sd: (g) => g.sd("price") })
  .table("clean", "winsorized")
  .join("moments", { on: { k: "k" }, take: ["mean", "sd"] })
  .derive("price_z", (row) => (row.price - row.mean) / row.sd)
  .select("date", "region", "units", "price", "weight", "price_z")
  .chart("dist", "histogram", "clean")
  .x("price_z");
