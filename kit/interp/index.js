// The reference interpreter: what a Kernel means, by walking its IR. Small, slow and written
// to be obviously right, so a backend's output can be compared with it. It shares nothing with
// the emitters beyond the IR's types.

export { run } from "./run.js";
export { coerce } from "./coerce.js";
