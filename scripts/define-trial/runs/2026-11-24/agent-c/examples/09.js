// REFUSED: R8 effects. An Environment session mutates a live program (set, addStep, undo), which needs effects and a
// non-pure space; D012 refuses any space without pure: true. Mutation is not a Program.
