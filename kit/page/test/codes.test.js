// kit/page's codes take a letter no other kit module uses (kit/lir's verifier owns W), and every kit letter is
// reserved, so no Dialect's own check codes can take one.

import { test } from "node:test";
import assert from "node:assert/strict";
import { PAGE_CODES } from "../codes.js";
import { LIR_CODES } from "../../lir/verify.js";
import { RESERVED_LETTERS } from "../../define/codes.js";

test("kit/page's codes are H codes, apart from kit/lir's W codes", () => {
  for (const code of Object.keys(PAGE_CODES)) assert.match(code, /^H\d{3}$/);
  for (const code of Object.keys(LIR_CODES)) assert.ok(!Object.hasOwn(PAGE_CODES, code), code);
});

test("the kit's own letters are reserved from Dialects: H (page), K (package), W (lir verify); R is not reserved (kit/define's README says why)",() => {
  for (const letter of ["H", "K", "W"]) assert.ok(RESERVED_LETTERS.includes(letter), letter);
});
