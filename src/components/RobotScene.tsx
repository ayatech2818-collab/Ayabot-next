
'use client';

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

const pointerTarget = { x: 0, y: 0 };
let motionEnabled = true;

type RobotSceneProps = {
  getPlaybackLevel: () => number;
};

type RobotModelProps = RobotSceneProps;

function RobotModel({ getPlaybackLevel }: RobotModelProps) {
  const { scene } = useGLTF('/models/ai_robot.glb');

  const mouthRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  const targetOpening = useRef(0.002);
  const currentOpening = useRef(0.002);
  const currentGlow = useRef(1.5);
  const floatingGroupRef = useRef<THREE.Group>(null);
  const headGroupRef = useRef<THREE.Group | null>(null);
  const bodyGroupRef = useRef<THREE.Group | null>(null);
  const neutralHeadRotation = useRef<[number, number, number]>([0, 0, 0]);
  const neutralBodyRotation = useRef<[number, number, number]>([0, 0, 0]);
  const currentHeadRotation = useRef<[number, number, number]>([0, 0, 0]);
  const currentBodyRotation = useRef<[number, number, number]>([0, 0, 0]);
  const currentFloat = useRef(0);

  const { robot, position, scale, headGroup, bodyGroup } = useMemo(() => {
    // Clone the model so the cached GLB remains unchanged.
    const robot = scene.clone(true);

    const box = new THREE.Box3().setFromObject(robot);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxDimension = Math.max(size.x, size.y, size.z) || 1;
    const previousScale = 2.65 / maxDimension;
    const scale = 3.3 / maxDimension;

    const head = robot.getObjectByName('Head_Head_0');

    if (head) {
      const mouthMaterial = new THREE.MeshStandardMaterial({
        color: '#00eaff',
        emissive: '#00eaff',
        emissiveIntensity: 1.5,
        roughness: 0.3,
      });

      const mouth = new THREE.Mesh(
        new THREE.SphereGeometry(1, 32, 16),
        mouthMaterial,
      );

      mouth.name = 'AYABOT_Mouth';

      // Preserve the mouth's established position on the face.
      mouth.position.set(0, -0.074, -0.025);

      // Thin, horizontal resting mouth.
      mouth.scale.set(0.014, 0.002, 0.006);

      head.add(mouth);
    } else {
      console.warn('Head_Head_0 was not found in the robot model.');
    }

    const headGroup = robot.getObjectByName('Head') as THREE.Group | undefined;
    const bodyGroup = robot.getObjectByName('RootNode') as THREE.Group | undefined;

    return {
      robot,
      scale,
      headGroup,
      bodyGroup,
      position: [
        -center.x * scale,
        -center.y * scale + (size.y / 2) * (scale - previousScale),
        -center.z * scale,
      ] as [number, number, number],
    };
  }, [scene]);

  // Retrieve the mouth from the cloned model after it has been created.
  const mouth = robot.getObjectByName(
    'AYABOT_Mouth',
  ) as THREE.Mesh | undefined;

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
    if (mouth) {
      mouthRef.current = mouth;
      materialRef.current = mouth.material as THREE.MeshStandardMaterial;
    }
  }, [mouth, headGroup, bodyGroup]);

  useFrame((state, delta) => {
    const smooth = 1 - Math.exp(-delta * 4.5);
    const time = state.clock.elapsedTime;
    const floatTarget = motionEnabled
      ? (1 - Math.cos((time / 3.6) * Math.PI * 2)) * 0.045
      : 0;
    currentFloat.current = THREE.MathUtils.lerp(currentFloat.current, floatTarget, smooth);
    if (floatingGroupRef.current) floatingGroupRef.current.position.y = currentFloat.current;

    const pointerX = motionEnabled ? pointerTarget.x : 0;
    const pointerY = motionEnabled ? pointerTarget.y : 0;
    const headBase = neutralHeadRotation.current;
    const bodyBase = neutralBodyRotation.current;
    const headTargetX = headBase[0] - pointerY * THREE.MathUtils.degToRad(7);
    const headTargetY = headBase[1] + pointerX * THREE.MathUtils.degToRad(12);
    const headTargetZ = headBase[2];
    const bodyTargetX = bodyBase[0] - pointerY * THREE.MathUtils.degToRad(0.7);
    const bodyTargetY = bodyBase[1] + pointerX * THREE.MathUtils.degToRad(1.2);
    const bodyTargetZ = bodyBase[2] - pointerX * THREE.MathUtils.degToRad(0.6);

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

    const level = getPlaybackLevel();

    // Audio RMS is usually a small value. Amplify it for visible movement.
    const normalizedLevel = THREE.MathUtils.clamp(level * 12, 0, 1);

    // Keep a thin line when idle and open the mouth with louder audio.
    targetOpening.current = 0.002 + normalizedLevel * 0.018;

    // Smooth the movement to avoid jitter.
    const smoothing = 1 - Math.exp(-delta * 18);

    currentOpening.current = THREE.MathUtils.lerp(
      currentOpening.current,
      targetOpening.current,
      smoothing,
    );

    currentGlow.current = THREE.MathUtils.lerp(
      currentGlow.current,
      1.2 + normalizedLevel * 3.5,
      1 - Math.exp(-delta * 10),
    );

    if (mouthRef.current) {
      mouthRef.current.scale.y = currentOpening.current;
    }

    if (materialRef.current) {
      materialRef.current.emissiveIntensity = currentGlow.current;
    }
  });

  return (
    <group ref={floatingGroupRef}>
      <primitive object={robot} position={position} scale={scale} />
    </group>
  );
}

