import * as THREE from 'three';
import type { SpeechFeatures } from '../utils/audioProcessing';

/*
 * AYABOT's mouth: a glowing shape drawn by a shader on a small plane that floats just in
 * front of the visor. All sizes below are in "mouth units" (half the plane height), so the
 * shader and the driver agree on proportions regardless of the model's scale.
 *
 * Head_Head_0 local space (from the GLB): the face looks down -Y, +Z is up, +X is across.
 */

// Plane size and placement in Head_Head_0 local units. The visor surface sits at y ≈ -0.072
// around the mouth, and its lower edge is near z = -0.045.
const PLANE_WIDTH = 0.072;
const PLANE_HEIGHT = 0.052;
const MOUTH_UNIT = PLANE_HEIGHT / 2;
const MOUTH_POSITION = new THREE.Vector3(0, -0.0748, -0.026);

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec2 uSize;
  uniform float uUnit;
  uniform float uHalfWidth;
  uniform float uTop;
  uniform float uBottom;
  uniform float uSmile;
  uniform float uRound;
  uniform float uTeeth;
  uniform float uGlow;
  uniform float uHot;
  uniform vec3 uRim;
  uniform vec3 uInner;
  uniform vec3 uDeep;
  uniform vec3 uTongue;
  uniform vec3 uTeethColor;
  varying vec2 vUv;

  void main() {
    vec2 p = (vUv - 0.5) * uSize / uUnit;

    // Lift the corners into a smile and keep the mouth visually centred.
    float xn = p.x / uHalfWidth;
    float ax = abs(xn);
    // The curve stops at the corners so it can't keep rising towards the eyes.
    float cx = min(ax, 1.0);
    float y = p.y - uSmile * (cx * cx - 0.35);

    // Flatter upper lip, rounder dropping jaw; "oo" shapes pull both towards a circle.
    bool upper = y >= 0.0;
    float n = upper ? mix(4.0, 2.0, uRound) : mix(2.6, 2.0, uRound);
    float h = upper ? uTop : uBottom;
    float field = pow(pow(ax, n) + pow(abs(y) / h, n), 1.0 / n) - 1.0;

    // Convert the implicit field into an approximate distance in mouth units.
    float px = max(length(vec2(dFdx(p.x), dFdy(p.x))), 1e-4);
    float gradient = max(length(vec2(dFdx(field), dFdy(field))), 1e-5);
    float d = field / gradient * px;
    // Past the corners the field estimate collapses along the lip line and would draw a
    // neon streak; use the true distance to the corner tip there instead.
    if (ax > 1.0) {
      d = max(d, length(vec2((ax - 1.0) * uHalfWidth, y)));
    }

    float inside = 1.0 - smoothstep(-px, px, d);
    float rimWidth = max(0.075, px * 1.3);
    float rim = 1.0 - smoothstep(rimWidth * 0.5 - px, rimWidth * 0.5 + px, abs(d + rimWidth * 0.5));
    // A tight halo hugging the lips; a wide one fills the plane and shows its edges.
    float glow = exp(-max(d, 0.0) / 0.07) * uGlow * (1.0 - inside);

    // Interior: dark under the upper lip, a little lighter towards the jaw.
    float yn = y / h;
    float depth = clamp((1.0 - yn) * 0.5, 0.0, 1.0);
    vec3 inner = mix(uDeep, uInner, depth * depth);

    float tongue = (1.0 - smoothstep(0.75, 1.0, length(vec2(xn * 1.5, (yn + 1.0) * 2.0))))
      * smoothstep(0.18, 0.4, uBottom) * (upper ? 0.0 : 1.0);
    inner = mix(inner, uTongue, tongue * 0.9);

    float teeth = upper
      ? uTeeth * (1.0 - smoothstep(0.5, 0.62, ax)) * smoothstep(0.42, 0.5, yn) * (1.0 - smoothstep(0.82, 0.9, yn))
      : 0.0;
    inner = mix(inner, uTeethColor, teeth);

    vec3 rimColor = mix(uRim, vec3(0.86, 1.0, 1.0), uHot * 0.45);

    vec3 color = rimColor;
    float alpha = glow * 0.4;
    color = mix(color, inner, inside);
    alpha = max(alpha, inside * 0.97);
    color = mix(color, rimColor, rim);
    alpha = max(alpha, rim);

    // Fade everything out before the plane's edges so no rectangle can ever show.
    vec2 edge = smoothstep(0.0, 0.15, vUv) * smoothstep(0.0, 0.15, 1.0 - vUv);
    alpha *= edge.x * edge.y;

    gl_FragColor = vec4(color, alpha);
  }
