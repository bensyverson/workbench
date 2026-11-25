# Changes to the hidden set for the final sheet

Every file was re-judged against the final dream-code.md, using settled.md's rulings and its list of changes that could flip a verdict.

**Moved:** none. No accept file is refused by the final sheet, and no reject file is accepted.
**Relabeled:** none. Every reject file still takes the refusal number on its first line once "Which number" is applied (for example r01 stays 1 and r07e stays 7).
**Removed:** none.

## Rewritten

| File | What changed | Why |
|---|---|---|
| accept/a01.js | Replaced by the final sheet's example, verbatim (adds `.counter("burnedOut")`, a bump in update, and a read in mist's rate). | Its job is "the sheet's own example"; the example changed. The old text is still accepted, and a02–a18 cover everything it did. |
| accept/a05.js | Comment only: it now quotes the final sheet's wording on forward names and calls after an emitter. | The old comment quoted wording that is no longer in the sheet. The code is unchanged. |

## README-only updates (file contents unchanged)

| File | What changed | Why |
|---|---|---|
| accept/a05.js | RISKY dropped | "Names may refer forward" is now stated. |
| accept/a07.js | RISKY dropped | "Vectors are values" (`let v = p.vel; v.x = 0;`) is now stated. |
| accept/a09.js | RISKY dropped | The fixed-count `for` form is now spelled out. |
| accept/a10.js | RISKY dropped; notes the `$`-bounded loop is build code | Build-time `$.name` gives `value`, and names may come from expressions. R21's loop rule binds only lambdas and helpers. |
| accept/a11.js | RISKY dropped | Same ruling as a10. |
| accept/a13.js | RISKY dropped | Build-time values are checked with each param's `value`. |
| reject/r01.js | RISKY dropped | Block-body rate is allowed. "Which" sends any non-local assignment in a rate to 1. |
| reject/r06c.js | RISKY dropped | Block-body helpers are allowed. R6 names a helper that only update calls. |

The README lines for a04, a18, r02e, r07, r07e, r17, r17i and r19 also gained a short clause naming the final-sheet rule that settles them. Their verdicts did not change.

## Added: reject/

All are the base Program with one mistake. r23–r25d and r22r use the base plus a valid declared counter `burnedOut`, bumped in update. r25e uses the plain base with no counter.

