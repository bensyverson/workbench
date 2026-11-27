// Dialect ports for the FM synth.
export const ports = {
  in: {
    notes: {
      seam: "Event<{ index: f64, on: bool, velocity: f64 }>",
      note: "One note struck or released. index is the note's place from 0 (the first key, KeyA) up to 11 (KeyL); on is true when struck and false when released; velocity is 0 to 1 (keys send 1, MIDI sends velocity / 127).",
    },
    vibrato: {
      seam: "Event<{ value: f64 }>",
      note: "Vibrato depth, 0 to 1, as the runtime keeps it. It is not written to the source.",
    },
  },
  out: {
    picture: {
      seam: "Draw",
      note: "The synth's stage: the operators drawn as shapes the person can see.",
    },
  },
};
