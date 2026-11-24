// The stand-in for the `glow` dialect (docs/glow.md).

import { session, callSite } from "../session.js";
import { Part, OutHandle, isPoison, unwrap } from "../handles.js";
import * as arg from "../args.js";

/** @import { MethodSpec } from "../handles.js" */
/** @import { SeamType } from "../types.js" */
/** @import { Site } from "../session.js" */

export const PIXEL_MEMBERS = ["xy", "uv", "size", "color", "t"];

export class GlowPart extends Part {
  /** @param {string} name @param {Site} site */
  constructor(name, site) {
    super("glow", name, site, { clock: "frame", target: "gpu" });
    /** @type {{ handle: OutHandle, site: Site } | null} */
    this.over = null;
  }

  /** @returns {Record<string, MethodSpec>} */
  methods() {
    return {
      ...super.methods(),
      over: { once: true, fn: ([image], ctx) => {
        const h = arg.connect(image, ctx, "the image", "Image@px");
        if (h) { this.over = { handle: h, site: ctx.site }; this.connections.push({ slot: "over", handle: h, site: ctx.site }); }
      } },
      size: { once: true, fn: ([w, h], ctx) => { arg.num(w, ctx, "width", { min: 16, max: 4096 }) && arg.num(h, ctx, "height", { min: 16, max: 4096 }); } },
      light: { once: true, fn: ([f], ctx) => { if (arg.fn(f, ctx, "the light kernel", "p => vec3")) this.lambda(f, ctx, "glow.light", ["pixel"]); } },
      tint: { once: true, fn: ([rgb], ctx) => {
        if (typeof rgb === "function") { this.lambda(rgb, ctx, "glow.tint", []); return; }
        if (isPoison(rgb) || (Array.isArray(rgb) && rgb.length === 3 && rgb.every((x) => typeof x === "number"))) return;
        if (unwrap(rgb) instanceof OutHandle) { arg.num(rgb, ctx, "the tint", { lambda: true }); return; }
        session.add("D002", ctx.site, `${this.label}.tint() takes [r, g, b] or a lambda () => vec3; got ${arg.show(rgb)}.`, ".tint([1, 0.9, 0.8])");
      } },
    };
  }

  /** @returns {Map<string, SeamType>} */
  outputs() { return new Map([["image", { text: "Image@px", kind: "image", tag: "px" }]]); }

  internals() { return ["light", "shader", "pixels"]; }

  finalize() {
    if (!this.called("light")) session.add("D003", this.site, `glow '${this.name}' has no .light(); it is required.`, ".light(p => vec3(…))");
    const over = this.called("over"), size = this.called("size");
    if (!over && !size) session.add("D003", this.site, `glow '${this.name}' needs .over(image) or .size(width, height).`, ".over(game.out.image)");
    if (over && size) session.add("D002", this.first("size")?.site ?? this.site, `glow '${this.name}' has both .over() and .size(); they exclude each other.`, "remove .size(): .over() sets the size");
    if (this.over) {
      const t = this.over.handle.type;
      if (t && t.kind !== "image") session.add("S203", this.over.site, `.over() takes Image@px; got ${t.text} (${this.over.handle.text}).`, `use an image output: ${this.over.handle.part.label}.out.image`);
    }
  }
}

/** A new glow part. @param {unknown} name */
export function glow(name) {
  const site = callSite();
  if (typeof name !== "string") session.add("D002", site, "glow(name) takes a string name.", 'glow("light")');
  return new GlowPart(typeof name === "string" ? name : "glow", site).proxy();
}
