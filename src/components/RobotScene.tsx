
'use client';

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, useGLTF, useProgress } from '@react-three/drei';
import * as THREE from 'three';
import type { SpeechFeatures } from '../utils/audioProcessing';
import { createMouth, type MouthDriver } from './robotMouth';
import { installEyeBlink, type EyeBlink } from './robotEyes';
import { RobotAnimator } from './robotAnimator';

const pointerTarget = { x: 0, y: 0 };
let motionEnabled = true;

type SceneTheme = 'light' | 'dark';

type RobotSceneProps = {
  getSpeechFeatures: () => SpeechFeatures;
  theme: SceneTheme;
  /** True while a conversation is connected (Aya greets with a wave when it starts). */
  active: boolean;
  /** Called once the robot model is in the scene and ready to show. */
  onReady?: () => void;
  /** Loading progress of the model and environment, 0..100. */
  onProgress?: (progress: number) => void;
};

type RobotModelProps = Pick<RobotSceneProps, 'getSpeechFeatures' | 'active' | 'onReady'>;

// Arm node local axes: X runs across the body, Y front-to-back (+Y is behind), Z up (the arm
// hangs along -Z from the shoulder pivot).
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const armSwing = new THREE.Quaternion();
const armOutward = new THREE.Quaternion();
const armForward = new THREE.Quaternion();
const armTwist = new THREE.Quaternion();

/**
 * Rest pose × swing (about Z) × outward (about Y) × forward (about X) × twist (about the
 * arm's own length, also Z at rest). `side` is +1 for the left arm, -1 for the right.
 */
function poseArm(
  arm: THREE.Object3D,
  base: THREE.Quaternion,
  angles: { forward: number; outward: number; swing: number; twist: number },
  side: 1 | -1,
) {
  armSwing.setFromAxisAngle(AXIS_Z, side * angles.swing);
  armOutward.setFromAxisAngle(AXIS_Y, side * angles.outward);
  armForward.setFromAxisAngle(AXIS_X, -angles.forward);
  armTwist.setFromAxisAngle(AXIS_Z, side * angles.twist);
  arm.quaternion.copy(base).multiply(armSwing).multiply(armOutward).multiply(armForward).multiply(armTwist);
}

// Lighting and accent colors per theme. Dark leans on neon glow; light needs
// softer emissives and deeper cyan so the robot stays readable on a pale page.
const SCENE_PALETTE = {
  dark: {
    ambient: 1.9,
    key: 2.6,
    rim: '#00eaff',
    rimIntensity: 1.6,
    fill: '#22d3ee',
    fillIntensity: 8,
    under: 3,
    platformBase: '#071a2b',
    platformRing: '#42f5ff',
    platformRingEmissive: '#00cce8',
    platformRingGlow: 2.1,
    platformInner: '#54e8d2',
    platformInnerEmissive: '#00bda9',
    platformDisc: '#13d8eb',
    platformDiscOpacity: 0.11,
    orbitA: '#38bdf8',
    orbitB: '#20d5d5',
    orbitOpacity: 0.43,
  },
  light: {
    ambient: 2.3,
    key: 2.9,
    rim: '#38bdf8',
    rimIntensity: 1.1,
    fill: '#67e8f9',
    fillIntensity: 4,
    under: 1.2,
    platformBase: '#d6e6f2',
    platformRing: '#0891b2',
    platformRingEmissive: '#06b6d4',
    platformRingGlow: 0.9,
    platformInner: '#14b8a6',
    platformInnerEmissive: '#0d9488',
    platformDisc: '#0891b2',
    platformDiscOpacity: 0.08,
    orbitA: '#0284c7',
    orbitB: '#0d9488',
    orbitOpacity: 0.32,
  },
} as const;

type Palette = (typeof SCENE_PALETTE)[SceneTheme];

