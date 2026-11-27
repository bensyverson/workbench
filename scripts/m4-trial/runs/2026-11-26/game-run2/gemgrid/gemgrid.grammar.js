import { defineGrammar, name, data } from "kit/define";
import { gemgridDialect } from "./gemgrid.dialect.js";

const MAX_SIDE = 24;

function checkMap(call, ctx) {
  const rows = call.args[0];
  const width = rows.length ? rows[0].length : 0;
  if (rows.length < 1 || rows.length > MAX_SIDE || width < 1 || width > MAX_SIDE) {
    ctx.error("G001", `a map is 1 to ${MAX_SIDE} rows of 1 to ${MAX_SIDE} cells`, { arg: 0, tip: "resize the map" });
    return;
  }
  let players = 0;
  let gems = 0;
  for (let y = 0; y < rows.length; y++) {
    if (rows[y].length !== width) {
      ctx.error("G002", `row ${y + 1} has ${rows[y].length} cells; row 1 has ${width}`, { arg: 0, tip: "make every row the same length" });
    }
    for (const c of rows[y]) {
      if (!"#.*P".includes(c)) {
        ctx.error("G003", `row ${y + 1} has the character '${c}'`, { arg: 0, tip: "use # (wall), . (floor), * (gem) or P (player start)" });
      }
      if (c === "P") players++;
      if (c === "*") gems++;
    }
  }
  if (players !== 1) ctx.error("G004", `a map has exactly one P; this one has ${players}`, { arg: 0, tip: "mark the start with one P" });
  if (gems === 0) ctx.error("G005", "a map has at least one gem", { arg: 0, tip: "put a * on a floor cell" });
}

export const gemgrid = defineGrammar(gemgridDialect, {
  root: "gemgrid",
  constructs: {
    gemgrid: {
      opens: [name()],
      slots: {
        map: { kind: "decl", args: [data("string[]")], once: true, required: true, check: checkMap },
        pace: { kind: "decl", args: [data("number", { min: 0.05, max: 1 })], once: true },
      },
    },
  },
});
