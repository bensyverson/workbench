import { defineGrammar, name, data, ref, lambda } from "kit/define";
import { budgetLang } from "./budget.dialect.js";

const isWhole = (n) => Number.isInteger(n);

export const budget = defineGrammar(budgetLang, {
  root: "program",
  params: { slot: "param" },
  constructs: {
    program: {
      opens: [name("program", { as: "name" })],
      slots: {
        param: {
          kind: "decl",
          args: [name("param"), data({ value: "number", min: "number", max: "number" })],
          as: "params",
          check(call, ctx) {
            const p = call.args[1];
            if (p.value < p.min || p.value > p.max) {
              ctx.error("G001", `param ${call.args[0]} has value ${p.value}, outside ${p.min}..${p.max}`, {
                arg: 1,
                tip: "value must lie within min..max",
              });
            }
          },
        },
        start: {
          kind: "decl",
          args: [data("number"), data("number")],
          once: true,
          required: true,
          check(call, ctx) {
            const [year, month] = call.args;
            if (!isWhole(year)) ctx.error("G003", "start year must be a whole number", { arg: 0 });
            if (!isWhole(month) || month < 1 || month > 12) {
              ctx.error("G003", `start month must be 1 to 12, got ${month}`, { arg: 1 });
            }
          },
        },
        horizon: {
          kind: "decl",
          args: [data("number")],
          once: true,
          check(call, ctx) {
            const n = call.args[0];
            if (!isWhole(n) || n < 1 || n > 120) {
              ctx.error("G002", `horizon must be a whole number of months, 1 to 120, got ${n}`, {
                arg: 0,
                tip: "a horizon is a number of months, for example .horizon($.months)",
              });
            }
          },
        },
      },
      check(record, ctx) {
        if (!record.account || record.account.length === 0) {
          ctx.error("G007", "a budget needs at least one account", {
            tip: 'add an account, for example .account("checking", { opening: 0 })',
          });
        }
      },
      rejected: {
        loan: {
          message: "this language has no loans",
          fix: 'an outflow instead, for example .outflow("loan payment", (m) => 250)',
        },
      },
    },
    account: {
      parent: "program",
      opens: [name("account", { as: "name" }), data({ opening: "number" }, { as: "open" })],
      record: "calls",
      state: {
        init(opened) {
          return { name: opened.name, flows: {} };
        },
        step(state, call, inferred, ctx) {
          if (call.slot === "inflow" || call.slot === "outflow") {
            const flow = call.args[0];
            if (Object.hasOwn(state.flows, flow)) {
              ctx.error("G006", `account ${state.name} already has a flow named ${flow}`, {
                tip: "inflow and outflow names are unique within one account",
              });
            }
            return { ...state, flows: { ...state.flows, [flow]: "f64" } };
          }
          if (call.slot === "transfer" && call.args[0] === state.name) {
            ctx.error("G005", `account ${state.name} cannot transfer to itself`, {
              tip: "name a different account in .transfer",
            });
          }
          return state;
        },
      },
      slots: {
        inflow: { kind: "decl", args: [data("string"), lambda("flow")] },
        outflow: { kind: "decl", args: [data("string"), lambda("flow")] },
        transfer: { kind: "decl", args: [ref("account"), lambda("transfer")] },
      },
      check(record, ctx) {
        if (record.open.opening < 0) {
          ctx.error("G004", `opening balance must be at least 0, got ${record.open.opening}`, {
            arg: 1,
            tip: "an account's opening balance is never negative",
          });
        }
      },
    },
  },
});
