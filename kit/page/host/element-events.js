// A custom element stage's events (project/2026-11-27-controls-draft.md, "In a composition"): it speaks the targets the
// host's own widgets do, `wb-control` ({ control, value }), `wb-param` ({ param, value, phase }) and `wb-edit`
// ({ to, value, phase }). Each is checked against the declarations, then logged, or refused with the kit's own code:
// N013 (a Control the page lacks), N012 (a record that does not fit), H011 (a target that cannot be written), N008 (a
// param value outside its declaration, the run's), H012 (an argument's value that does not build). A `preview` plays
// and commits nothing; a `commit` (the default) also hands the session's onCommit what to write back. An argument's
// previews are built at most once a frame, the latest of each target. The session's seams come in as functions; no DOM.

/** @typedef {{ code: string, severity: "error" | "warning", message: string, fix?: string }} Refusal */

/** The events a custom element stage may dispatch. */
export const ELEMENT_EVENTS = Object.freeze(["wb-control", "wb-param", "wb-edit"]);

/**
 * @typedef {{
 *   shown: () => string,
 *   controls: () => Array<{ name: string }>,
 *   control: (name: string, record: Record<string, unknown>, event: { phase?: "preview" | "commit" }) => Array<{ code: string, message: string }>,
 *   setParam: (part: string, name: string, value: any) => Array<{ code: string, message: string }>,
 *   writeProblem: (part: string, to: string) => { code: string, message: string, fix?: string } | null,
 *   declares: (part: string, name: string) => boolean,
 *   build: (part: string, to: string, value: unknown) => Record<string, any>,
 *   logRebuild: (part: string, record: Record<string, any>, phase: "preview" | "commit") => void,
 *   commit: (c: { part: string, to: string, value: unknown }) => void,
 *   refused: (r: Refusal) => void,
 * }} ElementSeams
 */

/** @param {string} code @param {string} message @param {string} [fix] @returns {Refusal} */
const no = (code, message, fix) => ({ code, severity: code === "H011" ? "warning" : "error", message, ...(fix ? { fix } : {}) });
/** @param {unknown} e */
const messageOf = (e) => (e instanceof Error ? e.message : String(e));
/** @param {unknown} phase */
const phaseOf = (phase) => (phase === "preview" ? "preview" : "commit");

/** @param {ElementSeams} s */
export function createElementEvents(s) {
  /** An argument's previews waiting for the next frame, the latest of each target. @type {Map<string, { part: string, to: string, value: unknown }>} */
  const waiting = new Map();
  /** The previews that failed, said once until one builds again. */
  const failing = new Set();

  /** Builds and logs a part with an argument overridden; the refusal, or null. @param {string} part @param {string} to @param {unknown} value @param {"preview" | "commit"} phase */
  const rebuild = (part, to, value, phase) => {
    try {
      const record = s.build(part, to, value);
      if (record === null || typeof record !== "object") throw new Error("its build gave no record (the Program refused the value)");
      s.logRebuild(part, record, phase);
      failing.delete(`${part} ${to}`);
      return null;
    } catch (e) {
      return no("H012", `the custom element's ${to} = ${JSON.stringify(value)} of part ${part} does not build, so it is not kept: ${messageOf(e)}`, "send a value the Program accepts");
    }
  };

  /** @param {string} part @param {string} name @param {unknown} value @param {"preview" | "commit"} phase @returns {Refusal[]} */
  function param(part, name, value, phase) {
    const to = `param.${name}`;
    // a param the Program does not declare is no target; one it declares but cannot write back still plays
    if (!s.declares(part, name)) return [no("H011", `a custom element's wb-param names ${name}, and part ${part}'s Program declares no param '${name}'`, "name a param the Program declares")];
    const problem = s.writeProblem(part, to);
    if (typeof value !== "number" && typeof value !== "string" && typeof value !== "boolean") return [no("N008", `a custom element's wb-param ${name} = ${JSON.stringify(value)} is not a param value (a number, a string or a boolean)`)];
    const refused = s.setParam(part, name, value);
    if (refused.length) return refused.map((d) => no(d.code, d.message));
    if (phase === "preview") return [];
    if (problem) return [no("H011", `the custom element's wb-param ${name} plays, and cannot be written back: ${problem.message}`, problem.fix)];
    s.commit({ part, to, value });
    return [];
  }

  return {
    /**
     * One event a custom element stage dispatched (its `type` and `detail`): the refusals, empty when it was taken.
     * @param {string} type @param {any} detail @returns {Refusal[]}
     */
    handle(type, detail) {
      const d = detail ?? {};
      const phase = phaseOf(d.phase);
      const part = s.shown();
      if (type === "wb-control") {
        if (!s.controls().some((c) => c.name === d.control)) return [no("N013", `a custom element's wb-control names the Control ${JSON.stringify(d.control)}, which the page lacks: its Controls are ${s.controls().map((c) => c.name).join(", ") || "none"}`)];
        if (d.value === null || typeof d.value !== "object" || Array.isArray(d.value)) return [no("N012", `a custom element's wb-control ${d.control} sent ${JSON.stringify(d.value)}, and a Control's value is its record (an object)`)];
        try { return s.control(d.control, d.value, { phase }).map((x) => no(x.code, x.message)); } catch (e) {
          const m = messageOf(e);
          const code = /^H01[12] /.test(m) ? m.slice(0, 4) : "N012";
          return [no(code, `a custom element's wb-control ${d.control}: ${code === "N012" ? m : m.slice(5)}`)];
        }
      }
      if (type === "wb-param") return param(part, String(d.param), d.value, phase);
      if (type === "wb-edit") {
        const to = String(d.to);
        if (to.startsWith("param.")) return param(part, to.slice(6), d.value, phase);
        const problem = to.startsWith("arg.") ? s.writeProblem(part, to) : { code: "H011", message: `the target ${JSON.stringify(d.to)} is neither "param.<name>" nor "arg.<address>"` };
        if (problem) return [no("H011", `a custom element's wb-edit of part ${part}: ${problem.message}`, problem.fix)];
        if (phase === "preview") { waiting.set(`${part} ${to}`, { part, to, value: d.value }); return []; }
        waiting.delete(`${part} ${to}`);
        const refused = rebuild(part, to, d.value, "commit");
        if (refused) return [refused];
        s.commit({ part, to, value: d.value });
        return [];
      }
      return [];
    },
    /** Builds what the previews left waiting: the session calls it once a frame. A failure is said once, with its own code (`refused`). */
    flush() {
      const all = [...waiting.values()];
      waiting.clear();
      for (const w of all) {
        const r = rebuild(w.part, w.to, w.value, "preview");
        const key = `${w.part} ${w.to}`;
        if (r && !failing.has(key)) { failing.add(key); s.refused(r); }
      }
    },
  };
}
