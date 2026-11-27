// A run's codes: N… is something that happened while a composed workbench ran (the clocks draft's table, as ruled
// 2026-11-26). Each diagnostic carries the part (when it has one), the instant T and the revision. A composition the
// scheduler refuses to start comes back as a RunError holding its diagnostics (N006, and kit/compose's S116).

/** Each code and what it means; the tests check that every one has a case. */
export const RUN_CODES = Object.freeze({
  N001: "The run fell behind wall time and T slowed (how long, how much; written while it lasts, rewritten as it grows); also an input that keeps the last n records dropped some (counted), or records sent to a stopped part were dropped (counted in stats().stopped), or a wire's overflow policy, or a page wire's fold into the latest held state, dropped records a step could not take (counted in stats().overflow)",
  N002: "A step returned a state that does not fit the Dialect's state (the checkState paths), pushed more records into an Event output than its runtime declares, or would take more from an Event input than it declares",
  N003: "A step or init kept memory outside its state: in any run, a field in the extensible state struct that the Program does not declare; in a development run, a step that changed the state it was handed, or gave another result on a second step on the same state",
  N004: "A step or init threw: the part stops, and the others run on with its last snapshot",
  N005: "A replay diverged from its record: a state hash differs at an instant, so something is not deterministic",
  N006: "A runtime's clock(record) is not { tick: seconds }, { frame: true } or { demand: true }",
  N007: "A composed record's wire has an overflow that is neither \"keepLast\" nor \"keepFirst\" (a hand-edited record: compose's S102 refuses it at the glue)",
  N008: "A param wire's value does not fit the param's declaration (its type, finite, min..max, options): the wire does not set it, and the part keeps its build; noted once per value",
});

/**
 * A run diagnostic. `T` is the instant as rational text ("19/8"), null before the first.
 * @typedef {{ code: string, severity: "error" | "warning", message: string, part?: string, T: string | null, revision?: number }} RunDiagnostic
 */

/** A run that cannot start: every diagnostic. */
export class RunError extends Error {
  /** @param {Array<{ code: string, message: string }>} diagnostics */
  constructor(diagnostics) {
    super(diagnostics.map((d) => `${d.code} ${d.message}`).join("\n"));
    this.name = "RunError";
    this.diagnostics = diagnostics;
  }
}
