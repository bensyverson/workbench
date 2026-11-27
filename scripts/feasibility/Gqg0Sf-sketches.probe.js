// Runs the CPU-tier draft's three sketches as plain JavaScript, to check the algorithms before the doc cites them.
// Not a test of the CPU tier (it is not built): only that each sketch computes what it claims.
// node local/Gqg0Sf-sketches.probe.js

// ---- Knuth-Plass -------------------------------------------------------------------------------
const INF = 10000;

const itemize = (text, advance, space) => {
  const items = [];
  let w = 0;
  for (let i = 0; i <= text.length; i++) {
    const c = text.charCodeAt(i);                       // NaN past the end
    if (c === 32 || i === text.length) {
      if (w > 0) items.push({ kind: "box", width: w, stretch: 0, shrink: 0, penalty: 0 });
      if (c === 32) items.push({ kind: "glue", width: space, stretch: space / 2, shrink: space / 3, penalty: 0 });
      w = 0;
    } else {
      w += advance[c] ?? 0;
    }
  }
  items.push({ kind: "glue", width: 0, stretch: INF, shrink: 0, penalty: 0 });       // the last line's fill
  items.push({ kind: "penalty", width: 0, stretch: 0, shrink: 0, penalty: -INF });   // the paragraph's end
  return items;
};

const at = (xs, i) => xs[i] ?? 0;

const isBreak = (items, b) => {
  const it = items[b];
  if (it == null) return false;
  if (it.kind === "penalty") return it.penalty < INF;
  const before = items[b - 1];
  return it.kind === "glue" && before != null && before.kind === "box";
};

const demerits = (r, pen) => {
  const d = (1 + 100 * Math.abs(r) ** 3) ** 2;
  if (pen >= 0) return d + pen ** 2;
  if (pen > -INF) return d - pen ** 2;
  return d;
};

const breakLines = (items, width, tolerance) => {
  const sw = [];
  const sy = [];
  const sz = [];
  let w = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < items.length; i++) {
    sw.push(w);
    sy.push(y);
    sz.push(z);
    const it = items[i];                                 // narrowed by the loop's test
    if (it.kind !== "penalty") w += it.width;
    if (it.kind === "glue") {
      y += it.stretch;
      z += it.shrink;
    }
  }
  sw.push(w);
  sy.push(y);
  sz.push(z);

  const nodes = [{ pos: 0, demerits: 0, prev: -1 }];
  let active = [0];
  for (let b = 0; b < items.length; b++) {
    if (!isBreak(items, b)) continue;
    const it = items[b];
    const pen = it.kind === "penalty" ? it.penalty : 0;
    const tail = it.kind === "penalty" ? it.width : 0;
    const keep = [];
    let best = -1;
    let bestD = 0;
    for (const k of active) {
      const n = nodes[k];
      if (n == null) continue;
      const room = width - (at(sw, b) - at(sw, n.pos) + tail);
      const give = room >= 0 ? at(sy, b) - at(sy, n.pos) : at(sz, b) - at(sz, n.pos);
      const r = give > 0 ? room / give : room === 0 ? 0 : room > 0 ? INF : -INF;
      if (r < -1) continue;
      if (pen > -INF) keep.push(k);
      if (r <= tolerance) {
        const d = n.demerits + demerits(r, pen);
        if (best === -1 || d < bestD) {
          best = k;
          bestD = d;
        }
      }
    }
    if (best !== -1) {
      keep.push(nodes.length);
      nodes.push({ pos: b + 1, demerits: bestD, prev: best });
    }
    active = keep;
    if (active.length === 0) return [];
  }

  let last = -1;
  let lastD = 0;
  for (let k = 0; k < nodes.length; k++) {
    const n = nodes[k];
    if (n.pos === items.length && (last === -1 || n.demerits < lastD)) {
      last = k;
      lastD = n.demerits;
    }
  }
  const out = [];
  let k = last;
  while (k > 0) {
    const n = nodes[k];
    if (n == null) break;
    out.push(n.pos - 1);
    k = n.prev;
  }
  for (let i = 0; i < Math.floor(out.length / 2); i++) {
    const j = out.length - 1 - i;
    const t = at(out, i);
    out[i] = at(out, j);
    out[j] = t;
  }
  return out;
};

