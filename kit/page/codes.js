// kit/page's codes: H… is a page diagnostic, something the page cannot show as the composition asks, reported for
// the host to show and never dropped silently. H is reserved for the kit (kit/define's RESERVED_LETTERS).

/** Each code and what it means. */
export const PAGE_CODES = Object.freeze({
  H001: "The composition's renderer profile refuses the shown list as it stands, at draw time (kit/draw's checkDraw: J040–J044); the page draws it anyway, on Canvas",
  H002: "Nothing to draw: the composition shows no part, or the shown part has no Draw output (a custom element stage, or the text view)",
  H003: "An image's pixels are not available: its file is not in a loaded package, or the host's decoder failed on it; it draws as its box",
  H004: "A frame threw (the run's driver, or a draw: a host's decode result drawImage rejects, say); the page stopped its frame loop, and page.start() runs it again",
  H005: "A package example cannot run alone as a preset: its default export is not a function ($) => <builder chain>, or calling it threw or returned no Program (examplePreset)",
  H006: "A package test's expectation was not met (runTests): the message names the test, the kind of expectation, the instant, the path or output, and the expected and actual values",
  H007: "A package test's run reported an error diagnostic the test did not expect (N002, N003, N004, a J code), or its replay from its own record diverged (N005)",
  H008: "A package test could not run: its example does not build alone, createRun refused it, an in input was refused when logged (N011, N012), or a state path names a Program field the built Program does not declare",
  H009: "A part run alone could take a page control in more than one way, so none of those is wired: two of its Event inputs take one control's seam, or one input fits several controls (the buttons' { held: bool }); a warning, and a glue chooses",
  H010: "The shown layer's bottom frame has no extent, so the page has no size and the canvas stays hidden: a layer has no text stage to fall back on, as a shown part with no extent does",
});

/** How many page diagnostics the list keeps: past it, the oldest go (a refusal that comes and goes must not grow it without bound). */
export const MAX_PAGE_DIAGNOSTICS = 100;

/**
 * One page diagnostic: its code, the instant (rational text) and, when it is about one, the part.
 * @typedef {{ code: keyof typeof PAGE_CODES, severity: "error" | "warning", message: string, T: string, part?: string, check?: Array<{ code: string, message: string }> }} PageDiagnostic
 */
