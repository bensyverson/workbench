import { program } from "../data.grammar.js";

// REFUSED: no diagnostic applies: inspecting, listing, diffing and tracing the IR are calls on what the
// host built, not builder calls, so the language has nothing to refuse them with. The nearest the kit
// offers is the record (.build()), grammar.lower(record) (each lambda's id, type and the per-step states)
// and bindingText (each param's binding time: `metric` folded at build for the format, a uniform in the
// y and title lambdas). There is no listing, lineage, downstreamOf, diff or toJSON of a DAG. The "next"
// version, which reopens "monthly" to add a filter, is B002 (a second table named 'monthly'): a table is
// not extended after it is closed. The Program inspected is example 4's:
export default ($) => program("revenue-by-month")
  .source("sales", { csv: "data/sales.csv", columns: { date: "date", region: "str", units: "f64", price: "f64" } })
  .param("metric", { widget: "select", options: ["revenue", "units"], value: "revenue" })
  .table("monthly", "sales")
  .derive("revenue", (row) => row.units * row.price)
  .derive("month", (row) => truncMonth(row.date))
  .groupBy("month", "region")
  .agg({
    revenue: (g) => g.sum("revenue"),
    units: (g) => g.sum("units"),
    orders: (g) => g.count(),
  })
  .sort("month")
  .chart("trend", "line", "monthly")
  .x("month", { type: "time" })
  .y(() => $.metric)
  .color("region");
