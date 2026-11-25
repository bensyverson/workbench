import { defineUI, listOf } from "kit/define";
import { particles } from "./particles.grammar.js";

export const particlesUI = defineUI(particles, {
  state: {
    t: "number",
    maxParticles: "number",
    bounds: { width: "number", height: "number" },
    emitters: listOf({ name: "string", live: "number" }),
    counters: listOf({ name: "string", value: "number" }),
    particles: listOf({ x: "number", y: "number" }),
  },
  stage: { element: "particles-field", module: "./particles-field.js", emits: ["pick"] },
  annotate: {
    traces: { t: { note: "run time, in seconds" } },
    params: { rate: { badge: (s, $) => ($.rate > 300 ? "hot" : null) } },
  },
  tiles: {
    readouts: {
      title: "Readouts",
      place: { splitRight: "stage", size: 0.3 },
      body: [
        { kind: "stat", label: "time", value: "t", unit: "s" },
        { kind: "stat", label: "live", value: (s) => s.particles.length, badIf: (s) => s.particles.length >= s.maxParticles },
        { kind: "stat", label: "cap", value: "maxParticles" },
        { kind: "check", label: "under cap", expect: (s) => s.particles.length < s.maxParticles },
        { kind: "table", label: "Emitters", rows: "emitters", columns: ["name", "live"] },
        { kind: "table", label: "Counters", rows: "counters", columns: ["name", "value"] },
      ],
    },
    live: {
      title: "Live",
      place: { splitBelow: "readouts" },
      body: [{ kind: "plot", label: "live particles", y: (s) => s.particles.length, window: 10 }],
    },
    runs: {
      title: "Runs",
      place: { tabWith: "stage" },
      body: [
        {
          kind: "runs",
          label: "live after 5 s, by rate",
          param: "rate",
          from: 0,
          to: 400,
          steps: 9,
          seconds: 5,
          y: (s) => s.particles.length,
        },
      ],
    },
  },
});
