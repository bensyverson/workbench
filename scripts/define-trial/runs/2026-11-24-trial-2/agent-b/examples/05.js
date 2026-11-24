import { program } from "../data.grammar.js";

// "-total" descending sort is .sortDesc("total"). The join key-type check (E-JOIN-TYPE) and the
// result schema listing are not expressible. SQL text: see the report (W001, rejected .sql).
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
  .chart("bars", "top", "bar")
  .x("total")
  .y("name", { sort: "-x" })
  .color("segment")
  .view("top", "bars");
