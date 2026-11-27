# Report: score and timer (`roundkeeper/`)

## Difficulty

**1.** The package and all its tests passed the first check run, and API.md plus the package README's Tests section were enough.

## What I built

`roundkeeper` is a language for one timed round and its score.

```js
roundkeeper("sprint")
  .seconds(10)    // required: round length, whole, 1 to 3600
  .worth(10)      // points per event, default 1
  .goal(30)       // optional target score
  .label("Gems"); // optional, at most 8 characters, default "Score"
```

- **Input:** `scored`, `Event<{}>`, reliable, at most 256 records per step. Each record is one scoring event. A producer's fields are dropped by the wire, so any Event output should be able to feed it (I did not try a wire).
- **Value outputs:** `score` (`f64`), `left` (`f64@s`), `over` (`bool`) and `met` (`bool`, the goal is reached).
- **Picture:** `view`, `Draw<8>@hud`, 184 by 32: a translucent panel, label and score (with `/goal`), time left or `TIME UP`, and a time bar. It is meant to be layered over another picture at scale 1.
- **Round:** it starts at the part's first step. An event counts if its `$T` is less than the length after the start. Once `over` is true nothing changes.
- **Examples:** `sprint.js` (10 s, with goal) and `minute.js` (45 s, all defaults). `refusals/long-label.js` is refused with Q001.

**How to use it:** a composer wires some Event output to `scored` and shows `view` over their own picture. Played alone, it only counts down: it has no button to score by hand (see Docs I could not reach).

I did not look at the picture on a page. `./check.sh` verifies only that it is not empty and that it changes.

## Where the docs misled me

- `docs/kit/API.md`, `defineUI` ▸ Controls, says each kind's keys and record are in `define/README.md#defineui` and the controls draft. The README lists only the kind names. The table is in the draft, which is not in `docs/`.

Nothing else I relied on turned out wrong.

## What I guessed

- That `Event<{}>`, a record with no fields, is a legal input seam. The docs mention `{}` as a test value when every field has a default, but never an empty record seam. It was accepted.
- That `slots: {}`, no `objects` or `globals`, and a root with only data slots are fine for a language with no Program lambdas. They are.
- That a runtime should take its start time from its first step, not assume 0, since `init` has no `T` (the package README says this about tests).
- That `$T` is a plain number I can subtract from `T`, and that a small epsilon is enough at the end boundary.
- An event stamped before the end but delivered in the step that ends the round counts. One delivered after `over` is already true (a delayed wire could do that) does not, so a reported final score never changes.
- 256 as the input's per-step max. I had no way to know what a stranger's producer needs.
- I build the displayed strings in the runtime and keep them in the state, so I did not find out whether a Draw builder can join a number into a string.
- `Q` as my diagnostic letter.

## APIs I fought

None. I rewrote nothing because of the kit.

## Gaps

- **A test cannot expect anything of a Draw output.** I wanted to show that the picture says `TIME UP` and that the bar is empty. Smallest change: an expectation such as `{ "at": t, "draw": "view", "contains": { "op": "text", "str": "TIME UP" } }`, matching only the fields given. The package README already lists this as not built.
- **Controls cannot be written from these docs** (above). I left them out rather than guess. Smallest change: put the kind table in `define/README.md`.

## Tests

Three tests, all passing:

| Test | What it shows |
|---|---|
| `scored-adds-worth` | one record, then two at the same stamp; `score`, `met`, `over`, `left` and the shown strings |
| `round-over-holds-score` | records at 9.9, 9.999, 10 and 11 s of a 10 s round: the first two count, the others do not, and the score holds to 15 s |
| `defaults-count-one` | default worth, label and no goal |

- **How hard:** easy. The `output` expectation, `within`, and the stated first instant (T = 0) were what I needed. I saw no failing test, and I did not break the runtime on purpose to confirm that these tests catch it.
- **Where the draft left me guessing:** only whether `{}` is right for an input that has no fields at all, as opposed to all-defaulted ones. It is.
- **What it cannot say:**
  - anything about the Draw output (above), so I checked the state strings and `fraction` behind it;
  - that a record with extra fields is accepted, since a test record must fit the input's own seam. This is the wire's job, but I could not show it for my package;
  - a Program of the test's own. A shorter round or another case needs another entry in `examples`.

## Docs I could not reach

- `docs/project/2026-11-27-controls-draft.md` ("The kinds"), linked from API.md and `define/README.md`. It was needed for a Control that lets a person score by hand.

The folder also holds `transcript.jsonl` and `stderr.txt`, which I did not open.

## Checker runs

2 runs of `./check.sh roundkeeper`, both clean: no diagnostic codes, `tests: 3 of 3 passed`. Between them I added the 9.999 s record and the refusal, lowered the goal's maximum and removed an unused `Math` object.
