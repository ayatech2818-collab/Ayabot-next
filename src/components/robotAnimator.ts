import * as THREE from 'three';

/*
 * Procedural "life" for AYABOT: blinking, idle gestures, and body language while speaking.
 * Everything is expressed as small rotation offsets on top of the model's rest pose and is
 * smoothed here, so RobotScene only has to apply the numbers.
 */

const deg = THREE.MathUtils.degToRad;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const approach = (current: number, target: number, rate: number, delta: number) =>
  current + (target - current) * (1 - Math.exp(-rate * delta));
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
const random = (min: number, max: number) => min + Math.random() * (max - min);

/** Rotation offsets in radians. Head/body: pitch + leans forward, yaw turns, roll tilts. */
type Angles = { pitch: number; yaw: number; roll: number };
/**
 * Arm offsets in radians, applied in this order: twist turns the arm about its own length
 * (which way the hand faces), forward lifts the hanging arm in front, outward raises it out
 * to the side, and swing then turns a raised arm towards the front.
 */
type ArmAngles = { forward: number; outward: number; swing: number; twist: number };

export type RobotPose = {
  /** 1 = eyes open, 0 = closed. */
  eyeOpen: number;
  /** How much the head follows the mouse pointer (1 = fully, 0 = ignores it). */
  pointerFollow: number;
  head: Angles;
  body: Angles;
  leftArm: ArmAngles;
  rightArm: ArmAngles;
};

type GestureKind = 'look' | 'tilt' | 'stretch' | 'rest-arm' | 'wave' | 'explain' | 'explain-both';

type Gesture = {
  kind: GestureKind;
  start: number;
  duration: number;
  /** 1 = robot's left arm / one direction, -1 = right arm / the other. */
  side: 1 | -1;
};

const IDLE_GESTURES: { kind: GestureKind; weight: number; duration: [number, number] }[] = [
  { kind: 'look', weight: 0.3, duration: [2.4, 3.2] },
  { kind: 'tilt', weight: 0.25, duration: [2.0, 2.8] },
  { kind: 'stretch', weight: 0.15, duration: [2.0, 2.6] },
  { kind: 'rest-arm', weight: 0.18, duration: [2.2, 3.0] },
  { kind: 'wave', weight: 0.12, duration: [2.2, 2.6] },
];

// Blink timing in seconds (a real blink is ~0.1–0.3 s).
const BLINK_CLOSE = 0.075;
const BLINK_HOLD = 0.05;
const BLINK_OPEN = 0.13;

type UpdateInput = {
  /** Smoothed voice loudness 0..1 from the mouth driver. */
  loudness: number;
  /** True while a conversation is connected. */
  active: boolean;
  /** False when the viewer prefers reduced motion; only blinking remains. */
  motion: boolean;
};

const emptyPose = (): RobotPose => ({
  eyeOpen: 1,
  pointerFollow: 1,
  head: { pitch: 0, yaw: 0, roll: 0 },
  body: { pitch: 0, yaw: 0, roll: 0 },
  leftArm: { forward: 0, outward: 0, swing: 0, twist: 0 },
  rightArm: { forward: 0, outward: 0, swing: 0, twist: 0 },
});

export class RobotAnimator {
  private time = 0;
  private nextBlinkAt = random(1.2, 2.5);
  private blinkStart = -1;
  private doubleBlinkQueued = false;
  private nextIdleAt = random(2.5, 4);
  private nextSpeechGestureAt = 0;
  private idleGesture: Gesture | null = null;
  private speechGesture: Gesture | null = null;
  private speaking = 0;
  private wasActive = false;

  private readonly smoothed = emptyPose();
  private readonly target = emptyPose();
  private readonly output = emptyPose();

