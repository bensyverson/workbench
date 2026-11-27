import { defineDialect, exact, list, struct, pointerSeam } from "kit/define";

// The lens bench (a non-founding workbench, project/2026-11-27-controls-draft.md): lenses on a 100 by 100 bench, each
// with a radius and a position. Its Grips drag a lens's radius and its position, and a release writes the new literal
// into the Program's text. It takes the pointer on its stage and counts what it got.

export const lensDialect = defineDialect({
  name: "lens",
  numberType: "f64",
  text: (s) => s.lenses.map((l, i) => `lens ${i}: r ${l.r} at (${l.x}, ${l.y})`).join("\n"),
  spaces: {},
  objects: { Params: { label: "the params ($)", members: {} } },
  globals: { $: "Params" },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {},
  params: { object: "Params", name: "$" },
  environment(program) {
    const params = {};
    for (const n of Object.keys(program.params ?? {})) params[n] = "f64";
    return { objects: { Params: { members: params } } };
  },
  state: {
    seen: "f64",
    lenses: list(struct({ x: "f64", y: "f64", r: "f64", radius: "str", at: "str" }), 8),
  },
  frames: { px: { dims: 2, note: "bench units", extent: () => ({ min: [0, 0], max: [100, 100] }) } },
  ports: {
    in: { pointer: { seam: pointerSeam("px"), note: "the pointer on the bench" } },
    out: {
      view: {
        seam: "Draw<16>@px",
        note: "the bench and its lenses",
        pen: (s, pen) => {
          pen.rect({ at: [0, 0], size: [100, 100], fill: "#101820", id: "bench" });
          let i = 0;
          for (const l of s.lenses) {
            pen.ellipse({ at: [l.x, l.y], r: [l.r, l.r], stroke: "#7fd3ff", fill: "#1d3a4a", id: "lens" + i });
            i = i + 1;
          }
        },
      },
    },
  },
});
