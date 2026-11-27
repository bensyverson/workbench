// The editor stage's DOM (the generated view `editor`): the Program's text in a textarea over a <pre>, with Apply,
// Undo and Redo. Thin: the text, its history and each write are editor.js's; building a text is load.js's reloadText
// and the session's install. A text that changes the composition's parts or wires runs as a new run (`mount`), and
// the editor and its history stay. A draft held while a write lands is rebased onto the written text when the two do
// not meet, else kept and said to be under a changed text; the view answers only the holder it was built for, so an
// earlier load's write or show never reaches a later load's view.

import { h, fill } from "./dom.js";
import { createEditor, rebuildWith, rebaseDraft } from "./editor.js";
import { codeView } from "./views.js";

/** What the panel needs of a load: the host's Current, of which it sets `editor`, and on a remount `loaded`, `elements` and `session`. @typedef {{ loaded: import("./load.js").Loaded, session: any, elements: Map<string, any>, editor: ReturnType<typeof createEditor> | null }} EditorHolder */

/**
 * @param {{
 *   box: () => any,
 *   listed: (source: string, ds: Array<{ code: string, message: string, severity?: string, fix?: string }>) => void,
 *   reload: (loaded: import("./load.js").Loaded, text: string) => Promise<import("./load.js").Loaded>,
 *   mount: (loaded: import("./load.js").Loaded) => Promise<void>,
 * }} o  `box()` the panel's element; `listed` lists refusals; `reload` builds a text on the loaded packages; `mount` starts a run
 */
export function createEditorPanel(o) {
  /**
   * The view and the holder it was built for. `shown` is the text the person's draft was made from, and `under` is
   * set while a write the draft could not take sits under it.
   * @type {{ holder: EditorHolder, area: any, mirror: any, mark: () => void, shown: string, under: boolean } | null}
   */
  let view = null;

  /**
   * The editor's text after a write: an unedited textarea follows it; an edited one gets the write rebased under the
   * person's draft (rebaseDraft), or, when the two edits meet, keeps the draft and says the text changed under it. A
   * holder the view was not built for (an earlier load's) changes nothing.
   * @param {EditorHolder} c @param {boolean} [force]  the person's own Apply, Undo or Redo: the textarea shows the text
   */
  function show(c, force = false) {
    const e = view, edit = c.editor;
    if (!e || !edit || e.holder !== c) return;
    /** @param {string} t */
    const put = (t) => { e.area.value = t; e.mirror.textContent = t + "\n"; };
    if (force || e.area.value === e.shown) { put(edit.text); e.shown = edit.text; e.under = false; }
    else if (edit.text !== e.shown) {
      const r = rebaseDraft(e.shown, e.area.value, edit.text);
      if (r.ok) { put(r.text); e.shown = edit.text; e.under = false; } else e.under = true;
    }
    e.mark();
  }

  /** The editor for a load: its text, Apply, Undo and Redo; a load with no Program text shows it read-only. @param {EditorHolder} c */
  function build(c) {
    const loaded = c.loaded;
    view = null;
    if (!loaded.program || !loaded.source) { fill(o.box(), codeView(loaded.source, loaded.sourceName)); return; }
    const edit = createEditor({
      text: loaded.source,
      recordOf: (part) => c.session?.recordOf(part) ?? {},
      inForce: () => c.session?.textInForce() ?? true,
      rebuild: rebuildWith({
        reload: (text) => o.reload(c.loaded, text),
        current: () => c,
        remount: async (next, why) => {
          o.listed("editor", [{ code: "LOAD", severity: "warning", message: `${why}: the page started a new run on the edited text` }]);
          c.session?.stop();
          c.loaded = next;
          c.elements = new Map();
          await o.mount(next);
        },
      }),
    });
    c.editor = edit;
    const area = h("textarea", { class: "editor-text", spellcheck: "false", "aria-label": "the Program's text", oninput: () => { mirror.textContent = area.value + "\n"; mark(); } });
    const mirror = h("pre", { class: "editor-pre", "aria-hidden": "true" });
    const note = h("span", { class: "dim" });
    /** @param {Promise<import("./editor.js").Outcome>} p */
    const after = (p) => p.then((r) => { if (!r.ok) o.listed("editor", r.diagnostics); show(c, true); });
    const buttons = {
      apply: h("button", { class: "btn sm", title: "build the text and run it (one undo step)", onclick: () => after(edit.apply(area.value)) }, "Apply"),
      undo: h("button", { class: "btn sm", onclick: () => after(edit.undo()) }, "Undo"),
      redo: h("button", { class: "btn sm", onclick: () => after(edit.redo()) }, "Redo"),
    };
    const mark = () => {
      const now = c.editor ?? edit;
      note.textContent = area.value === now.text ? "" : view?.under ? "edited, and the text changed under this draft (a write-back): Apply builds the draft as it is, over that write" : "edited: Apply builds it";
      buttons.undo.disabled = !now.canUndo; buttons.redo.disabled = !now.canRedo;
    };
    view = { holder: c, area, mirror, mark, shown: edit.text, under: false };
    fill(o.box(), h("div", { class: "editor-bar" }, buttons.apply, buttons.undo, buttons.redo, note), h("div", { class: "editor" }, mirror, area));
    show(c, true);
  }

  /**
   * A release written back (the session's onCommit): one undo step, or its refusal listed.
   * @param {EditorHolder} c @param {import("./editor.js").Commit} commit
   */
  const write = (c, commit) => {
    // an earlier load's session or element may still commit: its holder is not the view's, and the write is dropped
    if (view?.holder !== c) return;
    c.editor?.write(commit).then((r) => { if (!r.ok) o.listed("editor", r.diagnostics); show(c); });
  };

  return { build, show, write };
}
