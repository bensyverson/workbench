// Probes what the Runtime Subset admits for a lexer/parser written as a Runtime Lambda.
import { defineDialect, defineGrammar, exact, list, lambda, name } from "../../kit/define/index.js";

const d = defineDialect({
  name: "probe",
  numberType: "f64",
  types: {},
  spaces: { calc: { pure: true } },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {
    onText: { params: ["str"], returns: "f64", space: "calc" },
    onCodes: { params: [list("f64", 64)], returns: "f64", space: "calc" },
  },
  text: () => "",
});

const g = defineGrammar(d, {
  root: "p",
  constructs: {
    p: {
      opens: [name()],
      slots: {
        text: { kind: "decl", args: [name("t"), lambda("onText")] },
        codes: { kind: "decl", args: [name("c"), lambda("onCodes")] },
      },
    },
  },
});

const cases = {
  strIndex: ["text", "(s) => { const c = s[0]; if (c == null) return 0; return 1; }"],
  strLength: ["text", "(s) => s.length"],
  strCharCode: ["text", "(s) => s.charCodeAt(0)"],
  listGrowInLoop: ["codes", "(xs) => { let st = [0]; for (const x of xs) { st = [...st, x]; } return st.length; }"],
  listStore: ["codes", "(xs) => { const st = [0, 0]; st[0] = 1; return st.length; }"],
  dfaCount: ["codes", "(xs) => { let st = 0; let n = 0; for (const c of xs) { const isDigit = c >= 48 && c <= 57; if (isDigit && st === 0) { n += 1; st = 1; } else if (!isDigit) { st = 0; } } return n; }"],
  listRead:["codes", "(xs) => { let n = 0; for (let i = 0; i < xs.length; i++) { const c = xs[i]; if (c != null) n += c; } return n; }"],
};

for (const [label, [slot, src]] of Object.entries(cases)) {
  try {
    const rec = g("x")[slot](label, src).build();
    const r = g.lower(rec);
    const ds = r.diagnostics.map((x) => `${x.code} ${x.message}`.slice(0, 160));
    console.log(label.padEnd(16), ds.length ? ds.join(" | ") : "OK");
  } catch (e) {
    const err = /** @type {any} */ (e);
    console.log(label.padEnd(16), "THROWS", String(err.message).slice(0, 200), (err.problems ?? err.diagnostics ?? []).map((p) => p.code).join(","));
  }
}
