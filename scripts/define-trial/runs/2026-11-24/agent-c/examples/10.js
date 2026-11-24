import { program } from "../data.grammar.js";

// REFUSED (part): wb.component("cohort") (components, build-time lambdas, wb.arg.build); fragments (.rule, column
// attrs); wb.book.note and layout; .agent(...) permissions (effects); fn.trunc/diff on dates.
// The heatmap and line chart are kept over the eligible table in place of ret.
export default program("retention")
  .source("events", { csv: "data/events.csv" })
  .source("plans", { csv: "data/plans.csv" })
  .param("plan", { value: "pro" })
  .param("minEvents", { value: 3, min: 1, max: 20 })
  .table("planPicked", "plans")
    .filter(p => p.name === $.plan)
  .table("eligible", "events")
    .semiJoin("planPicked", { on: "user_id" })
    .keepGroups("user_id", g => g.count() >= $.minEvents)
  .chart("heat", "eligible")
    .kind("heatmap")
    .x("period", {})
    .y("cohort", { type: "ordinal" })
    .color("retention", { scheme: "sequential", format: ".0%" })
  .view("heat");
