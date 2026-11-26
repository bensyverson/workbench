// kit/seam: the seam types every package's ports are written in, and the frame math a composition converts with.
// Pure data and functions: no Dialect, no Program. kit/define reads seams at a Dialect's ports; kit/compose
// compares them across a wire and plans each conversion.

export { parseSeam, printSeam, printType, frameOf, framesOf, leavesOf, pairLocal, compareSeams, SECONDS } from "./seam.js";
export { normalizeEdge, composeEdges, invertEdge, identity, fitEdge, sameEdge, edgeText, convertText, uniform, FrameGraph, show } from "./frames.js";
