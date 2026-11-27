import { defineRuntime } from "kit/define";
import { gemgrid } from "./gemgrid.grammar.js";

const DIRECTIONS = ["up", "down", "left", "right"];
const DELTA = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const DEFAULT_PACE = 0.15;
// The most pad records one 1/60 s step takes: 2 per display frame of 1/240 s (the page's bound).
const RECORDS = 8;

function cells(map, mark) {
  const found = [];
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) if (map[y][x] === mark) found.push([x + 0.5, y + 0.5]);
  }
  return found;
}

export const gemgridRuntime = defineRuntime(gemgrid, {
  clock: () => ({ tick: 1 / 60 }),
  init: (record) => {
    const gems = cells(record.map, "*");
    return {
      width: record.map[0].length,
      height: record.map.length,
      walls: cells(record.map, "#"),
      gems,
      player: cells(record.map, "P")[0],
      picked: 0,
      total: gems.length,
      moves: 0,
      held: { up: false, down: false, left: false, right: false },
      heading: "none",
      waited: 0,
    };
  },
  step(state, { dt, record, inputs, events }) {
    const pace = record.pace ?? DEFAULT_PACE;
    let { player, gems, picked, moves, held, heading, waited } = state;

    const walk = (direction) => {
      const [dx, dy] = DELTA[direction];
      const next = [player[0] + dx, player[1] + dy];
      const row = record.map[Math.floor(next[1])];
      const cell = row === undefined ? undefined : row[Math.floor(next[0])];
      if (cell === undefined || cell === "#") return;
      player = next;
      moves++;
      const left = gems.filter((g) => g[0] !== next[0] || g[1] !== next[1]);
      if (left.length < gems.length) {
        gems = left;
        picked++;
        events.picked.push({ at: [next[0], next[1]] });
      }
    };

    let fresh = false;
    for (const pad of inputs.move) {
      const pressed = DIRECTIONS.find((d) => pad[d] && !held[d]);
      held = { up: pad.up, down: pad.down, left: pad.left, right: pad.right };
      if (pressed !== undefined) {
        heading = pressed;
        waited = 0;
        fresh = true;
        walk(pressed);
      } else if (heading === "none" || !held[heading]) {
        heading = DIRECTIONS.find((d) => held[d]) ?? "none";
        waited = 0;
        fresh = true;
      }
    }
    if (!fresh && heading !== "none") {
      waited += dt;
      if (waited >= pace - 1e-9) {
        waited = Math.max(0, waited - pace);
        walk(heading);
      }
    }
    return { ...state, player, gems, picked, moves, held, heading, waited };
  },
  events: { in: { move: RECORDS }, out: { picked: RECORDS + 1 } },
});
