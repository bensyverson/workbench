// A run's codes: N… is something that happened while a composed workbench ran (the clocks draft's table, as ruled
// 2026-11-26). Each diagnostic carries the part (when it has one), the instant T and the revision. A composition the
// scheduler refuses to start comes back as a RunError holding its diagnostics (N006, and kit/compose's S116).

/** Each code and what it means; the tests check that every one has a case. */
export const RUN_CODES = Object.freeze({
  N001: "The run fell behind wall time and T slowed (how long, how much; written while it lasts, rewritten as it grows); also an input that keeps the last n records dropped some (counted), or records sent to a stopped part were dropped (counted in stats().stopped), or a wire's overflow policy, or a page wire's fold into the latest held state, dropped records a step could not take (counted in stats().overflow), or a delta page wire (a triggers Control's, a pointer's) carried records a step could not take over to the next steps, none dropped (counted in stats().carried)",
  N002: "A step returned a state that does not fit the Dialect's state (the checkState paths), pushed more records into an Event output than its runtime declares, or would take more from an Event input than it declares",
  N003: "A step or init kept memory outside its state: in any run, a field in the extensible state struct that the Program does not declare; in a development run, a step that changed the state it was handed, or gave another result on a second step on the same state",
  N004: "A step or init threw: the part stops, and the others run on with its last snapshot",
  N005: "A replay diverged from its record: a state hash differs at an instant, so something is not deterministic",
  N006: "A runtime's clock(record) is not { tick: seconds }, { frame: true } or { demand: true }",
  N007: "A composed record kit/compose would not have built (a hand-edited record): the record has no `frames` list, a wire's overflow is neither \"keepLast\" nor \"keepFirst\" (compose's S102 refuses it at the glue), or a layer has fewer than two inputs, an input with no wire or several, an input from anything but a Draw output of a part in the run, an output on two inputs, a record whose `layer.inputs`, `max` or `frame` disagrees with its wires, a delay or rename on a wire into a layer, a wire from a layer port but `view`, or layers that feed each other; refused at createRun, never drawn empty",
  N008: "A param's value does not fit the param's declaration (its type, finite, min..max, options): a param wire's is not set and the part keeps its build, noted once per value; a param input's is refused when it is logged if it fits no record that can be in force at its stamp (run.input throws a RunError, and the run is unchanged), and otherwise is not applied when the record in force as it applies refuses it (noted)",
  N009: "An input names a part the composition does not have: refused when it is logged (run.input throws a RunError, and the run is unchanged)",
  N011: "An in input addressed to an input the part does not have, to a value or Draw input, or to an Event input a wire feeds, or a control input addressed to any part but the built-in page: refused when it is logged (a RunError, and the run is unchanged)",
  N012: "An in input whose value does not fit the input's seam (a field missing that has no default, an unknown field, a value of the wrong type), a control input whose value does not fit its declared Control's seam, or a pointer input whose value does not fit the part's pointer input: refused when it is logged (a RunError, and the run is unchanged)",
  N013: "A control input naming a Control the composed page lacks, or a pointer input to a part that takes no pointer (its UI names no pointer input there): refused when it is logged (a RunError, and the run is unchanged)",
  N014: "A run whose every stepping part is on a demand clock: nothing makes an instant past the first, so inputs never reach a step; a warning at createRun (kit/run's \"Not here\": a workbench of demand parts only)",
  N010: "A param input changes a param that build-time code reads, and the run was given no build(part, params) to rebuild the part with: refused when it is logged (a RunError), or, when only a rebuild logged before it made the param build-time, not applied (noted)",
});

/**
 * A run diagnostic. `T` is the instant as rational text ("19/8"), null before the first.
 * @typedef {{ code: string, severity: "error" | "warning", message: string, part?: string, T: string | null, revision?: number }} RunDiagnostic
 */

/** A run that cannot start, or an input it refuses: every diagnostic. */
export class RunError extends Error {
  /** @param {Array<{ code: string, message: string, part?: string }>} diagnostics */
  constructor(diagnostics) {
    super(diagnostics.map((d) => `${d.code} ${d.message}`).join("\n"));
    this.name = "RunError";
    this.diagnostics = diagnostics;
  }
}
