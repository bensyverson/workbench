// Runs fragment shaders on a WebGL2 context and reads the pixels back as floats. The context is handed in, so
// this holds no DOM: page.js is the thin part that makes a canvas.

/**
 * One shader to run, over a grid, once per set of uniform values.
 * @typedef {object} ShaderJob
 * @property {string} id
 * @property {string} source  GLSL ES 3.00 fragment shader, writing `output`.
 * @property {number} width
 * @property {number} height
 * @property {string} resolution  The vec2 uniform that takes (width, height).
 * @property {Array<{ glsl: string, kind: string }>} uniforms
 * @property {Array<Record<string, number | boolean | EncodedImage>>} sets  Uniform values by shader name, one entry per run; a `sampler2D`'s is an EncodedImage.
 */

/**
 * An image as it crosses into the page: its size and its RGBA bytes (row 0 the bottom, as a SamplerImage's) as base64.
 * @typedef {{ width: number, height: number, rgba: string }} EncodedImage
 */

/** @import { SamplerImage } from "../interp/interp.js" */

/**
 * @typedef {object} ShaderResult
 * @property {string} id
 * @property {string | null} error  Compile or link log, or null.
 * @property {Float32Array[]} sets  One RGBA buffer per set: row 0 is the bottom row, (j * width + i) * 4.
 */

const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

/**
 * What the context is, as WebGL reports it, so a tolerance can say where it was measured.
 * @param {WebGL2RenderingContext} gl
 * @returns {{ vendor: string, renderer: string, version: string, floatReadback: boolean }}
 */
export function describeRenderer(gl) {
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  return {
    vendor: String(dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)),
    renderer: String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),
    version: String(gl.getParameter(gl.VERSION)),
    floatReadback: gl.getExtension("EXT_color_buffer_float") !== null,
  };
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {number} type
 * @param {string} text
 * @returns {{ shader: WebGLShader | null, log: string }}
 */
function compile(gl, type, text) {
  const shader = gl.createShader(type);
  if (!shader) return { shader: null, log: "createShader failed" };
  gl.shaderSource(shader, text);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return { shader, log: "" };
  const log = gl.getShaderInfoLog(shader) ?? "";
  gl.deleteShader(shader);
  return { shader: null, log };
}

/**
 * Runs each job, in order, over a float framebuffer of its own size.
 * @param {WebGL2RenderingContext} gl
 * @param {ShaderJob[]} jobs
 * @returns {ShaderResult[]}
 */
export function renderJobs(gl, jobs) {
  if (!gl.getExtension("EXT_color_buffer_float")) throw new Error("EXT_color_buffer_float is not available, so pixels cannot be read back as floats");
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  return jobs.map((job) => {
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl, gl.FRAGMENT_SHADER, job.source);
    if (!vs.shader || !fs.shader) return { id: job.id, error: `compile: ${vs.log || fs.log}`, sets: [] };
    const program = gl.createProgram();
    gl.attachShader(program, vs.shader);
    gl.attachShader(program, fs.shader);
    gl.linkProgram(program);
    gl.deleteShader(vs.shader);
    gl.deleteShader(fs.shader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = `link: ${gl.getProgramInfoLog(program) ?? ""}`;
      gl.deleteProgram(program);
      return { id: job.id, error, sets: [] };
    }
    gl.useProgram(program);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, job.width, job.height, 0, gl.RGBA, gl.FLOAT, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      return { id: job.id, error: "framebuffer: a float RGBA target is not renderable here", sets: [] };
    }
    gl.viewport(0, 0, job.width, job.height);
    gl.disable(gl.BLEND);
    gl.disable(gl.DITHER);

    const resolution = gl.getUniformLocation(program, job.resolution);
    /** @type {Float32Array[]} */
    const sets = [];
    for (const values of job.sets) {
      if (resolution) gl.uniform2f(resolution, job.width, job.height);
      /** @type {WebGLTexture[]} */
      const images = [];
      for (const u of job.uniforms) {
        const loc = gl.getUniformLocation(program, u.glsl);
        if (!loc) continue;
        const v = values[u.glsl];
        if (v === undefined) throw new Error(`${job.id}: no value for uniform ${u.glsl}`);
        if (u.kind === "float") gl.uniform1f(loc, Number(v));
        else if (u.kind === "int") gl.uniform1i(loc, Number(v));
        else if (u.kind === "bool") gl.uniform1i(loc, v ? 1 : 0);
        // Unit 0 holds the output texture, so images take units from 1.
        else if (u.kind === "sampler2D") images.push(bindImage(gl, loc, images.length + 1, /** @type {EncodedImage} */ (v)));
        else throw new Error(`${job.id}: uniform ${u.glsl} has kind ${u.kind}, which the harness does not set`);
      }
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const pixels = new Float32Array(job.width * job.height * 4);
      gl.readPixels(0, 0, job.width, job.height, gl.RGBA, gl.FLOAT, pixels);
      sets.push(pixels);
      for (const t of images) gl.deleteTexture(t);
      gl.activeTexture(gl.TEXTURE0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(texture);
    gl.deleteProgram(program);
    return { id: job.id, error: null, sets };
  });
}

/**
 * Uploads an image uniform's value as an RGBA8 texture on `unit` and points the sampler at it: NEAREST filtering and
 * CLAMP_TO_EDGE, the convention the fields Dialect's `sample` reference implements, and rows uploaded as given (no
 * flip), so row 0 is the bottom, at t = 0.
 * @param {WebGL2RenderingContext} gl
 * @param {WebGLUniformLocation} loc
 * @param {number} unit
 * @param {EncodedImage} encoded
 * @returns {WebGLTexture}
 */
function bindImage(gl, loc, unit, encoded) {
  const img = decodeImage(encoded);
  const texture = /** @type {WebGLTexture} */ (gl.createTexture());
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, img.width, img.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, /** @type {Uint8Array} */ (img.data));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(loc, unit);
  return texture;
}

/**
 * An image as it crosses into the page: its bytes, base64.
 * @param {SamplerImage} img
 * @returns {EncodedImage}
 */
export function encodeImage(img) {
  const bytes = Uint8Array.from(img.data);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { width: img.width, height: img.height, rgba: btoa(s) };
}

/**
 * @param {EncodedImage} e
 * @returns {SamplerImage & { data: Uint8Array }}
 */
export function decodeImage(e) {
  const s = atob(e.rgba);
  const data = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) data[i] = s.charCodeAt(i);
  return { width: e.width, height: e.height, data };
}

/**
 * Float32 buffers as base64, which is how they cross out of the page (a JSON array of 12-digit numbers is
 * several times larger).
 * @param {Float32Array} f
 * @returns {string}
 */
export function encodeFloats(f) {
  const bytes = new Uint8Array(f.buffer, f.byteOffset, f.byteLength);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * @param {string} b64
 * @returns {Float32Array}
 */
export function decodeFloats(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}
