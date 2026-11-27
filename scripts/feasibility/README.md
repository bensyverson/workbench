# Feasibility probes

Throwaway probes behind [the sketch feasibility findings](../../project/2026-11-27-sketch-feasibility-findings.md) (2026-11-27, container `tXS4wB`). Each script prints its figures; run it with `node scripts/feasibility/<file>` from the repo root. The figures depend on the machine and its load, so a rerun differs from the recorded ones by a few tens of percent. They import the kit by relative path, and they are excluded from `npm run typecheck` (tsconfig.json).

| Script | What it measures | Recorded (2026-11-27, Ben's Mac, Node 26) |
|---|---|---|
| `B7flF7-hash-probe.mjs` | kit/run's `stateHash` over an image accumulation buffer held as state, at 128², 256² and 512² × 3 | 512²: 122 ms (agent), 119.5 ms (integrator rerun) |
| `B7flF7-state-probe.mjs` | `checkState` on a `Float32Array` (refused), and the cost of one fresh copy and a freeze of a 512² × 3 buffer | refused; copy 12–14 ms; freeze 4–9 ms |
| `K4CaKm-growth.bench.js` | 5 s of audio on kit/run's contract: per-sample instants versus 128-frame blocks of a 16-voice, 6-operator FM state; heap growth and hashes kept | per-sample: +84–85 MB, 240,001 hashes; per-block: 1,876 hashes |
| `K4CaKm-rate.bench.js` | the same, as the share of real time a headless run takes | per-block well under real time |
| `kuwxBq-probe.js` | what the Runtime Subset admits for a lexer written as a Runtime Lambda (string index, `length`, list stores, growing lists, a DFA over a code list) | only the DFA over a fixed list lowers |
| `kuwxBq-time-lower.js` | the time to lower fields' domain-warp Program, which calls three Library entries | 5–6.3 ms per lowering |
