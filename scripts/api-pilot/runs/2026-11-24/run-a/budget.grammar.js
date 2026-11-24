import { defineGrammar, name, ref, data, lambda } from "kit/define";
import { budgetLang } from "./budget.dialect.js";

const isWhole = (n) => Number.isInteger(n);
const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const FLOWS = ["inflow", "outflow"];

/** The account this call belongs to: the last one opened so far (the call is already in the record). */
const currentAccount = (ctx) => ctx.program.account.at(-1);

/**
 * Flow names are unique within one account only, so they cannot be name() declarations
 * (a namespace is Program-wide); the account checks them itself.
 */
function checkFlowName(call, ctx) {
  const flow = call.args[0];
  if (!IDENT.test(flow)) {
    ctx.error("U008", `flow name '${flow}' is not an identifier, so a later lambda could not read it as f.${flow}`, { arg: 0, tip: "use letters, digits and _ only, not starting with a digit" });
    return;
  }
  const acct = currentAccount(ctx);
  const same = acct.calls.filter((c) => FLOWS.includes(c.slot) && c.args[0] === flow);
  if (same.length > 1) ctx.error("U009", `account '${acct.account}' already has a flow named '${flow}'`, { arg: 0, tip: "flow names are unique within an account; rename this one" });
}

function checkTransfer(call, ctx) {
  const acct = currentAccount(ctx);
  if (call.args[0] === acct.account) {
    ctx.error("U010", `account '${acct.account}' transfers to itself; a transfer moves money to another account`, { arg: 0, tip: "name a different account, declared anywhere in the Program" });
  }
}

export const budget = defineGrammar(budgetLang, {
  root: "budget",
  params: { slot: "param" },
  constructs: {
    budget: {
      opens: [name()],
      slots: {
        param: {
          kind: "decl",
          args: [name("param"), data({ value: "number", min: "number", max: "number" })],
          as: "params",
          check(call, ctx) {
            const { value, min, max } = call.args[1];
            if (min > max) ctx.error("U001", `param '${call.args[0]}' has min ${min} above max ${max}`, { arg: 1, tip: "make min at most max" });
            else if (value < min || value > max) ctx.error("U002", `param '${call.args[0]}' value ${value} lies outside ${min}..${max}`, { arg: [1, "value"], tip: "give a value within min..max" });
          },
        },
        start: {
          kind: "decl",
          args: [data("number", { as: "year" }), data("number", { as: "month" })],
          once: true,
          required: true,
          check(call, ctx) {
            const [year, month] = call.args;
            if (!isWhole(year)) ctx.error("U003", `start year ${year} is not a whole number`, { arg: 0, fix: ".start(2026, 1)" });
            if (!isWhole(month) || month < 1 || month > 12) ctx.error("U004", `start month ${month} is not a whole month 1 to 12`, { arg: 1, fix: ".start(2026, 1)" });
          },
        },
        horizon: {
          kind: "decl",
          args: [data("number")],
          once: true,
          check(call, ctx) {
            const n = call.args[0];
            if (!isWhole(n) || n < 1 || n > 120) ctx.error("U005", `horizon ${n} is not a whole number of months from 1 to 120`, { arg: 0, fix: ".horizon(12)" });
          },
        },
      },
      rejected: {
        loan: { message: "this budget language has no loans", fix: '.outflow("loan", (m) => 300)' },
      },
      check(record, ctx) {
        const accounts = record.account ?? [];
        if (accounts.length === 0) ctx.error("U006", "a budget needs at least one account", { fix: '.account("checking", { opening: 0 })' });
      },
    },
    account: {
      parent: "budget",
      opens: [name("account"), data({ opening: "number" }, { as: "options" })],
      record: "calls",
      check(record, ctx) {
        if (!(record.options.opening >= 0)) ctx.error("U007", `account '${record.account}' has a negative opening balance (${record.options.opening})`, { arg: [1, "opening"], tip: "an opening balance is at least 0", fix: `{ opening: 0 }` });
      },
      state: {
        init() { return { flows: {} }; },
        step(state, call) {
          if (call.slot === "inflow" || call.slot === "outflow") return { flows: { ...state.flows, [call.args[0]]: "f64" } };
          return state;
        },
      },
      slots: {
        inflow: { kind: "decl", args: [data("string"), lambda("flow")], check: checkFlowName },
        outflow: { kind: "decl", args: [data("string"), lambda("flow")], check: checkFlowName },
        transfer: { kind: "decl", args: [ref("account"), lambda("flow")], check: checkTransfer },
      },
    },
  },
});
