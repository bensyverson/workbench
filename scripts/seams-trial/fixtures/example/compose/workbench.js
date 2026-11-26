import { compose } from "kit/compose";
import { drums } from "drums";
import { board } from "board";

// Each drum hit lights the lamps under its step; the strip scrolls with the tempo, and a full strip mutes the drums.
export default ($) => {
  const beat = drums("beat").length(16).tempo(8).lane("kick", [0, 4, 8, 12]).lane("snare", [4, 12]);
  const strip = board("strip").lamps(32).glow((l) => { if (hit != null) { l.level = hit.strength; } });

  return compose("light-show")
    .part(beat)
    .part(strip)
    .frame(beat.frame.step, strip.frame.lamp, "fit")
    .wire(beat.out.hit, strip.in.flash, { rename: { when: "pos", loud: "strength" } })
    .wire(beat.out.tempo, strip.in.drift)
    .wire(strip.out.full, beat.in.mute, { delay: true })
    .show(strip);
};
