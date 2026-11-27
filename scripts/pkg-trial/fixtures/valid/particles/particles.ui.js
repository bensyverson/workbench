import { defineUI } from "kit/define";
import { particles } from "./particles.grammar.js";

// The passing fixture for the particles package: the draft's worked example plus one of each other piece.
export const particlesUI = defineUI(particles, {
  stage: { element: "particles-field", module: "./particles-field.js" }, // emits retired 2026-11-27: an element dispatches wb-control
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
        { kind: "table", label: "Emitters", rows: "emitters", limit: 20, columns: ["name", "live", { label: "share", value: (row, s) => row.live / Math.max(1, s.particles.length) }] },
        { kind: "plot", label: "live", y: (s) => s.particles.length, window: 10 },
      ],
    },
    sweep: {
      title: "Rate sweep",
      place: { tabWith: "health" },
      body: [
        { kind: "text", value: "Live particles after five seconds, by **rate**." },
        { kind: "runs", label: "live by rate", param: "rate", from: 0, to: 400, steps: 9, seconds: 5, y: (s) => s.particles.length },
      ],
    },
  },
  annotate: {
    traces: { t: { note: "seconds since start" } },
    params: { rate: { badge: (s, $) => ($.rate > 300 ? "hot" : null) }, "*": { tone: "dim" } },
  },
});
