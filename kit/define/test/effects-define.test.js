// Per-slot effects in a Dialect definition (scripts/define-trial/docs/api-effects.md, its Codes table): the garden
// is accepted; each case of D012 (widened), D021 and D022 is refused with its code, at its path, naming what is
// wrong; and the same checks run on what environment(program) adds and on what a convention function returns,
// refused the way those paths refuse (a DefinitionError when the Environment is made or the slot is asked for).
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, DefinitionError, DEFINE_CODES, list, struct } from "../index.js";
import { gardenDef } from "../fixtures/garden-dialect.js";

/** The codes, paths and messages of a refused definition, or [] when it is accepted. @param {(d: Record<string, any>) => void} edit */
function refused(edit) {
  const def = gardenDef();
  edit(def);
  try { defineDialect(/** @type {any} */ (def)); return []; } catch (e) {
    if (!(e instanceof DefinitionError)) throw e;
    return e.diagnostics.map((d) => ({ code: d.code, path: d.path.join("."), text: `${d.message} ${d.tip}` }));
  }
}

/** @param {(may: string[]) => string[]} f @returns {(d: Record<string, any>) => void} */
const growMay = (f) => (d) => { d.slots.grow.may = f(d.slots.grow.may); };

test("the garden is accepted: instance and pure spaces, writable members, a verb, a callable object, may, helpers", () => {
  assert.deepEqual(refused(() => {}), []);
});

test("D021 and D022 are define codes, and D012 says a space is pure or an instance space", () => {
  assert.ok("D021" in DEFINE_CODES && "D022" in DEFINE_CODES);
  assert.match(DEFINE_CODES.D012, /instance/);
});

