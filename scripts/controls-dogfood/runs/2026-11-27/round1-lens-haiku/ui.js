// ui.js: the controls, grips, stage and tiles of the lens bench.

export const ui = {
  stage: { draw: "bench" },

  controls: {
    caption: {
      kind: "text",
      label: "Caption",
      value: "",
      max: 120,
      lines: 1,
    },
    glass: {
      kind: "pick",
      label: "Glass",
      file: "glasses",
      key: "name",
      show: ["name", "nd", "vd"],
      map: { x: "vd", y: "nd" },
      carry: { nd: "f64", vd: "f64" },
      value: "BK7",
      // The first lens's glass argument, as a static Argument address.
      to: "arg.bench.lens#0:0.glass",
    },
  },

  grips: {
    radius: {
      each: "lenses",
      at: (item) => [item.cx + item.r, item.cy],
      to: (item) => "arg." + item.radiusTarget,
      kind: "length",
      axis: () => [1, 0],
      label: "radius",
    },
  },

  tiles: {
    chart: {
      kind: "view",
      draw: "chart",
      place: { tabWith: "stage" },
    },
  },
};
