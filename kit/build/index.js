// kit/build: the build record as data. A part's content key, the revision rule, a composition's key, and the build
// event one rebuild writes to the run log. No I/O and no Node built-ins; README.md is the spec.

export { sha256 } from "./sha256.js";
export { canonical, partKey, compositionKey, nextRevision, stateHash } from "./key.js";
export { buildEvent, paramTrigger, packageTrigger, glueTrigger } from "./event.js";
