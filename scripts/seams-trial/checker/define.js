// The `kit/define` a seams trial hand-in imports: the UI trial's (the real kit/define, with a defineUI that
// records its call), with defineDialect and defineGrammar wrapped to take the draft's additions. defineDialect
// strips `ports`, `frames`, `edges` and `inputs`, judges them (D024–D030), fills the inputs object's members
// through environment(program), and passes the rest to the kit. defineGrammar fills the `in` namespace a
// ref("in") names, gives every builder its handles, and makes lower(record) judge the seams against the
// Program too. Everything else is the kit's own.

import { defineDialect as kitDefineDialect, defineGrammar as kitDefineGrammar, DefinitionError } from "../../../kit/define/index.js";
import { programOf } from "../../../kit/define/grammar.js";
import { callSite } from "../../../kit/define/site.js";
import { TAG, kindOf } from "../../../kit/define/tags.js";
import { declare, against, SEAM_KEYS } from "./ports.js";
import { lowerPorts } from "./port-lower.js";
import { wrapChain } from "./handles.js";
import { dialects, builders, programs, registry } from "./registry.js";
import { hideStandInFrames } from "./stack.js";

export * from "../../ui-trial/checker/define.js";

hideStandInFrames();

/** @import { Seams } from "./ports.js" */
/** @typedef {{ code: string, path: Array<string | number>, message: string, tip: string, line?: number }} Problem */

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && !(TAG in v);

/**
 * Throws one DefinitionError with the kit's diagnostics and the stand-in's, and records it for the checker.
 * @param {string} what @param {unknown} decl @param {any[]} kit @param {Problem[]} own
 */
function refuseAll(what, decl, kit, own) {
  if (!kit.length && !own.length) return;
  const { file, loc } = callSite();
  const diagnostics = [...kit, ...own.map((p) => ({ ...p, severity: /** @type {const} */ ("error"), file, loc }))];
  registry.refusals.push({ what, decl, diagnostics });
  throw new DefinitionError(what, diagnostics);
}

/** @param {() => unknown} f @returns {{ value: any, refused: any[] }} */
function attempt(f) {
  try { return { value: f(), refused: [] }; } catch (e) {
    if (e instanceof DefinitionError) return { value: null, refused: /** @type {any} */ (e).diagnostics };
    throw e;
  }
}

/**
 * defineDialect with the draft's ports, frames, edges and inputs.
 * @param {any} def
 */
export function defineDialect(def) {
  if (!isObj(def)) return kitDefineDialect(def);
  const rest = Object.fromEntries(Object.entries(def).filter(([k]) => !SEAM_KEYS.includes(k)));
  const { problems, seams, members } = declare(def);
  if (seams.inputs && Object.keys(members).length) {
    const { object } = seams.inputs;
    const own = typeof def.environment === "function" ? def.environment : null;
    rest.environment = (/** @type {any} */ program, /** @type {any} */ states) => {
      const env = own ? own.call(def, program, states) ?? {} : {};
      const objects = { ...(env.objects ?? {}) };
      objects[object] = { ...(objects[object] ?? {}), members: { ...(objects[object]?.members ?? {}), ...members } };
      return { ...env, objects };
    };
  }
  const { value: dialect, refused } = attempt(() => kitDefineDialect(/** @type {any} */ (rest)));
  const own = dialect ? [...problems, ...against(seams, dialect)] : problems;
  refuseAll("defineDialect", def, refused, own);
  dialects.set(dialect, { seams, file: callSite().file });
  return dialect;
}

/** Every ref(ns) and name(ns) tag anywhere in a Grammar declaration's specs. @param {unknown} v @param {Set<unknown>} [seen] */
function tagsIn(v, seen = new Set()) {
  /** @type {Array<{ tag: string, ns: unknown }>} */
  const out = [];
  if (v === null || typeof v !== "object" || seen.has(v)) return out;
  seen.add(v);
  const k = kindOf(v);
  if (k === "ref" || k === "name") out.push({ tag: k, ns: /** @type {any} */ (v).ns });
  for (const x of Object.values(v)) out.push(...tagsIn(x, seen));
  return out;
}

/** The ports and frames of a Dialect, by side, for its handles. @param {Seams | undefined} s */
const namesOf = (s) => ({ out: Object.keys(s?.out ?? {}), in: Object.keys(s?.in ?? {}), frame: Object.keys(s?.frames ?? {}) });

/**
 * defineGrammar whose builders answer the handles, whose ref("in") names the Dialect's inputs, and whose
 * lower(record) judges the seams against the Program.
 * @param {any} dialect @param {any} def
 */
export function defineGrammar(dialect, def) {
  const entry = dialect && typeof dialect === "object" ? dialects.get(dialect) : undefined;
  /** @type {Seams} */
  const seams = entry?.seams ?? { out: {}, in: {}, frames: {}, edges: null, inputs: null };
  /** @type {Problem[]} */
  const own = [];
  if (isObj(def) && isObj(def.constructs)) {
    const tags = tagsIn(def.constructs);
    if (tags.some((t) => t.tag === "ref" && t.ns === "in") && !Object.keys(seams.in).length) own.push({ code: "D031", path: ["constructs"], message: `a ref("in") names one of the Dialect's inputs, and the ${String(dialect?.name ?? "")} Dialect declares no ports.in`, tip: 'declare the input in defineDialect: ports: { in: { burst: { seam: "Event<{ … }>", note: "…" } } }' });
    if (tags.some((t) => t.tag === "name" && t.ns === "in")) own.push({ code: "D031", path: ["constructs"], message: `a name("in") declares into the namespace the kit fills from ports.in`, tip: "use another namespace" });
    for (const [cn, c] of Object.entries(def.constructs)) {
      if (["out", "in", "frame"].includes(cn) && isObj(c) && c.parent !== undefined) own.push({ code: "D031", path: ["constructs", cn], message: `the child construct '${cn}' would be a method named like the handles every builder gains (.out, .in, .frame)`, tip: `rename '${cn}'` });
      for (const sn of Object.keys(isObj(c) && isObj(c.slots) ? c.slots : {})) if (["out", "in", "frame"].includes(sn)) own.push({ code: "D031", path: ["constructs", cn, "slots", sn], message: `construct '${cn}': the slot '${sn}' is named like the handles every builder gains (.out, .in, .frame)`, tip: `rename '${sn}'` });
    }
  }
  const { value: real, refused } = attempt(() => kitDefineGrammar(dialect, def));
  refuseAll("defineGrammar", def, refused, own);
  const names = namesOf(seams);
  const inNames = Object.keys(seams.in);
  const builder = (/** @type {unknown[]} */ ...args) => {
    const chain = real(...args);
    const program = programOf(chain);
    if (program) {
      if (inNames.length) /** @type {any} */ (program).names.set("in", new Set(inNames));
      programs.set(program, builder);
    }
    return wrapChain(chain, names);
  };
  Object.assign(builder, {
    dialect: real.dialect,
    grammar: real.grammar,
    /** The kit's lowering, then the seams' (port-lower.js). @param {Record<string, any>} record */
    lower: (record) => {
      const lowered = real.lower(record);
      const extra = lowerPorts(dialect, seams, record).diagnostics;
      return extra.length ? { ...lowered, diagnostics: [...lowered.diagnostics, ...extra] } : lowered;
    },
  });
  builders.set(builder, { dialect, seams, grammar: def });
  return builder;
}
