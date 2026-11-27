// UI declaration for the lens bench: stage, controls, grips and tiles.

export const ui = {
  stage: { draw: "bench" },

  controls: {
    // Bound by name to the Event input `caption` in dialect.js.
    caption: {
      kind: "text",
      label: "Caption",
      value: "",
      max: 120,
      lines: 1,
    },

    // Part-local: no Event input of this name, so `to` is required.
    // Fixed target: the first lens's glass (the task says the first lens is enough).
    // Its address is written from the Ref id scheme (bench.lens#0, argument 0, key glass).
    glass: {
      kind: "pick",
      label: "Glass for lens 0",
      file: "glasses",
      key: "name",
      show: ["name", "nd", "vd"],
      map: { x: "vd", y: "nd" },
      carry: { nd: "f64", vd: "f64" },
      value: "BK7",
      to: "arg.bench.lens#0:0.glass",
    },
  },

  grips: {
    // One Grip per lens, on its right edge, dragged along the horizontal optical axis.
    // The radius range (5 to 80) belongs in the Dialect's Grammar for the radius argument,
    // which is not written here.
    radius: {
      each: "lenses",
      at: (l) => [l.cx + l.r, l.cy],
      to: (l) => "arg." + l.radiusTarget,
      kind: "length",
      axis: () => [1, 0],
      label: "Radius",
    },
  },

  tiles: {
    // Controls panel beside the bench.
    panel: {
      title: "Controls",
      place: { splitRight: "stage" },
      body: [
        { kind: "control", control: "caption" },
        { kind: "control", control: "glass" },
      ],
    },

    // The Abbe chart as a second tab of the same group as the stage.
    chart: {
      title: "Abbe chart",
      place: { tabWith: "stage" },
      body: [{ kind: "view", draw: "chart" }],
    },
  },
};
