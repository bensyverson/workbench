// REFUSED: no code. The Environment, session, event log, undo and permissions (s.set, s.addStep, s.log,
// env.commit) are not Program builder calls; nothing in the API defines them. The Program a session would
// end with (the refund table and chart, as written in the example) is below.
import { program } from "../data.grammar.js";

export default program("sales-env")
  .source("sales_raw", { csv: "data/sales.csv", columns: { date: "date", region: "str", units: "f64", price: "f64" } })
  .param("minUnits", { min: 0, max: 500, step: 10, value: 50 })
  .table("sales", "sales_raw")
  .filter(row => row.price > 0)
  .table("refunds", "sales_raw")
  .filter(row => row.price < 0)
  .groupBy("region")
  .agg({ n: g => g.count() })
  .chart("refundBars", "refunds", "bar")
  .x("region")
  .y("n");
