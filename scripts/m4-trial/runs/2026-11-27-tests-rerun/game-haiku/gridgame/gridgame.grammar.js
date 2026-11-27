import { defineGrammar, name, data } from "kit/define";
import { gridgame } from "./gridgame.dialect.js";

// A level is one .row("…") per row, top row first. Characters:
//   # wall   . floor   * gem   @ the player's start (exactly one)
const CELLS = "#.*@";

export const level = defineGrammar(gridgame, {
  root: "level",
  constructs: {
    level: {
      opens: [name()],
      slots: {
        row: { kind: "decl", args: [data("string")] },
      },
      check(record, ctx) {
        const rows = record.row ?? [];
        if (rows.length === 0) {
          ctx.error("G001", "a level needs at least one row", { tip: 'add .row("#####")' });
          return;
        }
        const width = rows[0].length;
        rows.forEach((line, y) => {
          if (line.length !== width) {
            ctx.error("G002", `row ${y} is ${line.length} cells wide, row 0 is ${width}`, {
              tip: "every row must be the same width",
            });
          }
          for (const ch of line) {
            if (!CELLS.includes(ch)) {
              ctx.error("G003", `'${ch}' is not a cell character`, {
                tip: 'use "#" wall, "." floor, "*" gem or "@" start',
              });
            }
          }
        });
        const starts = rows.join("").split("@").length - 1;
        if (starts !== 1) {
          ctx.error("G004", `a level has exactly one "@" start, this one has ${starts}`, {
            tip: 'mark where the player starts with one "@"',
          });
        }
        if (rows.length * width > 400) {
          ctx.error("G005", `a level holds at most 400 cells, this one has ${rows.length * width}`, {
            tip: "make the level smaller",
          });
        }
      },
    },
  },
});
