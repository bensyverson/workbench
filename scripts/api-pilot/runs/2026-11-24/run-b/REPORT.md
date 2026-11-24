# Report

## Difficulty
2: the two pages and the example gave a near-working definition on the first try, and the check found every gap I had left.

## Refusals
1. L002 (flow lambda reads a member the "flows so far" object lacks; also covers misspellings and later or cross-account flows).
2. Z003 unknown transfer target, Z004 transfer to own account (my codes, in the Program check).
3. Duplicate flow in an account: Z006 (my check). Duplicate account: B002 (from `name("account")`).
4. L003 for both `m.date === 3` and `m.date + 1` (nominal scalar `month`).
5. L003 ("This is bool, but a flow's result needs f64").
6. Z005 (my check on the account's opening).
7. B004 (a function where a number goes), with a fix line naming `.horizon($.months)`.
8. B009 (`rejected` entry), message says there are no loans and fix suggests an outflow. Same with and without arguments.
9. L002 (`$` has no member `rnet`; lists members).
10. L002 (`Math` has no member `sin`; also `Math.PI`).
11. B012.
12. Missing start: B005. Called twice: B006.

Also my own: Z001 start month not 1..12, Z002 horizon not a whole number 1..120 (written, not run against a refused example), Z007 param value outside min..max, Z008 no account.

## Where the documents misled you
- API.md's `data({ value: "number", "min?": "number", "max?": "number" })` example has min/max optional; the sheet says `.param(name, { value, min, max })` without saying they are required. I made them required. Not misleading, but a decision.
- "`ref(ns)` names a declared one (B003, did-you-mean)" and the Dream Code transfer rule ("declared somewhere in the Program") collide: ref resolves, I assume, only earlier declarations, so I did not use it and checked in the Program's `check` instead. I never verified that assumption.
- API.md says `check(record, ctx)` sees "the record", but does not say how a child construct's entry looks (I used `a.name ?? a.account`, `a.calls`; `a.opening` shape guessed too). It worked for the Program check; in the account's own check I handle `record.opening` being either a number or an object.
- "`step` ... `call.args[0]`" is the data arg as the bare string; worked.

## What you guessed
- Month representation: scalar `month` over f64, `monthOf(y, m) = y*12 + m-1` (any spelling, only compared).
- `m` as a declared object `Month`; slot convention `flow` shared by inflow, outflow and transfer; space named `month` (spaces key is free).
- `f` type: `object(label, state.flows)`, with flows added in `step` for inflow/outflow only; transfers never appear.
- `balance` is f64.
- Library empty; `Math` members listed with `rest` for min/max.
- Param min/max required, value checked within min..max by my own Z007 (tested).
- start/horizon use data args; start month 1-12 integer, horizon integer 1-120, checked with codes Z001/Z002.
- Opening passed as `data({ opening: "number" })` in `opens`.
- Flow names as plain `data("string")`, uniqueness by my own check, since `name(ns)` namespaces appeared global to the Program.
- `text(state)` state shape: `{ rows: [{ month, balances }] }`.
- Loan rejection fix text `.outflow("payment", (m) => 100)`.
- At least one account enforced in the Program check as Z008 (tested).

## Gaps
- No way to say "param value lies within min..max" except my own check (Z007).
- `name(ns)` scoped per construct instance would let duplicate flow names use B002 and a ref to later-declared accounts; not available (or not known to me).
- No built-in way to require at least one child (pitfall 2: done in the parent check, Z008).
- Whole-number checks use my own codes.

## Files
Opened: START.md, API.md, dream-code.md, check.sh (cat), and wrote budget.dialect.js, budget.grammar.js, examples/*.js and REPORT.md in run-b. Nothing else under the repository was opened (check.sh itself ran the kit; I did not read it).
