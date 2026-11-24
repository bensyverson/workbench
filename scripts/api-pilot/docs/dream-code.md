# Budget planner: Dream Code

A small language for planning a household budget month by month. You define it; this page says what its Programs look like and which ones it must refuse. Nothing here is implemented.

## A Program

```js
import { budget } from "../budget.grammar.js";

// Top-level helpers and plain-data constants: lambdas may use them.
const yearly = (m, amount) => (m.index % 12 === 0 ? amount : 0);
const FOOD = 600;

export default ($) => budget("household")
  .param("rent", { value: 1500, min: 0, max: 5000 })        // read inside lambdas: changes without a rebuild
  .param("months", { value: 12, min: 1, max: 60 })          // read at build time below
  .param("saveRate", { value: 0.1, min: 0, max: 0.5 })
  .start(2026, 1)                                           // year, month (1-12)
  .horizon($.months)                                        // how many months to plan
  .account("checking", { opening: 1200 })
    .inflow("salary", (m) => 4000)
    .outflow("rent", (m) => $.rent)
    .outflow("food", (m) => (m.index % 12 === 11 ? 900 : FOOD))
    .outflow("insurance", (m) => yearly(m, 800))
    .outflow("trip", (m) => (m.date === monthOf(2026, 7) ? 2000 : 0))
    .transfer("savings", (m, f) => (f.salary - f.rent) * $.saveRate)
  .account("savings", { opening: 0 })
    .inflow("interest", (m, f, balance) => balance * 0.003);
```

## What each part means

- The exported function may be a single chain, as above, or have a block body that builds the chain with ordinary JavaScript (a loop or an `if` that adds accounts or flows) and returns it.
- `budget(name)` opens a Program. Its calls: `param` (any number), `start(year, month)` (once, required), `horizon(n)` (once, optional; n whole months, 1 to 120, default 12) and one or more `account`s.
- `.param(name, { value, min, max })` declares a number param; `value` lies within `min..max`. Lambdas read it as `$.name`, and may read any declared param. Build-time code may read it too, as in `.horizon($.months)`, but only after its `.param` call. Param names are separate from flow and account names.
- `.account(name, { opening })` opens an account. `opening` is a number, at least 0. Account names are unique in a Program. An account may have no flows.
- Inside an account, in any order: `.inflow(name, lambda)`, `.outflow(name, lambda)` and `.transfer(toAccount, lambda)`. Each lambda gives an amount (a number) for one month. Inflow and outflow names are unique within an account. A transfer has no name of its own, and an account may have several transfers, to the same account or to others.
- Every lambda in an account (an inflow's, an outflow's or a transfer's) takes up to three parameters:
  - `m`, the month: `m.index` (0 for the first planned month), `m.year` and `m.month` (1 to 12), all numbers, and `m.date`.
  - `f`, this month's amounts of the inflows and outflows **declared earlier in the same account**, by name (`f.salary`). So `f` grows as the account is built. A transfer never appears in `f`. Reading a flow declared later, or one in another account, is an error.
  - `balance`, the account's balance at the start of the month, before any of this month's flows.
- `m.date` is a **month** value. Months compare only with months (`===`, `<`, `<=` …), never with numbers, and take no arithmetic. `monthOf(year, month)` makes one from any two numbers.
- Lambdas may use `Math.min`, `Math.max`, `Math.round` and `Math.abs`, and nothing else from `Math`. A top-level helper follows the same rules as a lambda, so it may use these, `monthOf` and other helpers.
- `.transfer(to, lambda)` moves the amount from this account to the account named `to`. That account must be declared somewhere in the Program, and it must not be this account.
- How a month runs: every account's flows run in declaration order; an inflow adds, an outflow and a transfer subtract, and a transfer's amount arrives in its target at the month's close. The host runs this; the language describes it.
- The text view prints a ledger the host has computed: one row per month, one column per account's closing balance, the month as `2026-01`.

## What it must refuse

Each of these must fail to build or to check, with a diagnostic that names the mistake:

1. A flow lambda that reads a flow not declared earlier in its account (`f.food` before `food`, or a misspelling).
2. A transfer to an account that does not exist, or to its own account.
3. Two flows with the same name in one account, or two accounts with the same name.
4. `m.date` compared with a number, or used in arithmetic (`m.date + 1`).
5. A lambda that returns something other than a number (`(m) => m.index > 3`).
6. An account with a negative `opening`.
7. `.horizon(() => $.months)`: a lambda where a number goes.
8. `.loan(…)`, with any arguments: this language has no loans. The diagnostic should say so and suggest an `outflow` instead.
9. A lambda that reads a param that is not declared (`$.rnet`).
10. `Math.sin`, or any other name the language does not give a lambda.
11. A lambda that calls a top-level function made by another function (`const bump = makeBump(2)`).
12. `start` missing, or called twice.
