// The reference gives no import path for examplePreset, so the names are passed in.
// `ui` is what defineUI returned for the declaration in ui.js.
// wirePage is left at its default: each Control is wired to the input of its name.
export default ({ examplePreset, game, build, ui }) =>
  examplePreset("game", game, build, { ui });
