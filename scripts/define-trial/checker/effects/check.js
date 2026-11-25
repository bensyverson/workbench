// After a record is lowered against the patched Environment (lower.js): the draft's checks that need the Program.
// First the definition checks environment(program) and convention functions defer to here (D021, D022 on what they
// returned). Then each lambda's effects, its helpers' included (lowering lists a callee's effects at the call),
// against its slot's `may` (L004), reads of the slot's own instance always allowed in an instance space; each
// helper's own effects against `helpers.may` (L004 at the helper); and totals, from the syntax tree (L017).

import { matches, parseEffect } from "./effect.js";
import { checkMay, paramProblems, reachProblems } from "./validate.js";
import { totalSites } from "./totals.js";

/** @import { EffectsInfo } from "./strip.js" */
/** @import { Problem, ObjectModel } from "./validate.js" */
/** @import { TotalSite } from "./totals.js" */
/** @import { Environment } from "../../../../kit/lower/environment.js" */
/** @import { LowerResult } from "../../../../kit/lower/index.js" */

/**
 * A diagnostic as the checker's examples.js reports a lowering's: `ref` for a lambda's, `unit` for a helper's, `loc`
 * inside its source.
 * @typedef {{ code: string, severity: "error", message: string, tip: string, loc: { start: { line: number } }, ref?: any, unit?: string }} EffectDiagnostic
 */

/** @typedef {{ effect: string, line: number, site?: TotalSite }} Use */

/** @param {unknown} v @returns {string[]} */
const listOf = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);

/**
 * The checks of one lowered record.
 * @param {import("../../../../kit/define/lower.js").Lowered} lowered
 * @param {EffectsInfo} info
 * @returns {{ problems: Problem[], diagnostics: EffectDiagnostic[] }}
 */
