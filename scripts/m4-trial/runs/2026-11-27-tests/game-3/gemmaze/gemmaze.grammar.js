import { defineGrammar, name, data } from "kit/define";
import { gemmazeDialect } from "./gemmaze.dialect.js";

export const gemmaze = defineGrammar(gemmazeDialect, {
  root: "level",
  constructs: {
    level: {
      opens: [name()],
      slots: {
        map: {
          kind: "decl",
          args: [data("string[]")],
          once: true,
          required: true,
          check(call, ctx) {
            const rows = call.args[0];
            const bad = (message, tip) => ctx.error("M001", message, { arg: 0, tip });
            if (rows.length === 0 || rows[0].length === 0) return bad("the map is empty", "give at least one row of cells");
            const width = rows[0].length;
            if (rows.some((r) => r.length !== width)) return bad("the map's rows differ in length", "pad every row to the same number of cells");
            if (width * rows.length > 400) return bad("the map has more than 400 cells", "make the level smaller");
            let starts = 0;
            for (const row of rows) {
              for (const c of row) {
                if (!"#.*@".includes(c)) return bad("'" + c + "' is not a cell", "use # wall, . floor, * gem, @ player start");
                if (c === "@") starts++;
              }
            }
            if (starts !== 1) return bad("the map has " + starts + " player starts", "write exactly one @");
          },
        },
      },
    },
  },
});
