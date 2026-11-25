import { defineUI, listOf } from "kit/define";
import { particles } from "./particles.grammar.js";

export const particlesUI = defineUI(particles, {
  // Matches the comment above text(state) in particles.dialect.js.
  state: {
    t: "number",
    maxParticles: "number",
    bounds: { width: "number", height: "number" },
    emitters: listOf({ name: "string", live: "number" }),
    counters: listOf({ name: "string", value: "number" }),
    particles: listOf({ x: "number", y: "number" }),
  },
  stage: { element: "particles-field", module: "./particles-field.js", emits: ["pick"] },
  tiles: {
    health: {
      title: "Health",
      place: { splitRight: "stage", size: 0.3 },
      body: [
        { kind: "row", items: [
          { kind: "stat", label: "live", value: (s) => s.particles.length, badIf: (s) => s.particles.length >= s.maxParticles },
          { kind: "stat", label: "cap", value: "maxParticles" },
          { kind: "stat", label: "time", value: "t", unit: "s" },
        ] },
        { kind: "check", label: "under the cap", expect: (s) => s.particles.length < s.maxParticles },
        { kind: "table", label: "Emitters", rows: "emitters", columns: ["name", "live"] },
        { kind: "table", label: "Counters", rows: "counters", columns: ["name", "value"] },
        { kind: "plot", label: "live particles", y: (s) => s.particles.length, window: 10 },
      ],
    },
    sweep: {
      title: "Rate sweep",
      place: { tabWith: "health" },
      body: [
        // 150 ticks is 5 s at a tick of 1/30 s.
        { kind: "runs", label: "live particles after 5 s, by rate", param: "rate", from: 0, to: 400, steps: 9, ticks: 150, y: (s) => s.particles.length },
      ],
    },
  },
  annotate: {
    traces: { t: { note: "seconds of run time since the start" } },
    params: { rate: { badge: (s, $) => ($.rate > 300 ? "hot" : null) } },
  },
});
