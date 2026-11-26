import { defineUI } from "kit/define";
import { swarm } from "./swarm.grammar.js";

// A text-view stage, the agents by group, and a plot of how many there are.
export const swarmUI = defineUI(swarm, {
  tiles: {
    groups: {
      title: "Groups",
      place: { splitRight: "stage", size: 0.3 },
      body: [
        { kind: "stat", label: "agents", value: (s) => s.agents.length },
        { kind: "stat", label: "time", value: "t", unit: "s" },
        { kind: "table", label: "Groups", rows: "groups", limit: 50, columns: ["name", "count"] },
      ],
    },
  },
});
