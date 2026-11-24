// @ts-nocheck: a lambda names the Dialect's free names ($, intrinsics), which TypeScript cannot see; the builder checks them (B008).
// Dream Code example 5: a query over two tables. A table is named by a string, not `t.customers`;
// `.sort("-total")` is `.sortDesc("total")` (the first is T002 with that fix); `.limit($.topN)` is a lambda;
// the grid is a named view of the table, and the row layout with its controls is left out (B009).
import { program } from "../grammar.js";

export default () => program("top-customers")
  .source("orders", { csv: "data/orders.csv", columns: { id: "f64", customer_id: "f64", placed_at: "date", amount: "f64" } })
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
  .sortDesc("total")
  .limit(() => $.topN)
  .chart("bars", "top")
  .mark("bar")
  .x("total")
  .y("name", { sort: "-x" })
  .color("segment")
  .view("topRows", "top");
