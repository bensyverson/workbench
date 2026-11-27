// kit/page's codes: H… is a page diagnostic, something the page cannot show as the composition asks, reported for
// the host to show and never dropped silently. H is reserved for the kit (kit/define's RESERVED_LETTERS).

/** Each code and what it means. */
export const PAGE_CODES = Object.freeze({
  H001: "The composition's renderer profile refuses the shown list as it stands, at draw time (kit/draw's checkDraw: J040–J044); the page draws it anyway, on Canvas",
  H002: "Nothing to draw: the composition shows no part, or the shown part has no Draw output (a custom element stage, or the text view)",
  H003: "An image's pixels are not available: its file is not in a loaded package, or the host's decoder failed on it; it draws as its box",
  H004: "A frame threw (the run's driver, or a draw: a host's decode result drawImage rejects, say); the page stopped its frame loop, and page.start() runs it again",
  H005: "A package example cannot run alone as a preset: its default export is not a function ($) => <builder chain>, or calling it threw or returned no Program (examplePreset)",
});

/** How many page diagnostics the list keeps: past it, the oldest go (a refusal that comes and goes must not grow it without bound). */
export const MAX_PAGE_DIAGNOSTICS = 100;

/**
 * One page diagnostic: its code, the instant (rational text) and, when it is about one, the part.
 * @typedef {{ code: keyof typeof PAGE_CODES, severity: "error" | "warning", message: string, T: string, part?: string, check?: Array<{ code: string, message: string }> }} PageDiagnostic
 */
