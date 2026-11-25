import { defineUI, listOf } from "kit/define";
import { particles } from "./particles.grammar.js";

export const particlesUI = defineUI(particles, {
  // Matches what the Dialect's text(state) reads (see the comment above it).
  state: {
    t: "number",
    maxParticles: "number",
    bounds: { width: "number", height: "number" },
    particles: listOf({ x: "number", y: "number" }),
    emitters: listOf({ name: "string", live: "number" }),
    counters: listOf({ name: "string", value: "number" }),
  },
  stage: { element: "particles-dots", module: "./particles-dots.js", emits: ["pick"] },
  tiles: {
    readouts: {
      title: "Particles",
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
      place: { tabWith: "readouts" },
      body: [
        // Each run uses the Program's own tick.
        { kind: "runs", label: "live after 5 s, by rate", param: "rate", from: 0, to: 400, steps: 9, seconds: 5, y: (s) => s.particles.length },
      ],
    },
  },
  annotate: {
    traces: { t: { note: "run time in seconds" } },
    params: { rate: { badge: (s, $) => ($.rate > 300 ? "hot" : null) } },
  },
});
