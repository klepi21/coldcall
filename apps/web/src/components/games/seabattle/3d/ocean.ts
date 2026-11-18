/**
 * Night ocean for the 3D Sea Battle board: one ShaderMaterial on a displaced plane.
 * Waves are a small sum of directional sines (kept calm over the 10 by 10 battle grid so the grid
 * stays readable, rougher towards the horizon). The same height function exists in JS (waveHeight)
 * so ships, markers and the crosshair ride the real surface.
 *
 * The fragment shader also paints the neon grid, cell marks (from a 10 by 10 data texture), the aim
 * band, the last shot outline, coordinate labels (canvas texture), fire glow and splash ripples, so
 * the whole sea costs one draw call. Original shader code written for Cold Call.
 */
import * as THREE from 'three';

export const MAX_FIRES = 20;
export const MAX_RIPPLES = 4;

/** Wave components: direction x, direction z, wave number, speed, amplitude. */
const WAVES: [number, number, number, number, number][] = [
  [0.8, 0.6, 0.55, 0.9, 1.0],
  [-0.4, 0.92, 0.9, 1.25, 0.55],
  [0.97, -0.24, 1.6, 1.7, 0.28],
  [-0.7, -0.71, 2.4, 2.2, 0.16],
];

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Height scale: calm on the grid, livelier far away. */
export function waveAmp(x: number, z: number) {
  const d = Math.max(Math.abs(x), Math.abs(z));
  return 0.045 + 0.2 * smooth(5.5, 16, d);
}

export function waveHeight(x: number, z: number, t: number) {
  let h = 0;
  for (const [dx, dz, k, w, a] of WAVES) h += a * Math.sin((dx * x + dz * z) * k + t * w);
  return h * waveAmp(x, z);
}

const wavesGlsl = WAVES.map(([dx, dz, k, w, a]) => `h += ${a.toFixed(3)} * sin(dot(vec2(${dx.toFixed(3)}, ${dz.toFixed(3)}), p) * ${k.toFixed(3)} + t * ${w.toFixed(3)});`).join('\n  ');

const COMMON = /* glsl */ `
float waveAmp(vec2 p) {
  float d = max(abs(p.x), abs(p.y));
  return 0.045 + 0.2 * smoothstep(5.5, 16.0, d);
}
float waveH(vec2 p, float t) {
  float h = 0.0;
  ${wavesGlsl}
  return h * waveAmp(p);
}
`;

