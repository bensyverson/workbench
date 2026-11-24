import { defineGrammar, name, data, lambda, ref } from "kit/define";
import { budgetLang } from "./budget.dialect.js";

export const budget = defineGrammar(budgetLang, {
  root: "budget",
  params: { slot: "param" },
  constructs: {
    budget: {
      opens: [name()],
      slots: {
        param: { kind: "decl", args: [name("param"), data({ value: "number", min: "number", max: "number" })], as: "params",
          check(call, ctx) {
            const { value, min, max } = call.args[1];
            if (min > max || value < min || value > max) ctx.error("Z007", "param value must lie within min..max", { arg: 1 });
          } },
        start: { kind: "decl", args: [data("number", { as: "year" }), data("number", { as: "month" })], once: true, required: true,
          check(call, ctx) {
            const [y, m] = call.args;
            if (!Number.isInteger(m) || m < 1 || m > 12) ctx.error("Z001", "start month must be 1 to 12", { arg: 1 });
          } },
        horizon: { kind: "decl", args: [data("number")], once: true,
          check(call, ctx) {
            const n = call.args[0];
            if (!Number.isInteger(n) || n < 1 || n > 120) ctx.error("Z002", "horizon takes whole months, 1 to 120", { arg: 0 });
          } },
      },
      rejected: { loan: { message: "this language has no loans", fix: ".outflow(\"payment\", (m) => 100)" } },
      check(record, ctx) {
        const accounts = record.account ?? [];
        if (accounts.length === 0) ctx.error("Z008", "a budget needs at least one account", { tip: "add .account(name, { opening })" });
        const names = new Set(accounts.map((a) => a.name ?? a.account));
        for (const a of accounts) {
          const an = a.name ?? a.account;
          for (const c of a.calls ?? []) {
            if (c.slot === "transfer") {
              const to = c.args[0];
              if (!names.has(to)) ctx.error("Z003", `transfer to unknown account '${to}'`, { tip: "declare the account with .account" });
              else if (to === an) ctx.error("Z004", "a transfer cannot go to its own account", { tip: "name another account" });
            }
          }
        }
      },
    },
    account: {
      parent: "budget",
      opens: [name("account"), data({ opening: "number" }, { as: "opening" })],
      record: "calls",
      check(record, ctx) {
        const op = typeof record.opening === "object" ? record.opening?.opening : record.opening;
        if (typeof op === "number" && op < 0) ctx.error("Z005", "opening must be at least 0", { tip: "use 0 or more" });
        const all = new Set();
        for (const c of record.calls ?? []) {
          if (c.slot === "transfer") continue;
          const n = c.args[0];
          if (all.has(n)) ctx.error("Z006", `flow '${n}' is already declared in this account`, { tip: "flow names are unique within an account" });
          all.add(n);
        }
      },
      state: {
        init() { return { flows: {} }; },
        step(state, call) {
          if (call.slot === "inflow" || call.slot === "outflow") return { flows: { ...state.flows, [call.args[0]]: "f64" } };
          return state;
        },
        names: {},
      },
      slots: {
        inflow: { kind: "decl", args: [data("string"), lambda("flow")] },
        outflow: { kind: "decl", args: [data("string"), lambda("flow")] },
        transfer: { kind: "decl", args: [data("string"), lambda("flow")] },
      },
    },
  },
});
