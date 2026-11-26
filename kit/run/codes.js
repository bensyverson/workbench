// A run's codes: R… is something that happened while a composed workbench ran (the clocks draft's table, as ruled
// 2026-11-26). Each diagnostic carries the part (when it has one), the instant T and the revision. A composition the
// scheduler refuses to start comes back as a RunError holding its diagnostics (R006, and kit/compose's S116).

/** Each code and what it means; the tests check that every one has a case. */
export const RUN_CODES = Object.freeze({
  R001: "The run fell behind wall time and T slowed (how long, how much); also an input that keeps the last n records dropped some (counted)",
  R002: "A step returned a state that does not fit the Dialect's state (the checkState paths), or pushed more records into an Event output than its runtime declares",
  R003: "In a development run, a step changed the state it was handed, or kept memory outside it (a second step on the same state gave another result)",
  R004: "A step or init threw: the part stops, and the others run on with its last snapshot",
  R005: "A replay diverged from its record: a state hash differs at an instant, so something is not deterministic",
  R006: "A runtime's clock(record) is not { tick: seconds }, { frame: true } or { demand: true }",
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
