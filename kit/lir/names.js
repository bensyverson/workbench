// Identifiers the LIR may hold: legal in GLSL ES 3.00 and never colliding with what the target
// or the emitter owns. A core name (`domain-warp.pixel`, `float`, `a__b`) is made one by `safeName`.

/** GLSL ES 3.00 keywords, and the words it reserves for later. */
const KEYWORDS = `attribute const uniform varying break continue do for while switch case default if else in out inout float int void bool true false
invariant discard return mat2 mat3 mat4 mat2x2 mat2x3 mat2x4 mat3x2 mat3x3 mat3x4 mat4x2 mat4x3 mat4x4 vec2 vec3 vec4 ivec2 ivec3 ivec4 bvec2 bvec3 bvec4
uint uvec2 uvec3 uvec4 lowp mediump highp precision sampler2D sampler3D samplerCube sampler2DShadow samplerCubeShadow sampler2DArray sampler2DArrayShadow
isampler2D isampler3D isamplerCube isampler2DArray usampler2D usampler3D usamplerCube usampler2DArray struct centroid flat smooth layout patch sample
subroutine common partition active asm class union enum typedef template this resource goto inline noinline public static extern external interface long
short double half fixed unsigned superp input output hvec2 hvec3 hvec4 fvec2 fvec3 fvec4 dvec2 dvec3 dvec4 sampler1D sampler3DRect sampler2DRect
sampler1DShadow sampler2DRectShadow sizeof cast namespace using filter
coherent volatile restrict readonly writeonly atomic_uint noperspective packed shared buffer row_major column_major
image1D image1DArray image2D image2DArray image3D imageBuffer imageCube iimage1D iimage1DArray iimage2D iimage2DArray iimage3D iimageBuffer iimageCube
uimage1D uimage1DArray uimage2D uimage2DArray uimage3D uimageBuffer uimageCube
sampler1DArray sampler1DArrayShadow isampler1D isampler1DArray isampler2DRect isamplerBuffer usampler1D usampler1DArray usampler2DRect usamplerBuffer
samplerBuffer sampler2DMS sampler2DMSArray isampler2DMS isampler2DMSArray usampler2DMS usampler2DMSArray`.split(/\s+/);

/** The built-in functions: a variable or function of the same name would hide or redefine one. */
const BUILTINS = `radians degrees sin cos tan asin acos atan sinh cosh tanh asinh acosh atanh pow exp log exp2 log2 sqrt inversesqrt abs sign floor trunc round
roundEven ceil fract mod modf min max clamp mix step smoothstep isnan isinf floatBitsToInt floatBitsToUint intBitsToFloat uintBitsToFloat length distance dot
cross normalize faceforward reflect refract matrixCompMult outerProduct transpose determinant inverse lessThan lessThanEqual greaterThan greaterThanEqual
equal notEqual any all not texture textureProj textureLod textureSize texelFetch dFdx dFdy fwidth main packSnorm2x16 unpackSnorm2x16 packUnorm2x16
unpackUnorm2x16 packHalf2x16 unpackHalf2x16 textureGrad textureOffset textureProjLod textureProjGrad textureProjOffset textureLodOffset textureGradOffset
textureProjLodOffset textureProjGradOffset texelFetchOffset`.split(/\s+/);

const RESERVED = new Set([...KEYWORDS, ...BUILTINS]);

/** What the emitter and the program's uniforms own, and what GLSL reserves (`gl_`, and `GL_` for the preprocessor's macros such as `GL_ES`): a name beginning with one is never a local's or a function's. */
export const OWNED_PREFIXES = Object.freeze(["u_", "wb_", "gl_", "GL_"]);

/**
 * Why `name` cannot be an identifier here, or null when it can.
 * @param {string} name
 * @returns {string | null}
 */
export function identifierProblem(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return "is not made of letters, digits and underscores, or begins with a digit";
  if (name.includes("__")) return "has a double underscore, which GLSL reserves";
  if (RESERVED.has(name)) return "is a GLSL keyword or built-in function";
  const owned = OWNED_PREFIXES.find((p) => name.startsWith(p));
  if (owned) return `begins with ${owned}, which the emitter and the uniforms own`;
  return null;
}

/**
 * A legal identifier for `raw` that is not in `taken` (which it joins).
 * @param {string} raw
 * @param {Set<string>} taken
 * @returns {string}
 */
export function safeName(raw, taken) {
  let name = raw.replace(/[^A-Za-z0-9_]+/g, "_").replace(/_+/g, "_").replace(/^(\d)/, "_$1") || "v";
  if (OWNED_PREFIXES.some((p) => name.startsWith(p))) name = `x_${name}`;
  if (RESERVED.has(name) || taken.has(name)) {
    // One underscore first (`float_`), then numbers (`min_1`), on a base without trailing underscores: no candidate holds a double underscore.
    const base = name.replace(/_+$/, "") || "v";
    let n = 0;
    do name = n === 0 && base === name ? `${base}_` : `${base}_${n || 1}`; while (n++, RESERVED.has(name) || taken.has(name));
  }
  taken.add(name);
  return name;
}

/**
 * The name of a uniform: `u_` and the parameter's name, unique among `taken`.
 * @param {string} param
 * @param {Set<string>} taken
 * @returns {string}
 */
export function uniformName(param, taken) {
  let name = `u_${param.replace(/[^A-Za-z0-9_]+/g, "_").replace(/_+/g, "_")}`;
  while (taken.has(name)) name += "_";
  taken.add(name);
  return name;
}
