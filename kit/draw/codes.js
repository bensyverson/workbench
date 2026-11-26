// Draw's codes: J… is a draw list's problem, from its declaration (J001–J003, judged by kit/define), through its
// max for one built Program (J010), to a list a builder made (J020–J022, a run stops the part) and a list a
// renderer profile draws (J040–J042). A composition's checks of draw lists are kit/compose's S4… codes.

/** Each code and what it means. */
export const DRAW_CODES = Object.freeze({
  J001: "A malformed Draw port: no builder or more than one (from, each with from, pen, layers), a layer with a key it does not take, an each path that is not a state list with a max, a pen layer without its max, a max that is neither a whole number nor a function of the built record, a Draw input given a default, required, delivery, record or type, or a frame that is not 2-D",
  J002: "A Draw builder that calls map or its kin (filter, forEach, reduce, flatMap, push, concat): a builder walks a list with each, a pen's for…of, or concatenates whole lists with spread",
  J003: "A malformed colors or images declaration: a color that is not \"#rrggbb\" or \"#rrggbbaa\", an image without a whole positive size, a cell that does not divide it, or a key an image does not take",
  J010: "A Draw port's max for one built Program that is not a whole number of at least 0, or that passes the seam's ceiling (Draw<ceiling>)",
  J020: "A builder made something that is not an op of the table: a missing or unknown field, a field of the wrong type, an undeclared color or image (the part stops)",
  J021: "A draw list longer than its max, or a pen layer that drew more than its own max (the part stops; a list is never truncated)",
  J022: "A builder threw (the part stops)",
  J040: "A renderer profile's limit passed at draw time: too many sprites (text characters are sprites), too many on one row, too many tiles layers, a stage larger than the screen (named with the profile and the limit; nothing is dropped)",
  J041: "An op a renderer profile cannot draw exactly: an image whose cells are not its cell size, an image or tiles drawn at another size than its own (a scaling wire), a mirrored tiles op, or a second tiles layer that is not the window (opaque, on the tile grid, running to the screen's far corner)",
  J042: "An op kind a renderer profile does not draw, found at draw time (a builder whose kinds the composition could not see)",
});