| File | Refusal | Case of that refusal it covers |
|---|---|---|
| r21.js | 21 | syntax outside the list: `while` |
| r21b.js | 21 | syntax: `==` |
| r21c.js | 21 | syntax: a string |
| r21d.js | 21 | syntax: computed access `p["vel"]` |
| r21e.js | 21 | syntax: a nested function |
| r21f.js | 21 | `for` count not fixed: `k < $.wind` |
| r21g.js | 21 | `for` count not fixed: bounded by a `let` local |
| r21h.js | 21 | `for` count not fixed: body assigns `k` |
| r21i.js | 21 | a function stored (`const h = half`) |
| r21j.js | 21 | a function passed (`first(p.size, half)`) |
| r21k.js | 21 | `$` used as anything but `$.name` |
| r21l.js | 21 | a local named `vec2` |
| r21m.js | 21 | a helper named `length` |
| r21n.js | 21 | a parameter named `Math` |
| r21o.js | 21 | more parameters than the slot |
| r21p.js | 21 | a default parameter |
| r21q.js | 21 | a rest parameter |
| r21r.js | 21 | a destructured parameter |
| r21s.js | 21 | syntax: `**` (from settled.md's change 6) |
| r21t.js | 21 | syntax: `var` (change 6) |
| r21u.js | 21 | syntax: an array literal (change 6) |
| r21v.js | 21 | a `let` without an initializer (change 6) |
| r22.js | 22 | option missing |
| r22b.js | 22 | option unknown |
| r22c.js | 22 | option not a number |
| r22d.js | 22 | option not finite (`Infinity`) |
| r22e.js | 22 | option not finite (`NaN`) |
| r22f.js | 22 | malformed name: a space |
| r22g.js | 22 | malformed name: empty |
| r22h.js | 22 | malformed name: leading digit |
| r22i.js | 22 | param `value` outside `min..max` |
| r22j.js | 22 | param with `min > max` |
| r22k.js | 22 | lambda slot given a `function` expression |
| r22l.js | 22 | lambda slot given a variable, not an arrow in place |
| r22m.js | 22 | an extra argument |
| r22n.js | 22 | `.rate` with no emitter before it |
| r22o.js | 22 | `.spawn` with no emitter before it |
| r22p.js | 22 | export calls `particles` twice |
| r22q.js | 22 | export returns something other than its Program |
| r22r.js | 22 | malformed name on a counter |
| r23.js | 23 | counter read in update |
| r23b.js | 23 | counter read in spawn |
| r23c.js | 23 | counter assigned `= 0` |
| r23d.js | 23 | counter assigned `-= 1` |
| r23e.js | 23 | bump used as a value |
| r23f.js | 23 | counter assigned `*= 2` |
| r24.js | 24 | counter bumped (`++`) in rate |
| r24b.js | 24 | counter assigned in rate (24 over 1) |
| r24c.js | 24 | counter bumped (`+=`) in rate |
| r24d.js | 24 | counter read in a force |
| r24e.js | 24 | counter bumped in a force |
| r24f.js | 24 | counter read in a helper |
| r24g.js | 24 | counter bumped in a helper (24 over 8) |
| r25.js | 25 | undeclared counter name (`burntOut`) |
| r25b.js | 25 | `counters` by computed access (25 over 21) |
| r25c.js | 25 | `counters` stored as a value |
| r25d.js | 25 | two counters with one name (25, not 15) |
| r25e.js | 25 | `counters.name` with no counter declared at all |

## Added: accept/

| File | Covers | Why |
|---|---|---|
| a19.js | counters bumped in spawn and update (`++`, `+= <expr>`, `+= p.size`), read in rate, one unused, none elsewhere | new feature |
| a20.js | counter declared last, sharing its name with a param and a field; bumps in a loop and an `else`; read in a block-body rate (RISKY, mild: forward counter reference) | new feature |
| a21.js | block-body rate lambdas | settled.md change 1 |
| a22.js | vector compound assignment and vector negation | changes 2 and 4 |
| a23.js | `&&` `\|\|` `!` `else` `!==` `%` `%=` unary minus `++` `--`, bare `return;` | change 3 |
| a24.js | loops bounded by top-level constants, `<=`, `k += 1`, `break`, `continue` | change 5 |
| a25.js | `forces: []` | change 28 |
| a26.js | range ends, fractional bounds, system calls after emitters, cross-kind names, an emitter named `t` | changes 29–31 (extra; not in the request's list) |
| a27.js | `rng` renamed and called in `if`, loop and argument; a `let` copy of a vector field | change 19 and Inside ▸ Values (extra) |

## 2026-11-25: rules the set missed

Added for rules dream-code.md states that no file covered. Every reject file is the base Program with one mistake; r24h uses the counter base. None is RISKY.

### Added: reject/

| File | Refusal | Case of that refusal it covers |
|---|---|---|
| r12f.js | 12 | a number as an `if` condition |
| r12g.js | 12 | a number as a ternary condition |
| r12h.js | 12 | a number as the operand of `!` |
| r12i.js | 12 | a number as an operand of `&&` |
| r12j.js | 12 | a number as an operand of `\|\|` |
| r12k.js | 12 | a vector times a vector |
| r12l.js | 12 | a number divided by a vector (12 over 10) |
| r12m.js | 12 | a helper whose paths return different types |
| r11e.js | 11 | a block-body rate missing a `return` on one path |
| r11f.js | 11 | an update with an expression body |
| r08b.js | 8 | an uncalled helper writing a particle field |
| r08c.js | 8 | an uncalled helper calling itself |
| r06d.js | 6 | an uncalled helper calling `p.kill()` |
| r24h.js | 24 | an uncalled helper reading a counter |

### Added: accept/

| File | Covers | Why |
|---|---|---|
| a28.js | helpers called with a number in one place and a vector in another, each call well typed | Inside ▸ Helpers: "checked for each set of argument types it is called with" |
