import { program } from "../data.grammar.js";

// REFUSED: no diagnostic applies: the Environment (sessions, set, addStep, peek, profile, log, undo,
// commit) is not built, and it is the host's API, not the builder's. What fits is the Program the
// session's log describes once applied: the filter step added to "sales", the "refunds" table and the
// "refundBars" chart. Moving the slider ($.minUnits to 100) is a host value passed to run(), not a
// change to the Program. The refused mutation's diagnostic (row.prise) is the L002 lowering gives.
export default ($) => program("sales-session")
  .source("sales_raw", { csv: "data/sales.csv", columns: { date: "date", region: "str", units: "f64", price: "f64" } })
  .param("minUnits", { widget: "slider", min: 0, max: 500, step: 10, value: 50 })
  .table("sales", "sales_raw")
  .filter((row) => row.units >= $.minUnits)
  .filter((row) => row.price > 0)   // why: negative prices are refunds
  .table("refunds", "sales_raw")
  .filter((row) => row.price < 0)
  .groupBy("region")
  .agg({ n: (g) => g.count() })
  .chart("refundBars", "bar", "refunds")
  .x("region")
  .y("n");
