import { gemgrid } from "../gemgrid.grammar.js";

export default () => gemgrid("Two starts")
  .map([
    "#####",
    "#P*P#",
    "#####",
  ]);
