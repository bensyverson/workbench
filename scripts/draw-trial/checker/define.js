// The `kit/define` a draw-trial hand-in imports: the UI trial's (the real kit/define with its defineUI stand-in),
// with `Draw` emulated. defineDialect takes each `Draw<max>@frame` port, and the `colors` and `images` keys, out of
// the definition into `draws` (by Dialect name), and puts back in each Draw port's place an Event port of
// `{ at: point2@<frame> }`: a port the real kit accepts, which kit/compose then checks for wires (S111, S112),
// frame paths (S251) and plans with the frame edge the checker converts each op by. An Event port pushes nothing
// unless a runtime does, so a run is unchanged; defineRuntime adds the events maxes the stand-in ports need.

import { defineDialect as uiDefineDialect, defineRuntime as kitDefineRuntime } from "../../ui-trial/checker/define.js";
import { parseDrawSeam } from "./ops.js";

export * from "../../ui-trial/checker/define.js";

/** The most records a stand-in Draw input takes a step: never reached, since nothing pushes them. */
export const STAND_IN_TAKES = 1000;
/** The note a stand-in port gets when the author wrote none (W002 says so). */
const NO_NOTE = "(no note)";

/**
 * What one Dialect declared for Draw: its Draw ports (raw declaration, max, frame), colors, images, raw state and
 * globals, and each problem found taking them out (W002).
 * @typedef {{ name: string, outs: Record<string, { port: any, max: number, frame: string }>, ins: Record<string, { port: any, max: number, frame: string }>,
 *   colors: Record<string, string>, images: Record<string, any>, rawPaint: { colors?: unknown, images?: unknown }, state: Record<string, any>, globals: string[], params: string | null, inputs: string | null,
 *   problems: Array<{ port?: string, message: string }> }} DrawDecl
 */

/** @type {Map<string, DrawDecl>} */
export const draws = new Map();

/** The definition with its Draw ports, colors and images taken out into `draws`. @param {any} def */
export function takeDraws(def) {
  if (!def || typeof def !== "object") return def;
  const { colors, images, ...rest } = def;
  /** @type {DrawDecl} */
  const decl = {
    name: String(def.name), outs: {}, ins: {}, colors: isObj(colors) ? colors : {}, images: isObj(images) ? images : {}, rawPaint: { colors, images },
    state: isObj(def.state) ? def.state : {}, globals: Object.keys(isObj(def.globals) ? def.globals : {}),
    params: def.params?.name ?? null, inputs: def.inputs?.name ?? null, problems: [],
  };
  if (isObj(def.ports)) {
    const ports = { ...def.ports };
    for (const side of /** @type {const} */ (["out", "in"])) {
      if (!isObj(ports[side])) continue;
      const kept = { ...ports[side] };
      for (const [name, port] of Object.entries(ports[side])) {
        const parsed = isObj(port) && typeof port.seam === "string" ? parseDrawSeam(port.seam) : null;
        if (!parsed) continue;
        delete kept[name];
        if ("error" in parsed) { decl.problems.push({ port: name, message: `${side === "out" ? "output" : "input"} '${name}': ${parsed.error}` }); continue; }
        const frame = isObj(def.frames) ? def.frames[parsed.frame] : undefined;
        if (!frame) { decl.problems.push({ port: name, message: `${side === "out" ? "output" : "input"} '${name}': ${parsed.frame} is not one of your frames (${Object.keys(def.frames ?? {}).join(", ") || "none"})` }); continue; }
        if (frame.dims !== 2) { decl.problems.push({ port: name, message: `${side === "out" ? "output" : "input"} '${name}': a draw list is measured in a 2-D frame, and ${parsed.frame} has dims ${frame.dims}` }); continue; }
        if (typeof port.note !== "string" || !port.note.trim()) decl.problems.push({ port: name, message: `${side === "out" ? "output" : "input"} '${name}' has no note: say what is drawn and in which frame` });
        if (side === "in") for (const k of Object.keys(port)) if (!["seam", "note"].includes(k)) decl.problems.push({ port: name, message: `input '${name}': a Draw input takes only seam and note, not '${k}'` });
        decl[side === "out" ? "outs" : "ins"][name] = { port, max: parsed.max, frame: parsed.frame };
        kept[name] = { seam: `Event<{ at: point2@${parsed.frame} }>`, note: typeof port.note === "string" && port.note.trim() ? port.note : NO_NOTE };
      }
      ports[side] = kept;
    }
    rest.ports = ports;
  }
  draws.set(decl.name, decl);
  return rest;
}

/** @param {unknown} v @returns {v is Record<string, any>} */
function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }

/** defineDialect with Draw emulated. @param {any} def */
export function defineDialect(def) {
  return uiDefineDialect(takeDraws(def));
}

/**
 * defineRuntime with the events maxes the stand-in Draw ports need (an output 1, an input STAND_IN_TAKES), so an
 * author never lists a Draw port in events.
 * @param {any} grammar @param {any} rt
 */
export function defineRuntime(grammar, rt) {
  const decl = draws.get(String(grammar?.dialect?.name));
  if (!decl || !rt || typeof rt !== "object") return kitDefineRuntime(grammar, rt);
  const events = { out: { ...(rt.events?.out ?? {}) }, in: { ...(rt.events?.in ?? {}) } };
  for (const n of Object.keys(decl.outs)) events.out[n] = 1;
  for (const n of Object.keys(decl.ins)) events.in[n] = STAND_IN_TAKES;
  return kitDefineRuntime(grammar, { ...rt, events });
}
