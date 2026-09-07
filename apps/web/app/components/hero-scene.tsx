"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame, type RootState } from "@react-three/fiber";
import { Text, Stars } from "@react-three/drei";
import * as THREE from "three";
import { DECORATIVE_PI_DIGITS } from "../pi-digits";

/**
 * Full-viewport 3D hero: a faceted "π core" (icosahedron  -  many sharp
 * triangular facets, deliberately not a smooth sphere) with thin orbital
 * rings and a swarm of the actual first ~100 decorative π digits floating
 * in a shell around it. Purely decorative background layer  -  see
 * hero-3d.tsx for the reduced-motion / no-WebGL fallback that skips this
 * entirely.
 *
 * Note: deliberately no postprocessing/bloom pass  -  @react-three/postprocessing's
 * EffectComposer rendered the whole canvas opaque black here (its render
 * target doesn't preserve the alpha this scene needs to blend with the
 * page background). The glow read is achieved with emissive materials +
 * a CSS radial-gradient glow behind the canvas instead  -  simpler, and one
 * fewer fragile dependency.
 */

function FacetedCore() {
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (!group.current) return;
    group.current.rotation.y += delta * 0.09;
    group.current.rotation.x += delta * 0.025;
  });
  return (
    <group ref={group}>
      <mesh>
        <icosahedronGeometry args={[1.05, 1]} />
        <meshStandardMaterial color="#0d0d12" emissive="#f2c94c" emissiveIntensity={0.5} roughness={0.4} metalness={0.4} flatShading />
      </mesh>
      <mesh scale={1.006}>
        <icosahedronGeometry args={[1.05, 1]} />
        <meshBasicMaterial color="#f2c94c" wireframe transparent opacity={0.55} />
      </mesh>
    </group>
  );
}

function OrbitRings() {
  const r1 = useRef<THREE.Mesh>(null);
  const r2 = useRef<THREE.Mesh>(null);
  const r3 = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (r1.current) r1.current.rotation.z += delta * 0.06;
    if (r2.current) r2.current.rotation.x += delta * 0.045;
    if (r3.current) r3.current.rotation.y += delta * 0.07;
  });
  return (
    <>
      <mesh ref={r1} rotation={[Math.PI / 2.2, 0, 0]}>
        <torusGeometry args={[1.9, 0.006, 8, 160]} />
        <meshBasicMaterial color="#8b5cf6" transparent opacity={0.6} />
      </mesh>
      <mesh ref={r2} rotation={[0.35, Math.PI / 3, 0]}>
        <torusGeometry args={[2.35, 0.005, 8, 160]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.45} />
      </mesh>
      <mesh ref={r3} rotation={[1.15, 0, Math.PI / 5]}>
        <torusGeometry args={[2.8, 0.004, 8, 160]} />
        <meshBasicMaterial color="#f2c94c" transparent opacity={0.35} />
      </mesh>
    </>
  );
}

function DigitSwarm({ count = 64 }: { count?: number }) {
  const group = useRef<THREE.Group>(null);
  const items = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const radius = 3.6 + Math.random() * 1.8;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const position: [number, number, number] = [
          radius * Math.sin(phi) * Math.cos(theta),
          radius * Math.sin(phi) * Math.sin(theta) * 0.6,
          radius * Math.cos(phi),
        ];
        return { position, digit: DECORATIVE_PI_DIGITS[i % DECORATIVE_PI_DIGITS.length] };
      }),
    [count]
  );

  useFrame((state) => {
    if (group.current) group.current.rotation.y = state.clock.elapsedTime * 0.018;
  });

  return (
    <group ref={group}>
      {items.map((item, i) => (
        <Text key={i} position={item.position} fontSize={0.2} color="#f2c94c" anchorX="center" anchorY="middle" fillOpacity={0.5}>
          {item.digit}
        </Text>
      ))}
    </group>
  );
}

function CameraRig({ pointer }: { pointer: React.MutableRefObject<{ x: number; y: number }> }) {
  useFrame((state: RootState) => {
    const targetX = pointer.current.x * 0.6;
    const targetY = -pointer.current.y * 0.4 + 0.3;
    state.camera.position.x += (targetX - state.camera.position.x) * 0.02;
    state.camera.position.y += (targetY - state.camera.position.y) * 0.02;
    state.camera.lookAt(0, 0, 0);
  });
  return null;
}

export function HeroScene() {
  const pointer = useRef({ x: 0, y: 0 });

  return (
    <div
      className="absolute inset-0"
      onPointerMove={(e) => {
        pointer.current = { x: (e.clientX / window.innerWidth) * 2 - 1, y: (e.clientY / window.innerHeight) * 2 - 1 };
      }}
    >
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-[68%] h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(242,201,76,0.35) 0%, rgba(139,92,246,0.12) 45%, transparent 70%)" }}
      />
      <Canvas camera={{ position: [0, 0.3, 6.5], fov: 45 }} gl={{ antialias: true, alpha: true }} dpr={[1, 1.5]}>
        <ambientLight intensity={0.5} />
        <pointLight position={[4, 3, 4]} intensity={8} color="#f2c94c" />
        <pointLight position={[-5, -2, -3]} intensity={6} color="#8b5cf6" />

        {/* Anchored low/back so it sits behind the search panel, not the headline text above it. */}
        <group position={[0, -2.1, -1.5]}>
          <FacetedCore />
          <OrbitRings />
        </group>
        <DigitSwarm />
        <Stars radius={40} depth={20} count={800} factor={2} fade speed={0.3} />
        <CameraRig pointer={pointer} />
      </Canvas>
    </div>
  );
}
