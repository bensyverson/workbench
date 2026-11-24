// Read-only queries over IR Kernels (types in query.d.ts).

export { walk, isStmt } from "./walk.js";
export { reachableHelpers, reads } from "./reads.js";
export { writers } from "./writers.js";
export { impurities, isPure } from "./purity.js";
