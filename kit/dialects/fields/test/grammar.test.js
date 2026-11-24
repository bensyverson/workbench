// The generated field() against the hand-written one it replaced: deep-equal FieldPrograms for every field(...)
// chain in the repo's sketches and tests, and the same refusals, now with codes. What the hand-written builder
// built is kept in golden/hand-built.json, recorded from it just before it was deleted (leaf iJtvVE); each chain
// in the refusals test below threw there. The deliberate differences are the design doc's "What changes for
// fields", and B004/B008.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { field } from "../index.js";
import { BuildError } from "../../../define/index.js";

/** @typedef {(f: any) => unknown} Chain */

const root = new URL("../../../../", import.meta.url);
/** What the hand-written field() built from each sketch file and each inline chain. */
const HAND = JSON.parse(readFileSync(new URL("golden/hand-built.json", import.meta.url), "utf8"));
/** Every sketch file: each exports Programs built with field(…). */
const SKETCHES = [
  "kit/dialects/fields/programs/uv-remaps.js", "kit/dialects/fields/programs/uv-remaps-calls.js",
  "kit/dialects/fields/programs/domain-warp.js", "kit/dialects/fields/programs/domain-warp-calls.js",
  "scripts/h3-trial/docs/typed-example.js", "scripts/h3-trial/docs/call-example.js",
];

/**
 * A sketch module's exports with `field` bound to the given builder: its one import is replaced.
 * @param {string} path @param {unknown} builder @param {string} tag
 */
async function load(path, builder, tag) {
  const src = readFileSync(new URL(path, root), "utf8");
  const swapped = src.replace(/^import \{ field \} from "[^"]+";$/m, "const { field } = globalThis.__fieldUnderTest;");
  assert.notEqual(swapped, src, `${path} imports field`);
  /** @type {any} */ (globalThis).__fieldUnderTest = { field: builder };
  return { ...(await import(`data:text/javascript,${encodeURIComponent(swapped)}#${tag}`)) };
}

test("every sketch builds the same FieldPrograms with the generated field()", async () => {
  let n = 0;
  for (const path of SKETCHES) {
    const want = HAND.sketches[path];
    const got = await load(path, field, "generated");
    assert.deepEqual(got, want, path);
    n += Object.keys(want).length;
  }
  assert.equal(n, 8);
});

/** The chains the repo's tests write inline (operators, size-flag, wide, component-spans, review2, h3 trial). */
const CHAINS = /** @type {Array<[string, Chain]>} */ ([
  ["operators probe", (f) => f("probe").param("k", { value: 1 }).param("palette", { value: "a", options: ["a", "b"] }).pixel(`(uv, u) => { const a = uv * u.k;\n return color(0, 0, 0); }`).build()],
  ["operators uv", (f) => f("probe").pixel("(uv, u) => uv").build()],
  ["component-spans", (f) => f("c").pixel("(uv, u) => color(uv.x, uv.y, 0)").build()],
  ["review2 fbm", (f) => f("c").pixel("(uv, u) => { const f = fbm(uv, 1); return color(f, f, f); }").build()],
  ["review2 loop", (f) => f("c").param("n", { value: 4, min: 0, max: 100 }).pixel(`(uv, u) => { let s = 0; for (let i = 0; i < u.n; i++) { s += 1; } return color(s, s, s); }`).build()],
  ["size-flag loopOver", (f) => { let b = f("c"); for (const [n, p] of Object.entries({ n: { value: 4, min: 0, max: 20000000 } })) b = b.param(n, p); return b.pixel("(uv, u) => color(0, 0, 0)").build(); }],
  ["size-flag edge", (f) => f("c").param("n", { value: 1, min: 0, max: 16777215.5 }).pixel("(uv, u) => color(0, 0, 0)").build()],
  ["size-flag max", (f) => { f("c").param("n", { value: 100, min: 0, max: 100 }); return f("c").param("n", { value: 100, min: 0, max: 100 }).pixel("(uv, u) => color(0, 0, 0)").build(); }],
  ["wide", (f) => f("t").param("k", { value: 2, min: 0, max: 8 }).pixel("(uv, u) => color(u.k, 0, 0)").build()],
  ["h3 mutable builder", (f) => { const b = f("probe"); b.param("k", { value: 1 }); b.const("K", "0.5"); b.fn("g", "(x) => x * K"); return b.pixel("(uv, u) => color(g(u.k), 0, 0)").build(); }],
  ["toggle", (f) => f("t").param("on", { value: true }).pixel("(uv, u) => color(u.on ? 1 : 0, 0, 0)").build()],
]);

test("every inline chain builds the same FieldProgram", () => {
  assert.deepEqual(CHAINS.map(([what]) => what), Object.keys(HAND.chains));
  for (const [what, chain] of CHAINS) assert.deepEqual(chain(field), HAND.chains[what], what);
});

/**
 * The codes the generated builder refuses a chain with: thrown at once (B001) or at .build().
 * @param {Chain} chain
 * @returns {string[]}
 */
