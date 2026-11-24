// The budget planner Grammar: a Program with params, a start month, a horizon and accounts. Each account is
// built call by call; its construct state is the flows declared so far, which types the `f` of the next
// lambda (budget.dialect.js). Transfers name an account declared anywhere in the Program, never their own.

import { defineGrammar, name, ref, data, lambda } from "kit/define";
import { budgetDialect } from "./budget.dialect.js";

const IDENT = /^[A-Za-z_$][\w$]*$/;
const whole = (n) => Number.isInteger(n);

/** Flow names unique within an account, and readable as f.name. */
function checkFlowName({ args: [n] }, ctx) {
  if (!IDENT.test(n)) {
    ctx.error("U004", `flow name '${n}' is not an identifier, so a later lambda could not read it as f.${n}`, { arg: 0, tip: "name it with letters, digits and _" });
    return;
  }
  const account = ctx.program.account?.at(-1);
  // ctx.program already holds this call, as the account's last.
  const named = (account?.calls ?? []).filter((c) => c.slot !== "transfer" && c.args[0] === n);
  if (named.length > 1) ctx.error("U003", `account '${account.name}' already has a flow named '${n}'`, { arg: 0, tip: "give each flow in an account its own name" });
}

const flowSlot = { kind: "decl", args: [data("string"), lambda("flow")], check: checkFlowName };

const LOAN = {
  message: "this language has no loans",
  tip: "model a repayment as an outflow: .outflow(\"loan\", (m) => 350)",
  fix: ".outflow(\"loan\", (m) => …)",
};

export const budget = defineGrammar(budgetDialect, {
  root: "budget",
  params: { slot: "param" },
  constructs: {
    budget: {
      opens: [name()],
      rejected: { loan: LOAN },
      check(record, ctx) {
        if (!record.account?.length) ctx.error("U008", `budget '${record.name}' has no account`, { tip: ".account(\"checking\", { opening: 0 })" });
      },
      slots: {
        param: {
          kind: "decl", args: [name("param"), data({ value: "number", "min?": "number", "max?": "number" })], as: "params",
        },
        start: {
          kind: "decl", args: [data("number"), data("number")], once: true, required: true,
          check({ args: [y, m] }, ctx) {
            if (!whole(y)) ctx.error("U001", `start year ${y} is not a whole number`, { arg: 0, tip: ".start(2026, 1)" });
            if (!whole(m) || m < 1 || m > 12) ctx.error("U001", `start month ${m} is not a month: write 1 to 12`, { arg: 1, tip: ".start(2026, 1)" });
          },
        },
        horizon: {
          kind: "decl", args: [data("number")], once: true,
          check({ args: [n] }, ctx) {
            if (!whole(n) || n < 1 || n > 120) ctx.error("U002", `horizon ${n} is not a whole number of months from 1 to 120`, { arg: 0, tip: ".horizon(12)" });
          },
        },
      },
    },
    account: {
      parent: "budget",
      opens: [name(), data({ opening: "number" }, { as: "terms" })],
      record: "calls",
      check(record, ctx) {
        const o = record.terms?.opening;
        if (typeof o === "number" && !(o >= 0)) ctx.error("U006", `account '${record.name}' opens at ${o}; an opening balance is at least 0`, { arg: 1, tip: `.account("${record.name}", { opening: 0 })` });
      },
      // The flows declared so far, by name: what the next lambda reads as f.
      state: {
        init: () => ({ flows: {} }),
        step(state, call) {
          if (call.slot === "transfer") return state;
          return { flows: { ...state.flows, [call.args[0]]: "f64" } };
        },
        names: {},
      },
      slots: {
        inflow: flowSlot,
        outflow: flowSlot,
        transfer: {
          kind: "decl", args: [ref("account"), lambda("flow")],
          check({ args: [to] }, ctx) {
            const self = ctx.program.account?.at(-1)?.name;
            if (to === self) ctx.error("U005", `account '${self}' transfers to itself`, { arg: 0, tip: "transfer to another account" });
          },
        },
      },
    },
  },
});
