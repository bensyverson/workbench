import { program } from "../data.grammar.js";

export default program("top-customers")
  .source("orders", { csv: "data/orders.csv", columns: { id: "f64", customer_id: "f64", placed_at: "date", amount: "f64" } })
  .source("customers", { csv: "data/customers.csv", columns: { id: "f64", name: "str", segment: "str" } })
  .param("topN", { min: 5, max: 50, value: 10 })
  .param("year", { options: [2024, 2025, 2026], value: 2026 })
  .table("top", "orders")
  .filter(o => year(o.placed_at) === $.year)
  .join("customers", { on: { customer_id: "id" }, take: ["name", "segment"] })
  .groupBy("name", "segment")
  .agg({
    total: g => g.sum("amount"),
    orders: g => g.count(),
  })
  .sortDesc("total")
  .limit(() => $.topN)
  .chart("bars", "top")
  .mark("bar")
  .x("total")
  .y("name", { sort: "-x" })
  .color("segment");
// REFUSED (part): pasted SQL text and wb.sql`...` (program.sql(...) would be B009 "SQL text is not an input language");
// join key type mismatch and unknown-table diagnostics are not expressible (no check sees column types).
