// Test fixtures for draw lists across the kit: kit/define's seams maze given a picture (walls as tiles of a sheet,
// a disc per coin), and a small root Dialect, `screen`, that layers a Draw input under a line of HUD text. They
// live beside test/, not in it, since every file under a test/ folder runs as a test.

import { defineDialect, defineGrammar, exact, list, struct, name, data } from "../../define/index.js";
import { mazeDecl, mazeGrammar, GRID } from "../../define/fixtures/seams-dialects.js";

export { GRID };
export const steer = "(pl, pad) => { pl.dx = pad.left ? -1 : 0; }";

/** The seams maze with a `view`: its walls as one tiles op over the grid's strings, a disc per coin. */
export function drawnMazeDecl() {
  const d = /** @type {Record<string, any>} */ (mazeDecl());
  d.state.coins = list(struct({ x: "f64", y: "f64" }), 16);
  d.colors = { coin: "#ffd23f" };
  d.images = { sheet: { size: [16, 8], cell: [8, 8], note: "a wall, then the floor" } };
  d.ports.out.view = {
    seam: "Draw<64>@cell", note: "the maze after this tick, one unit a cell",
    max: (/** @type {any} */ record) => 1 + record.grid.length,
    layers: [
      { from: (/** @type {any} */ s) => ({ op: "tiles", at: [-0.5, -0.5], image: "sheet", grid: s.grid, key: { "#": 0, ".": 1, c: 1 }, size: [1, 1] }) },
      { each: "coins", from: (/** @type {any} */ c) => ({ op: "ellipse", at: [c.x, c.y], r: [0.25, 0.25], fill: "coin" }) },
    ],
  };
  return d;
}
/** @param {(d: Record<string, any>) => void} [change] */
export const drawnMaze = (change = () => {}) => { const d = drawnMazeDecl(); change(d); return mazeGrammar(defineDialect(/** @type {any} */ (d))); };

/** A root that draws its `board` input, then the score as text, in its own pixels. */
export function screenDecl() {
  return /** @type {Record<string, any>} */ ({
    name: "screen",
    numberType: "f64",
    spaces: { none: { pure: true } },
    objects: { In: { label: "the inputs (inp)", members: {} } },
    globals: { inp: "In" },
    inputs: { object: "In", name: "inp" },
    targets: { js: { accepts: "*", compare: exact() } },
    slots: { unused: { params: [], returns: "f64", space: "none" } },
    state: { t: "f64" },
    colors: { ink: "#ffffff" },
    frames: { px: { dims: 2, note: "pixels; x right, y down; (0, 0) is the top-left corner", extent: (/** @type {any} */ r) => ({ min: [0, 0], max: [r.size.width, r.size.height] }) } },
    ports: {
      in: {
        board: { seam: "Draw<64>@px", note: "the picture drawn first" },
        score: { seam: "f64", default: 0, note: "the score the HUD shows" },
      },
      out: {
        // @ts-ignore: inp is the inputs global the kit sets while a builder runs
        view: { seam: "Draw<80>@px", note: "the board, then the score at the top left", from: (/** @type {any} */ s, /** @type {any} */ record) => [...inp.board, { op: "text", at: [0, record.size.height - 8], str: "SCORE " + inp.score, font: "mono", fill: "ink" }] },
      },
    },
    text: () => "",
  });
}
/** @param {(d: Record<string, any>) => void} [change] */
export function screen(change = () => {}) {
  const d = screenDecl();
  change(d);
  return defineGrammar(defineDialect(/** @type {any} */ (d)), {
    root: "screen",
    constructs: { screen: { opens: [name()], slots: { size: { kind: "decl", args: [data({ width: data("number"), height: data("number") })], once: true, required: true } } } },
  });
}
