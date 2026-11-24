// The pixel debugger's library: what to import. No DOM; the preview page in page/ is a consumer.
export { tracePixel, finalColor, groupByLine } from "./trace.js";
export { formatValue } from "./format.js";
export { pixelUv, pixelOfUv, uniformsFor } from "./pixel.js";
export { compareColor, glslUniformValues } from "./gpu.js";
