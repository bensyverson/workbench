// The game part run alone. The reference gives no import path for examplePreset
// and does not define wirePage, so the host's names are passed in.
import { ui } from "./ui.js";

export default ({ examplePreset, game, build, wirePage }) =>
  examplePreset("game", game, build, { ui, wirePage });
