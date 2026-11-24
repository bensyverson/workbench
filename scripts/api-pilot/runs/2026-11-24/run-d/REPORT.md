# Budget planner: pilot report (run-d)

## Difficulty

3. The Dialect and Grammar went down quickly from API.md's examples, but the flow-name rule and the record shape of a `record: "calls"` construct each cost a probe run before they worked.

## Refusals

1. **L002**: `f.food` before `food` reports "the flows of a before this one has no member 'food'".
2. **B003**: `.transfer("nowhere", …)` reports "there is no acct 'nowhere'", with a did-you-mean.
3. **Two flows with one name in an account: K005** (my code, from a slot check). **Two accounts with one name: B002.**
4. **`m.date` against a number: L003** ("'===' compares month only with month"). **`m.date + 1`: L003** ("'+' does not take month").
5. **L003**: "This is bool, but a flow's result needs f64."
6. **K004**: "opening -5 is negative" (a construct check on `account`).
7. **B004**: ".horizon: argument 1: expected a number, got a function".
8. **B009**: `.loan(…)` is a rejected name on `program`, and the account inherits it. The message is "this language has no loans", and the fix suggests an `outflow`.
9. **L002**: "the params ($) has no member 'rnet'", with did-you-mean 'rent'.
10. **L002**: "Math has no member 'sin'", with did-you-mean.
11. **B012**: a top-level `const bump = makeBump(2)` is refused.
12. **B005** for a missing `start`, and **B006** for a second `start`.

Extra refusals I added and probed (not in the 12): self-transfer **K006**; param value outside min..max **K001**; horizon not a whole number from 1 to 120 **K002**; start month outside 1..12 or a non-whole year **K003**. A Program with no accounts (**K007**) is **not refused** under check.sh; see Gaps.

Every refusal Program was written, checked and deleted. `examples/` holds `00.js` (the dream-code Program, verbatim) and `01.js` (a block body that loops over names).

## Where the documents misled you

- API.md, on the record: "Any other decl slot becomes a list of its calls' arguments … and a `record: "calls"` construct keeps `calls: [{ slot, args }]` in order." I read this as also keeping the per-slot lists (`inflow`, `outflow`) on the child record. They are not there. Only `calls` is. My first flow-name check read the missing lists, so it never fired (r03a passed) until I probed it and switched to `calls`.
- API.md, on arguments: "Any spec takes `{ as: "key" }` last to name its record key." This does not say whether `data(shape, { as })` or `data({ … }, { as })` is the form, nor whether the `as` is the second argument. I guessed `data({ opening: "number" }, { as: "terms" })`.
- dream-code.md: "a block body that builds the chain with ordinary JavaScript (a loop or an `if` that adds accounts or flows)". The API says "Build-time code (outside lambdas) may branch and loop on params". Neither says a lambda cannot use the loop variable. My first `01.js` read `SHARES[i]` in a lambda and was refused with B013.
- API.md, on the record of an optional `once` slot: nothing says whether it appears when it is not given. I expected the default (12) to be absent and handled that in the host.
- API.md, on `fix` text: "`fix` the text to write instead". The kit writes "fix: write " in front of it, so `fix: "use an opening of 0 or more"` printed "write use an opening…". I changed the text to a noun phrase.

## What you guessed

Dialect (budget.dialect.js):
- `month` is `scalar("f64")`, with the value `year * 12 + (month - 1)`. `monthOf` is an intrinsic with the matching `ref` and a JS prelude. Dream-code says months compare only with months, so `monthOf` returns `month`, not a number.
- `Month` is a declared object (`index`, `year`, `month`, `date`). A `Params` object is filled by `environment`.
- Math: `min` and `max` are `params: ["f64", "f64"], rest: "f64"`. `round` and `abs` take one `f64`. No other member.
- Slot conventions `flow` and `transfer` take `("Month", object("the flows of <name> before this one", state.flows), …)`. `flow` adds `"f64"` for the balance. Both are `space: "month"`.
- The `text(state)` input is `{ accounts, months: [{ date, balances }] }`. Dream-code does not say what the host passes, so I invented that shape.

Grammar (budget.grammar.js):
- The account construct is `account`, with the namespace `acct` (so the record key is `acct`, not `account`, which avoids a clash with the child list).
- Flow names are `data("string")`, with a hand-written duplicate check over `calls`. Dream-code says flow names are unique within an account, and `name()` spans the whole Program (API pitfall 1), so this is the only option I found.
- `transfer` takes `ref("acct")`. `.transfer` to its own account is K006.
- Optional `horizon` has no default in the record. The host has to default it to 12.
- Lambdas may take fewer parameters than the convention (`(m) => 4000` on a flow with three). The kit accepted this.
- The opening `{ opening }` is a `data` object with `as: "terms"`.
- Negative flow amounts are not refused. Dream-code does not say to refuse them.
- The Program check (no accounts, K007) is written, but see Gaps.

## Gaps

- **Program-level check did not fire.** A Program with no accounts (`budget("t").start(2026, 1)`) passes check.sh with no violation, though the root's `check(record, ctx)` tests `record.account`. The API says the check runs "at `.check()`/`.build()`", and check.sh evidently does not run it on the root. I could not find out why without reading the kit. Needed: the root check to run on every Program, or a rule that a child must have at least one instance.
- **Per-instance names.** A name must be unique only within one account, but `name()` is unique across the Program. I needed a `data("string")` with a hand-written duplicate check. A `name(ns, { scope: "instance" })` or similar would remove this.
- **Lambdas and build-time loops.** A lambda cannot read a loop variable (B013), so a loop can only add flows whose lambdas are identical. There is no way to say "one flow per loop item" with a different lambda per item, short of writing each one out. (This is probably the intended design; the documents do not say so.)
- **Optional `once` defaults.** There is no way to state that `horizon` defaults to 12, so every host has to repeat the default.
- **The text view.** `text(state)` needs the host's computed ledger, but the API does not say how the host computes state from Lambdas, nor what a Dialect can compute itself. I wrote a formatter over a shape I invented.
- **Argument shapes.** Nothing shows how to type an object argument with a key that is the Grammar's own key (`.account(name, { opening })`) without an `as` wrapper.

## Files

Opened and read (the whole of each): `START.md`, `API.md`, `dream-code.md`, all in `/Users/ben/git/workbench/local/api-pilot/run-d`.

Ran but did not read: `/Users/ben/git/workbench/local/api-pilot/run-d/check.sh`, many times.

Listed the directory `/Users/ben/git/workbench/local/api-pilot/run-d` (with `ls`). Wrote a backup at `/tmp/bg.bak`, outside the repository, and removed nothing from it. Opened nothing else under `/Users/ben/git/workbench`. The session context included repository and user instruction files, which I did not open.

Files I wrote in `/Users/ben/git/workbench/local/api-pilot/run-d`: `budget.dialect.js`, `budget.grammar.js`, `examples/00.js`, `examples/01.js`, `REPORT.md`.
