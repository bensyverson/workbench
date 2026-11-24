# Budget planner pilot: report (run C)

## Difficulty

3. The API covered most of the sheet, but four rules needed my own checks and two behaviors (flow-name scope, top-level calls) were not what the documents suggested.

## Refusals

Codes are from the final `check.sh` run. Each refusal was confirmed, then its Program deleted.

1. A flow lambda reading an undeclared flow: `f.food` before `food` gives **L002** ("the flows declared before a has no member 'food'"). A misspelling (`f.foood`) gives **L002** too.
2. Transfer to a missing account: **B003** ("there is no account 'nowhere'"). Transfer to its own account: **G005** (my code, raised in the account's `step`).
3. Duplicate flow in one account: **G006** (my code; see Guesses). Duplicate account names: **B002**, printed twice (once as "already declared as a account", once as a `stateOf` note).
4. `m.date === 5`: **L003** ("'===' compares month only with month"). `m.date + 1`: **L003** ("'+' does not take month").
5. `(m) => m.index > 3`: **L003** ("This is bool, but a flow's result needs f64").
6. Negative opening: **G004** (my code, the account's `check`).
7. `.horizon(() => $.months)`: **B004** ("expected a number, got a function").
8. `.loan("car", 9000)`: **B009** ("account does not offer .loan(): this language has no loans"), with the outflow fix.
9. `$.rnet`: **L002** ("the params ($) has no member 'rnet'", with a did-you-mean for `rent`).
10. `Math.sin`: **L002** ("Math has no member 'sin'", with a did-you-mean).
11. `const bump = makeBump(2)` used in a lambda: **B012**.
12. No `start`: **B005**. Two `start` calls: **B006**.

Extra refusals I added, beyond the 12:
- Horizon outside 1 to 120 or not whole: **G002**. Start month outside 1 to 12 or non-whole year: **G003**. Param value outside `min..max`: **G001**.
- A budget with no account: **G007** (my code, a program-level `check`).
- Duplicate param name: **B002**.

## Where the documents misled you

- Dream Code, on accounts: "`.account(name, { opening })`". API.md: "`data(shape)` is a value of a shape (B004)". I first wrote `data("number")` for the opening, which is wrong: the Program passes an object, and the error (B004 "expected a number, got an object") pointed the wrong way. The shape must be an object, `data({ opening: "number" }, { as: "open" })`.
- API.md: "`name(ns)` declares a name in namespace `ns` (an identifier, unique: B004, B002)." It does not say whether uniqueness is per Program or per parent construct. In practice it is per Program. That contradicts Dream Code's "Inflow and outflow names are unique within an account", so a flow `food` in two accounts is refused.
- API.md, "The free-name rule": "the file's top-level `const` arrows and plain data". I wrote `const START = monthOf(2026, 1);` at top level, meaning it as plain data. It fails at load with `ReferenceError: monthOf is not defined`. The documents do not say that intrinsics exist only inside lambdas, so a top-level call looks allowed.
- API.md, "Slot options": "`check(call, ctx)`". The slot options do not say whether a `state` construct needs `record: "calls"`. Without it I got **D015** ("construct 'account' has a state but no record: \"calls\""). The API example has both, but the prose does not state the requirement.
- Dream Code, on `horizon`: "(once, optional; n whole months, 1 to 120, default 12)". The API has no default for an optional slot, so nothing here implements the default. See Gaps.
- Dream Code: "one or more `account`s". The API's pitfall 2 says a child cannot be `required`, and suggests checking in the parent's `check(record, ctx)`. That is what I did, but it assumes the child list is `record.account`. The API does not say how children appear in the record. I inferred it and it worked.
- START.md, Words: "**Construct**: a thing a Program declares, with its own builder methods." Pitfall 1 says a child has every method of its parent. I relied on that for `.loan` (declared once on the program) and it works on accounts, but the words do not say a rejected name is inherited.

## What you guessed

- **Flow names:** I used `data("string")` for inflow and outflow names, not `name("flow")`, because the kit's name uniqueness is program-wide. Uniqueness within one account is my own check, in the account's `step` (G006), using `state.flows`.
- **Self-transfer:** refused in `step` (G005), at lowering, not at `.build()`. The sheet says "fail to build or to check", and it does fail, but through the lowering step.
- **Account state:** `init(opened)` returns `{ name: opened.name, flows: {} }`. I guessed that `opened.name` holds the `name()` argument, and it did.
- **Opening record key:** `data({ opening: "number" }, { as: "open" })`, read in the account's `check` as `record.open.opening`.
- **Flow convention:** `(m, f, balance)`, with `m` the object `Month` (index, year, month, date), `f` an object of the flows declared before, and `balance` an f64. Transfers use the same convention, so a transfer's lambda may read `balance`. The sheet only shows `(m, f)` for transfers, so this is a guess. Fewer parameters than the convention declares (`(m) => …`) were accepted.
- **Months:** a `month` scalar whose value is `year * 12 + (month - 1)`. `monthOf` is an intrinsic with this meaning and a JS prelude. Only the JS target is declared.
- **Math:** `min` and `max` take two numbers plus rest; `round` and `abs` take one.
- **`text(state)`:** I decided `state` is the host's computed ledger, `{ accounts: string[], rows: { year, month, balances: number[] }[] }`. The text is printed as one row per month. I did not test it, since the pilot runs no host.
- **Param and `$` object:** `environment` fills `Params` with an f64 member per declared param, as in the API example.
- **Error codes:** G001 to G007 are my own. I chose the letter G.

## Gaps

- **Defaults for optional slots.** The sheet's `horizon` defaults to 12 when omitted. The API has no default value for a slot, so the language reports no horizon and leaves the default to the host. Smallest change: a `default` option on a `decl` slot, returned in the record.
- **Name scope.** I could not say "unique within this parent" with `name()`. Smallest change: a scope option on `name(ns, { within: "account" })` so flow names are unique per account while still usable from lambdas.
- **Child records.** A child list under the parent's name (`record.account`) was only inferred. A documented shape for child records would have saved guessing.
- **Top-level intrinsic calls.** There is no way to write a top-level constant that calls an intrinsic. The sheet forbids made helpers (refusal 11) and allows only arrows and plain data, so `START` must be inlined. This is fine for the sheet but should be stated.
- **Opening arguments.** `.account(name, { opening })` needs an object shape plus an `as` key. A plain `number` shape would have been clearer for a single value, and the documents do not explain why the Program's object form is needed.

## Files

Files I opened, each one: `START.md`, `API.md`, `dream-code.md` (all under `/Users/ben/git/workbench/local/api-pilot/run-c`).

I opened nothing else under the repository. I ran `check.sh` (its output only), and I listed the pilot folder with `ls`. I did not read `check.sh`, any kit file, or any other file in `/Users/ben/git/workbench`.

Files I wrote, all in `/Users/ben/git/workbench/local/api-pilot/run-c`:
- `budget.dialect.js`
- `budget.grammar.js` (exports `budget`)
- `examples/00.js` (the Dream Code Program, verbatim), `examples/01.js` to `examples/05.js` (clean Programs: 01 same name in two accounts; 02 block body with a loop and a `<` month comparison; 03 `Math` and `monthOf` helpers with a transfer; 04 a flow reading `m.index`; 05 a flow reading an earlier flow)
- `REPORT.md`

The refusal Programs were written, confirmed refused, and deleted. `check.sh` created `log.jsonl`. The final `check.sh` run reports no violations over six examples.
