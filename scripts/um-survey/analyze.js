// Classifies one sketch and lists the operations its functions use. Heuristics are marked as such in the README.
import { parseLambda, checkSubset } from "../../kit/parse/index.js";
import { topLevelUnits, asArrow } from "./units.js";

const NOISE = /hash|noise|fbm|rand|prng|jitter|worley|voronoi|perlin|simplex|pcg|lcg/i;
const TEXTURE = /getImageData|texel|sample|bilinear|lookup|drawImage/i;
const BITWISE = new Set(["|", "&", "^", "<<", ">>", ">>>"]);
/** Top-level exports that take the canvas or run once, so they are not pure kernels. */
const HOSTED = new Set(["exports.draw", "exports.setup", "exports.meta"]);

/**
 * frag: exports `frag(px, py, env)`, which the book calls once per pixel.
 * pixel-loop: `draw` fills an ImageData in its own pixel loop.
 * canvas: `draw` issues canvas calls; no per-pixel buffer.
 * @param {string} src @returns {"frag" | "pixel-loop" | "canvas"}
 */
export function classify(src) {
  if (/exports\.frag\s*=/.test(src) && !/exports\.draw\s*=/.test(src)) return "frag";
  if (/putImageData/.test(src) && /createImageData|new ImageData|getImageData/.test(src)) return "pixel-loop";
  return "canvas";
}

/** The sketch's declared parameters as `name=default`, read by running its top level the way the book does. @param {string} src */
function paramsOf(src) {
  try {
    /** @type {{ meta?: { params?: Record<string, { value: unknown }> } }} */
    const exports = {};
    new Function("exports", src)(exports);
    return Object.entries(exports.meta?.params ?? {}).map(([k, p]) => `${k}=${JSON.stringify(p.value)}`);
  } catch {
    return [];
  }
}

/**
 * @typedef {{ type: string, [k: string]: any }} Node
 * @param {unknown} node @param {(n: Node) => void} visit
 */
function walk(node, visit) {
  if (Array.isArray(node)) { for (const n of node) walk(n, visit); return; }
  if (!node || typeof node !== "object") return;
  const n = /** @type {Node} */ (node);
  if (typeof n.type === "string") visit(n);
  for (const [k, v] of Object.entries(n)) if (k !== "loc" && k !== "range") walk(v, visit);
}

/** @param {Node} test @param {string} text */
function forBound(test, text) {
  if (test?.type === "BinaryExpression" && test.right?.type === "Literal") return `for${test.operator}${text.slice(test.right.range[0], test.right.range[1])}`;
  return "for<dyn";
}

/** @param {string} src */
export function analyze(src) {
  const units = topLevelUnits(src);
  const code = src.replace(/\/\/.*$/gm, "");   // crude: a `//` inside a string is cut too, which only loses text from the regex checks
  const kind = classify(src);
  const exportsNames = units.filter((u) => u.name.startsWith("exports.")).map((u) => u.name.slice(8));
  /** @type {Set<string>} */ const math = new Set();
  /** @type {string[]} */ const loops = [];
  let integer = false, noise = NOISE.test(units.filter((u) => u.kind === "function").map((u) => u.name).join(" "));
  let clean = 0, total = 0;
  const functions = [];
  for (const u of units) {
    const text = asArrow(u);
    if (text === null) continue;
    const r = parseLambda(text);
    /** @type {string[]} */ let codes = [];
    if (r.ok) {
      const ds = checkSubset(r.ast, text);
      codes = [...new Set(ds.filter((d) => d.severity === "error").map((d) => d.code))];
      /** @type {Set<string>} */ const calls = new Set();
      const kernel = !HOSTED.has(u.name);
      walk(r.ast, (n) => {
        if (n.type === "CallExpression") {
          const c = n.callee;
          if (c.type === "MemberExpression" && c.object.type === "Identifier" && c.object.name === "Math") { math.add(c.property.name); if (c.property.name === "imul") integer = true; }
          else if (c.type === "Identifier") { calls.add(c.name); if (NOISE.test(c.name)) noise = true; }
        } else if (n.type === "BinaryExpression" && BITWISE.has(n.operator)) integer = true;
        else if (n.type === "ForStatement") loops.push(forBound(n.test, text));
        else if (n.type === "ForOfStatement") loops.push("forof");
        else if (n.type === "WhileStatement" || n.type === "DoWhileStatement") loops.push("while");
      });
      functions.push({ name: u.name, line: u.line, lines: u.text.split("\n").length, params: text.slice(0, text.indexOf("=>")).trim(), ok: true, codes, calls: [...calls], kernel });
    } else {
      codes = r.diagnostics.map((d) => d.code);
      functions.push({ name: u.name, line: u.line, lines: u.text.split("\n").length, params: "", ok: false, codes, calls: [], kernel: !HOSTED.has(u.name) });
    }
    if (!HOSTED.has(u.name)) { total++; if (r.ok && codes.length === 0) clean++; }
  }
  return {
    kind, exports: exportsNames, params: paramsOf(src), functions,
    fit: { clean, total }, math: [...math].sort(), loops, noise, texture: TEXTURE.test(code),
    state: exportsNames.includes("setup") || /\bstate\b/.test(code), integer,
  };
}
