// The page's one piece of WebGL: draws an emitted fragment shader over a canvas and reads a pixel back.
// Which uniforms to upload and how to compare colors are the library's (`glslUniformValues`, `compareColor`).
import { emitGlsl, fromLowering } from "../../emit/glsl/index.js";
import { FIELDS_DIALECT } from "../../dialects/fields/index.js";
import { glslUniformValues } from "../index.js";

const VERTEX = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

/**
 * @param {WebGL2RenderingContext} gl
 * @param {number} type
 * @param {string} source
 */
function compile(gl, type, source) {
  const s = /** @type {WebGLShader} */ (gl.createShader(type));
  gl.shaderSource(s, source);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader failed to compile");
  return s;
}

/**
 * A renderer for one lowered fields Program on `canvas`.
 * @param {HTMLCanvasElement} canvas
 * @param {import("../../dialects/fields/program.js").FieldLowering} lowering
 */
export function createRenderer(canvas, lowering) {
  const emitted = emitGlsl(fromLowering(lowering), FIELDS_DIALECT);
  if (!emitted.source) throw new Error(emitted.diagnostics.map((d) => d.message).join("\n"));
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL2 is not available");
  const program = /** @type {WebGLProgram} */ (gl.createProgram());
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, emitted.source));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "shader failed to link");
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const at = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(at);
  gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
  gl.viewport(0, 0, canvas.width, canvas.height);

  return {
    source: emitted.source,
    /** @param {Record<string, unknown>} values  The `u` object the interpreter takes. */
    draw(values) {
      for (const u of glslUniformValues(emitted.uniforms, values)) {
        const loc = gl.getUniformLocation(program, u.name);
        if (!loc) continue; // the driver drops a uniform the shader never reads
        if (u.kind === "float") gl.uniform1f(loc, u.value);
        else gl.uniform1i(loc, u.value);
      }
      gl.uniform2f(gl.getUniformLocation(program, emitted.resolution), canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    /**
     * The bytes of the pixel in column `i`, row `j` counted from the bottom (readPixels' own order).
     * @param {number} i
     * @param {number} j
     */
    readPixel(i, j) {
      const out = new Uint8Array(4);
      gl.readPixels(i, j, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
      return out;
    },
  };
}
