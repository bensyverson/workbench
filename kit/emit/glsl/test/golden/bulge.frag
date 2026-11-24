#version 300 es
precision highp float;
precision highp int;

uniform float u_t;
uniform float u_aspect;
uniform float u_strength;
uniform float u_cx;
uniform float u_cy;
uniform vec2 wb_resolution;
out vec4 wb_color;

float pmod(float x, float n) {
  return x - (n * floor((x / n)));
}

vec3 grid(vec2 q) {
  float gx = pmod(q.x, 10.0);
  float gy = pmod(q.y, 10.0);
  bool major = ((pmod(floor((q.x / 10.0)), 5.0) == 0.0) && (gx < 1.2)) || ((pmod(floor((q.y / 10.0)), 5.0) == 0.0) && (gy < 1.2));
  if (major) {
    return vec3(0.886, 0.0, 0.102);
  }
  if ((gx < 1.0) || (gy < 1.0)) {
    return vec3(0.45, 0.45, 0.45);
  }
  if (length((q - vec2(75.0, 75.0))) < 20.0) {
    return vec3(0.84, 0.84, 0.84);
  }
  return vec3(1.0, 1.0, 1.0);
}

vec3 bulge_pixel(vec2 uv) {
  float R = 63.0;
  vec2 c = vec2(u_cx, u_cy);
  vec2 d = (uv * 150.0) - c;
  float dist = length(d);
  if (dist < R) {
    if (dist > 0.0) {
      float k = mix(1.0, smoothstep(0.0, (R / dist), (dist / R)), (u_strength * 0.75));
      d = d * k;
    }
  }
  return grid(d + c);
}

void main() {
  vec2 uv = gl_FragCoord.xy / wb_resolution;
  wb_color = vec4(bulge_pixel(uv), 1.0);
}
