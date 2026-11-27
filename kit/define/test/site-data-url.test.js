// A Program imported from a `data:` URL built with encodeURIComponent keeps `(` and `)` unescaped in its URL, so
// callSite must read the whole URL up to its :line:col, or every call in the module lands at its caller's place.
import { test } from "node:test";
import assert from "node:assert/strict";

const SITE = new URL("../site.js", import.meta.url).href;

test("callSite reads a data: URL whose text holds parentheses, and tells its lines apart", async () => {
  const text = `import { callSite } from ${JSON.stringify(SITE)};\nconst f = () => callSite();\nexport const a = f();\nexport const b = (() => callSite())();\n`;
  const m = await import(`data:text/javascript,${encodeURIComponent(text)}`);
  assert.ok(m.a.file.startsWith("data:text/javascript,"), m.a.file);
  assert.equal(m.a.file, m.b.file);
  assert.equal(m.a.loc.start.line, 2);
  assert.equal(m.b.loc.start.line, 4);
});

test("callSite still reads a file: frame inside parentheses", async () => {
  const { callSite } = await import(SITE);
  const s = callSite();
  assert.equal(s.file, import.meta.url);
  assert.equal(s.loc.start.line, 19);
});
