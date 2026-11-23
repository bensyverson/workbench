// A stand-in for a user program loaded as an ES module.
export const name = "program";
export const tick = (self, w) => {
  if (self.up && --self.ttl === 0) self.up = false; // comment kept?
};
