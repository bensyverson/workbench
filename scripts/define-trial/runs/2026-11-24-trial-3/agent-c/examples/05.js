import { program } from "../data.grammar.js";

// Partly fits: the query. Refused: .chart(...) and .view(...) (rendering), and the SQL paste:
// REFUSED: B009 for wb.sql`...` (the program's rejected "sql" entry), and B004 for a table built from a callback that
// returns SQL text (a function where a relation name goes; the API has no string-returning table form).
export default ($) => program("top-customers")
  .param("topN", { min: 5, max: 50, value: 10 })
  .param("year", { options: [2024, 2025, 2026], value: 2026 })
  .source("orders", { customer_id: "f64", amount: "f64", placed_at: "date" })
  .source("customers", { id: "f64", name: "str", segment: "str" })
  .table("top", "orders")
  .filter((o) => year(o.placed_at) === $.year)
  .join("customers", { on: { customer_id: "id" }, take: ["name", "segment"] })
  .groupBy("name", "segment")
  .agg({
    total: (g) => g.sum("amount"),
    orders: (g) => g.count(),
  })
  .sort("-total")
  .limit($.topN);
