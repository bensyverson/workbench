// The debugger has no image of its own and its page uploads no textures yet: an image param must be given its value,
// and asking the page for a sampler's upload is refused by name, not sent as NaN. Every other param still works.
import { test } from "node:test";
import assert from "node:assert/strict";
import { uniformsFor, glslUniformValues } from "../index.js";
import { field } from "../../dialects/fields/index.js";

const program = /** @type {any} */ (field("look").param("img", { image: true }).param("k", { value: 2 }).pixel("(uv, u) => color(0, 0, 0)").build());
const IMAGE = { width: 1, height: 1, data: [0, 0, 0, 255] };

test("uniformsFor takes an image param's value from the overrides, and refuses to guess one", () => {
  assert.deepEqual(uniformsFor(program, { img: IMAGE }), { t: 0, aspect: 1, k: 2, img: IMAGE });
  assert.throws(() => uniformsFor(program), /image param 'img'/);
});

test("glslUniformValues refuses a sampler2D by name; a float still uploads", () => {
  assert.deepEqual(glslUniformValues([{ glsl: "u_k", param: "k", kind: "float" }], { k: 2 }), [{ name: "u_k", kind: "float", value: 2 }]);
  assert.throws(() => glslUniformValues([{ glsl: "u_img", param: "img", kind: "sampler2D" }], { img: IMAGE }), /u_img.*image/);
});