`;

export type RobotMouth = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  driver: MouthDriver;
};

export function createMouth(): RobotMouth {
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uSize: { value: new THREE.Vector2(PLANE_WIDTH, PLANE_HEIGHT) },
      uUnit: { value: MOUTH_UNIT },
      uHalfWidth: { value: 0.67 },
      uTop: { value: 0.035 },
      uBottom: { value: 0.035 },
      uSmile: { value: 0.3 },
      uRound: { value: 0 },
      uTeeth: { value: 0 },
      uGlow: { value: 0.5 },
      uHot: { value: 0 },
      uRim: { value: new THREE.Color(0.25, 0.92, 1.0) },
      uInner: { value: new THREE.Color(0.02, 0.2, 0.25) },
      uDeep: { value: new THREE.Color(0.0, 0.03, 0.05) },
      uTongue: { value: new THREE.Color(0.1, 0.5, 0.58) },
      uTeethColor: { value: new THREE.Color(0.78, 0.98, 1.0) },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PLANE_WIDTH, PLANE_HEIGHT), material);
  mesh.name = 'AYABOT_Mouth';
  mesh.position.copy(MOUTH_POSITION);
  // PlaneGeometry faces +Z with +Y up; turn it to face -Y with +Z up like the visor.
  mesh.rotation.x = Math.PI / 2;
  mesh.renderOrder = 10;

  return { mesh, driver: new MouthDriver(material) };
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Frame-rate independent exponential approach towards `target`. */
const approach = (current: number, target: number, rate: number, delta: number) =>
  current + (target - current) * (1 - Math.exp(-rate * delta));

/**
 * Turns live speech features into mouth shapes (open, wide, round, teeth) with
 * attack/release smoothing, so the lips snap open on syllables and close between words.
 */
export class MouthDriver {
  private open = 0;
  private wide = 0.35;
  private round = 0;
  private teeth = 0;
  private loud = 0;
  private peak = 0.05;

  constructor(private readonly material: THREE.ShaderMaterial) {}

  /** Returns the smoothed loudness (0..1) so other motion can follow the voice. */
  update(features: SpeechFeatures, delta: number): number {
    const dt = Math.min(delta, 0.1);

    // Automatic gain: follow loud peaks immediately and relax slowly, so soft and loud
    // speech both use the mouth's full range.
    this.peak = Math.max(features.level, this.peak * Math.exp(-dt / 2.5), 0.04);
    const relative = features.level / this.peak;
    const loudTarget = Math.pow(clamp01((relative - 0.12) / 0.88), 0.8);

    const speaking = loudTarget > 0.02;
    // Speech centroid sits near 400–700 Hz for "oo", ~1 kHz for "ah", 2 kHz+ for "ee" and "s".
    const centroid = speaking && features.centroid > 0 ? clamp01((features.centroid - 400) / 2600) : 0.3;
    const openVowel = clamp01((features.low - 0.35) / 0.4); // "ah", "oh"
    const frontVowel = clamp01((features.mid - 0.3) / 0.35); // "ee", "eh"
    const fricative = clamp01((features.high - 0.3) / 0.35); // "s", "sh", "f"
    const rounded = speaking ? clamp01((0.18 - centroid) / 0.12) * (1 - fricative) : 0; // "oo", "oh"

    let openTarget = loudTarget * (0.55 + 0.45 * openVowel) * (1 - 0.6 * fricative);
    openTarget = Math.max(openTarget, fricative * loudTarget * 0.22);
    const wideTarget = speaking ? clamp01(0.35 + 0.5 * frontVowel + 0.35 * fricative - 0.25 * rounded) : 0.35;
    const teethTarget = Math.max(
      clamp01((openTarget - 0.25) / 0.3) * (0.4 + 0.6 * wideTarget) * (1 - rounded),
      fricative * loudTarget,
    );

    // Lips open fast and close a little slower; shape changes are gentler.
    this.loud = approach(this.loud, loudTarget, loudTarget > this.loud ? 30 : 14, dt);
    this.open = approach(this.open, openTarget, openTarget > this.open ? 28 : 16, dt);
    this.wide = approach(this.wide, wideTarget, 12, dt);
    this.round = approach(this.round, rounded, 12, dt);
    this.teeth = approach(this.teeth, teethTarget, 14, dt);

    const u = this.material.uniforms;
    u.uHalfWidth.value = (0.54 + 0.36 * this.wide) * (1 - 0.38 * this.round);
    u.uTop.value = 0.035 + this.open * 0.4 * (1 - 0.3 * this.wide) + this.round * this.open * 0.12;
    u.uBottom.value = 0.035 + this.open * 0.52 * (1 - 0.25 * this.wide) + this.round * this.open * 0.12;
    u.uSmile.value = 0.3 - 0.2 * this.open - 0.1 * this.round;
    u.uRound.value = this.round;
    u.uTeeth.value = this.teeth;
    u.uGlow.value = 0.5 + 0.6 * this.loud;
    u.uHot.value = this.loud;

    return this.loud;
  }
}
