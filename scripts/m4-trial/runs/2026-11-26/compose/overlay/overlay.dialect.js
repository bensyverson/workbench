import { defineDialect, exact } from "kit/define";

export const overlayDialect = defineDialect({
  name: "overlay",
  numberType: "f64",
  types: {},
  spaces: { host: { pure: true } },
  objects: { Inputs: { label: "the pictures wired in", members: {} } },
  globals: { layer: "Inputs" },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {},
  state: { width: "f64", height: "f64" },
  text(s) {
    return "two layered pictures, " + s.width + " by " + s.height;
  },
  frames: {
    canvas: {
      dims: 2,
      note: "the composed picture's pixels: x right, y down, origin at its top-left corner",
      extent: (record) => ({ min: [0, 0], max: [record.size.width, record.size.height] }),
    },
  },
  ports: {
    out: {
      view: {
        seam: "Draw<310>@canvas",
        note: "the under picture with the over picture on top of it",
        layers: [{ from: (s) => [...layer.under, ...layer.over] }],
      },
    },
    in: {
      under: { seam: "Draw<302>@canvas", note: "the picture drawn first" },
      over: { seam: "Draw<8>@canvas", note: "the picture drawn on top" },
    },
  },
  inputs: { object: "Inputs", name: "layer" },
});
