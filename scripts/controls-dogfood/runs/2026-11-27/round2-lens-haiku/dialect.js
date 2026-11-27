// Dialect ports and data files for the lens bench.

export const ports = {
  in: {
    caption: {
      seam: "Event<{ value: str }>",
      note: "One record is the whole caption text now. The runtime keeps it and draws it on the bench.",
    },
  },
  out: {
    bench: {
      seam: "Draw",
      note: "The optical axis with one lens per lens call, in the bench frame. Each lens is an op with an id.",
    },
    chart: {
      seam: "Draw",
      note: "Abbe diagram of the glass catalog: refractive index nd against dispersion vd, one point per row.",
    },
  },
};

export const files = {
  glasses: {
    kind: "csv",
    path: "glasses.csv",
    note: "Glass catalog. Columns: name (text), nd (refractive index), vd (Abbe number).",
  },
};
