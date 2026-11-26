import { test } from "node:test";
import assert from "node:assert/strict";
import { hashText, contentKey } from "../index.js";

test("hashText is the Subresource Integrity spelling of SHA-256", async () => {
  assert.equal(await hashText(""), "sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=");
  assert.equal(await hashText("abc"), "sha256-ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=");
});

test("hashText hashes UTF-8 bytes", async () => {
  assert.match(await hashText("é"), /^sha256-[A-Za-z0-9+/]{43}=$/);
  assert.notEqual(await hashText("é"), await hashText("e"));
});

const M = "{}";

test("contentKey depends on paths, hashes and the manifest, not on the order the map was written in", async () => {
  const a = await contentKey({ "a.js": "sha256-1", "b.js": "sha256-2" }, M);
  const b = await contentKey({ "b.js": "sha256-2", "a.js": "sha256-1" }, M);
  assert.equal(a, b);
  assert.notEqual(a, await contentKey({ "a.js": "sha256-1", "b.js": "sha256-3" }, M));
  assert.notEqual(a, await contentKey({ "a.js": "sha256-1", "c.js": "sha256-2" }, M));
});

test("contentKey changes with the manifest's text, byte for byte", async () => {
  const files = { "a.js": "sha256-1" };
  const a = await contentKey(files, '{"entry":1}');
  assert.notEqual(a, await contentKey(files, '{"entry":2}'));
  assert.notEqual(a, await contentKey(files, '{ "entry":1}'));
  assert.equal(a, await contentKey(files, '{"entry":1}'));
});

test("contentKey is the hash of the sorted `path\\0hash\\n` lines, then the manifest's line: its path, \\0 and the hash of its text", async () => {
  assert.equal(await contentKey({ "b": "H2", "a": "H1" }, "text"), await hashText("a\0H1\nb\0H2\nwb-package.json\0" + await hashText("text") + "\n"));
});