const VERT = /* glsl */ `
uniform float uTime;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vH;
${COMMON}
void main() {
  vec3 p = position;
  float h = waveH(p.xz, uTime);
  float e = 0.08;
  float hx = waveH(p.xz + vec2(e, 0.0), uTime);
  float hz = waveH(p.xz + vec2(0.0, e), uTime);
  p.y += h;
  vNormal = normalize(vec3(-(hx - h) / e, 1.0, -(hz - h) / e));
  vH = h / max(waveAmp(p.xz), 0.001);
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform sampler2D uMarks;
uniform sampler2D uLabels;
uniform vec3 uAim;        // col, row, strength (0 = none)
uniform vec3 uHover;      // col, row, strength
uniform vec3 uLast;       // col, row, on
uniform vec3 uFires[${MAX_FIRES}];
uniform int uFireCount;
uniform vec4 uRipples[${MAX_RIPPLES}]; // x, z, start time, strength
uniform float uGrid;      // grid visibility 0..1
uniform float uActive;    // my turn glow 0..1
uniform vec3 uHorizon;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vH;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

void main() {
  vec3 N = normalize(vNormal);
  // small ripples in the normal for a glittering surface
  vec2 q = vWorld.xz * 5.0 + vec2(uTime * 0.5, uTime * 0.3);
  vec2 q2 = vWorld.xz * 1.3 - vec2(uTime * 0.12, uTime * 0.2);
  N = normalize(N + vec3(noise(q) - 0.5, 0.0, noise(q + 7.3) - 0.5) * 0.09 + vec3(noise(q2) - 0.5, 0.0, noise(q2 + 3.1) - 0.5) * 0.05);
  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = max(dot(N, V), 0.0);
  float fres = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, N);
  vec3 zenith = vec3(0.008, 0.016, 0.045);
  vec3 sky = mix(uHorizon * 0.9, zenith, smoothstep(0.0, 0.4, R.y));
  vec3 moonDir = normalize(vec3(-0.35, 0.42, -0.84));
  float glint = smoothstep(0.55, 0.85, noise(vWorld.xz * 9.0 + uTime * 0.8));
  float spec = pow(max(dot(R, moonDir), 0.0), 500.0) * (0.15 + 0.9 * glint) + pow(max(dot(R, moonDir), 0.0), 40.0) * 0.025;
  vec3 deep = vec3(0.002, 0.008, 0.022);
  vec3 body = mix(deep, vec3(0.004, 0.026, 0.048), clamp(vH * 0.5 + 0.5, 0.0, 1.0));
  vec3 col = mix(body, sky, fres) + vec3(0.6, 0.8, 1.0) * spec;

  // foam on crests (mostly away from the grid)
  float crest = smoothstep(0.85, 1.3, vH + (noise(vWorld.xz * 4.0 + uTime * 0.2) - 0.5) * 0.35);
  float far = smoothstep(6.0, 12.0, max(abs(vWorld.x), abs(vWorld.z)));
  col += vec3(0.4, 0.6, 0.7) * crest * (0.01 + 0.05 * far);

  // ---------- battle grid ----------
  vec2 g = vWorld.xz + 5.0;          // 0..10 over the grid
  float inside = step(0.0, g.x) * step(g.x, 10.0) * step(0.0, g.y) * step(g.y, 10.0);
  vec2 cell = floor(g);
  vec2 f = fract(g);
  vec2 fw = fwidth(g);
  vec2 dl = min(f, 1.0 - f) / max(fw, vec2(0.0001));
  float line = 1.0 - smoothstep(0.0, 1.4, min(dl.x, dl.y));
  float glowLine = exp(-min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)) * 22.0);
  vec2 bd = min(g, 10.0 - g);
  float border = exp(-abs(min(bd.x, bd.y)) * 9.0) * step(-0.6, min(bd.x, bd.y));
  vec3 cyan = vec3(0.24, 0.86, 1.0);
  vec3 lime = vec3(0.78, 1.0, 0.24);
  col += cyan * inside * uGrid * (0.006 + line * 0.26 + glowLine * 0.035 + 0.012 * uActive);
  col += cyan * border * uGrid * (0.38 + 0.22 * uActive);
  // centre cross, dashed
  float cx = exp(-abs(g.x - 5.0) * 40.0) + exp(-abs(g.y - 5.0) * 40.0);
  col += cyan * cx * 0.08 * inside * step(0.5, fract((g.x + g.y) * 2.0)) * uGrid;

  // marks
  vec2 cc = f - 0.5;
  float r = length(cc);
  if (inside > 0.5) {
    vec4 m = texture2D(uMarks, (cell + 0.5) / 10.0);
    // miss: white ring with a soft centre
    float ring = exp(-pow((r - 0.22) * 34.0, 2.0));
    col += vec3(0.85, 0.95, 1.0) * m.r * ring * 0.42;
    // auto empty: small dim dot
    col += vec3(0.6, 0.8, 1.0) * m.g * exp(-r * r * 260.0) * 0.45;
    // hit: burning scorch disc
    float flick = 0.85 + 0.15 * sin(uTime * 13.0 + cell.x * 3.1 + cell.y * 1.7);
    col = mix(col, vec3(0.03, 0.01, 0.0), m.b * smoothstep(0.5, 0.15, r) * 0.6);
    col += vec3(1.0, 0.36, 0.08) * m.b * exp(-r * r * 9.0) * 0.8 * flick;
    // sunk: hot red cell outline
    float box = exp(-min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)) * 16.0);
    col += vec3(1.0, 0.28, 0.12) * m.a * (box * 0.5 + 0.06);
  }
  // aim band and cell
  if (uAim.z > 0.0 && inside > 0.5) {
    float band = max(step(abs(cell.x - uAim.x), 0.1), step(abs(cell.y - uAim.y), 0.1));
    float here = step(abs(cell.x - uAim.x), 0.1) * step(abs(cell.y - uAim.y), 0.1);
    col += lime * uAim.z * (band * 0.04 + here * (0.1 + line * 0.6));
  }
  if (uHover.z > 0.0 && inside > 0.5) {
    float here = step(abs(cell.x - uHover.x), 0.1) * step(abs(cell.y - uHover.y), 0.1);
    col += lime * uHover.z * here * (0.05 + line * 0.35);
  }
  // last shot: dashed white outline
  if (uLast.z > 0.0 && inside > 0.5) {
    float here = step(abs(cell.x - uLast.x), 0.1) * step(abs(cell.y - uLast.y), 0.1);
    float edge = 1.0 - smoothstep(0.055, 0.075, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    float dash = step(0.5, fract((f.x + f.y) * 4.0));
    col += vec3(1.0) * here * edge * dash * 0.7;
  }
  // labels
  vec2 luv = (vWorld.xz + 6.0) / 12.0;
  if (luv.x > 0.0 && luv.x < 1.0 && luv.y > 0.0 && luv.y < 1.0) {
    col += texture2D(uLabels, luv).rgb * 0.8 * uGrid;
  }
  // fire light on the water
  for (int i = 0; i < ${MAX_FIRES}; i++) {
    if (i >= uFireCount) break;
    vec3 fp = uFires[i];
    float d2 = dot(vWorld.xz - fp.xy, vWorld.xz - fp.xy);
    float fl = 0.8 + 0.2 * sin(uTime * 11.0 + float(i) * 2.3);
    col += vec3(1.0, 0.38, 0.1) * fp.z * fl * 0.32 * exp(-d2 * 1.1) * (0.4 + fres * 2.0);
  }
  // splash ripples
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 rp = uRipples[i];
    float age = uTime - rp.z;
    if (rp.w <= 0.0 || age < 0.0 || age > 1.8) continue;
    float rad = 0.15 + age * 1.5;
    float d = length(vWorld.xz - rp.xy);
    float rr = exp(-pow((d - rad) * 9.0, 2.0)) + 0.6 * exp(-pow((d - rad * 0.62) * 12.0, 2.0));
    col += vec3(0.85, 0.95, 1.0) * rr * rp.w * (1.0 - age / 1.8) * 0.7;
  }

  // distance haze into the horizon
  float dist = length(vWorld.xz - cameraPosition.xz);
  col = mix(col, uHorizon, smoothstep(16.0, 46.0, dist));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const HORIZON = new THREE.Color(0.02, 0.05, 0.1);

export function makeOceanMaterial(labels: THREE.Texture | null, marks: THREE.DataTexture) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uTime: { value: 0 },
      uMarks: { value: marks },
      uLabels: { value: labels ?? blankTex() },
      uAim: { value: new THREE.Vector3(0, 0, 0) },
      uHover: { value: new THREE.Vector3(0, 0, 0) },
      uLast: { value: new THREE.Vector3(0, 0, 0) },
      uFires: { value: Array.from({ length: MAX_FIRES }, () => new THREE.Vector3()) },
      uFireCount: { value: 0 },
      uRipples: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -99, 0)) },
      uGrid: { value: 1 },
      uActive: { value: 0 },
      uHorizon: { value: HORIZON.clone() },
    },
  });
}

let blank: THREE.DataTexture | null = null;
function blankTex() {
  if (!blank) {
    blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    blank.needsUpdate = true;
  }
  return blank;
}

/** 10 by 10 RGBA marks: r = miss, g = auto empty, b = hit, a = sunk. */
export function makeMarksTexture() {
  const tex = new THREE.DataTexture(new Uint8Array(400), 10, 10, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Coordinates A to J along the near edge and 1 to 10 along the left edge, drawn with the system font. */
export function makeLabelsTexture() {
  if (typeof document === 'undefined') return null;
  const S = 1024;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const g = cv.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  const u = S / 12; // one cell in pixels, the canvas spans -6..6
  g.fillStyle = 'rgb(120, 205, 240)';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${Math.round(u * 0.4)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const COLS = 'ABCDEFGHIJ';
  for (let i = 0; i < 10; i++) {
    g.fillText(COLS[i]!, (i + 1.5) * u, 11.45 * u);
    g.fillText(String(i + 1), 0.5 * u + 2, (i + 1.5) * u);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = false;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/* ---------------- sky dome ---------------- */

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;
const SKY_FRAG = /* glsl */ `
uniform vec3 uHorizon;
uniform float uTime;
varying vec3 vDir;
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 zenith = vec3(0.004, 0.006, 0.02);
  vec3 col = mix(uHorizon, zenith, smoothstep(-0.02, 0.45, y));
  // cyan haze band at the horizon
  col += vec3(0.05, 0.22, 0.3) * exp(-abs(y) * 22.0) * 0.5;
  // violet tint high up
  col += vec3(0.16, 0.09, 0.4) * smoothstep(0.15, 0.9, y) * 0.12;
  vec3 moonDir = normalize(vec3(-0.35, 0.42, -0.84));
  float md = max(dot(d, moonDir), 0.0);
  col += vec3(0.8, 0.88, 1.0) * (smoothstep(0.9993, 0.9996, md) * 1.4 + pow(md, 60.0) * 0.18 + pow(md, 8.0) * 0.04);
  // stars
  vec3 sp = floor(d * 220.0);
  float s = hash(sp);
  float tw = 0.6 + 0.4 * sin(uTime * 2.0 + s * 40.0);
  col += vec3(0.85, 0.9, 1.0) * step(0.9975, s) * smoothstep(0.05, 0.3, y) * tw * 0.8;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function makeSkyMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uHorizon: { value: HORIZON.clone() }, uTime: { value: 0 } },
  });
}
