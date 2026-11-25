import { defineUI } from "kit/define";
import { particles } from "./particles.grammar.js";

export const particlesUI = defineUI(particles, {
  stage: { element: "particles-field", module: "./particles-field.js", emits: ["pick"] },
  tiles: {
    readouts: {
      title: "Readouts",
      place: { splitRight: "stage", size: 0.25 },
      body: [
        { kind: "stat", label: "live", value: (s) => s.particles.length, max: (s) => s.maxParticles, badIf: (s) => s.particles.length >= s.maxParticles },
        { kind: "stat", label: "time", value: (s) => s.t, unit: "s" },
        { kind: "table", label: "Emitters", rows: "emitters", columns: ["name", "live"] },
        { kind: "table", label: "Counters", rows: "counters", columns: ["name", "value"] },
        { kind: "check", label: "under cap", expect: (s) => s.particles.length < s.maxParticles },
        { kind: "plot", label: "live particles", y: (s) => s.particles.length, window: 10 },
      ],
    },
    runs: {
      title: "Runs",
      place: { tabWith: "stage" },
      body: [
        { kind: "runs", label: "live after 5 s, by rate", param: "rate", from: 0, to: 400, steps: 9, seconds: 5, y: (s) => s.particles.length },
      ],
    },
  },
  annotate: {
    traces: { t: { note: "run time, in seconds" } },
    params: { rate: { badge: (s, $) => ($.rate > 300 ? "hot" : null) } },
  },
});
