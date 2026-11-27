export const ui = {
  controls: {
    move: {
      kind: "buttons",
      label: "Move",
      buttons: ["up", "down", "left", "right"],
      grid: [
        [null, "up", null],
        ["left", null, "right"],
        [null, "down", null],
      ],
      keys: {
        up: ["ArrowUp", "KeyW"],
        down: ["ArrowDown", "KeyS"],
        left: ["ArrowLeft", "KeyA"],
        right: ["ArrowRight", "KeyD"],
      },
      gamepad: { up: 12, down: 13, left: 14, right: 15 },
    },
    act: {
      kind: "buttons",
      label: "Actions",
      buttons: ["jump", "fire"],
      keys: { jump: ["KeyJ"], fire: ["KeyK"] },
    },
  },
  stage: { draw: "board" },
  tiles: {
    play: {
      title: "Play",
      place: { splitBelow: "stage" },
      body: [
        {
          kind: "row",
          items: [
            { kind: "control", control: "move" },
            { kind: "control", control: "act" },
          ],
        },
      ],
    },
  },
};
