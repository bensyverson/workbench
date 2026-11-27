// kit/page's codes: W… is a page diagnostic, something the page cannot show as the composition asks, reported for
// the host to show and never dropped silently. W is reserved for the kit (kit/define's RESERVED_LETTERS).

/** Each code and what it means. */
export const PAGE_CODES = Object.freeze({
  W001: "The composition's renderer profile refuses the shown list as it stands, at draw time (kit/draw's checkDraw: J040–J044); the page draws it anyway, on Canvas",
  W002: "Nothing to draw: the composition shows no part, or the shown part has no Draw output (a custom element stage, or the text view)",
  W003: "An image's pixels are not available: its file is not in a loaded package, or the host's decoder failed on it; it draws as its box",
});

/**
 * One page diagnostic: its code, the instant (rational text) and, when it is about one, the part.
 * @typedef {{ code: keyof typeof PAGE_CODES, severity: "error" | "warning", message: string, T: string, part?: string, check?: Array<{ code: string, message: string }> }} PageDiagnostic
 */
