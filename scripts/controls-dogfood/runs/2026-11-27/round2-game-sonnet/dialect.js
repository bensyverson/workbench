export const ports = {
  in: {
    move: {
      seam: "Event<{ up: bool, down: bool, left: bool, right: bool }>",
      note: "which directions are held now; true while held",
    },
    act: {
      seam: "Event<{ jump: bool, fire: bool }>",
      note: "which action buttons are held now; true while held",
    },
  },
  out: {
    board: { seam: "Draw", note: "the 12 by 10 grid and the creature on it" },
  },
};
