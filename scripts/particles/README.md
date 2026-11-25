# Particles

The particle-system language: the stateful domain for per-slot effects and the H5 run ([the plan](../../project/2026-11-24-particles-effects-plan.md)).

- [docs/dream-code.md](docs/dream-code.md): the Dream Code sheet, the fixed spec. It names no kit API and is written for readers blind to the kit: a Program example, the builder surface, what lambdas and helpers may contain, the particle's fields, what each lambda may write, kill, draw from `rng` and do to a counter (the only shared state), the run order of one tick, the text view, 25 numbered refusals and which number a mistake takes when two fit.
- [docs/settled.md](docs/settled.md): how the sheet was settled, every open item with its ruling and where the sheet says it, and the changes that could flip a hidden program's verdict.
- [reference/](reference/): the reference implementation (`particles.dialect.js`, `particles.grammar.js`, 6 passing examples and 6 refusals), trial 4's agent A hand-in as handed in, now checked by the real kit (per-slot effects built, leaf 8vQJOw). `node scripts/api-pilot/score.js scripts/particles/reference scripts/particles/hidden --lang particles` gave accept 27/27, reject 126/133 before the H5 run's additions, the 7 misses exactly the rejects out of H5's scope (hidden/README.md). With the 15 programs added after the run (leaf JWdGeK), it fails 13 more, each a rule the Definition API cannot say yet (decision MpZZsU); `test/reference.test.js` pins both lists.
- [h5/](h5/README.md): the H5 run: the brief, `run.sh` (one blind `claude -p` agent per directory, outside the repository), `summarize.js` (tokens, tool calls, files touched outside the directory, checker runs) and the record.
- [docs/open/](docs/open/): what the two blind readers (the hidden-program author and an implementer) found the draft left open.

How the sheet was settled (2026-11-24): the hidden-program author and an implementer each read only the draft and listed what it left open; one revision settled every item, either with a sentence in the sheet or as out of the language, and added counters (`.counter(name)`, Ben 2026-11-24). Refusals 1 to 20 kept their numbers; 21 to 25 are new.