function RobotModel({ getSpeechFeatures, active, onReady }: RobotModelProps) {
  const { scene } = useGLTF('/models/ai_robot.glb');

  const mouthDriverRef = useRef<MouthDriver | null>(null);
  const eyeBlinkRef = useRef<EyeBlink | null>(null);
  const animatorRef = useRef<RobotAnimator | null>(null);
  const armsRef = useRef<{
    left: THREE.Object3D;
    right: THREE.Object3D;
    leftBase: THREE.Quaternion;
    rightBase: THREE.Quaternion;
  } | null>(null);
  const currentNod = useRef(0);
  const floatingGroupRef = useRef<THREE.Group>(null);
  const headGroupRef = useRef<THREE.Group | null>(null);
  const bodyGroupRef = useRef<THREE.Group | null>(null);
  const neutralHeadRotation = useRef<[number, number, number]>([0, 0, 0]);
  const neutralBodyRotation = useRef<[number, number, number]>([0, 0, 0]);
  const currentHeadRotation = useRef<[number, number, number]>([0, 0, 0]);
  const currentBodyRotation = useRef<[number, number, number]>([0, 0, 0]);
  const currentFloat = useRef(0);

  const { robot, position, scale, headGroup, bodyGroup, mouthDriver, eyeBlink, leftArm, rightArm } = useMemo(() => {
    // Clone the model so the cached GLB remains unchanged.
    const robot = scene.clone(true);

    const box = new THREE.Box3().setFromObject(robot);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxDimension = Math.max(size.x, size.y, size.z) || 1;
    const previousScale = 2.65 / maxDimension;
    const scale = 3.3 / maxDimension;

    const head = robot.getObjectByName('Head_Head_0');
    let mouthDriver: MouthDriver | null = null;

    if (head) {
      const mouth = createMouth();
      head.add(mouth.mesh);
      mouthDriver = mouth.driver;
    } else {
      console.warn('Head_Head_0 was not found in the robot model.');
    }

    const eyes = robot.getObjectByName('Head_Eyes_0') as THREE.Mesh | undefined;
    let eyeBlink: EyeBlink | null = null;
    if (eyes && !Array.isArray(eyes.material)) {
      // Clones share materials with the cached GLB; give this robot its own visor material
      // so its blink uniform can't be replaced by another instance.
      eyes.material = eyes.material.clone();
      eyeBlink = installEyeBlink(eyes.material);
    }

    const headGroup = robot.getObjectByName('Head') as THREE.Group | undefined;
    const bodyGroup = robot.getObjectByName('RootNode') as THREE.Group | undefined;
    // Arm nodes pivot at the shoulder ball, so rotating them swings the whole arm.
    const leftArm = robot.getObjectByName('LeftArm');
    const rightArm = robot.getObjectByName('RightArm');

    return {
      robot,
      scale,
      headGroup,
      bodyGroup,
      mouthDriver,
      eyeBlink,
      leftArm,
      rightArm,
      position: [
        -center.x * scale,
        -center.y * scale + (size.y / 2) * (scale - previousScale),
        -center.z * scale,
      ] as [number, number, number],
    };
  }, [scene]);

  useEffect(() => {
    if (headGroup) {
      headGroupRef.current = headGroup;
      neutralHeadRotation.current = [headGroup.rotation.x, headGroup.rotation.y, headGroup.rotation.z];
      currentHeadRotation.current = [...neutralHeadRotation.current];
    }
    if (bodyGroup) {
      bodyGroupRef.current = bodyGroup;
      neutralBodyRotation.current = [bodyGroup.rotation.x, bodyGroup.rotation.y, bodyGroup.rotation.z];
      currentBodyRotation.current = [...neutralBodyRotation.current];
    }
    mouthDriverRef.current = mouthDriver;
    eyeBlinkRef.current = eyeBlink;
    armsRef.current = leftArm && rightArm
      ? {
          left: leftArm,
          right: rightArm,
          leftBase: leftArm.quaternion.clone(),
          rightBase: rightArm.quaternion.clone(),
        }
      : null;
    animatorRef.current ??= new RobotAnimator();
  }, [mouthDriver, eyeBlink, headGroup, bodyGroup, leftArm, rightArm]);

  // This component only mounts once the GLB has loaded (it suspends until then).
  useEffect(() => {
    onReady?.();
  }, [onReady]);

  useFrame((state, delta) => {
    // Lip-sync first so the head nod below can follow the same loudness.
    const loudness = mouthDriverRef.current?.update(getSpeechFeatures(), delta) ?? 0;
    currentNod.current = THREE.MathUtils.lerp(
      currentNod.current,
      motionEnabled ? loudness : 0,
      1 - Math.exp(-delta * 8),
    );

    // Blinks, idle gestures and talking body language, layered on the pointer motion below.
    const pose = animatorRef.current?.update(delta, { loudness, active, motion: motionEnabled });
    if (pose) eyeBlinkRef.current?.setOpenness(pose.eyeOpen);

    const smooth = 1 - Math.exp(-delta * 4.5);
    const time = state.clock.elapsedTime;
    const floatTarget = motionEnabled
      ? (1 - Math.cos((time / 3.6) * Math.PI * 2)) * 0.045
      : 0;
    currentFloat.current = THREE.MathUtils.lerp(currentFloat.current, floatTarget, smooth);
    if (floatingGroupRef.current) floatingGroupRef.current.position.y = currentFloat.current;

    const follow = pose?.pointerFollow ?? 1;
    const pointerX = motionEnabled ? pointerTarget.x * follow : 0;
    const pointerY = motionEnabled ? pointerTarget.y * follow : 0;
    const headBase = neutralHeadRotation.current;
    const bodyBase = neutralBodyRotation.current;
    // A small nod on stressed syllables makes speech read as more alive.
    // Head local axes: X pitches (+ nods down), Y is the facing axis (tilt), Z is up (turn).
    const headTargetX = headBase[0] - pointerY * THREE.MathUtils.degToRad(7) + currentNod.current * THREE.MathUtils.degToRad(2.2) + (pose?.head.pitch ?? 0);
    const headTargetY = headBase[1] + pointerX * THREE.MathUtils.degToRad(12) + (pose?.head.roll ?? 0);
    const headTargetZ = headBase[2] + (pose?.head.yaw ?? 0);
    const bodyTargetX = bodyBase[0] - pointerY * THREE.MathUtils.degToRad(0.7) + (pose?.body.pitch ?? 0);
    const bodyTargetY = bodyBase[1] + pointerX * THREE.MathUtils.degToRad(1.2) + (pose?.body.yaw ?? 0);
    const bodyTargetZ = bodyBase[2] - pointerX * THREE.MathUtils.degToRad(0.6) + (pose?.body.roll ?? 0);

    currentHeadRotation.current[0] = THREE.MathUtils.lerp(currentHeadRotation.current[0], headTargetX, smooth);
    currentHeadRotation.current[1] = THREE.MathUtils.lerp(currentHeadRotation.current[1], headTargetY, smooth);
    currentHeadRotation.current[2] = THREE.MathUtils.lerp(currentHeadRotation.current[2], headTargetZ, smooth);
    currentBodyRotation.current[0] = THREE.MathUtils.lerp(currentBodyRotation.current[0], bodyTargetX, smooth);
    currentBodyRotation.current[1] = THREE.MathUtils.lerp(currentBodyRotation.current[1], bodyTargetY, smooth);
    currentBodyRotation.current[2] = THREE.MathUtils.lerp(currentBodyRotation.current[2], bodyTargetZ, smooth);

    if (headGroupRef.current) {
      headGroupRef.current.rotation.set(...currentHeadRotation.current);
    }
    if (bodyGroupRef.current) {
      bodyGroupRef.current.rotation.set(...currentBodyRotation.current);
    }

    const arms = armsRef.current;
    if (arms && pose) {
      poseArm(arms.left, arms.leftBase, pose.leftArm, 1);
      poseArm(arms.right, arms.rightBase, pose.rightArm, -1);
    }
  });

  return (
    <group ref={floatingGroupRef}>
      <primitive object={robot} position={position} scale={scale} />
    </group>
  );
}

