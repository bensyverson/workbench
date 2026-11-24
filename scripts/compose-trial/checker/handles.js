// What the stand-in dialects hand back to a program while it builds: part handles whose methods record
// calls, output handles (`part.out.x`) that refuse to be read at build time, the parameters object, and a
// "poison" value that stands in after a reported mistake so one slip does not cascade.

import { didYouMean } from "../../../kit/lower/codes.js";
import { session, callSite } from "./session.js";
import { bindingAt, callArgs } from "./source.js";

/** @import { Site, LambdaRec } from "./session.js" */
/** @import { SeamType } from "./types.js" */

const TARGET = Symbol("target");
const POISON = Symbol("poison");

/** The checker's object behind a handle the program holds, or null. @param {unknown} v */
export function unwrap(v) {
  if ((typeof v === "object" || typeof v === "function") && v !== null) {
    try { return /** @type {any} */ (v)[TARGET] ?? null; } catch { return null; }
  }
  return null;
}

/** Whether a value stands in for a mistake already reported. @param {unknown} v */
export function isPoison(v) {
  return typeof v === "function" && /** @type {any} */ (v)[POISON] === true;
}

/**
 * A value that absorbs anything done to it: calling it returns `ret` (so a builder chain continues),
 * reading from it gives more poison, and it coerces to 0.
 * @param {unknown} [ret]
 * @returns {any}
 */
export function poison(ret) {
  /** @type {any} */
  const p = new Proxy(function () {}, {
    apply: () => ret ?? p,
    get: (_t, k) => {
      if (k === POISON) return true;
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === Symbol.iterator) return function* () {};
      if (k === "then" || typeof k === "symbol") return undefined;
      return p;
    },
  });
  return p;
}

/** One output handle, `part.out.<name>`, as taken during the build. */
export class OutHandle {
  /** @param {Part} part @param {string} name @param {Site} site */
  constructor(part, name, site) {
    this.part = part;
    this.name = name;
    this.site = site;
    /** Set once the build-time read has been reported, so it is reported once. */
    this.reported = false;
  }

  get text() { return `${this.part.label}.out.${this.name}`; }

  /** The output's type, or null when the part has no such output. @returns {SeamType | null} */
  get type() { return this.part.outputs().get(this.name) ?? null; }

  /** The program read this output at build time (arithmetic, a comparison, a field, a loop). @param {string} how */
  readAtBuild(how) {
    const site = callSite();
    if (this.reported && session.has(site, "S301")) return;
    this.reported = true;
    session.add("S301", site, `${this.text} is known only at run time, but it was read at build time (${how}).`, buildReadFix(site, this.text));
  }

  /** @returns {any} */
  proxy() {
    return new Proxy(this, {
      get: (t, k) => {
        if (k === TARGET) return t;
        if (k === Symbol.toPrimitive) return () => { t.readAtBuild("in arithmetic or a comparison"); return 0; };
        if (k === Symbol.iterator) return function* () { t.readAtBuild("in a loop"); };
        if (k === "then" || typeof k === "symbol") return undefined;
        t.readAtBuild(`its .${String(k)}`);
        return poison();
      },
    });
  }
}

/**
 * The fix for an output read at build time on a line: the lambda form of the slot it flows into, when that
 * slot has one.
 * @param {Site} site @param {string} what
 */
