// The intrinsics' spellings agree with their reference implementations, and ihash with the book.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { INTRINSICS } from "../index.js";
import { loadBook } from "../../../../scripts/um-survey/book.js";

const BOOK = "/Users/ben/git/workbench/local/uncommon-math-0.1.0.html";

/**
 * A JS spelling made callable: its prelude, then a function that applies its call template.
 * @param {string} name
 */
function spelled(name) {
  const { js, sig } = INTRINSICS[/** @type {keyof typeof INTRINSICS} */ (name)];
  const args = sig.params.map((_, i) => `a${i}`);
  const call = js.call.replace(/\$(\d)/g, (_, i) => `a${i}`);
  return new Function(...args, `${js.prelude ?? ""}\nreturn ${call};`);
}

test("every intrinsic has a signature, both spellings and a reference", () => {
  for (const [name, i] of Object.entries(INTRINSICS)) {
    assert.ok(i.sig.params.length > 0, name);
    assert.ok(i.js.call.includes("$0"), `${name} js`);
    assert.ok(i.glsl.call.includes("$0"), `${name} glsl`);
    assert.equal(typeof i.ref, "function", name);
  }
});

test("each JS spelling computes what its reference does", () => {
  const samples = [-2.5, -1, -0.25, 0, 0.3, 1, 1.5, 7.75];
  for (const [name, i] of Object.entries(INTRINSICS)) {
    if (name === "ihash") continue;
    if (name === "length") {
      assert.equal(i.ref(3, 4), 5);
      assert.equal(spelled("length")([3, 4]), 5);
      continue;
    }
    const f = spelled(name);
    const n = i.sig.params.length;
    for (const a of samples) for (const b of [0.5, 2]) for (const c of [0, 1]) {
      const args = [a, b, c].slice(0, n);
      const want = i.ref(...args), got = f(...args);
      assert.ok(Object.is(want, got) || (Number.isNaN(want) && Number.isNaN(got)) || Math.abs(want - got) < 1e-12, `${name}(${args}) ${got} vs ${want}`);
    }
  }
});

test("ihash: the JS spelling is the book's own code, the GLSL spelling is uint arithmetic, and the reference agrees", () => {
  const i = INTRINSICS.ihash;
  assert.match(i.glsl.prelude ?? "", /uint/);
  assert.doesNotMatch(i.glsl.prelude ?? "", /imul/);
  assert.match(i.js.prelude ?? "", /Math\.imul/);
  const f = spelled("ihash");
  for (const x of [-7, -1, 0, 1, 2, 99, 1234]) for (const y of [-3, 0, 5, 77]) for (const s of [0, 3, 297]) {
    assert.equal(f(x, y, s), i.ref(x, y, s), `ihash(${x}, ${y}, ${s})`);
  }
});

test("ihash is exactly the book's domain-warp ihash", { skip: existsSync(BOOK) ? false : `the book is not at ${BOOK}` }, () => {
  const src = loadBook(BOOK).sketches["04-noise/domain-warp"].src;
  const hashSrc = src.slice(src.indexOf("function ihash"), src.indexOf("function vnoise"));
  const bookHash = new Function(`${hashSrc}\nreturn ihash;`)();
  const i = INTRINSICS.ihash;
  for (let x = -20; x < 20; x += 3) for (let y = -20; y < 20; y += 7) for (const s of [0, 3, 30, 297]) {
    assert.equal(i.ref(x, y, s), bookHash(x, y, s));
  }
  const flat = (/** @type {string} */ t) => t.replace(/\s+/g, " ").trim();
  assert.ok(flat(i.js.prelude ?? "").includes(flat(hashSrc)), "the spelling carries the book's code unchanged");
});
