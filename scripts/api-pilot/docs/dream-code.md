# Budget planner: Dream Code

A small language for planning a household budget month by month. You define it; this page says what its Programs look like and which ones it must refuse. Nothing here is implemented.

## A Program

```js
import { budget } from "../budget.grammar.js";

// A top-level helper: lambdas may call it.
const yearly = (m, amount) => (m.index % 12 === 0 ? amount : 0);

export default ($) => budget("household")
  .param("rent", { value: 1500, min: 0, max: 5000 })        // read inside lambdas: changes without a rebuild
  .param("months", { value: 12, min: 1, max: 60 })          // read at build time below
  .param("saveRate", { value: 0.1, min: 0, max: 0.5 })
  .start(2026, 1)                                           // year, month (1-12)
  .horizon($.months)                                        // how many months to plan
  .account("checking", { opening: 1200 })
    .inflow("salary", (m) => 4000)
    .outflow("rent", (m) => $.rent)
    .outflow("food", (m) => (m.index % 12 === 11 ? 900 : 600))
    .outflow("insurance", (m) => yearly(m, 800))
    .outflow("trip", (m) => (m.date === monthOf(2026, 7) ? 2000 : 0))
    .transfer("savings", (m, f) => (f.salary - f.rent) * $.saveRate)
  .account("savings", { opening: 0 })
    .inflow("interest", (m, f, balance) => balance * 0.003);
```

## What each part means

- `budget(name)` opens a Program. Its calls: `param` (any number), `start(year, month)` (once, required), `horizon(n)` (once; n whole months, 1 to 120) and one or more `account`s. A param is declared before it is read.
- `.param(name, { value, min, max })` declares a number param. Lambdas read it as `$.name`. Build-time code may read it too, as in `.horizon($.months)`.
- `.account(name, { opening })` opens an account. `opening` is a number, at least 0. Account names are unique in a Program.
- Inside an account, in any order: `.inflow(name, lambda)`, `.outflow(name, lambda)` and `.transfer(toAccount, lambda)`. Each lambda gives an amount (a number) for one month. Flow names are unique within an account.
- A flow's lambda takes up to three parameters:
  - `m`, the month: `m.index` (0 for the first planned month), `m.year`, `m.month` (1 to 12), and `m.date`.
  - `f`, the amounts of the flows **declared earlier in the same account**, by name (`f.salary`). A transfer's `f` is the same. So `f` grows as the account is built. Reading a flow declared later, or one in another account, is an error.
  - `balance`, the account's balance at the start of the month.
- `m.date` is a **month** value. Months compare only with months (`===`, `<`, `<=` …), never with numbers, and take no arithmetic. `monthOf(year, month)` makes one inside a lambda.
- Lambdas may use `Math.min`, `Math.max`, `Math.round` and `Math.abs`, and nothing else from `Math`.
- `.transfer(to, lambda)` moves the amount from this account to the account named `to`. That account must be declared somewhere in the Program, and it must not be this account.
- The text view is the ledger: one row per month, one column per account's closing balance, the month as `2026-01`.

## What it must refuse

Each of these must fail to build or to check, with a diagnostic that names the mistake:

1. A flow lambda that reads a flow not declared earlier in its account (`f.food` before `food`, or a misspelling).
2. A transfer to an account that does not exist, or to its own account.
3. Two flows with the same name in one account, or two accounts with the same name.
4. `m.date` compared with a number, or used in arithmetic (`m.date + 1`).
5. A lambda that returns something other than a number (`(m) => m.index > 3`).
6. An account with a negative `opening`.
7. `.horizon(() => $.months)`: a lambda where a number goes.
8. `.loan(…)`: this language has no loans. The diagnostic should say so and suggest an `outflow` instead.
9. A lambda that reads a param that is not declared (`$.rnet`).
10. `Math.sin`, or any other name the language does not give a lambda.
11. A lambda that calls a top-level function made by another function (`const bump = makeBump(2)`).
12. `start` missing, or called twice.