function SceneContent({ getSpeechFeatures, theme, active, onReady }: RobotSceneProps) {
  const palette = SCENE_PALETTE[theme];
  return (
    <>
      <ambientLight intensity={palette.ambient} />

      <directionalLight
        position={[3, 5, 5]}
        intensity={palette.key}
      />

      {/* Subtle cyan backlight for atmospheric silhouette glow */}
      <directionalLight
        position={[-3, 2, -3]}
        color={palette.rim}
        intensity={palette.rimIntensity}
      />

      <pointLight
        position={[0, 2, 2]}
        color={palette.fill}
        intensity={palette.fillIntensity}
      />

      <pointLight
        position={[0, -1, -2]}
        color={palette.rim}
        intensity={palette.under}
      />

      <Suspense fallback={null}>
        <RobotModel getSpeechFeatures={getSpeechFeatures} active={active} onReady={onReady} />
        <Environment preset="city" />
      </Suspense>

      <HologramPlatform palette={palette} />
      <OrbitalRings palette={palette} />

    </>
  );
}

function HologramPlatform({ palette }: { palette: Palette }) {
  return (
    <group position={[0, -1.34, 0]}>
      <mesh position={[0, -0.045, 0]}>
        <cylinderGeometry args={[0.82, 0.94, 0.09, 64]} />
        <meshStandardMaterial color={palette.platformBase} metalness={0.82} roughness={0.28} transparent opacity={0.92} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
        <torusGeometry args={[0.78, 0.018, 8, 96]} />
        <meshStandardMaterial color={palette.platformRing} emissive={palette.platformRingEmissive} emissiveIntensity={palette.platformRingGlow} metalness={0.35} roughness={0.24} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, 0]}>
        <torusGeometry args={[0.55, 0.008, 6, 96]} />
        <meshStandardMaterial color={palette.platformInner} emissive={palette.platformInnerEmissive} emissiveIntensity={palette.platformRingGlow * 0.65} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <circleGeometry args={[0.39, 64]} />
        <meshBasicMaterial color={palette.platformDisc} transparent opacity={palette.platformDiscOpacity} />
      </mesh>
      <pointLight position={[0, 0.16, 0]} color={palette.platformRingEmissive} intensity={1.4} distance={2.2} />
    </group>
  );
}

