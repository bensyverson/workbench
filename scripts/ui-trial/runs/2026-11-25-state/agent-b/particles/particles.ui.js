import { defineUI } from "kit/define";
import { particles } from "./particles.grammar.js";

export const particlesUI = defineUI(particles, {
  stage: { element: "particles-stage", module: "./particles-stage.js", emits: ["pick"] },
  tiles: {
    readouts: {
      title: "Readouts",
      place: { splitRight: "stage", size: 0.3 },
      body: [
        { kind: "row", items: [
          {
            kind: "stat",
            label: "live particles",
            value: (s) => s.particles.length,
            max: "maxParticles",
            badIf: (s) => s.particles.length >= s.maxParticles,
          },
          { kind: "stat", label: "time", value: "t", unit: "s" },
        ] },
        { kind: "check", label: "under the cap", expect: (s) => s.particles.length < s.maxParticles },
        { kind: "table", label: "Emitters", rows: "emitters", columns: ["name", "live"], limit: 64 },
        { kind: "table", label: "Counters", rows: "counters", columns: ["name", "value"], limit: 64 },
        { kind: "plot", label: "live particles", y: (s) => s.particles.length, window: 10 },
      ],
    },
    sweep: {
      title: "Rate sweep",
      place: { tabWith: "readouts" },
      body: [
        {
          kind: "runs",
          label: "live particles after 5 s, by rate",
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
  annotate: {
    traces: { t: { note: "run time in seconds" } },
    params: { rate: { badge: (s, $) => ($.rate > 300 ? "hot" : null) } },
  },
});
