# kit/define review probes

Failing tests from the independent review of `kit/define` (commit 61faf0a, 2026-11-24). Run one with `node --test scripts/define-probes/<name>.probe.js`. They are named `*.probe.js` so `npm test` skips them; when a fix lands, move the probe into `kit/define/test/` as a `.test.js`. Every probe but the one below has been fixed and moved (leaves `OTTd8r`, `3t38w5`, `ULagYc`, `1vFLxi`, `uIlROy`, `BGzGkD`, `qCA7Tl`).

| Probe | Leaf |
|---|---|
| `lower-state-names.probe.js` | P5 of `qCA7Tl`: two stateful instances with one name in different constructs collide in `states` and `stateOf`. Parked on a design decision: how a Dialect's `ref.id` and `states` should tell them apart. |
