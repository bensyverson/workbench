// Image params: `.param(name, { image: true })` is a sampler uniform, read only by `sample(img, p)` and
// `imageSize(img)`, and passed whole to a helper. Anything else done with a sampler is L018.
import { test } from "node:test";
import assert from "node:assert/strict";
import { field, lowerField, INTRINSICS } from "../index.js";

/** @param {() => { build(): unknown }} make @returns {string} */
const refusal = (make) => { try { make().build(); } catch (e) { return /** @type {Error} */ (e).message; } return ""; };

/**
 * Lowers a pixel (and helpers) over an image param `atlas` and a number param `k`.
 * @param {string} pixel @param {Array<[string, string]>} [fns]
 */
const lower = (pixel, fns = []) => {
  let b = field("img").param("atlas", { image: true }).param("other", { image: true }).param("k", { value: 1 });
  for (const [n, src] of fns) b = b.fn(n, src);
  return lowerField(/** @type {any} */ (b.pixel(pixel).build()));
};

/** Every diagnostic of a lowering, the helpers' included. @param {ReturnType<typeof lowerField>} r */
const all = (r) => [...r.diagnostics, ...r.helpers.flatMap((h) => h.result.diagnostics)];

test("an image param builds, and its uniform is a sampler", () => {
  assert.equal(refusal(() => field("c").param("atlas", { image: true }).pixel("(uv, u) => color(0, 0, 0)")), "");
  const r = lower("(uv, u) => color(0, 0, 0)");
  const members = /** @type {Record<string, { t?: unknown }>} */ (r.environment.objects.Uniforms.members);
  assert.equal(members.atlas.t, "sampler");
});

test("an image param is { image: true } and nothing else", () => {
  assert.match(refusal(() => field("c").param("a", { image: false }).pixel("(uv, u) => color(0, 0, 0)")), /F004/);
  assert.match(refusal(() => field("c").param("a", /** @type {any} */ ({ image: true, value: 1 })).pixel("(uv, u) => color(0, 0, 0)")), /B004/);
});

test("sample and imageSize are intrinsics with a JS and a GLSL spelling", () => {
  for (const n of ["sample", "imageSize"]) {
    assert.ok(INTRINSICS[n], n);
    assert.equal(typeof INTRINSICS[n].js.call, "string");
    assert.equal(typeof INTRINSICS[n].glsl.call, "string");
  }
});

test("sample(u.atlas, uv) lowers to a vec4, imageSize to a vec2", () => {
  const r = lower("(uv, u) => { const c = sample(u.atlas, uv); const s = imageSize(u.atlas); return color(c.x * s.x, c.y, c.w); }");
  assert.deepEqual(all(r), []);
  assert.ok(r.kernel);
  const json = JSON.stringify(r.kernel);
  assert.match(json, /"fn":"sample"/);
  assert.match(json, /"t":"sampler"/);
});

test("a helper takes a sampler whole and samples it", () => {
  const r = lower("(uv, u) => { const c = cell(u.atlas, uv, u.k); return color(c.x, c.y, c.z); }", [["cell", "(img, p, n) => sample(img, p * n)"]]);
  assert.deepEqual(all(r), []);
  const cell = r.helpers.find((h) => h.name === "cell");
  assert.equal(cell?.result.kernel?.params[0].t, "sampler");
});

test("a sampler used other than passed to a call is L018, and the tip says how to use it", () => {
  const cases = [
    "(uv, u) => { const s = u.atlas; return color(0, 0, 0); }",
    "(uv, u) => { if (u.atlas === u.other) { return color(1, 1, 1); } return color(0, 0, 0); }",
    "(uv, u) => { const c = sample(u.k > 0 ? u.atlas : u.other, uv); return color(c.x, c.y, c.z); }",
    "(uv, u) => { if (u.atlas) { return color(1, 1, 1); } return color(0, 0, 0); }",
    "(uv, u) => { const w = u.atlas.width; return color(w, 0, 0); }",
  ];
  for (const src of cases) {
    const ds = all(lower(src));
    assert.ok(ds.some((d) => d.code === "L018"), `${src}: ${ds.map((d) => `${d.code} ${d.message}`).join("; ")}`);
    assert.match(ds.find((d) => d.code === "L018")?.tip ?? "", /sample\(/, src);
  }
});

test("a helper's sampler parameter is held, returned or compared: L018", () => {
  for (const fn of ["(img, p) => { const s = img; return sample(s, p); }", "(img, p) => img"]) {
    const ds = all(lower("(uv, u) => { const c = cell(u.atlas, uv); return color(c.x, c.y, c.z); }", [["cell", fn]]));
    assert.ok(ds.some((d) => d.code === "L018"), `${fn}: ${ds.map((d) => `${d.code} ${d.message}`).join("; ")}`);
  }
});

test("sample of a number is L003; a number param is no image", () => {
  const ds = all(lower("(uv, u) => { const c = sample(u.k, uv); return color(c.x, c.y, c.z); }"));
  assert.ok(ds.some((d) => d.code === "L003"), ds.map((d) => d.code).join());
});
