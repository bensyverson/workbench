import { program } from "../data.grammar.js";

// REFUSED: partly. The SQL-text paste (E-SQL-TEXT) is a table given a string: the language has no
// check on a table's arguments to detect it, and `.sql` is the only form it refuses (B009, `rejected`).
// The view/layout is rendering (R8) and is omitted.
export default ($) => program("top-customers")
  .source("orders", { csv: "data/orders.csv", columns: { customer_id: "f64", placed_at: "date", amount: "f64" } })
  .source("customers", { csv: "data/customers.csv", columns: { id: "f64", name: "str", segment: "str" } })
  .param("topN", { min: 5, max: 50, value: 10 })
  .param("year", { options: [2024, 2025, 2026], value: 2026 })
  .table("top", "orders")
  .filter((o) => year(o.placed_at) === $.year)
  .join("customers", { on: { customer_id: "id" }, take: ["name", "segment"] })
  .groupBy("name", "segment")
  .agg({
    total: (g) => g.sum("amount"),
    orders: (g) => g.count(),
  })
  .sort("-total")
  .limit($.topN)
  .chart("bars", "top")
  .mark("bar")
  .x("total")
  .y("name", { sort: "-x" })
  .color("segment");