// ---- packrat PEG -------------------------------------------------------------------------------
const UNTRIED = -2;

const fail = (far, pos) => {
  if (pos > (far[0] ?? 0)) far[0] = pos;
  return -1;
};

const match = (g, src, e, pos, memo, far) => {
  const x = g.exprs[e];
  if (x == null) return -1;
  if (x.op === "lit") return src.startsWith(x.text, pos) ? pos + x.text.length : fail(far, pos);
  if (x.op === "range") {
    const c = src.charCodeAt(pos);
    return c >= x.lo && c <= x.hi ? pos + 1 : fail(far, pos);
  }
  if (x.op === "seq") {
    let p = pos;
    for (const k of x.items) {
      p = match(g, src, k, p, memo, far);
      if (p < 0) return -1;
    }
    return p;
  }
  if (x.op === "alt") {
    for (const k of x.items) {
      const p = match(g, src, k, pos, memo, far);
      if (p >= 0) return p;
    }
    return -1;
  }
  const first = x.items[0] ?? -1;
  if (x.op === "star") {
    let p = pos;
    let next = match(g, src, first, p, memo, far);
    while (next > p) {
      p = next;
      next = match(g, src, first, p, memo, far);
    }
    return p;
  }
  if (x.op === "not") return match(g, src, first, pos, memo, far) < 0 ? pos : -1;
  const slot = x.rule * (src.length + 1) + pos;
  const seen = memo[slot] ?? UNTRIED;
  if (seen !== UNTRIED) return seen;
  const end = match(g, src, g.rules[x.rule] ?? -1, pos, memo, far);
  memo[slot] = end;
  return end;
};

const parse = (g, src) => {
  const memo = [];
  const size = g.rules.length * (src.length + 1);
  for (let i = 0; i < size; i++) memo.push(UNTRIED);
  const far = [0];
  const end = match(g, src, g.start, 0, memo, far);
  return { ok: end === src.length, end, farthest: far[0] ?? 0 };
};

// ---- Levenberg-Marquardt -----------------------------------------------------------------------
const zeros = (n) => {
  const xs = [];
  for (let i = 0; i < n; i++) xs.push(0);
  return xs;
};

const sumSq = (r) => {
  let s = 0;
  for (const x of r) s += x * x;
  return s;
};

const solve = (a, v, n) => {
  const L = zeros(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = at(a, i * n + j);
      for (let k = 0; k < j; k++) s -= at(L, i * n + k) * at(L, j * n + k);
      L[i * n + j] = i === j ? Math.sqrt(s) : s / at(L, j * n + j);
    }
  }
  const x = zeros(n);
  for (let i = 0; i < n; i++) {
    let s = at(v, i);
    for (let k = 0; k < i; k++) s -= at(L, i * n + k) * at(x, k);
    x[i] = s / at(L, i * n + i);
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = at(x, i);
    for (let k = i + 1; k < n; k++) s -= at(L, k * n + i) * at(x, k);
    x[i] = s / at(L, i * n + i);
  }
  return x;
};

const lmStep = (residual, data, s, tries, eps) => {
  const p = s.p;
  const r = residual(data, p);
  const m = r.length;
  const n = p.length;
  const J = zeros(m * n);
  for (let j = 0; j < n; j++) {
    const q = [...p];
    const h = 1e-6 * Math.max(1, Math.abs(at(p, j)));
    q[j] = at(p, j) + h;
    const rq = residual(data, q);
    for (let i = 0; i < m; i++) J[i * n + j] = (at(rq, i) - at(r, i)) / h;
  }
  const A = zeros(n * n);
  const g = zeros(n);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      g[j] = at(g, j) + at(J, i * n + j) * at(r, i);
      for (let k = 0; k < n; k++) A[j * n + k] = at(A, j * n + k) + at(J, i * n + j) * at(J, i * n + k);
    }
  }
  let lambda = s.lambda;
  let t = 0;
  while (t < tries) {
    const D = [...A];
    for (let j = 0; j < n; j++) D[j * n + j] = at(A, j * n + j) * (1 + lambda);
    const delta = solve(D, g, n);
    const q = zeros(n);
    for (let j = 0; j < n; j++) q[j] = at(p, j) - at(delta, j);
    const c = sumSq(residual(data, q));
    if (c < s.cost) {
      return { p: q, lambda: lambda / 10, cost: c, iter: s.iter + 1, done: s.cost - c <= eps * s.cost };
    }
    lambda = lambda * 10;
    t += 1;
  }
  return { p, lambda, cost: s.cost, iter: s.iter + 1, done: true };
};

