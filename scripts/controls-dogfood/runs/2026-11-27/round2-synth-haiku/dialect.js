// The synth's Dialect ports: the Event inputs the controls feed, and the Draw output the stage shows.

export const ports = {
  in: {
    notes: {
      seam: "Event<{ index: f64, on: bool, velocity: f64 }>",
      note: "One note on or off. index is the note (0 to 11, the i-th key code of the notes control). on is true when struck, false when released. velocity is 0 to 1 (a MIDI velocity over 127; a key sends 1).",
    },
    vibrato: {
      seam: "Event<{ value: f64 }>",
      note: "Vibrato depth, 0 to 1. The runtime keeps the value in its state; no source is written.",
    },
    env: {
      seam: "Event<{ key: str, value: list<vec2, 8> }>",
      note: "The envelope point list of one operator (key is the operator's name). value is up to 8 points, x (time) and y (level) each 0 to 1.",
    },
  },
  out: {
    picture: {
      seam: "Draw",
      note: "The synth's stage: the operators and their envelopes, drawn from the Program's state.",
    },
  },
};
