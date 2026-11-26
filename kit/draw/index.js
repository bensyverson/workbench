// kit/draw: the draw list (the draw-list draft, as ruled 2026-11-26). The closed op table, a Dialect's paint, the
// builders that make a list from a run's state, an op's conversion across a wire, the renderer profiles and the
// Canvas 2D renderer. No Node built-ins: it runs in the page.

export { DRAW_CODES } from "./codes.js";
export { declareDraw, kindsOf, drawMax, runDraw, carryList, isCarried, DRAW_PORT_KEYS, REFUSED_CALLS } from "./builders.js";
export { CANVAS, GAMEBOY, PROFILES, kindProblems, checkDraw, shadeOf } from "./profiles.js";
export { drawCanvas } from "./canvas.js";
export { OPS, OP_KINDS, FONTS, GLYPH, typeOp, checkPaint, resolveColor, convertOp, opBox, nativeSize, cellCount, gridCells } from "./ops.js";