/** @type {Array<[string, string, (d: Record<string, any>) => void, string, RegExp]>} code, why, edit, path, message */
const CASES = [
  ["D012", "both pure and instance", (d) => { d.spaces.plant = { pure: true, instance: "Plant" }; }, "spaces.plant", /plant.*both/],
  ["D012", "neither", (d) => { d.spaces.plant = {}; }, "spaces.plant", /plant.*neither/],
  ["D012", "pure: false", (d) => { d.spaces.weather = { pure: false }; }, "spaces.weather.pure", /weather.*instance/],
  ["D012", "an instance naming no object", (d) => { d.spaces.plant = { instance: "Plnt" }; }, "spaces.plant.instance", /Plnt.*Did you mean 'Plant'/i],
  ["D021", "an unknown verb in may", growMay(() => ["writ Plant"]), "slots.grow.may", /writ.*did you mean 'write'/i],
  ["D021", "an unknown object in may", growMay(() => ["write Plnt"]), "slots.grow.may", /Plnt.*did you mean 'Plant'/i],
  ["D021", "an unknown member in may (no environment(program) to add it)", (d) => { delete d.environment; d.slots.grow.may = ["write Plant.hight"]; }, "slots.grow.may", /hight.*did you mean 'height'/i],
  ["D021", "a write with no object", growMay(() => ["write"]), "slots.grow.may", /names no object/],
  ["D021", "a non-read in a pure space's slot", (d) => { d.slots.rain.may = ["rng"]; }, "slots.rain.may", /rng.*pure/],
  ["D021", "a bump outside an instance space", (d) => { d.slots.rain.may = ["bump Totals"]; }, "slots.rain.may", /bump.*instance space/],
  ["D021", "a non-read in helpers", (d) => { d.helpers = { may: ["write Plant"] }; }, "helpers.may", /helper.*read/i],
  ["D021", "a key in helpers other than may", (d) => { d.helpers = { may: ["read Plant"], can: [] }; }, "helpers.can", /can/],
  ["D021", "a bump of a member that is not a total", growMay(() => ["bump Plant.height"]), "slots.grow.may", /height.*not a total/],
  ["D021", "a write of a member that is not writable", (d) => { d.slots.sow.may = ["write Plant.age"]; }, "slots.sow.may", /age.*not writable/],
  ["D021", "one slot that may read and bump one total", growMay((m) => [...m, "read Totals"]), "slots.grow.may", /read.*bump/],
  ["D021", "a bare read beside a bump", growMay((m) => [...m, "read"]), "slots.grow.may", /read.*bump/],
  ["D021", "write and bump on one member", (d) => { d.objects.Plant.members.height = { value: "f64", write: true, bump: true }; }, "objects.Plant.members.height", /height.*both/],
  ["D021", "write on a member that is not a value", (d) => { d.objects.Plant.members.wilt.write = true; }, "objects.Plant.members.wilt", /wilt.*value/],
  ["D021", "bump on a value that is not f64", (d) => { d.objects.Totals.members.where = { value: "vec2", bump: true }; }, "objects.Totals.members.where", /where.*"f64"/],
  ["D021", "effects on a value member", (d) => { d.objects.Plant.members.age = { value: "f64", effects: ["rng"] }; }, "objects.Plant.members.age", /verb/],
  ["D021", "an unknown verb in a verb's effects", (d) => { d.objects.Plant.members.wilt.effects = ["destry Plant"]; }, "objects.Plant.members.wilt", /destry/],
  ["D021", "effects beside an object with no call", (d) => { d.objects.Totals.effects = ["rng"]; }, "objects.Totals.effects", /Totals.*no call/],
  ["D021", "effects on an intrinsic", (d) => { d.intrinsics = { noise: { params: ["f64"], returns: "f64", ref: (/** @type {number} */ x) => x, spell: { js: "($0)" }, effects: ["rng"] } }; }, "intrinsics.noise.effects", /noise.*pure/],
  ["D022", "a member of the instance's type", (d) => { d.objects.Plant.members.neighbor = "Plant"; }, "objects.Plant.members.neighbor", /neighbor/],
  ["D022", "a method result of the instance's type", (d) => { d.objects.Plant.members.next = { fn: { params: [], returns: "Plant" } }; }, "objects.Plant.members.next", /next/],
  ["D022", "a global of the instance's type", (d) => { d.globals.first = "Plant"; }, "globals.first", /first/],
  ["D022", "a list item of the instance's type", (d) => { d.objects.Plant.members.kin = list("Plant", 4); }, "objects.Plant.members.kin", /kin/],
  ["D022", "a struct field of the instance's type", (d) => { d.globals.pair = struct({ a: "Plant", b: "f64" }); }, "globals.pair", /pair/],
  ["D022", "a list member of the instance's type", (d) => { d.list = { first: "Plant" }; }, "list.first", /first/],
  ["D022", "an intrinsic result of the instance's type", (d) => { d.intrinsics = { pick: { params: ["f64"], returns: "Plant", ref: (/** @type {number} */ x) => x, spell: { js: "($0)" } } }; }, "intrinsics.pick", /pick/],
  ["D022", "an object's call result of the instance's type", (d) => { d.objects.Rng.call.returns = "Plant"; }, "objects.Rng.call", /Rng/],
  ["D022", "a slot outside the instance space that takes one", (d) => { d.slots.rain.params = ["f64", "Plant"]; }, "slots.rain.params", /rain.*Plant/],
  ["D022", "a slot in the instance space that takes none", (d) => { d.slots.sow.params = ["Rng"]; }, "slots.sow.params", /sow.*Plant/],
  ["D022", "a slot in the instance space that takes two", (d) => { d.slots.sow.params = ["Plant", "Plant"]; }, "slots.sow.params", /sow.*Plant/],
  ["D022", "a write of an object outside its instance space", growMay((m) => [...m, "write Totals"]), "slots.grow.may", /Totals/],
  ["D022", "a destroy of an object in another instance space", (d) => { d.objects.Bed = { label: "a bed", members: {} }; d.spaces.bed = { instance: "Bed" }; d.slots.tend = { params: ["Bed"], returns: "void", space: "bed", may: ["destroy Plant"] }; }, "slots.tend.may", /destroy of Plant.*Bed/],
  ["D022", "a verb of another object that destroys an instance", (d) => { d.objects.Totals.members.cull = { fn: { params: [], returns: "void" }, effects: ["destroy Plant"] }; }, "objects.Totals.members.cull", /Totals\.cull.*"destroy Plant".*Plant's own/],
  ["D022", "a verb of another object that writes an instance's member", (d) => { d.objects.Totals.members.flatten = { fn: { params: [], returns: "void" }, effects: ["write Plant.height"] }; }, "objects.Totals.members.flatten", /Totals\.flatten.*"write Plant\.height".*Plant's own/],
  ["D022", "an object's call that destroys an instance", (d) => { d.objects.Rng.effects = ["rng", "destroy Plant"]; }, "objects.Rng.effects", /Rng.*"destroy Plant".*Plant's own/],
  ["D021", "a verb's write of a member that is not writable", (d) => { d.objects.Plant.members.reset = { fn: { params: [], returns: "void" }, effects: ["write Plant.age"] }; }, "objects.Plant.members.reset", /age.*not writable/],
  ["D021", "a verb's bump of a member that is not a total", (d) => { d.objects.Plant.members.reset = { fn: { params: [], returns: "void" }, effects: ["bump Plant.height"] }; }, "objects.Plant.members.reset", /height.*not a total/],
  ["D021", "a call's bump of a member that is not a total", (d) => { d.objects.Rng.effects = ["rng", "bump Plant.height"]; }, "objects.Rng.effects", /height.*not a total/],
  ["D021", "a verb's effect naming an unknown member (no environment(program) to add it)", (d) => { delete d.environment; d.objects.Plant.members.reset = { fn: { params: [], returns: "void" }, effects: ["write Plant.hight"] }; }, "objects.Plant.members.reset", /hight.*did you mean 'height'/i],
  ["D021", "a verb's destroy with no object", (d) => { d.objects.Plant.members.reset = { fn: { params: [], returns: "void" }, effects: ["destroy"] }; }, "objects.Plant.members.reset", /names no object/],
  ["D021", "a verb that returns a value", (d) => { d.objects.Plant.members.reset = { fn: { params: [], returns: "f64" }, effects: ["destroy Plant"] }; }, "objects.Plant.members.reset", /reset.*void/],
];

for (const [code, why, edit, path, message] of CASES) {
  test(`${code}: ${why}`, () => {
    const got = refused(edit);
    const hit = got.find((p) => p.code === code);
    assert.ok(hit, `no ${code} in ${JSON.stringify(got)}`);
    assert.equal(hit.path, path);
    assert.match(hit.text, message);
  });
}

test("a member pattern naming a member environment(program) may add is not refused when the Dialect is defined", () => {
  assert.deepEqual(refused(growMay(() => ["write Plant", "bump Totals.harvest"])), []);
});

test("without environment(program), a member pattern naming no member is refused at once", () => {
  const got = refused((d) => { delete d.environment; d.slots.grow.may = ["bump Totals.harvest"]; });
  assert.ok(got.some((p) => p.code === "D021" && /harvest/.test(p.text)), JSON.stringify(got));
});

test("may and helpers are D001 when they are not lists or objects of the right keys, and keys the API lacks stay D001", () => {
  assert.ok(refused((d) => { d.slots.grow.can = []; }).some((p) => p.code === "D001"));
  assert.ok(refused((d) => { d.objects.Plant.members.age = { value: "f64", size: true, fast: true }; }).some((p) => p.code === "D001"));
  assert.ok(refused((d) => { d.slots.grow.may = "write Plant"; }).some((p) => p.code === "D021"));
});

/** Makes the Environment for a Program; a DefinitionError's codes and messages, or [] when it is made. @param {any} dialect @param {Record<string, any>} program */
function environmentProblems(dialect, program) {
  try { dialect.environment(program); return []; } catch (e) {
    if (!(e instanceof DefinitionError)) throw e;
    return e.diagnostics.map((d) => ({ code: d.code, path: d.path.join("."), text: `${d.message} ${d.tip}` }));
  }
}

test("environment(program): a may naming a member it did not add is D021 when the Environment is made", () => {
  const def = gardenDef();
  def.slots.grow.may = ["write Plant", "bump Totals.harvst"];
  const d = defineDialect(/** @type {any} */ (def));
  const got = environmentProblems(d, { total: { harvest: {} } });
  assert.deepEqual(got.map((p) => p.code), ["D021"]);
  assert.match(got[0].text, /harvst.*did you mean 'harvest'/i);
  assert.deepEqual(environmentProblems(d, { total: { harvst: {} } }), [], "a Program that declares it is fine");
});

test("environment(program): a member it adds of the instance's type is D022, and a bad total D021", () => {
  const def = gardenDef();
  const base = def.environment;
  def.environment = (/** @type {Record<string, any>} */ p) => {
    const r = base(p);
    r.objects.Params.members.who = "Plant";
    r.objects.Totals.members.at = { value: "vec2", bump: true };
    return r;
  };
  const got = environmentProblems(defineDialect(/** @type {any} */ (def)), {});
  assert.deepEqual(got.map((p) => p.code).sort(), ["D021", "D022"]);
  assert.ok(got.some((p) => p.code === "D022" && /who/.test(p.text)));
});

test("a verb of the instance object that destroys it or writes its members is accepted, and so is a verb's or a call's bump of a total", () => {
  assert.deepEqual(refused((d) => {
    d.objects.Plant.members.reset = { fn: { params: [], returns: "void" }, effects: ["write Plant.height", "destroy Plant", "bump Totals.harvest"] };
    d.objects.Rng.effects = ["rng", "bump Totals"];
  }), []);
});

test("environment(program): a verb it adds to another object that destroys an instance is D022", () => {
  const def = gardenDef();
  const base = def.environment;
  def.environment = (/** @type {Record<string, any>} */ p) => {
    const r = base(p);
    r.objects.Totals.members.cull = { fn: { params: [], returns: "void" }, effects: ["destroy Plant"] };
    return r;
  };
  const got = environmentProblems(defineDialect(/** @type {any} */ (def)), {});
  assert.deepEqual(got.map((p) => `${p.code} ${p.path}`), ["D022 environment.objects.Totals.members.cull"]);
  assert.match(got[0].text, /Totals\.cull.*Plant's own/);
});

test("environment(program): a verb's effect naming a member it did not add is D021 when the Environment is made", () => {
  const def = gardenDef();
  def.objects.Plant.members.reset = { fn: { params: [], returns: "void" }, effects: ["bump Totals.harvst"] };
  const d = defineDialect(/** @type {any} */ (def));
  const got = environmentProblems(d, { total: { harvest: {} } });
  assert.deepEqual(got.map((p) => `${p.code} ${p.path}`), ["D021 objects.Plant.members.reset"]);
  assert.match(got[0].text, /harvst.*did you mean 'harvest'/i);
  assert.deepEqual(environmentProblems(d, { total: { harvst: {} } }), [], "a Program that declares it is fine");
});

test("environment(program): a write of a member it adds read-only is D021", () => {
  const def = gardenDef();
  const base = def.environment;
  def.environment = (/** @type {Record<string, any>} */ p) => ({ objects: { ...base(p).objects, Plant: { members: { vigor: "f64" } } } });
  def.slots.grow.may = ["write Plant.vigor"];
  const got = environmentProblems(defineDialect(/** @type {any} */ (def)), {});
  assert.deepEqual(got.map((p) => p.code), ["D021"]);
  assert.match(got[0].text, /vigor.*not writable/);
});

test("a convention function's may is checked as a static one is, when the slot is asked for", () => {
  const def = gardenDef();
  def.slots.grow = () => ({ params: ["Plant", "f64"], returns: "void", space: "plant", may: ["write Plant", "destroy Plant", "bump Totals", "read Totals"] });
  def.slots.sow = () => ({ params: ["Rng"], returns: "void", space: "plant", may: [] });
  def.slots.rain = () => ({ params: ["f64", "Plant"], returns: "f64", space: "weather", may: [] });
  const env = defineDialect(/** @type {any} */ (def)).environment({ total: { n: {} } });
  /** @param {string} kind */
  const ask = (kind) => {
    try { env.slot({ id: `g.${kind}`, kind, on: "g" }); return []; } catch (e) {
      if (!(e instanceof DefinitionError)) throw e;
      return e.diagnostics.map((d) => d.code);
    }
  };
  assert.deepEqual(ask("grow"), ["D021"]);
  assert.deepEqual(ask("sow"), ["D022"]);
  assert.deepEqual(ask("rain"), ["D022"]);
});
