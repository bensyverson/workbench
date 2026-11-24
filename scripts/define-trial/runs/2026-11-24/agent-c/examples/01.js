import { program } from "../data.grammar.js";

// REFUSED (the rest): head(20) and a grid view have no draft equivalent (no layout, no rendering); type inference
// (date, int) has no draft type to infer into.
export default program("first-look")
  .source("sales", { csv: "data/sales.csv", header: true })
  .view("sales");
