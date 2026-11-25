import { defineUI, listOf } from "kit/define";
import { particles } from "./particles.grammar.js";

// The state matches the comment above text(state) in particles.dialect.js.
export const particlesUI = defineUI(particles, {
  state: {
    t: "number",
    maxParticles: "number",
    bounds: { width: "number", height: "number" },
    emitters: listOf({ name: "string", live: "number" }),
    counters: listOf({ name: "string", value: "number" }),
    particles: listOf({ x: "number", y: "number" }),
  },
  // 7. every particle as a dot; a click reports a pick.
  stage: { element: "particles-field", module: "./particles-field.js", emits: ["pick"] },
  tiles: {
    // 9. the readouts beside the stage.
    health: {
      title: "Health",
      place: { splitRight: "stage", size: 0.35 },
      body: [
        // 1. live against the cap, red when full; and the time.
        { kind: "row", items: [
          { kind: "stat", label: "live", value: (s) => s.particles.length, badIf: (s) => s.particles.length >= s.maxParticles },
          { kind: "stat", label: "cap", value: "maxParticles" },
          { kind: "stat", label: "time", value: "t", unit: "s" },
        ] },
        // 4. green while under the cap.
        { kind: "check", label: "under the cap", expect: (s) => s.particles.length < s.maxParticles },
        // 2. one row per emitter.
        { kind: "table", label: "Emitters", rows: "emitters", columns: ["name", "live"] },
        // 3. one row per counter.
        { kind: "table", label: "Counters", rows: "counters", columns: ["name", "value"] },
        // 5. live over the last 10 s.
        { kind: "plot", label: "live", y: (s) => s.particles.length, window: 10 },
      ],
    },
    // 6 and 9. the chart of runs, in a tab with the readouts.
    // 5 s of run time at the task's 1/30 s tick is 150 ticks; runs counts ticks, not seconds.
    sweep: {
      title: "Rate sweep",
      place: { tabWith: "health" },
      body: [
        { kind: "runs", label: "live after 5 s, by rate", param: "rate", from: 0, to: 400, steps: 9, ticks: 150, y: (s) => s.particles.length },
      ],
    },
  },
  // 8. a note on the t trace; a "hot" badge on rate above 300.
  annotate: {
    traces: { t: { note: "seconds of run time since the start" } },
    params: { rate: { badge: (s, $) => ($.rate > 300 ? "hot" : null) } },
  },
});
