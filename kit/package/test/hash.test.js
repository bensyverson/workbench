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

test("contentKey depends on paths and hashes, not on the order the map was written in", async () => {
  const a = await contentKey({ "a.js": "sha256-1", "b.js": "sha256-2" });
  const b = await contentKey({ "b.js": "sha256-2", "a.js": "sha256-1" });
  assert.equal(a, b);
  assert.notEqual(a, await contentKey({ "a.js": "sha256-1", "b.js": "sha256-3" }));
  assert.notEqual(a, await contentKey({ "a.js": "sha256-1", "c.js": "sha256-2" }));
});

test("contentKey is the hash of the sorted `path\\0hash\\n` lines", async () => {
  assert.equal(await contentKey({ "b": "H2", "a": "H1" }), await hashText("a\0H1\nb\0H2\n"));
});
