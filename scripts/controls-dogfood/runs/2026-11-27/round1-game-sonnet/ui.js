export const ui = {
  controls: {
    play: {
      kind: "buttons",
      label: "Play",
      buttons: ["up", "down", "left", "right", "jump", "fire"],
      // The cross on the left, an empty column, then jump and fire beside it.
      grid: [
        [null, "up", null, null, null, null],
        ["left", null, "right", null, "jump", "fire"],
        [null, "down", null, null, null, null],
      ],
      keys: {
        up: ["ArrowUp", "KeyW"],
        down: ["ArrowDown", "KeyS"],
        left: ["ArrowLeft", "KeyA"],
        right: ["ArrowRight", "KeyD"],
        jump: ["KeyJ"],
        fire: ["KeyK"],
      },
      gamepad: { up: 12, down: 13, left: 14, right: 15 },
      // A press and a release for each of the six buttons (the default is 2).
      perFrame: 12,
    },
  },
  stage: { draw: "board" },
};
