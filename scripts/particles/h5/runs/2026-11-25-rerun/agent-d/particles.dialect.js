import { defineDialect, vector, exact } from "kit/define";

const num = { params: ["f64"], returns: "f64" };
const many = { params: ["f64", "f64"], rest: "f64", returns: "f64" };
const collide = { message: "particles never see each other in this language, so there is no collide", fix: "remove .collide(…)" };

export const particlesDialect = defineDialect({
  name: "particles",
  numberType: "f64",
  conditions: "bool",
  types: { vec2: vector(2, "f64", { multiply: "scalar" }) },
  spaces: { rate: { pure: true }, particle: { instance: "Particle" } },
  objects: {
    Math: {
      label: "Math",
      members: {
        min: { fn: many }, max: { fn: many },
        abs: { fn: num }, sqrt: { fn: num }, floor: { fn: num }, sin: { fn: num }, cos: { fn: num },
        PI: "f64",
      },
      rejected: {
        random: { message: "Math.random is not available: randomness comes from spawn's rng, kept in a field if needed later", fix: "rng() in spawn" },
        tan: { message: "Math.tan is not in this language", fix: "Math.sin(a) / Math.cos(a)" },
      },
    },
    Params: { label: "the params ($)", members: {} },
    Counters: { label: "counters", members: {} },
    Particle: {
      label: "a particle (p)",
      members: {
        pos: { value: "vec2", write: true },
        vel: { value: "vec2", write: true },
        age: "f64",
        life: { value: "f64", write: true },
        size: { value: "f64", write: true },
        kill: { fn: { params: [], returns: "void" }, effects: ["destroy Particle"] },
      },
      rejected: { collide },
    },
    Rng: { label: "rng", call: { params: [], returns: "f64" }, effects: ["rng"] },
  },
  globals: { Math: "Math", $: "Params", counters: "Counters" },
  intrinsics: {
    length: { params: ["vec2"], returns: "f64", ref: Math.hypot, spell: { js: "Math.hypot($0[0], $0[1])" } },
  },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {
    rate: { params: ["f64", "f64"], returns: "f64", space: "rate", may: ["read Counters"] },
    spawn: { params: ["Particle", "Rng", "f64"], returns: "void", space: "particle", body: "block", may: ["write Particle", "rng", "bump Counters"] },
    force: { params: ["Particle", "f64"], returns: "void", space: "particle", body: "block", may: ["write Particle.vel"] },
    update: { params: ["Particle", "f64"], returns: "void", space: "particle", body: "block", may: ["write Particle", "destroy Particle", "bump Counters"] },
  },
  helpers: { may: ["read Particle"], check: "all" },
  params: { object: "Params", name: "$" },
  environment(program) {
    const params = {};
    for (const n of Object.keys(program.params ?? {})) params[n] = "f64";
    const fields = {};
    for (const n of Object.keys(program.fields ?? {})) fields[n] = { value: "f64", write: true };
    const counters = {};
    for (const n of Object.keys(program.counters ?? {})) counters[n] = { value: "f64", bump: true };
    return { objects: { Params: { members: params }, Particle: { members: fields }, Counters: { members: counters } } };
  },
  // state: { t, maxParticles, bounds: { width, height }, emitters: [name], counters: [[name, value]],
  //          particles: [{ emitter: name, pos: [x, y] }] } as the host has computed it.
  text(state) {
    const { t, maxParticles, bounds, emitters, counters, particles } = state;
    const per = emitters.map((e) => `${e}=${particles.filter((p) => p.emitter === e).length}`);
    const lines = [`t=${t.toFixed(2)} live=${particles.length}/${maxParticles} ${per.join(" ")}`];
    if (counters.length > 0) lines.push(counters.map(([n, v]) => `${n}=${String(v)}`).join(" "));
    const grid = Array.from({ length: 20 }, () => new Array(40).fill(0));
    for (const { pos: [x, y] } of particles) {
      const col = Math.min(39, Math.floor((x / bounds.width) * 40));
      const row = Math.min(19, Math.floor((y / bounds.height) * 20));
      grid[row][col] += 1;
    }
    for (const row of grid) lines.push(row.map((n) => (n === 0 ? "." : n > 9 ? "#" : String(n))).join(""));
    return lines.join("\n");
  },
});