function buildReadFix(site, what) {
  const text = session.lineText(site);
  for (const m of text.matchAll(/\.(\w+)\(/g)) {
    const args = callArgs(text, m[1]);
    if (args && args.includes(".out.") && LAMBDA_SLOTS.has(m[1])) return `write the argument as a lambda, which runs while the program runs: .${m[1]}(() => ${args})`;
  }
  return `${what} has a value only while the program runs: read it inside a runtime lambda, or use a parameter or a constant here`;
}

/** Slots that take `value | () => value` (cave.seed, glow.tint). */
export const LAMBDA_SLOTS = new Set(["seed", "tint"]);

/**
 * A builder method: what it does with its arguments, and whether it may be called once.
 * @typedef {object} MethodSpec
 * @property {boolean} [once]
 * @property {boolean} [perKey]  may be called once per value of its first argument
 * @property {(args: unknown[], ctx: Ctx) => void} fn
 */

/** @typedef {{ owner: Builder, method: string, site: Site }} Ctx */

/** Common to part and actor handles: recorded calls, and a proxy that routes method calls. */
class Builder {
  /** @param {string} name @param {Site} site @param {string} factory */
  constructor(name, site, factory) {
    this.name = name;
    this.site = site;
    const scan = session.scan;
    /** The top-level const it is bound to, or null. */
    this.binding = scan ? bindingAt(scan, site.line, factory)?.name ?? null : null;
    /** @type {Map<string, Array<{ args: unknown[], site: Site }>>} */
    this.calls = new Map();
    /** @type {any} */
    this.handle = null;
  }

  get label() { return this.binding ?? this.name; }

  /** @returns {Record<string, MethodSpec>} */
  methods() { return {}; }

  /** Names a program might mistake for members of this object, with what to say. @param {string} _k @returns {{ code: string, message: string, fix: string } | null} */
  misread(_k) { return null; }

  /** @param {string} m */
  called(m) { return this.calls.has(m); }

  /** @param {string} m */
  first(m) { return this.calls.get(m)?.[0]; }

  /** @returns {any} */
  proxy() {
    if (this.handle) return this.handle;
    const methods = this.methods();
    this.handle = new Proxy(this, {
      get: (t, k) => {
        if (k === TARGET) return t;
        if (k === "then" || typeof k === "symbol") return undefined;
        const name = String(k);
        if (name === "out" && t instanceof Part) return t.outProxy();
        const spec = Object.hasOwn(methods, name) ? methods[name] : null;
        const site = callSite();
        if (spec) {
          return (/** @type {unknown[]} */ ...args) => {
            const at = callSite();
            const prior = t.calls.get(name) ?? [];
            const key = args[0];
            if (spec.once && prior.length) session.add("D004", at, `${t.label}.${name}() may be called once; it was already called at line ${prior[0].site.line}.`, `remove one of the two .${name}() calls`);
            else if (spec.perKey && prior.some((p) => p.args[0] === key)) session.add("D004", at, `${t.label}.${name}(${JSON.stringify(key)}) is declared twice.`, `declare each ${name} once`);
            prior.push({ args, site: at });
            t.calls.set(name, prior);
            spec.fn(args, { owner: t, method: name, site: at });
            return t.handle;
          };
        }
        const mis = t.misread(name);
        if (mis) { session.add(mis.code, site, mis.message, mis.fix); return poison(t.handle); }
        session.add("D001", site, `${t.label} has no method '${name}'.${didYouMean(name, Object.keys(methods))}`, `the methods are ${Object.keys(methods).join(", ")} (see the reference)`);
        return poison(t.handle);
      },
    });
    return this.handle;
  }
}

/** A part: one dialect's instance in the program. */
export class Part extends Builder {
  /**
   * @param {"cave" | "tiles" | "glow"} dialect @param {string} name @param {Site} site
   * @param {{ clock: string, target: "cpu" | "gpu" }} info
   */
  constructor(dialect, name, site, info) {
    super(name, site, dialect);
    this.dialect = dialect;
    this.clock = info.clock;
    this.target = info.target;
    /** @type {Array<{ handle: unknown, mode: unknown, site: Site }>} */
    this.samples = [];
    /** @type {Array<{ slot: string, handle: OutHandle, site: Site }>} connections to other parts' outputs */
    this.connections = [];
    session.parts.push(this);
  }

  /** @returns {Map<string, SeamType>} */
  outputs() { return new Map(); }

  /** Checks once the whole program has been built: required calls, shapes, values. */
  finalize() {}

  /** @returns {Record<string, MethodSpec>} */
  methods() {
    return {
      sample: { fn: (args, ctx) => { this.samples.push({ handle: args[0], mode: args[1], site: ctx.site }); } },
    };
  }

  /** @param {string} k */
  misread(k) {
    if (k === "clock") return { code: "D001", message: `${this.label} has no method 'clock': a part's clock is set by its dialect (${this.dialect}: ${this.clock}).`, fix: "remove the .clock() call" };
    if (this.outputs().has(k)) return { code: "S312", message: `${this.label}.${k} reaches into part '${this.label}'; parts meet only through outputs.`, fix: `read the output: ${this.label}.out.${k}` };
    if (this.internals().includes(k)) return { code: "S312", message: `${this.label}.${k} is inside part '${this.label}'; parts meet only through outputs.`, fix: this.exportFix(k) };
    return null;
  }

  /** Names inside the part a program might reach for. @returns {string[]} */
  internals() { return []; }

  /** How to make an internal value readable by other parts. @param {string} k */
  exportFix(k) { return `read one of ${this.label}'s outputs (${[...this.outputs().keys()].join(", ")}) instead of ${k}`; }

  /** @returns {any} */
  outProxy() {
    return new Proxy({}, {
      get: (_t, k) => {
        if (k === "then" || typeof k === "symbol") return undefined;
        const site = callSite();
        if (k === "events" && this.dialect === "tiles") {
          return new Proxy({}, { get: (_u, e) => (typeof e === "symbol" || e === "then" ? undefined : this.takeHandle(`events.${String(e)}`, callSite())) });
        }
        return this.takeHandle(String(k), site);
      },
    });
  }

  /** @param {string} name @param {Site} site */
  takeHandle(name, site) {
    const h = new OutHandle(this, name, site);
    session.handles.push(h);
    return h.proxy();
  }

  /**
   * Records a runtime lambda this part runs.
   * @param {unknown} fn @param {Ctx} ctx @param {string} slot @param {string[]} roles
   * @param {Partial<LambdaRec>} [extra]
   */
  lambda(fn, ctx, slot, roles, extra = {}) {
    if (typeof fn !== "function") return false;
    session.lambdas.push({ fn, site: ctx.site, part: this, actor: null, slot, roles, ...extra });
    return true;
  }
}

/** A tiles actor kind. */
export class Actor extends Builder {
  /** @param {string} name @param {Site} site */
  constructor(name, site) {
    super(name, site, "actor");
    /** @type {Map<string, SeamType>} */
    this.fields = new Map();
    /** @type {Part | null} the tiles part that spawns it */
    this.part = null;
    session.actors.push(this);
  }
}

/** The parameters object, `params({…})`. */
export class Params {
  /** @param {Record<string, { default: number }>} specs @param {Site} site */
  constructor(specs, site) {
    this.specs = specs;
    this.site = site;
    this.binding = session.scan ? bindingAt(session.scan, site.line, "params")?.name ?? null : null;
  }

  /** @returns {any} */
  proxy() {
    return new Proxy(this, {
      get: (t, k) => {
        if (k === TARGET) return t;
        if (k === "then" || typeof k === "symbol") return undefined;
        const name = String(k);
        if (!Object.hasOwn(t.specs, name)) {
          session.add("C004", callSite(), `there is no parameter '${name}'.${didYouMean(name, Object.keys(t.specs))}`, `declare it in params({ … }), or use one of ${Object.keys(t.specs).join(", ")}`);
          return 0;
        }
        session.buildParamReads.add(name);
        return t.specs[name].default;
      },
    });
  }
}

/** The program, `program(title)`. */
export class Program {
  /** @param {unknown} title @param {Site} site */
  constructor(title, site) {
    this.title = title;
    this.site = site;
    /** @type {Array<{ part: unknown, site: Site }>} */
    this.shows = [];
    session.programs.push(this);
  }

  /** @returns {any} */
  proxy() {
    /** @type {any} */
    const handle = new Proxy(this, {
      get: (t, k) => {
        if (k === TARGET) return t;
        if (k === "then" || typeof k === "symbol") return undefined;
        if (k === "show") return (/** @type {unknown} */ part) => { t.shows.push({ part, site: callSite() }); return handle; };
        session.add("D001", callSite(), `program has no method '${String(k)}'.${didYouMean(String(k), ["show"])}`, "a program has one method, .show(part)");
        return poison(handle);
      },
    });
    return handle;
  }
}