  update(delta: number, { loudness, active, motion }: UpdateInput): RobotPose {
    const dt = Math.min(delta, 0.1);
    this.time += dt;
    const t = this.time;

    this.output.eyeOpen = this.updateBlink();

    // Greet with a wave whenever a conversation starts.
    if (active && !this.wasActive && motion) {
      this.idleGesture = { kind: 'wave', start: t, duration: 2.4, side: -1 };
    }
    this.wasActive = active;

    // Speaking envelope: rises quickly with the voice, fades slowly through short pauses.
    const speakingTarget = loudness > 0.04 ? 1 : 0;
    this.speaking = approach(this.speaking, speakingTarget, speakingTarget > this.speaking ? 5 : 1, dt);

    if (!motion) {
      // Keep only blinking; ease every offset back to the rest pose.
      this.resetTarget();
      this.smooth(dt);
      this.copySmoothedToOutput();
      return this.output;
    }

    this.scheduleGestures();
    this.resetTarget();

    const s = this.speaking;
    const idle = 1 - s;
    const { head, body, leftArm, rightArm } = this.target;

    // Constant idle life: breathing arms and a slow drifting gaze.
    const breath = Math.sin(t * 1.7);
    leftArm.outward += deg(3) + breath * deg(1.2);
    rightArm.outward += deg(3) + breath * deg(1.2);
    leftArm.forward += deg(2) + Math.sin(t * 0.9) * deg(1.5);
    rightArm.forward += deg(2) + Math.sin(t * 0.9 + 1.3) * deg(1.5);
    head.yaw += Math.sin(t * 0.45) * deg(2.5) * idle;
    head.roll += Math.sin(t * 0.33 + 0.8) * deg(1.5);

    // Talking body language: gentle sway, expressive head and arms that follow the voice.
    body.yaw += Math.sin(t * 1.15) * deg(2.6) * s;
    body.roll += Math.sin(t * 0.85 + 1.1) * deg(1.6) * s;
    body.pitch += loudness * deg(1.6) * s;
    head.roll += Math.sin(t * 0.95 + 0.4) * deg(4) * s;
    head.yaw += Math.sin(t * 0.62 + 2) * deg(5) * s;
    leftArm.forward += (deg(8) + loudness * deg(7)) * s;
    rightArm.forward += (deg(8) + loudness * deg(7)) * s;
    leftArm.outward += deg(5) * s;
    rightArm.outward += deg(5) * s;

    let wave = { lift: 0, wag: 0 };
    let waveSide: 1 | -1 = 1;
    if (this.idleGesture) {
      wave = this.applyGesture(this.idleGesture, this.idleGesture.kind === 'wave' ? 1 : idle, loudness);
      waveSide = this.idleGesture.side;
    }
    if (this.speechGesture) this.applyGesture(this.speechGesture, s, loudness);

    this.smooth(dt);
    this.copySmoothedToOutput();

    // The wave's quick back-and-forth is added after smoothing so it stays crisp: a small
    // arm lift plus a wrist-like wag about the arm's own axis, which keeps the hand in place
    // in front of the body instead of sweeping it back towards the head.
    if (wave.lift !== 0 || wave.wag !== 0) {
      const arm = waveSide === 1 ? this.output.leftArm : this.output.rightArm;
      arm.outward += wave.lift;
      arm.twist += wave.wag;
    }

    return this.output;
  }

  private updateBlink(): number {
    const t = this.time;
    if (this.blinkStart < 0 && t >= this.nextBlinkAt) this.blinkStart = t;
    if (this.blinkStart < 0) return 1;

    const elapsed = t - this.blinkStart;
    if (elapsed < BLINK_CLOSE) return 1 - smoothstep(0, 1, elapsed / BLINK_CLOSE);
    if (elapsed < BLINK_CLOSE + BLINK_HOLD) return 0;
    if (elapsed < BLINK_CLOSE + BLINK_HOLD + BLINK_OPEN) {
      return smoothstep(0, 1, (elapsed - BLINK_CLOSE - BLINK_HOLD) / BLINK_OPEN);
    }

    this.blinkStart = -1;
    if (!this.doubleBlinkQueued && Math.random() < 0.15) {
      // Now and then blink twice in a row, like people do.
      this.doubleBlinkQueued = true;
      this.nextBlinkAt = t + 0.12;
    } else {
      this.doubleBlinkQueued = false;
      this.nextBlinkAt = t + random(2.4, 4.0);
    }
    return 1;
  }

  private scheduleGestures() {
    const t = this.time;

    if (this.idleGesture && t > this.idleGesture.start + this.idleGesture.duration) {
      this.idleGesture = null;
      this.nextIdleAt = t + random(3.5, 7.5);
    }
    if (!this.idleGesture && this.speaking < 0.3 && t >= this.nextIdleAt) {
      this.idleGesture = this.pickIdleGesture();
    }

    if (this.speechGesture && t > this.speechGesture.start + this.speechGesture.duration) {
      this.speechGesture = null;
      this.nextSpeechGestureAt = t + random(0.4, 1.6);
    }
    if (!this.speechGesture && this.speaking > 0.5 && t >= this.nextSpeechGestureAt) {
      this.speechGesture = {
        kind: Math.random() < 0.3 ? 'explain-both' : 'explain',
        start: t,
        duration: random(1.1, 1.7),
        side: Math.random() < 0.5 ? 1 : -1,
      };
    }
  }

  private pickIdleGesture(): Gesture {
    let roll = Math.random() * IDLE_GESTURES.reduce((sum, g) => sum + g.weight, 0);
    let choice = IDLE_GESTURES[0];
    for (const gesture of IDLE_GESTURES) {
      roll -= gesture.weight;
      if (roll <= 0) {
        choice = gesture;
        break;
      }
    }
    return {
      kind: choice.kind,
      start: this.time,
      duration: random(...choice.duration),
      side: Math.random() < 0.5 ? 1 : -1,
    };
  }

