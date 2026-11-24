// The page's side of the GLSL run: a canvas, and `window.workbenchHarness.render(jobs)`, which runs the jobs
// and returns each result with its pixels as base64 floats. Everything else is in gl.js.

import { renderJobs, describeRenderer, encodeFloats } from "./gl.js";

/** @import { ShaderJob } from "./gl.js" */

const canvas = document.createElement("canvas");
canvas.width = 1;
canvas.height = 1;
const gl = canvas.getContext("webgl2", { antialias: false, alpha: true, preserveDrawingBuffer: true });

Object.assign(window, {
  workbenchHarness: {
    renderer: () => (gl ? describeRenderer(gl) : null),
    /** @param {ShaderJob[]} jobs */
    render: (jobs) => {
      if (!gl) throw new Error("WebGL2 is not available");
      return renderJobs(gl, jobs).map((r) => ({ id: r.id, error: r.error, sets: r.sets.map(encodeFloats) }));
    },
  },
});
