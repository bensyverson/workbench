import { program } from "../data.grammar.js";

// The part that fits: the cohort expansion written out with core table steps, the bucket fixed to month.
export default program("retention")
  .source("events", { csv: "data/events.csv", columns: { user_id: "f64", ts: "date", kind: "str" } })
  .source("plans", { csv: "data/plans.csv", columns: { user_id: "f64", name: "str" } })
  .param("plan", { options: ["pro", "team", "free"], value: "pro" })
  .param("minEvents", { min: 1, max: 20, value: 3 })
  .table("onPlan", "plans")
  .filter(p => p.name === $.plan)
  .table("eligible", "events")
  .semiJoin("onPlan", { on: { user_id: "user_id" } })
  .keepGroups("user_id", g => g.count() >= $.minEvents)
  .select("user_id", "ts", "kind")
  .table("first", "eligible")
  .groupBy("user_id")
  .agg({ cohort: g => g.min("ts") })
  .derive("cohort", r => truncMonth(r.cohort))
  .table("ret", "eligible")
  .filter(row => row.kind !== "heartbeat")
  .join("first", { on: { user_id: "user_id" }, take: ["cohort"] })
  .derive("period", r => monthDiff(r.cohort, r.ts))
  .groupBy("cohort", "period")
  .agg({ users: g => g.countDistinct("user_id") })
  .chart("heat", "ret")
  .mark("heatmap")
  .x("period")
  .y("cohort", { type: "ordinal" })
  .color("users", { scheme: "sequential" });
// REFUSED (part): wb.component("cohort", ...) with build-time args, the retention column (needs a lookup of another
// row of the same table), the second chart's rule on a ratio, the book note, wb.layout, and .agent(...) permissions.