export function checkLowered(lowered, info) {
  const env = lowered.environment;
  const instances = Object.values(info.spaces).filter((x) => x !== null);
  const model = modelOf(env, info);

  /** @type {Problem[]} */
  const problems = [];
  for (const [kind, s] of Object.entries(info.slots)) {
    if (typeof s.space !== "string" || !(s.space in info.spaces)) continue;
    problems.push(...checkMay(s.may, { who: `slot '${kind}'`, instance: info.spaces[s.space], helpers: false, path: ["slots", kind, "may"] }, model, { perProgram: true }));
  }
  if (Array.isArray(info.helpers)) problems.push(...checkMay(info.helpers, { who: "helpers", instance: null, helpers: true, path: ["helpers", "may"] }, model, { perProgram: true }));
  for (const [id, c] of info.current.conventions) {
    if (typeof c.space !== "string" || !(c.space in info.spaces)) continue;
    const path = ["slots", c.kind];
    problems.push(...checkMay(c.may ?? [], { who: `slot '${c.kind}' for ${id}`, instance: info.spaces[c.space], helpers: false, path: [...path, "may"] }, model, { perProgram: true }));
    problems.push(...paramProblems(`${c.kind}' for '${id}`, c.params, info.spaces[c.space], instances, path));
  }
  const added = info.current.added;
  problems.push(...reachProblems({ objects: added.objects, globals: added.globals }, instances).map((p) => ({ ...p, path: ["environment", ...p.path], message: `environment(program) declares ${p.message[0].toLowerCase()}${p.message.slice(1)}` })));
  if (problems.length) return { problems, diagnostics: [] };

  /** @param {string} o */
  const totalsOf = (o) => new Set(Object.entries({ ...(info.objects[o]?.members ?? {}), ...(info.current.members[o] ?? {}) }).filter(([, f]) => f.bump).map(([m]) => m));
  /** @type {Record<string, string>} */
  const globals = {};
  for (const [n, t] of Object.entries(env.globals)) if (typeof t === "object" && "obj" in t && totalsOf(t.obj).size) globals[n] = t.obj;
  /** @param {LowerResult} r */
  const receivers = (r) => ({ globals, params: r.params.map((t) => (typeof t === "object" && "obj" in t && totalsOf(t.obj).size ? t.obj : null)) });

  /** @type {EffectDiagnostic[]} */
  const diagnostics = [];
  const helpers = new Map(lowered.helpers.filter((h) => h.kind === "fn").map((h) => [h.name, h.result]));
  /** @type {Map<string, TotalSite[]>} */
  const sitesOf = new Map();
  /** @param {string} name */
  const helperSites = (name) => {
    if (!sitesOf.has(name)) {
      const r = helpers.get(name);
      sitesOf.set(name, r?.kernel ? totalSites(r.kernel.src, receivers(r), totalsOf) : []);
    }
    return /** @type {TotalSite[]} */ (sitesOf.get(name));
  };
  /** The helpers a unit calls, directly or through others. @param {LowerResult} r */
  const reached = (r) => {
    const out = new Set(), todo = [r];
    while (todo.length) for (const c of /** @type {LowerResult} */ (todo.pop()).calls) {
      const name = c.key.startsWith("$.") ? c.key.slice(2) : null;
      if (name && !out.has(name) && helpers.has(name)) { out.add(name); todo.push(/** @type {LowerResult} */ (helpers.get(name))); }
    }
    return [...out];
  };

  /**
   * A unit's effects in the draft's terms, each with a line in its source; a bad change to a total is L017 at once.
   * @param {LowerResult} r @param {string} src @param {(d: Omit<EffectDiagnostic, "ref" | "unit">) => void} report
   * @returns {Use[]}
   */
  const usesOf = (r, src, report) => {
    const own = totalSites(src, receivers(r), totalsOf);
    const callees = reached(r).flatMap(helperSites);
    const isTotal = (/** @type {{ object?: string, member?: string }} */ p) => p.object !== undefined && p.member !== undefined && totalsOf(p.object).has(p.member);
    /** @type {Use[]} */
    const uses = [];
    for (const e of r.effects) {
      const p = parseEffect(e);
      if (!p || p.verb === "call") continue;
      if ((p.verb === "read" || p.verb === "write") && isTotal(p)) {
        const seen = [...own, ...callees].some((s) => s.object === p.object && s.member === p.member && s.kind !== "read");
        if (p.verb === "write" && !seen) report(l017(lineIn(r, src, e), `${p.object}.${p.member}`, "changed through another name", `${p.object}.${p.member}`));
        continue;
      }
      uses.push({ effect: e, line: lineIn(r, src, e) });
    }
    for (const s of own) {
      if (s.kind === "bad") report(l017(s.loc.start.line, s.text, /** @type {string} */ (s.why), `${s.object}.${s.member}`));
      else uses.push({ effect: `${s.kind} ${s.object}.${s.member}`, line: s.loc.start.line, site: s });
    }
    for (const s of callees) if (s.kind !== "bad") uses.push({ effect: `${s.kind} ${s.object}.${s.member}`, line: lineIn(r, src, `${s.kind === "bump" ? "write" : "read"} ${s.object}.${s.member}`) });
    return uses;
  };

  for (const l of lowered.lambdas) {
    const conv = info.current.conventions.get(l.ref.id);
    const space = conv ? conv.space : info.slots[l.ref.kind]?.space;
    const instance = typeof space === "string" ? info.spaces[space] ?? null : null;
    const may = listOf(conv ? conv.may ?? [] : info.slots[l.ref.kind]?.may);
    const kind = l.ref.kind;
    const report = (/** @type {Omit<EffectDiagnostic, "ref" | "unit">} */ d) => diagnostics.push({ ...d, ref: l.ref });
    const done = new Set();
    for (const u of usesOf(l.result, l.src, report)) {
      if (done.has(u.effect)) continue;
      done.add(u.effect);
      const p = /** @type {{ verb: string, object?: string, member?: string }} */ (parseEffect(u.effect));
      if (p.verb === "read" && instance !== null && p.object === instance) continue;
      if (p.verb === "read" && may.some((m) => matches(m, `bump ${p.object}.${p.member}`)) && p.member !== undefined) {
        report(l017(u.line, u.site?.text ?? `${p.object}.${p.member}`, `read in the ${kind} slot, which bumps it`, `${p.object}.${p.member}`));
        continue;
      }
      if (!may.some((m) => matches(m, u.effect))) report(l004(u.line, `The ${kind} slot`, u.effect, may.length ? `the ${kind} slot may: ${may.map((m) => `"${m}"`).join(", ")}; remove the ${p.verb} from the lambda, or add it to the slot's may if the language allows it` : `the ${kind} slot's may is empty: its lambda changes nothing and reads only what nothing changes`));
    }
  }

  const helperMay = listOf(info.helpers);
  for (const h of lowered.helpers) {
    if (h.kind !== "fn" || !h.result.kernel) continue;
    const report = (/** @type {Omit<EffectDiagnostic, "ref" | "unit">} */ d) => diagnostics.push({ ...d, unit: h.name });
    const done = new Set();
    for (const u of usesOf(h.result, h.result.kernel.src, report)) {
      if (done.has(u.effect) || helperMay.some((m) => matches(m, u.effect))) continue;
      done.add(u.effect);
      report(l004(u.line, `A helper ('${h.name}')`, u.effect, `helpers may: ${helperMay.map((m) => `"${m}"`).join(", ")}${info.helpersDefault ? " (the default: a read of each instance object; list more, such as a total, in helpers: { may: [ … ] })" : ""}: a helper only reads, even when every caller could do more; do the ${u.effect.split(" ")[0]} in the lambda that calls it`));
    }
  }
  return { problems: [], diagnostics };
}

