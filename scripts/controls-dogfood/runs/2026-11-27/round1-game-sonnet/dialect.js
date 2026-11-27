export const ports = {
  in: {
    play: {
      seam: "Event<{ up: bool, down: bool, left: bool, right: bool, jump: bool, fire: bool }>",
      note: "which of the six game buttons are held now: up, down, left, right move the creature; jump makes it jump; fire makes it fire",
    },
  },
  out: {
    board: { seam: "Draw", note: "the 12 by 10 grid with the creature on it" },
  },
};