function OrbitalRings({ palette }: { palette: Palette }) {
  const rings = [
    { radius: 1.42, tube: 0.006, rotation: [-Math.PI / 2, 0.08, 0.12] as [number, number, number], color: palette.orbitA, scale: [1, 0.38, 1] as [number, number, number] },
    { radius: 1.62, tube: 0.004, rotation: [-Math.PI / 2, -0.08, -0.18] as [number, number, number], color: palette.orbitB, scale: [1, 0.3, 1] as [number, number, number] },
  ];
  return <group position={[0, -0.82, 0]}>{rings.map((ring) => (
    <mesh key={ring.radius} rotation={ring.rotation} scale={ring.scale}>
      <torusGeometry args={[ring.radius, ring.tube, 6, 128]} />
      <meshBasicMaterial color={ring.color} transparent opacity={palette.orbitOpacity} />
    </mesh>
  ))}</group>;
}

/** Forwards drei's global loading progress to the page's loader. */
function ProgressReporter({ onProgress }: { onProgress?: (progress: number) => void }) {
  const progress = useProgress(state => state.progress);
  useEffect(() => {
    onProgress?.(progress);
  }, [progress, onProgress]);
  return null;
}

export default function RobotScene({ getSpeechFeatures, theme, active, onReady, onProgress }: RobotSceneProps) {
  useEffect(() => {
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    motionEnabled = !reducedMotion.matches;

    const resetPointer = () => {
      pointerTarget.x = 0;
      pointerTarget.y = 0;
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!finePointer.matches || reducedMotion.matches || event.pointerType !== 'mouse') {
        resetPointer();
        return;
      }
      pointerTarget.x = THREE.MathUtils.clamp((event.clientX / window.innerWidth) * 2 - 1, -1, 1);
      pointerTarget.y = THREE.MathUtils.clamp(1 - (event.clientY / window.innerHeight) * 2, -1, 1);
    };
    const onMotionPreferenceChange = (event: MediaQueryListEvent) => {
      motionEnabled = !event.matches;
      if (event.matches) resetPointer();
    };
    const onPointerOut = (event: PointerEvent) => {
      if (event.relatedTarget === null) resetPointer();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerout', onPointerOut, { passive: true });
    window.addEventListener('blur', resetPointer);
    reducedMotion.addEventListener('change', onMotionPreferenceChange);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerout', onPointerOut);
      window.removeEventListener('blur', resetPointer);
      reducedMotion.removeEventListener('change', onMotionPreferenceChange);
      resetPointer();
    };
  }, []);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Canvas
        // Framed so the antenna ball keeps headroom at the top of the float/nod and the platform
        // base stays in view (measured by projecting the scene's bounds).
        camera={{ position: [0, 0, 6], fov: 38.5 }}
        dpr={[1, 1.25]}
        gl={{ antialias: true, alpha: true }}
      >
        <SceneContent getSpeechFeatures={getSpeechFeatures} theme={theme} active={active} onReady={onReady} />
      </Canvas>
      <ProgressReporter onProgress={onProgress} />
    </div>
  );
}
