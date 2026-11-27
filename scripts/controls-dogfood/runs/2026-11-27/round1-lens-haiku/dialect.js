// dialect.js: ports and data files of the lens bench Dialect.

export const ports = {
  in: {
    caption: {
      seam: "Event<{ value: str }>",
      note: "The caption line typed for the bench. Each record is the whole text.",
    },
    glass: {
      seam: "Event<{ value: str, nd: f64, vd: f64 }>",
      note: "A glass picked from the catalog: its name, and its nd and vd. Written back to the first lens's glass argument on release.",
    },
  },
  out: {
    bench: {
      seam: "Draw",
      note: "The lenses on an optical axis, with a grip-able radius per lens.",
    },
    chart: {
      seam: "Draw",
      note: "Abbe diagram of the glass catalog: refractive index nd against dispersion vd.",
    },
  },
};

export const files = {
  glasses: "glasses.csv",
};
