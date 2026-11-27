// The synth Grammar (kit/define's controls fixture) as one module, so a Program text that write-back tests build by
// a `data:` URL can import the same Grammar by this module's absolute URL. Beside test/, since every file under a
// test/ folder runs as a test.

import { synth } from "../../define/fixtures/controls-dialects.js";

/** The one synth Grammar every Program text here builds with. */
export const g = synth();

/** This module's URL, for a Program text's first line. */
export const HERE = import.meta.url;
