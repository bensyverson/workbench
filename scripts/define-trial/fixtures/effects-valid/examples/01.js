import { garden } from "../garden.grammar.js";

const TALL = 2;
const tall = (pl) => pl.height > TALL;

export default ($) => garden("beds")
  .param("rate", { value: 3, min: 0, max: 10 })
  .total("harvest")
  .total("grown")
  .rain((t) => (totals.harvest < 10 ? $.rate : 0))
  .grow((pl, dt) => {
    pl.height += dt * pl.water;
    pl.water = Math.max(0, pl.water - dt);
    totals.grown++;
    if (tall(pl)) {
      pl.wilt();
      totals.harvest += pl.height;
    }
  })
  .sow((pl, rng) => {
    pl.water = rng();
    pl.spot = vec2(rng() * 10, pl.spot.y);
  });
