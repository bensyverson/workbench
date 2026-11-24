#version 300 es
precision highp float;
precision highp int;

uniform float u_t;
uniform float u_aspect;
uniform float u_k;
uniform float u_levels;
uniform float u_scale;
uniform int u_palette;
uniform float u_seed;
uniform vec2 wb_resolution;
out vec4 wb_color;

float ihash(float x, float y, float s) {
  uint h = (uint(int(x)) * 0x27d4eb2du) ^ (uint(int(y)) * 0x165667b1u) ^ (uint(int(s)) * 0x9e3779b1u);
  h ^= h >> 16u; h *= 0x7feb352du; h ^= h >> 15u; h *= 0x846ca68bu; h ^= h >> 16u;
  return float(h) / 4294967296.0;
}

float vnoise(vec2 p, float s) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = (f * f) * (vec2(3.0, 3.0) - (2.0 * f));
  float a = ihash(i.x, i.y, s);
  float b = ihash((i.x + 1.0), i.y, s);
  float c = ihash(i.x, (i.y + 1.0), s);
  float d = ihash((i.x + 1.0), (i.y + 1.0), s);
  return ((a + ((b - a) * u.x)) + ((c - a) * u.y)) + (((((a - b) - c) + d) * u.x) * u.y);
}

float fbm(vec2 p, float s) {
  float v = 0.0;
  float a = 0.5;
  vec2 q = p;
  for (float i = 0.0; i < 5.0; i = i + 1.0) {
    v = v + (a * vnoise(q, s));
    q = vec2((2.02 * ((cos(0.5) * q.x) - (sin(0.5) * q.y))) + 100.0, (2.02 * ((sin(0.5) * q.x) + (cos(0.5) * q.y))) + 100.0);
    a = a * 0.5;
  }
  return v;
}

vec3 domain_warp_pixel(vec2 uv) {
  float s = u_seed * 3.0;
  float k = u_k;
  vec2 p = vec2(uv.x * u_scale, (uv.y * u_scale) / u_aspect);
  vec2 q = vec2(0.0, 0.0);
  vec2 r = vec2(0.0, 0.0);
  float f = 0.0;
  if (u_levels == 0.0) {
    f = fbm(p, s);
  } else {
    q = vec2(fbm(p + vec2(0.03 * u_t, 0.0), s), fbm(p + vec2(5.2, 1.3), s));
    if (u_levels == 1.0) {
      f = fbm(p + (k * q), s);
    } else {
      r = vec2(fbm((p + (k * q)) + vec2(1.7 + (0.15 * u_t), 9.2), s), fbm((p + (k * q)) + vec2(8.3, 2.8 + (0.126 * u_t)), s));
      f = fbm(p + (k * r), s);
    }
  }
  if (u_palette == 1) {
    float g = clamp(((f - 0.2) / 0.6), 0.0, 1.0);
    return vec3(g, g, g);
  }
  vec3 B = vec3(0.051, 0.039, 0.102);
  vec3 L = vec3(0.169, 0.102, 0.431);
  vec3 M = vec3(0.851, 0.271, 0.42);
  vec3 H = vec3(1.0, 0.722, 0.42);
  if (u_palette == 2) {
    B = vec3(0.03, 0.08, 0.06);
    L = vec3(0.1, 0.27, 0.22);
    M = vec3(0.31, 0.56, 0.47);
    H = vec3(0.94, 0.91, 0.83);
    float stripe = 0.5 + (0.5 * sin(((2.2 * (p.x + p.y)) + (9.0 * f))));
    float vein = pow((1.0 - stripe), 6.0);
    float n = clamp(((f - 0.25) / 0.5), 0.0, 1.0);
    vec3 c = (n < 0.5) ? mix(B, L, (n * 2.0)) : mix(L, M, ((n * 2.0) - 1.0));
    return mix(c, H, (0.9 * vein));
  }
  vec3 c_1 = mix(B, L, clamp(((f * f) * 4.0), 0.0, 1.0));
  c_1 = mix(c_1, M, clamp(length(q), 0.0, 1.0));
  c_1 = mix(c_1, H, clamp(abs(r.x), 0.0, 1.0));
  return mix(B, c_1, ((((f * f) * f) + ((0.6 * f) * f)) + (0.5 * f)));
}

void main() {
  vec2 uv = gl_FragCoord.xy / wb_resolution;
  wb_color = vec4(domain_warp_pixel(uv), 1.0);
}
