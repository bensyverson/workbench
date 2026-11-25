import { defineUI, listOf } from "kit/define";
import { particles } from "./particles.grammar.js";

export const particlesUI = defineUI(particles, {
  state: {
    t: "number",
    maxParticles: "number",
    bounds: { width: "number", height: "number" },
    particles: listOf({ x: "number", y: "number" }),
    emitters: listOf({ name: "string", live: "number" }),
    counters: listOf({ name: "string", value: "number" }),
  },
  stage: { element: "particles-field", module: "./particles-field.js", emits: ["pick"] },
  tiles: {
    health: {
      title: "Health",
      place: { splitRight: "stage", size: 0.3 },
      body: [
        { kind: "row", items: [
          { kind: "stat", label: "live", value: (s) => s.particles.length, badIf: (s) => s.particles.length >= s.maxParticles },
          { kind: "stat", label: "time", value: "t", unit: "s" },
        ] },
        { kind: "check", label: "under the cap", expect: (s) => s.particles.length < s.maxParticles },
        { kind: "table", label: "Emitters", rows: "emitters", columns: ["name", "live"] },
        { kind: "table", label: "Counters", rows: "counters", columns: ["name", "value"] },
        { kind: "plot", label: "live", y: (s) => s.particles.length, window: 10 },
      ],
    },
    sweep: {
      title: "Rate sweep",
      place: { tabWith: "health" },
      body: [
        { kind: "runs", label: "Live after 5 s, by rate", param: "rate", from: 0, to: 400, steps: 9, ticks: 150, y: (s) => s.particles.length },
      ],
    },
  },
  annotate: {
    traces: { t: { note: "seconds since start" } },
    params: { rate: { badge: (s, $) => ($.rate > 300 ? "hot" : null) } },
  },
});
