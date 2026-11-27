import { defineGrammar, name, data } from "kit/define";
import { gemgridDialect } from "./gemgrid.dialect.js";

function checkMap(call, ctx) {
  const rows = call.args[0];
  const bad = (code, message, tip) => ctx.error(code, message, { tip, arg: 0 });
  if (rows.length < 1 || rows.length > 15) return bad("G001", `a map has 1 to 15 rows, not ${rows.length}`, "split or shrink the level");
  const w = rows[0].length;
  if (w < 1 || w > 20) return bad("G001", `a map row has 1 to 20 cells, not ${w}`, "split or shrink the level");
  if (rows.some((r) => r.length !== w)) return bad("G002", "every map row must be as long as the first", "pad short rows with . or #");
  const all = rows.join("");
  const odd = all.match(/[^#.*P]/);
  if (odd) return bad("G003", `'${odd[0]}' is not a map character`, "use # wall, . floor, * gem, P player start");
  const starts = all.split("P").length - 1;
  if (starts !== 1) return bad("G004", `a map has exactly one P (the player's start), not ${starts}`, "mark one cell P");
  if (!all.includes("*")) return bad("G005", "a map needs at least one gem", "mark a cell *");
}

export const gemgrid = defineGrammar(gemgridDialect, {
  root: "level",
  constructs: {
    level: {
      opens: [name()],
      slots: {
        map: { kind: "decl", args: [data("string[]")], once: true, required: true, check: checkMap },
      },
    },
  },
});
