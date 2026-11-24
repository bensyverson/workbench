// An LIR program as the text of a GLSL ES 3.00 fragment shader, with a line map: every line says
// where it came from (a span of a kernel's lambda, a prelude, or the shader's own scaffolding).

import { LineTable } from "../../parse/lexer.js";
import { glslType, top } from "./text.js";

/** @import { LProgram, LKernel, LStmt } from "../../lir/lir.js" */
/** @import { Span } from "../../ir/ir.js" */
/** @import { Position } from "../../parse/ast.js" */

/**
 * Where one line of the shader came from.
 * @typedef {{ origin: "kernel", kernel: string, span: Span, start: Position }
 *   | { origin: "prelude", name: string }
 *   | { origin: "scaffold" }} LineOrigin
 */

/** The names the emitter owns: the shader's resolution, its output, and the entry point's `uv`. */
export const RESOLUTION = "wb_resolution";
export const OUTPUT = "wb_color";

/**
 * The shader text and, for each of its lines, where it came from.
 * @param {LProgram} p  A verified program whose entry kernel takes one vec2 (the position) and returns a vec3 or vec4.
 * @returns {{ source: string, lines: LineOrigin[] }}
 */
export function emitProgram(p) {
  /** @type {string[]} */
  const text = [];
  /** @type {LineOrigin[]} */
  const map = [];
  /** @param {string} line @param {LineOrigin} [origin] */
  const out = (line, origin = { origin: "scaffold" }) => { text.push(line); map.push(origin); };

  out("#version 300 es");
  out("precision highp float;");
  out("precision highp int;");
  out("");
  for (const u of p.uniforms) out(`uniform ${glslType(u.t)} ${u.name};`);
  out(`uniform vec2 ${RESOLUTION};`);
  out(`out vec4 ${OUTPUT};`);
  for (const pre of p.preludes) {
    out("");
    for (const line of pre.text.replace(/\n$/, "").split("\n")) out(line, { origin: "prelude", name: pre.name });
  }
  for (const k of [...p.helpers, p.main]) {
    out("");
    kernel(k, out);
  }
  out("");
  out("void main() {");
  out(`  vec2 uv = gl_FragCoord.xy / ${RESOLUTION};`);
  out(`  ${OUTPUT} = ${typeof p.main.returns === "object" && p.main.returns.vec === 4 ? `${p.main.name}(uv)` : `vec4(${p.main.name}(uv), 1.0)`};`);
  out("}");
  return { source: `${text.join("\n")}\n`, lines: map };
}

/**
 * @param {LKernel} k
 * @param {(line: string, origin?: LineOrigin) => void} out
 */
function kernel(k, out) {
  const lines = new LineTable(k.src);
  /** @param {string} line @param {Span} span */
  const at = (line, span) => out(line, { origin: "kernel", kernel: k.source, span, start: lines.at(span[0]) });
  at(`${glslType(k.returns)} ${k.name}(${k.params.map((p) => `${glslType(p.t)} ${p.name}`).join(", ")}) {`, k.span);
  block(k.body, 1, at);
  at("}", k.span);
}

/**
 * @param {LStmt[]} stmts
 * @param {number} depth
 * @param {(line: string, span: Span) => void} at
 */
function block(stmts, depth, at) {
  const pad = "  ".repeat(depth);
  for (const s of stmts) {
    switch (s.k) {
      case "let": at(`${pad}${glslType(s.t)} ${s.name}${s.value ? ` = ${top(s.value)}` : ""};`, s.span); break;
      case "set": at(`${pad}${s.name} = ${top(s.value)};`, s.span); break;
      case "do": at(`${pad}${top(s.value)};`, s.span); break;
      case "return": at(`${pad}return ${top(s.value)};`, s.span); break;
      case "break": case "continue": at(`${pad}${s.k};`, s.span); break;
      case "if":
        at(`${pad}if (${top(s.test)}) {`, s.span);
        block(s.then, depth + 1, at);
        if (s.else.length) { at(`${pad}} else {`, s.span); block(s.else, depth + 1, at); }
        at(`${pad}}`, s.span);
        break;
      case "for": {
        const update = s.update.map((u) => `${u.name} = ${top(u.value)}`).join(", ");
        at(`${pad}for (${glslType(s.t)} ${s.name} = ${top(s.init)}; ${top(s.test)}; ${update}) {`, s.span);
        block(s.body, depth + 1, at);
        at(`${pad}}`, s.span);
        break;
      }
    }
  }
}

/**
 * The line map as text, one shader line per line, for goldens and for people.
 * @param {LineOrigin[]} lines
 * @param {string} source  The shader the map belongs to.
 * @returns {string}
 */
export function showLineMap(lines, source) {
  const text = source.replace(/\n$/, "").split("\n");
  const width = String(text.length).length;
  return `${lines.map((o, i) => {
    const from = o.origin === "kernel" ? `${o.kernel} ${o.start.line}:${o.start.column} [${o.span[0]}, ${o.span[1]}]` : o.origin === "prelude" ? `prelude ${o.name}` : "-";
    return `${String(i + 1).padStart(width)} | ${text[i]}`.trimEnd() + `  <- ${from}`;
  }).join("\n")}\n`;
}