// ---- checks ------------------------------------------------------------------------------------
const results = [];
const check = (label, ok, detail) => { results.push(ok); console.log(ok ? "ok  " : "FAIL", label, detail); };

{
  const advance = [];
  for (let c = 0; c < 128; c++) advance.push(1);
  const text = "the quick brown fox jumps over the lazy dog and keeps on running far away";
  const items = itemize(text, advance, 1);
  const breaks = breakLines(items, 20, 3);
  const lines = [];
  let start = 0;
  for (const b of breaks) {
    let s = "";
    for (let i = start; i < b; i++) s += items[i].kind === "box" ? "#".repeat(items[i].width) : items[i].kind === "glue" ? " " : "";
    lines.push(s);
    start = b + 1;
  }
  const fits = lines.every((l) => l.trimEnd().length <= 20) && lines.join(" ").replace(/ +/g, " ").trim() === text.replace(/[a-z]/g, "#");
  check("KP breaks the text into lines of at most 20, losing no word", breaks.length > 1 && fits && breaks[breaks.length - 1] === items.length - 1, JSON.stringify(lines));
  check("KP: an impossible width gives []", breakLines(itemize("unbreakableword", advance, 1), 5, 3).length === 0, "");
}

{
  // expr = num (("+" / "-") num)* ; num = [0-9] [0-9]*
  const g = {
    start: 0,
    rules: [0, 6],
    exprs: [
      { op: "seq", items: [1, 2], text: "", lo: 0, hi: 0, rule: 0 },        // 0: expr body
      { op: "ref", items: [], text: "", lo: 0, hi: 0, rule: 1 },            // 1: num
      { op: "star", items: [3], text: "", lo: 0, hi: 0, rule: 0 },          // 2: (op num)*
      { op: "seq", items: [4, 1], text: "", lo: 0, hi: 0, rule: 0 },        // 3: op num
      { op: "alt", items: [9, 10], text: "", lo: 0, hi: 0, rule: 0 },       // 4: "+" / "-"
      { op: "range", items: [], text: "", lo: 48, hi: 57, rule: 0 },       // 5: [0-9]
      { op: "seq", items: [5, 7], text: "", lo: 0, hi: 0, rule: 0 },        // 6: num body
      { op: "star", items: [5], text: "", lo: 0, hi: 0, rule: 0 },          // 7: [0-9]*
      { op: "not", items: [5], text: "", lo: 0, hi: 0, rule: 0 },           // 8: unused
      { op: "lit", items: [], text: "+", lo: 0, hi: 0, rule: 0 },           // 9
      { op: "lit", items: [], text: "-", lo: 0, hi: 0, rule: 0 },           // 10
    ],
  };
  const a = parse(g, "12+3-456");
  check("PEG parses 12+3-456", a.ok && a.end === 8, JSON.stringify(a));
  const b = parse(g, "12+-3");
  check("PEG refuses 12+-3, farthest at 3", !b.ok && b.farthest === 3, JSON.stringify(b));
}

{
  const xs = [];
  const ys = [];
  for (let i = 0; i < 20; i++) { xs.push(i / 10); ys.push(2 * Math.exp(0.5 * (i / 10))); }
  const data = { xs, ys };
  const residual = (d, p) => {
    const r = [];
    for (let i = 0; i < d.xs.length; i++) r.push((p[0] ?? 0) * Math.exp((p[1] ?? 0) * (d.xs[i] ?? 0)) - (d.ys[i] ?? 0));
    return r;
  };
  let s = { p: [1, 0.1], lambda: 1e-3, cost: 0, iter: 0, done: false };
  s = { ...s, cost: sumSq(residual(data, s.p)) };
  while (!s.done && s.iter < 100) s = lmStep(residual, data, s, 10, 1e-12);
  check("LM fits a = 2, b = 0.5", Math.abs(s.p[0] - 2) < 1e-6 && Math.abs(s.p[1] - 0.5) < 1e-6, JSON.stringify({ p: s.p, iter: s.iter, cost: s.cost }));
}

if (results.some((r) => !r)) process.exit(1);
