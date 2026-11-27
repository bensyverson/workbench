// The Program text's history (project/2026-11-27-controls-draft.md, requirement 8): a release, an action's edits or an
// applied edit is one step. An undo gives the previous text, which the host builds and logs as a rebuild (an undo is
// an edit, not a rewind); a new edit after an undo drops the redo. Pure.

/** @param {string} text  the text as it is */
export function createHistory(text) {
  /** @type {string[]} */
  const before = [];
  /** @type {string[]} */
  const after = [];
  let now = text;
  return {
    get text() { return now; },
    get canUndo() { return before.length > 0; },
    get canRedo() { return after.length > 0; },
    /** A new text, one step; the same text is no step. @param {string} next */
    commit(next) { if (next === now) return; before.push(now); now = next; after.length = 0; },
    /** The previous text, or null at the first. @returns {string | null} */
    undo() { if (!before.length) return null; after.push(now); now = /** @type {string} */ (before.pop()); return now; },
    /** The next text, or null when there is none. @returns {string | null} */
    redo() { if (!after.length) return null; before.push(now); now = /** @type {string} */ (after.pop()); return now; },
  };
}
