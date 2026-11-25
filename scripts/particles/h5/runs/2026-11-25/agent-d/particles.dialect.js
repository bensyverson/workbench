import { defineDialect, vector, exact } from "kit/define";
import { checkLambda, worst } from "./particles.check.js";

const math = (n) => ({ fn: { params: Array(n).fill("f64"), returns: "f64" } });
const many = { fn: { params: ["f64", "f64"], rest: "f64", returns: "f64" } };
const own = (value) => ({ value, write: true });

// The kit calls a convention several times for one lambda, so each answer is kept
// by ref.id. A force's ref does not name the force: forces are first asked for in
// declaration order. A helper's mistake is reported once, by its first caller.
const memory = new WeakMap(); // program → { forces: [ref.id], helpers: Set, answers: Map }

function sourceOf(kind, ref, program, known) {
  if (kind === "update") return program.update;
  if (kind === "force") {
    if (!known.forces.includes(ref.id)) known.forces.push(ref.id);
    return Object.values(program.forces)[known.forces.indexOf(ref.id)];
  }
  return program.emitter.find((e) => e.emitter === ref.on)?.[kind];
}

function refusal(kind, source, program, known) {
  if (typeof source !== "string") return null;
  const { problems } = checkLambda(kind, source, program, program.units ?? []);
  const found = worst(problems.filter((p) => !p.helper || !known.helpers.has(p.message)));
  for (const p of problems) if (p.helper) known.helpers.add(p.message);
  // The kit reports a helper's writes, recursion, kill and counter use itself, at
  // the helper. Refusing the caller too would add an "untyped helper" L014.
  if (!found || (found.helper && [6, 8, 24].includes(found.n))) return null;
  return found.message;
}

function convention(kind, normal) {
  return (ref, program) => {
    if (!memory.has(program)) memory.set(program, { forces: [], helpers: new Set(), answers: new Map() });
    const known = memory.get(program);
    const key = `${kind} ${ref.id}`;
    if (!known.answers.has(key)) known.answers.set(key, refusal(kind, sourceOf(kind, ref, program, known), program, known));
    return known.answers.get(key) ?? normal;
  };
}

export const particlesDialect = defineDialect({
  name: "particles",
  numberType: "f64",
  types: { vec2: vector(2, "f64") },
  spaces: { rate: { pure: true }, particle: { instance: "Particle" } },
  objects: {
    Math: { label: "Math", members: {
      min: many, max: many, abs: math(1), sqrt: math(1), floor: math(1), sin: math(1), cos: math(1), PI: "f64",
    } },
    Params: { label: "the params ($)", members: {} },
    Counters: { label: "the counters (counters)", members: {} },
    Particle: { label: "a particle (p)", members: {
      pos: own("vec2"), vel: own("vec2"), age: "f64", life: own("f64"), size: own("f64"),
      kill: { fn: { params: [], returns: "void" }, effects: ["destroy Particle"] },
    } },
    Rng: { label: "rng", call: { params: [], returns: "f64" }, effects: ["rng"] },
  },
  globals: { Math: "Math", $: "Params", counters: "Counters" },
  intrinsics: {
    length: { params: ["vec2"], returns: "f64", ref: (v) => Math.hypot(v[0], v[1]),
      spell: { js: { call: "length($0)", prelude: "const length = (v) => Math.hypot(v[0], v[1]);" } } },
  },
  targets: { js: { accepts: "*", compare: exact() } },
  // Each convention first runs the language's own check on the lambda's source;
  // a string refuses the lambda (B011).
  slots: {
    rate: convention("rate", { params: ["f64", "f64"], returns: "f64", space: "rate", may: ["read Counters"] }),
    spawn: convention("spawn", { params: ["Particle", "Rng", "f64"], returns: "void", space: "particle", may: ["write Particle", "rng", "bump Counters"] }),
    force: convention("force", { params: ["Particle", "f64"], returns: "void", space: "particle", may: ["write Particle.vel"] }),
    update: convention("update", { params: ["Particle", "f64"], returns: "void", space: "particle", may: ["write Particle", "destroy Particle", "bump Counters"] }),
  },
  helpers: { may: ["read Particle"] },
  params: { object: "Params", name: "$" },
  environment(program) {
    const each = (rec, member) => Object.fromEntries(Object.keys(rec ?? {}).map((n) => [n, member]));
    return { objects: {
      Params: { members: each(program.params, "f64") },
      // a field named like a built-in is refused by the grammar's check
      Particle: { members: Object.fromEntries(Object.entries(each(program.fields, own("f64")))
        .filter(([n]) => !["pos", "vel", "age", "life", "size", "kill"].includes(n))) },
      Counters: { members: each(program.counters, { value: "f64", bump: true }) },
    } };
  },
  // state: { t, maxParticles, bounds: { width, height }, emitters: [name, in declaration order],
  //          counters: { name: number }, particles: [{ emitter: name, pos: [x, y] }] }
  text(state) {
    const { t, maxParticles, bounds, emitters, counters, particles } = state;
    const per = emitters.map((e) => `${e}=${particles.filter((p) => p.emitter === e).length}`);
    const lines = [`t=${t.toFixed(2)} live=${particles.length}/${maxParticles} ${per.join(" ")}`];
    const names = Object.keys(counters);
    if (names.length) lines.push(names.map((n) => `${n}=${counters[n]}`).join(" "));
    const grid = Array.from({ length: 20 }, () => Array(40).fill(0));
    for (const { pos: [x, y] } of particles) {
      const col = Math.max(0, Math.min(39, Math.floor((x / bounds.width) * 40)));
      const row = Math.max(0, Math.min(19, Math.floor((y / bounds.height) * 20)));
      grid[row][col]++;
    }
    for (const row of grid) lines.push(row.map((n) => (n === 0 ? "." : n > 9 ? "#" : String(n))).join(""));
    return lines.join("\n");
  },
});