/**
 * The objects a may pattern may name, with what each member is: the Environment's members (the definition's and
 * what environment(program) added), marked writable or a total from the stripped declarations.
 * @param {Environment} env @param {EffectsInfo} info
 * @returns {ObjectModel}
 */
function modelOf(env, info) {
  /** @type {ObjectModel} */
  const out = {};
  for (const o of new Set([...Object.keys(info.objects), ...Object.keys(info.current.members)])) {
    const decl = env.objects[o];
    if (!decl) continue;
    const flags = { ...(info.objects[o]?.members ?? {}), ...(info.current.members[o] ?? {}) };
    out[o] = Object.fromEntries(Object.entries(decl.members).map(([m, d]) => [m, { kind: /** @type {any} */ (d.kind === "value" || d.kind === "fn" || d.kind === "keyed" ? d.kind : "other"), ...(flags[m] ?? {}) }]));
  }
  return out;
}

/**
 * The 1-based line in a unit's source of the innermost IR node that has an effect (a store, a call, a load of
 * state); line 1 when the unit has no kernel or no node has it.
 * @param {LowerResult} r @param {string} src @param {string} effect
 */
function lineIn(r, src, effect) {
  /** @type {[number, number] | null} */
  let best = null;
  /** @param {any} n */
  const walk = (n) => {
    if (n === null || typeof n !== "object") return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    const has = (Array.isArray(n.effects) && n.effects.includes(effect)) || (n.k === "load" && n.place?.store && `read ${n.place.owner}.${n.place.name}` === effect);
    if (has && Array.isArray(n.span) && (!best || n.span[1] - n.span[0] < best[1] - best[0])) best = n.span;
    for (const [k, v] of Object.entries(n)) if (k !== "span" && k !== "t") walk(v);
  };
  if (r.kernel) walk(r.kernel.body);
  if (!best) return 1;
  return src.slice(0, best[0]).split("\n").length;
}

/** @param {number} line @param {string} who @param {string} effect @param {string} tip @returns {Omit<EffectDiagnostic, "ref" | "unit">} */
const l004 = (line, who, effect, tip) => ({ code: "L004", severity: "error", message: `${who} may not '${effect}'.`, tip, loc: { start: { line } } });

/** @param {number} line @param {string} text @param {string} why @param {string} total @returns {Omit<EffectDiagnostic, "ref" | "unit">} */
const l017 = (line, text, why, total) => ({
  code: "L017", severity: "error",
  message: `'${text}' is a total (${total}, bump: true), ${why}; a total changes only by the statement ${text} += <number> or ${text}++, and a slot that bumps it never reads it.`,
  tip: `write ${text} += …; or ${text}++; as a statement of its own, or read the total in a slot that may read it and does not bump it`,
  loc: { start: { line } },
});
