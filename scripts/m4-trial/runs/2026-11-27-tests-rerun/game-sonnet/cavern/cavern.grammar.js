import { defineGrammar, name, data } from "kit/define";
import { cavernDialect } from "./cavern.dialect.js";

const MAX_WIDTH = 20;
const MAX_HEIGHT = 15;

export const cavern = defineGrammar(cavernDialect, {
  root: "level",
  constructs: {
    level: {
      opens: [name()],
      slots: {
        row: {
          kind: "decl",
          args: [data("string")],
          as: "rows",
          required: true,
          check(call, ctx) {
            const text = call.args[0];
            const rows = ctx.program.rows;
            const bad = [...text].find((c) => !"#.*@".includes(c));
            if (bad !== undefined) ctx.error("G001", `a row may not hold '${bad}'`, { arg: 0, tip: "use # (wall), . (floor), * (gem) or @ (the player's start)" });
            if (text.length < 1 || text.length > MAX_WIDTH) ctx.error("G002", `a row is 1 to ${MAX_WIDTH} cells, not ${text.length}`, { arg: 0, tip: "shorten or fill the row" });
            if (text.length !== rows[0].length) ctx.error("G003", `this row has ${text.length} cells and the first has ${rows[0].length}`, { arg: 0, tip: "make every row the same length" });
            if (rows.length > MAX_HEIGHT) ctx.error("G002", `a level has at most ${MAX_HEIGHT} rows`, { tip: "remove rows" });
          },
        },
      },
      check(record, ctx) {
        const starts = [...(record.rows ?? []).join("")].filter((c) => c === "@").length;
        if (starts !== 1) ctx.error("G004", `a level has exactly one player start (@), not ${starts}`, { tip: "put one @ in one row" });
      },
    },
  },
});
