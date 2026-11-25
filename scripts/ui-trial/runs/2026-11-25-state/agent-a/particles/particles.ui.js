import { defineUI } from "kit/define";
import { particles } from "./particles.grammar.js";

// The state is particles.dialect.js's: t, maxParticles, bounds, emitters, counters, particles.
export const particlesUI = defineUI(particles, {
  // 7. every particle as a dot in the box; a click reports a pick in state coordinates.
  stage: { element: "particles-dots", module: "./particles-dots.js", emits: ["pick"] },
  tiles: {
    // 9. the readouts beside the stage.
    readouts: {
      title: "Readouts",
      place: { splitRight: "stage", size: 0.3 },
      body: [
        // 1. live particles against the cap, red when full; and the time.
        { kind: "row", items: [
          { kind: "stat", label: "live", value: (s) => s.particles.length, max: "maxParticles",
            badIf: (s) => s.particles.length >= s.maxParticles },
          { kind: "stat", label: "time", value: "t", unit: "s" },
        ] },
        // 4. green while under the cap.
        { kind: "check", label: "under the cap", expect: (s) => s.particles.length < s.maxParticles },
        // 2. one row per emitter.
        { kind: "table", label: "Emitters", rows: "emitters", columns: ["name", "live"], limit: 64 },
        // 3. one row per counter.
        { kind: "table", label: "Counters", rows: "counters", columns: ["name", "value"], limit: 64 },
        // 5. live particles over the last 10 seconds.
        { kind: "plot", label: "live particles", y: (s) => s.particles.length, window: 10 },
      ],
    },
    // 6. + 9. the chart of runs, in a tab with the readouts.
    sweep: {
      title: "Rate sweep",
      place: { tabWith: "readouts" },
      body: [
        { kind: "runs", label: "live after 5 s, by rate", param: "rate", from: 0, to: 400, steps: 9, seconds: 5,
          y: (s) => s.particles.length },
      ],
    },
  },
  // 8. a note on the t trace, a "hot" badge on rate above 300.
  annotate: {
    traces: { t: { note: "run time, in seconds since the start" } },
    params: { rate: { badge: (s, $) => ($.rate > 300 ? "hot" : null) } },
  },
});
