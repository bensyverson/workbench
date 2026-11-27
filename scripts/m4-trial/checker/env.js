// The Node side of the workbench page, for the M4 trial's checker: kit/page/host's loader env (modules from data:
// URLs, kit/define and kit/compose by file URL), a Canvas 2D stub that counts calls, and a page driven frame by frame.
// It decides nothing: loading, checking, building, running and drawing are the kit's and the host's own code.

import { createPage } from "../../../kit/page/index.js";

const kit = (/** @type {string} */ p) => new URL(`../../../kit/${p}`, import.meta.url).href;

/** @type {import("../../../kit/page/host/load.js").LoadEnv} */
export const ENV = {
  urls: { define: kit("define/index.js"), compose: kit("compose/index.js") },
  makeUrl: (text) => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`,
  importUrl: (url) => import(url),
};

/** The page's frame length in the checker: 60 frames a second. */
export const FRAME_MS = 1000 / 60;

/** A Canvas 2D context that draws nothing and counts each call by name. */
export function stubContext() {
  /** @type {Record<string, number>} */
  const calls = {};
  const target = { calls, canvas: { width: 0, height: 0 } };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return /** @type {any} */ (t)[k];
      return (/** @type {any[]} */ ..._args) => { calls[String(k)] = (calls[String(k)] ?? 0) + 1; return { width: 0 }; };
    },
    set() { return true; },
  });
}

/**
 * A page on a composed workbench with its frames under the caller's control.
 * @param {{ composed: any, runtimes: any[], packages: any[] }} built
 */
export async function drivenPage(built) {
  /** @type {((ms: number) => void)[]} */
  let pending = [];
  let ms = 0;
  const context = stubContext();
  const page = createPage({
    composed: built.composed, runtimes: built.runtimes, packages: built.packages, context: /** @type {any} */ (context),
    requestFrame: (cb) => { pending.push(cb); },
    decode: (_bytes, info) => ({ width: info.width, height: info.height }),
  });
  await page.ready;
  page.start();
  /** Runs `n` frames of FRAME_MS each. @param {number} n */
  const frames = (n) => {
    for (let i = 0; i < n; i++) {
      const now = pending;
      pending = [];
      ms += FRAME_MS;
      for (const cb of now) cb(ms);
      if (page.status().halted) return;
    }
  };
  frames(1);
  return { page, context, frames };
}
