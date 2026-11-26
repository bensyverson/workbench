// A composition's codes: S… is a glue program's mistake, found when it is checked. Each about a wire or an edge
// names both sides. The numbers are the seams draft's table (S102, S257 added by the relay trial's checker; S115
// and S205 by the 2026-11-26 rulings on cycles and renames; S116 by the queue-bound ruling).

/** Each code and what it means; the tests check that every one has a failing case. */
export const COMPOSE_CODES = Object.freeze({
  S101: "Two parts with one name",
  S102: "A composition call given the wrong thing: .part of something that is not a builder or twice, a handle of a part not passed to .part, .wire of anything but an output then an input, wire options other than { rename, delay }, .frame of anything but two frames, .show of a part not in the composition or a second .show, a composition name that is not lowercase letters, digits and -",
  S111: "An output, input or frame the part does not have (lists what it has, with a did-you-mean)",
  S112: "An input wired twice",
  S113: "A required input with no wire",
  S114: "A part wired to itself",
  S115: "A cycle of wires with no wire in it marked { delay: true } (names the loop)",
  S116: "A reliable Event wire whose queue can hold more records at one consumer step than the consumer's runtime takes (from the two clocks and the producer's per-step max; checked when .check or .build is given the runtimes): names both sides and the two fixes, raise the max or { keepLast: n }",
  S201: "Seam kinds differ: an Event into a value input, a record into a scalar, a rate into a non-rate",
  S202: "A record field the consumer takes and the producer lacks, or one of another kind (names the field, both sides); a field the producer has and the consumer does not take is dropped on the wire, not an error",
  S203: "An enum the consumer does not accept",
  S204: "A list longer than the consumer's max",
  S205: "A rename that names a field the producer's record lacks or the consumer's does not take (with a did-you-mean), maps two fields to one, or renames into a field the producer already has; or a rename on a wire that carries no record",
  S206: "A warning, not an error: a wire drops a producer field the consumer does not take and fills a consumer field with its default, and the two fields' seams are compatible, so a rename was probably meant (the fix names it)",
  S251: "Tagged on both sides, no frame path",
  S252: "Tagged on one side only",
  S253: "Two frame paths disagree (names both, and the edges on each)",
  S254: "A quantity across a non-uniform scale",
  S255: "A point into a vector, or a vector into a point",
  S256: "\"fit\" with a frame that has no extent, or with dims that differ",
  S257: "A malformed edge: not { scale, offset }, a scale of 0, the wrong number of axes; or two frames of different dims, or of one part, related by .frame",
  S301: "A handle read as a value at build time: arithmetic, an ordering comparison or a string (caught as the glue runs), or tested or compared (`if (h)`, `h ? a : b`, `!h`, `h && x` where the logical is itself tested, `h !== undefined`, `h == null`; found by scanGlue in the glue's text), or a property a handle does not define read (`a.out.x.y`; the handle throws an Error carrying code S301, file and loc)",
});