function codes(chain) {
  try { chain(field); } catch (e) {
    if (e instanceof BuildError) return e.diagnostics.map((d) => d.code);
    return [/** @type {any} */ (e).code ?? String(e)];
  }
  return [];
}

test("what the hand-written field() refused (each of these threw there), the generated one refuses, with a code", () => {
  /** @type {Array<[string, Chain, string[]]>} */
  const cases = [
    ["unknown method", (f) => f("bad").pixle("(uv, u) => color(0, 0, 0)"), ["B001"]],
    ["duplicate param", (f) => f("c").param("n", { value: 1 }).param("n", { value: 2 }).pixel("(uv, u) => color(0, 0, 0)").build(), ["B002"]],
    ["duplicate helper", (f) => f("c").fn("g", "(x) => x").const("g", "1").pixel("(uv, u) => color(0, 0, 0)").build(), ["B002"]],
    ["helper named like a Library fn", (f) => f("c").fn("vnoise", "(p, s) => 0.25").pixel("(uv, u) => color(0, 0, 0)").build(), ["B002"]],
    ["helper named like a Library fn (pmod)", (f) => f("c").fn("pmod", "(x, n) => x").pixel("(uv, u) => color(0, 0, 0)").build(), ["B002"]],
    ["const named like a Library const", (f) => f("c").const("OCTAVE_COS", "2").pixel("(uv, u) => color(0, 0, 0)").build(), ["B002"]],
    ["param named like a helper", (f) => f("c").fn("g", "(x) => x").param("g", { value: 1 }).pixel("(uv, u) => color(0, 0, 0)").build(), ["F003"]],
    ["param named like a Library entry", (f) => f("c").param("fbm", { value: 1 }).pixel("(uv, u) => color(0, 0, 0)").build(), ["F003"]],
    ["value above max", (f) => f("c").param("n", { value: 1e9, min: 0, max: 100 }).pixel("(uv, u) => color(0, 0, 0)").build(), ["F001"]],
    ["value below min", (f) => f("c").param("n", { value: -1, min: 0, max: 100 }).pixel("(uv, u) => color(0, 0, 0)").build(), ["F001"]],
    ["two pixels", (f) => f("c").pixel("(uv, u) => color(0, 0, 0)").pixel("(uv, u) => color(1, 0, 0)").build(), ["B006"]],
    ["no pixel", (f) => f("c").param("n", { value: 1 }).build(), ["B005"]],
    ["empty source", (f) => f("c").pixel("").build(), ["B007"]],
    ["a number for a source", (f) => f("c").fn("g", 42).pixel("(uv, u) => color(0, 0, 0)").build(), ["B007"]],
  ];
  for (const [what, chain, want] of cases) {
    assert.deepEqual(codes(chain), want, what);
  }
});

test("the deliberate differences: functions accepted, earlier refusals, shapes and free names checked", () => {
  const fn = (/** @type {any} */ uv, /** @type {any} */ u) => uv + u;
  const built = /** @type {any} */ (field("f").pixel(fn).build());
  assert.equal(built.pixel, String(fn), "a function is read as its text (the hand-written builder threw)");
  // The hand-written builder took u.t as a param and refused it only when the Environment was built; the generated one at the call.
  assert.deepEqual(codes((f) => f("c").param("t", { value: 1 }).pixel("(uv, u) => color(0, 0, 0)").build()), ["F002"]);
  assert.deepEqual(codes((f) => f("c").param("n", { value: "x" }).pixel("(uv, u) => color(0, 0, 0)").build()), ["B004"]);
  assert.deepEqual(codes((f) => f("c").pixel("(uv, u) => color(uv.x * K, 0, 0)").build()), ["B008"]);
  assert.deepEqual(codes((f) => f("c").pixel("(uv, u) => color(Math.sin(uv.x), 0, 0)").build()), ["B008"], "Math is not a fields global");
  assert.deepEqual(codes((f) => f("c").pixel("function (uv, u) { return color(0, 0, 0); }").build()), ["B007"]);
});

test("a refusal names the call site, the fix and a did-you-mean", () => {
  /** @type {any} */
  let thrown;
  try { field("bad").param("angle", { value: 2.4 }).pixle("(uv, u) => color(0, 0, 0)"); } catch (e) { thrown = e; }
  const line = Number(new Error().stack?.match(/grammar\.test\.js:(\d+)/)?.[1]) - 1;
  assert.equal(thrown.code, "B001");
  assert.match(thrown.message, /field has no method "pixle".*Did you mean 'pixel'/);
  assert.equal(thrown.diagnostic.loc.start.line, line);
  assert.match(thrown.diagnostic.file, /fields\/test\/grammar\.test\.js$/);

  const b = field("bad").pixel("(uv, u) => color(uv.x * K, 0, 0)");
  const callLine = line + 7;
  const [d] = b.check();
  assert.equal(d.code, "B008");
  assert.match(d.message, /pixel lambda reads "K", which it cannot see/);
  assert.match(d.tip, /\.const\("K"/);
  assert.equal(d.loc.start.line, callLine);
  assert.throws(() => b.build(), (/** @type {any} */ e) => e instanceof BuildError && e.diagnostics[0].code === "B008");
});