function SceneContent({ getPlaybackLevel }: RobotSceneProps) {
  return (
    <>
      <ambientLight intensity={1.9} />

      <directionalLight
        position={[3, 5, 5]}
        intensity={2.6}
      />

      {/* Subtle cyan backlight for atmospheric silhouette glow */}
      <directionalLight
        position={[-3, 2, -3]}
        color="#00eaff"
        intensity={1.6}
      />

      <pointLight
        position={[0, 2, 2]}
        color="#22d3ee"
        intensity={8}
      />

      <pointLight
        position={[0, -1, -2]}
        color="#00eaff"
        intensity={3}
      />

      <Suspense fallback={null}>
        <RobotModel getPlaybackLevel={getPlaybackLevel} />
        <Environment preset="city" />
      </Suspense>

      <HologramPlatform />
      <OrbitalRings />

    </>
  );
}

function HologramPlatform() {
  return (
    <group position={[0, -1.34, 0]}>
      <mesh position={[0, -0.045, 0]}>
        <cylinderGeometry args={[0.82, 0.94, 0.09, 64]} />
        <meshStandardMaterial color="#071a2b" metalness={0.82} roughness={0.28} transparent opacity={0.92} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
        <torusGeometry args={[0.78, 0.018, 8, 96]} />
        <meshStandardMaterial color="#42f5ff" emissive="#00cce8" emissiveIntensity={2.1} metalness={0.35} roughness={0.24} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, 0]}>
        <torusGeometry args={[0.55, 0.008, 6, 96]} />
        <meshStandardMaterial color="#54e8d2" emissive="#00bda9" emissiveIntensity={1.35} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <circleGeometry args={[0.39, 64]} />
        <meshBasicMaterial color="#13d8eb" transparent opacity={0.11} />
      </mesh>
      <pointLight position={[0, 0.16, 0]} color="#00dff5" intensity={1.4} distance={2.2} />
    </group>
  );
}

function OrbitalRings() {
  const rings = [
    { radius: 1.42, tube: 0.006, rotation: [-Math.PI / 2, 0.08, 0.12] as [number, number, number], color: '#38bdf8', scale: [1, 0.38, 1] as [number, number, number] },
    { radius: 1.62, tube: 0.004, rotation: [-Math.PI / 2, -0.08, -0.18] as [number, number, number], color: '#20d5d5', scale: [1, 0.3, 1] as [number, number, number] },
  ];
  return <group position={[0, -0.82, 0]}>{rings.map((ring) => (
    <mesh key={ring.radius} rotation={ring.rotation} scale={ring.scale}>
      <torusGeometry args={[ring.radius, ring.tube, 6, 128]} />
      <meshBasicMaterial color={ring.color} transparent opacity={0.43} />
    </mesh>
  ))}</group>;
}

export default function RobotScene({ getPlaybackLevel }: RobotSceneProps) {
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
    <div className="robot-scene">
      <Canvas
        camera={{ position: [0, 0.3, 6], fov: 34 }}
        dpr={[1, 1.25]}
        gl={{ antialias: true, alpha: true }}
      >
        <SceneContent getPlaybackLevel={getPlaybackLevel} />
      </Canvas>
    </div>
  );
}
