// A component assignment rebuilds the vector; the components it keeps must point at the vector
// they are read from, not at the member being assigned (the debugger pairs values with spans).
import { test } from "node:test";
import assert from "node:assert/strict";
import { lowerField, field } from "../index.js";

/** @param {unknown} n @param {(n: any) => void} f */
const walk = (n, f) => {
  if (Array.isArray(n)) n.forEach((x) => walk(x, f));
  else if (n && typeof n === "object") { f(n); Object.values(n).forEach((x) => walk(x, f)); }
};

for (const stmt of ["a.x = 0.9;", "a.y += 0.5;", "a.x++;", "a.y--;", "const v = a.x = 0.9;", "const v = a.x++;"]) {
  test(`${stmt} gives each component read a span that is its own text`, () => {
    const src = `(uv, u) => { let a = uv; ${stmt} return color(a.x, a.y, 0); }`;
    const r = lowerField(field("c").pixel(src).build());
    assert.deepEqual(r.diagnostics, []);
    let seen = 0;
    walk(r.kernel, (n) => {
      if (n.k !== "field" || !n.span) return;
      seen++;
      const text = src.slice(...n.span);
      const named = /\.(\w+)$/.exec(text);
      assert.ok(!named || named[1] === n.name, `component ${n.name} is read at "${text}"`);
    });
    assert.ok(seen >= 3);
  });
}
