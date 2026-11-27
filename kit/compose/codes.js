// A composition's codes: S… is a glue program's mistake, found when it is checked. Each about a wire or an edge
// names both sides. The numbers are the seams draft's table (S102, S257 added by the relay trial's checker; S115
// and S205 by the 2026-11-26 rulings on cycles and renames; S116 by the queue-bound ruling; S117, S118, S207 and S208
// by the rulings on a wire constant and a wire into a param; S404 by the layer ruling of 2026-11-27; S119 to S121 by
// declared Controls, 2026-11-27; S119 narrowed to shared Controls by the part-qualified ruling, the same day).

/** Each code and what it means; the tests check that every one has a failing case. */
export const COMPOSE_CODES = Object.freeze({
  S101: "Two parts with one name (a layer's included, the shorthand's `layers` too)",
  S102: "A composition call given the wrong thing: .part of something that is not a builder or twice, a handle of a part not passed to .part, .wire of anything but an output then an input, wire options other than { rename, set, delay, overflow } (or an overflow that is not keepLast or keepFirst, or one on a value wire, or a set that is not an object of literal data), a param wire with any option, a param as a wire's producer, .frame of anything but two frames, .show of a part not in the composition, of one output alone, or a second .show, a composition name that is not lowercase letters, digits and -; layer(<name>, ...) or .show's shorthand given fewer than two outputs, something that is not an output handle, an output twice, an output of a part not added, or a bad name, or .part of one layer twice",
  S103: "A glue's default export is not a function ($) => composition, throws (a thrown kit code or kit diagnostics are kept instead), or returns something that is not a composition (callGlue)",
  S104: "A glue's build-time code reads its $ (a param by name, a spread, `in`): a glue has no params, each part keeps its own, so the read is refused rather than undefined (callGlue)",
  S111: "An output, input, frame or param the part does not have (lists what it has, with a did-you-mean); any handle of a layer but .out.view (the fix says what to do instead); a page Control no composed part's UI declares (listing the page's Controls), or, when the packages given carry no UI, saying to pass the loaded packages; page.out.<control> into a part that does not declare it when only parts' own (scoped) Controls have that name (listing their page names, page.out[\"<part>.<control>\"])",
  S112: "An input wired twice",
  S113: "A required input with no wire",
  S114: "A part wired to itself",
  S115: "A cycle of wires with no wire in it marked { delay: true } (names the loop)",
  S116: "A reliable Event wire whose queue can hold more records at one consumer step than the consumer's runtime takes (from the two clocks and the producer's per-step max; checked when .check or .build is given the runtimes): names both sides and the fixes, raise the max, { keepLast: n } on the input, or { overflow } on the wire; with { overflow: \"keepLast\" | \"keepFirst\" } on the wire it is a warning naming the policy, and on a page wire with no policy a warning naming the fold into the latest held state",
  S117: "A param wire from the part's own output, or a loop of param wires alone: each rebuild would change the output that sets the next (names the loop)",
  S118: "A warning, not an error: a param wire fed by a part that steps at a rate (a tick or frame clock): each change of the value rebuilds the param's part if build-time code reads it",
  S119: "Two parts' UIs declare one shared Control name differently (both parts and both declarations named): one name is one Control on the page. A keyed Control (each) or one with to is its part's own, named <part>.<control> on the page, and never clashes (part-qualified Controls, 2026-11-27)",
  S120: "A warning, not an error: a part's UI declares a Control whose Event input nothing in the composition wires, so the person cannot play it",
  S121: "A warning, not an error: two different Controls of one composition bind one KeyboardEvent code; the first declared takes the key",
  S201: "Seam kinds differ: an Event into a value input, a record into a scalar, a rate into a non-rate",
  S202: "A record field the consumer takes and the producer lacks, or one of another kind (names the field, both sides); a field the producer has and the consumer does not take is dropped on the wire, not an error",
  S203: "An enum the consumer does not accept",
  S204: "A list longer than the consumer's max",
  S205: "A rename that names a field the producer's record lacks or the consumer's does not take (with a did-you-mean), maps two fields to one, or renames into a field the producer already has; or a rename on a wire that carries no record",
  S206: "A warning, not an error: a wire that builds drops a producer field the consumer does not take and gives a consumer field its default, and the two fields' seams are compatible and any frames they are measured in are joined by a frame path; says what the wire will do, and offers a constant (set) and a rename alike, since a field of the same kind may not mean the same",
  S207: "A wire constant (set) that names a field the consumer's record does not take (with a did-you-mean), gives a value that does not fit the field's seam, or sits on a wire with no record into its input or with a list's items",
  S208: "A wire constant (set) on a field the producer's record also sends: a set never overrides",
  S251: "Tagged on both sides, no frame path",
  S252: "Tagged on one side only",
  S253: "Two frame paths disagree (names both, and the edges on each)",
  S254: "A quantity across a non-uniform scale",
  S255: "A point into a vector, or a vector into a point",
  S256: "\"fit\" or an anchored edge with a frame that has no extent, or \"fit\" with dims that differ; in a run, a re-plan after a rebuild whose derived edge lost an extent",
  S257: "A malformed edge: not { scale, offset } or { scale, anchor, offset? }, a key besides those, a scale of 0, the wrong number of axes, an anchor other than \"min\", \"center\" or \"max\" per axis or a pair { from, to } of those; or two frames of different dims, or of one part, related by .frame",
  S301: "A handle read as a value at build time: arithmetic, an ordering comparison or a string (caught as the glue runs), or tested or compared (`if (h)`, `h ? a : b`, `!h`, `h && x` where the logical is itself tested, `h !== undefined`, `h == null`; found by scanGlue in the glue's text), or a property a handle does not define read (`a.out.x.y`; the handle throws an Error carrying code S301, file and loc)",
  S401: "The shown draw list can hold an op kind the renderer profile does not draw (check({ profile })), read from the builders and followed through the Draw inputs they spread; names the output whose builder writes it",
  S402: "The shown part has several Draw outputs and none is named view, so the page cannot tell which to show",
  S403: "check({ profile }) names no renderer profile",
  S404: "A layer argument (layer(<name>, ...) or .show(<output>, <output>, ...)) whose output is not a Draw list: a value, an Event or a record (names the output and its seam)",
});
