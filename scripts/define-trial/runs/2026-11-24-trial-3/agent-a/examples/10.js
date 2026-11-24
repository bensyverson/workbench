import { program } from "../data.grammar.js";

// REFUSED: B009 for program.component("cohort", …): "new components are not part of this language", and
// for .agent(…): "agent permissions are not part of this language"; .view (layout) is B009 too. The cohort
// is written out as tables below, with its bucket fixed to "month" by the author: a build-time choice from
// the data's date range needs a build-time lambda that sees the data, which the API does not have. The
// retention denominator (the window lookup first("users", { period: 0 })) becomes a join with a
// cohort-size table. The inline filtered table inside .semiJoin becomes its own table "onPlan". The
// line chart's .rule(0.2) (a layered mark) and the markdown note are not offered.
export default ($) => program("retention")
  .source("events", { csv: "data/events.csv", columns: { user_id: "str", ts: "date", kind: "str" } })
  .source("plans", { csv: "data/plans.csv", columns: { user_id: "str", name: "str" } })
  .param("plan", { widget: "select", from: { table: "plans", column: "name" }, value: "pro" })
  .param("minEvents", { widget: "slider", min: 1, max: 20, value: 3 })
  .table("onPlan", "plans")
  .filter((p) => p.name === $.plan)
  .table("eligible", "events")
  .semiJoin("onPlan", { on: "user_id" })
  .keepGroups("user_id", (g) => g.count() >= $.minEvents)
  .select("user_id", "ts", "kind")
  // the cohort "ret", expanded: user "user_id", at "ts", bucket "month", active kind !== "heartbeat"
  .table("firstSeen", "eligible")
  .groupBy("user_id")
  .agg({ cohort: (g) => g.min("ts") })
  .derive("cohort", (r) => truncMonth(r.cohort))
  .table("activity", "eligible")
  .filter((row) => row.kind !== "heartbeat")
  .join("firstSeen", { on: { user_id: "user_id" } })
  .derive("period", (r) => monthsBetween(r.cohort, r.ts))
  .groupBy("cohort", "period")
  .agg({ users: (g) => g.countDistinct("user_id") })
  .table("cohortSize", "activity")
  .filter((r) => r.period === 0)
  .select("cohort", "users")
  .rename({ users: "size" })
  .table("ret", "activity")
  .join("cohortSize", { on: { cohort: "cohort" } })
  .derive("retention", (r) => r.users / r.size)
  .chart("heat", "heatmap", "ret")
  .x("period")
  .y("cohort", { type: "ordinal" })
  .color("retention", { scheme: "sequential", format: ".0%" })
  .chart("curves", "line", "ret")
  .x("period")
  .y("retention")
  .color("cohort");