  /** Adds a gesture's contribution to the target pose; returns the wave oscillation, if any. */
  private applyGesture(gesture: Gesture, weight: number, loudness: number): { lift: number; wag: number } {
    const elapsed = this.time - gesture.start;
    const progress = clamp01(elapsed / gesture.duration);
    // Ease in, hold, ease out.
    const e = smoothstep(0, 0.22, progress) * (1 - smoothstep(0.72, 1, progress)) * weight;
    if (e <= 0) return { lift: 0, wag: 0 };

    const { head, body, leftArm, rightArm } = this.target;
    const side = gesture.side;
    const arm = side === 1 ? leftArm : rightArm;

    switch (gesture.kind) {
      case 'look':
        head.yaw += side * deg(14) * e;
        head.pitch -= deg(3) * e;
        body.yaw += side * deg(4) * e;
        break;
      case 'tilt':
        head.roll += side * deg(10) * e;
        head.pitch -= deg(2) * e;
        break;
      case 'stretch':
        leftArm.forward += deg(22) * e;
        rightArm.forward += deg(22) * e;
        leftArm.outward += deg(6) * e;
        rightArm.outward += deg(6) * e;
        head.pitch -= deg(4) * e;
        break;
      case 'rest-arm':
        arm.outward += deg(28) * e;
        body.roll += side * deg(1.5) * e;
        break;
      case 'wave':
        // Look at the viewer while waving instead of turning towards the pointer, which
        // could swing the head in front of the raised hand.
        this.target.pointerFollow -= e;
        // Lift the arm forward and up so the hand waves in front of the body, not beside or
        // behind the head.
        // Tuned against the model's geometry: the hand sits at chin height just outside the
        // face and as far forward as the short arm allows (about twice the old pose), clear of
        // the head through the whole stroke, with the palm turned towards the viewer.
        arm.outward += deg(120) * e;
        arm.forward += deg(62) * e;
        // Turn the forearm so the palm faces the viewer with fingers up, not sideways or back.
        arm.twist -= deg(95) * e;
        // Tilt the head away from the raised hand to keep clear of it.
        head.roll += side * deg(6) * e;
        body.roll -= side * deg(1.5) * e;
        return { lift: Math.sin(elapsed * 9) * deg(6) * e, wag: Math.sin(elapsed * 9) * deg(22) * e };
      case 'explain':
        arm.forward += (deg(32) + loudness * deg(10)) * e;
        arm.outward += deg(14) * e;
        head.yaw += side * deg(4) * e;
        break;
      case 'explain-both':
        leftArm.forward += (deg(26) + loudness * deg(8)) * e;
        rightArm.forward += (deg(26) + loudness * deg(8)) * e;
        leftArm.outward += deg(18) * e;
        rightArm.outward += deg(18) * e;
        break;
    }
    return { lift: 0, wag: 0 };
  }

  private resetTarget() {
    const { head, body, leftArm, rightArm } = this.target;
    this.target.pointerFollow = 1;
    head.pitch = head.yaw = head.roll = 0;
    body.pitch = body.yaw = body.roll = 0;
    leftArm.forward = leftArm.outward = leftArm.swing = leftArm.twist = 0;
    rightArm.forward = rightArm.outward = rightArm.swing = rightArm.twist = 0;
  }

  private smooth(dt: number) {
    const from = this.smoothed;
    const to = this.target;
    from.pointerFollow = approach(from.pointerFollow, clamp01(to.pointerFollow), 6, dt);
    for (const part of ['head', 'body'] as const) {
      from[part].pitch = approach(from[part].pitch, to[part].pitch, 5, dt);
      from[part].yaw = approach(from[part].yaw, to[part].yaw, 5, dt);
      from[part].roll = approach(from[part].roll, to[part].roll, 5, dt);
    }
    for (const part of ['leftArm', 'rightArm'] as const) {
      from[part].forward = approach(from[part].forward, to[part].forward, 6, dt);
      from[part].outward = approach(from[part].outward, to[part].outward, 6, dt);
      from[part].swing = approach(from[part].swing, to[part].swing, 6, dt);
      from[part].twist = approach(from[part].twist, to[part].twist, 6, dt);
    }
  }

  private copySmoothedToOutput() {
    const from = this.smoothed;
    const out = this.output;
    out.pointerFollow = from.pointerFollow;
    Object.assign(out.head, from.head);
    Object.assign(out.body, from.body);
    Object.assign(out.leftArm, from.leftArm);
    Object.assign(out.rightArm, from.rightArm);
  }
}
