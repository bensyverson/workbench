import { defineGrammar, name, data, ref, lambda } from "kit/define";
import { budgetLang } from "./budget.dialect.js";

const PARAM_CODE = "K001";
const HORIZON_CODE = "K002";
const START_CODE = "K003";
const OPENING_CODE = "K004";
const DUPLICATE_FLOW_CODE = "K005";
const SELF_TRANSFER_CODE = "K006";
const NO_ACCOUNT_CODE = "K007";

const MAX_HORIZON = 120;

export const budget = defineGrammar(budgetLang, {
  root: "program",
  params: { slot: "param" },
  constructs: {
    program: {
      opens: [name()],
      slots: {
        param: {
          kind: "decl",
          args: [name("param"), data({ value: "number", min: "number", max: "number" })],
          as: "params",
          check(call, ctx) {
            const { value, min, max } = call.args[1];
            if (value < min || value > max) {
              ctx.error(PARAM_CODE, `param "${call.args[0]}" value ${value} is outside ${min}..${max}`, {
                arg: 1,
                fix: "set value between min and max",
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
            if (!Number.isInteger(year)) {
              ctx.error(START_CODE, `start year ${year} is not a whole number`, { arg: 0, fix: ".start(2026, 1)" });
            }
            if (!Number.isInteger(month) || month < 1 || month > 12) {
              ctx.error(START_CODE, `start month ${month} is not 1 to 12`, { arg: 1, fix: ".start(2026, 1)" });
            }
          },
        },
        horizon: {
          kind: "decl",
          args: [data("number")],
          once: true,
          check(call, ctx) {
            const n = call.args[0];
            if (!Number.isInteger(n) || n < 1 || n > MAX_HORIZON) {
              ctx.error(HORIZON_CODE, `horizon ${n} is not a whole number of months from 1 to ${MAX_HORIZON}`, {
                arg: 0,
                fix: ".horizon(12)",
              });
            }
          },
        },
      },
      rejected: {
        loan: {
          message: "this language has no loans",
          fix: '.outflow("name", (m) => …) inside an account, for the repayments',
        },
      },
      check(record, ctx) {
        if (!record.account) {
          ctx.error(NO_ACCOUNT_CODE, "a budget needs at least one account", {
            fix: '.account("checking", { opening: 0 })',
          });
        }
      },
    },
    account: {
      parent: "program",
      opens: [name("acct"), data({ opening: "number" }, { as: "terms" })],
      record: "calls",
      state: {
        init() {
          return { flows: {} };
        },
        step(state, call) {
          if (call.slot === "inflow" || call.slot === "outflow") {
            return { flows: { ...state.flows, [call.args[0]]: "f64" } };
          }
          return state;
        },
      },
      slots: {
        inflow: {
          kind: "decl",
          args: [data("string"), lambda("flow")],
          check: checkFlowName,
        },
        outflow: {
          kind: "decl",
          args: [data("string"), lambda("flow")],
          check: checkFlowName,
        },
        transfer: {
          kind: "decl",
          args: [ref("acct"), lambda("transfer")],
          check(call, ctx) {
            const here = ctx.program.account.at(-1);
            if (here.acct === call.args[0]) {
              ctx.error(SELF_TRANSFER_CODE, `transfer goes to its own account "${call.args[0]}"`, {
                arg: 0,
                fix: "name a different account",
              });
            }
          },
        },
      },
      check(record, ctx) {
        if (record.terms.opening < 0) {
          ctx.error(OPENING_CODE, `opening ${record.terms.opening} is negative`, {
            arg: 1,
            fix: "an opening of 0 or more",
          });
        }
      },
    },
  },
});

// Flow names are unique within an account, inflows and outflows together.
// Reads `calls`, not the per-slot lists: a record: "calls" construct keeps only the
// ordered calls. The call being checked is already in the list (pitfall 6).
function checkFlowName(call, ctx) {
  const here = ctx.program.account.at(-1);
  const names = here.calls
    .filter((c) => c.slot === "inflow" || c.slot === "outflow")
    .map((c) => c.args[0]);
  if (names.filter((n) => n === call.args[0]).length > 1) {
    ctx.error(DUPLICATE_FLOW_CODE, `this account already has a flow named "${call.args[0]}"`, {
      arg: 0,
      fix: "give this flow another name",
    });
  }
}
