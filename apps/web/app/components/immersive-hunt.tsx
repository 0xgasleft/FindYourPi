"use client";

import { Sparkles, Stars, Text } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { PiHunt } from "../pi-hunt";
import { CornerBrackets } from "./corner-brackets";
import { WalletButton } from "./wallet-button";
import { ClaimGallery } from "./claim-gallery";

const PROOF_STEPS = [
  { label: "LOCAL SEARCH", title: "Your query never leaves this browser", body: "Numbers are searched directly in a public suffix array containing 5,000,000 Pi digits. Words are converted locally into a deterministic six-digit SHA-256 prefix.", formula: "suffixArray(digits, query) -> position" },
  { label: "CHUNK PACKING", title: "Digits become cryptographic leaves", body: "The matching digits are covered by fixed 128-digit chunks. Two decimal digits are packed into each byte, then every packed chunk is hashed with Keccak-256.", formula: "leaf[i] = keccak256(pack(128 digits))" },
  { label: "MERKLE PATH", title: "A short path proves public data", body: "Sibling hashes are combined from the matching leaf to the registered root. The browser rebuilds this path and rejects the dataset if its derived root differs.", formula: "root = hash(hash(leaf, sibling), ...)" },
  { label: "DISCOVERY ID", title: "An occurrence has a unique on-chain identity", body: "The identity commits to the dataset version, its immutable root, the exact position, sequence length, and the sequence hash. A matching position cannot be claimed twice.", formula: "keccak256(version, root, position, length, hash(sequence))" },
  { label: "ARC VALIDATION", title: "The contract verifies, then mints", body: "Arc independently validates the chunk proof against the registered dataset root before minting. The claimed mapping blocks the exact same discovery after it confirms.", formula: "verifyOccurrence(root, proof) && !claimed[id]" },
] as const;

function DiscoveryPortal({ activeStep, onSelect }: { activeStep: number; onSelect: (index: number) => void }) {
  const portal = useRef<THREE.Group>(null);
  const outerRing = useRef<THREE.Mesh>(null);
  const innerRing = useRef<THREE.Mesh>(null);

  useFrame(({ clock }, delta) => {
    if (portal.current) {
      portal.current.rotation.y += delta * 0.055;
      portal.current.position.y = 0.38 + Math.sin(clock.elapsedTime * 0.32) * 0.13;
    }
    if (outerRing.current) outerRing.current.rotation.z -= delta * 0.1;
    if (innerRing.current) innerRing.current.rotation.x += delta * 0.15;
  });

  const nodes = useMemo(() => [
    [-2.05, 1.72, 0] as [number, number, number],
    [1.94, 1.64, -0.1] as [number, number, number],
    [2.36, -0.42, 0.1] as [number, number, number],
    [0.56, -1.88, 0] as [number, number, number],
    [-2.04, -1.2, 0.2] as [number, number, number],
  ], []);

  return <group ref={portal} position={[0, 0.38, -3.7]}>
    <mesh rotation={[0.3, 0, 0]}>
      <torusGeometry args={[3.02, 0.022, 12, 180]} />
      <meshBasicMaterial color="#22d3ee" transparent opacity={0.27} />
    </mesh>
    <mesh ref={outerRing} rotation={[1.08, 0.28, 0]}>
      <torusGeometry args={[2.42, 0.04, 14, 180]} />
      <meshStandardMaterial color="#f2c94c" emissive="#f2c94c" emissiveIntensity={1.3} metalness={0.88} roughness={0.2} />
    </mesh>
    <mesh ref={innerRing} rotation={[0.1, 0.86, 0.6]}>
      <torusGeometry args={[1.82, 0.02, 12, 160]} />
      <meshBasicMaterial color="#8b5cf6" transparent opacity={0.46} />
    </mesh>
    <mesh position={[0, 0, -0.62]} rotation={[0.6, 0.2, 0]}>
      <torusKnotGeometry args={[0.62, 0.09, 160, 24, 2, 3]} />
      <meshStandardMaterial color="#101421" emissive="#22d3ee" emissiveIntensity={0.42} metalness={0.92} roughness={0.18} />
    </mesh>
    <Text position={[0, -0.02, 0.13]} fontSize={3.4} color="#f2c94c" outlineWidth={0.012} outlineColor="#fff1b0" anchorX="center" anchorY="middle">π</Text>
    {nodes.map((position, index) => {
      const selected = index === activeStep;
      return <group key={PROOF_STEPS[index]!.label} position={position} onClick={(event) => { event.stopPropagation(); onSelect(index); }}>
        <mesh>
          <octahedronGeometry args={[selected ? 0.22 : 0.16, 0]} />
          <meshStandardMaterial color={selected ? "#f2c94c" : "#101421"} emissive={selected ? "#f2c94c" : "#22d3ee"} emissiveIntensity={selected ? 2 : 0.72} metalness={0.85} roughness={0.18} />
        </mesh>
        <mesh scale={selected ? 1.9 : 1.45}>
          <octahedronGeometry args={[0.16, 0]} />
          <meshBasicMaterial color={selected ? "#f2c94c" : "#22d3ee"} wireframe transparent opacity={0.52} />
        </mesh>
        <Text position={[0, 0.34, 0]} fontSize={0.16} color={selected ? "#fff1b0" : "#7dd3fc"} anchorX="center" anchorY="middle">{String(index + 1).padStart(2, "0")}</Text>
      </group>;
    })}
  </group>;
}

function DataField() {
  const group = useRef<THREE.Group>(null);
  const glyphs = useMemo(() => Array.from({ length: 28 }, (_, index) => {
    const angle = index * 2.39996;
    const radius = 4.15 + (index % 4) * 0.44;
    return { value: String((index * 7 + 3) % 10), position: [Math.cos(angle) * radius, Math.sin(angle * 1.7) * 2.45, -4.5 - (index % 3)] as [number, number, number], scale: 0.12 + (index % 3) * 0.03 };
  }), []);
  useFrame(({ clock }) => { if (group.current) { group.current.rotation.z = clock.elapsedTime * 0.018; group.current.position.y = Math.sin(clock.elapsedTime * 0.35) * 0.1; } });
  return <group ref={group}>{glyphs.map((glyph, index) => <Text key={index} position={glyph.position} fontSize={glyph.scale} color={index % 4 === 0 ? "#22d3ee" : "#f2c94c"} fillOpacity={0.3} anchorX="center" anchorY="middle">{glyph.value}</Text>)}</group>;
}

function CameraMotion() {
  useFrame(({ camera, pointer, clock }) => {
    const x = pointer.x * 0.26;
    const y = pointer.y * 0.16 + Math.sin(clock.elapsedTime * 0.2) * 0.05;
    camera.position.x += (x - camera.position.x) * 0.022;
    camera.position.y += (y - camera.position.y) * 0.022;
    camera.lookAt(0, 0.25, -2.8);
  });
  return null;
}

function TutorialPanel({ activeStep, onSelect, compact = false, onClose }: { activeStep: number; onSelect: (index: number) => void; compact?: boolean; onClose?: () => void }) {
  const step = PROOF_STEPS[activeStep] ?? PROOF_STEPS[0]!;
  return <aside className={`proof-console pointer-events-auto ${compact ? "w-full" : "w-[360px]"} border border-cyan-300/20 bg-void-950/82 p-1 shadow-[0_0_70px_rgba(34,211,238,0.13)] backdrop-blur-xl`} aria-label="Interactive proof tutorial">
    <div className="relative border border-white/10 p-5"><CornerBrackets /><div className="mb-4 flex items-center justify-between gap-3"><div className="font-mono text-[10px] uppercase tracking-[0.22em] text-arc-mint">Interactive proof map</div>{onClose && <button onClick={onClose} className="font-mono text-[10px] uppercase tracking-wide text-neutral-400 hover:text-white">Close</button>}</div>
      <div className="mb-5 flex gap-1.5">{PROOF_STEPS.map((item, index) => <button key={item.label} onClick={() => onSelect(index)} aria-label={`Open ${item.label}`} className={`h-1.5 flex-1 transition ${index === activeStep ? "bg-pi-gold" : "bg-white/10 hover:bg-cyan-300/50"}`} />)}</div>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-pi-gold">{String(activeStep + 1).padStart(2, "0")} / {step.label}</div>
      <h2 className="mt-2 font-display text-xl font-bold leading-tight text-white">{step.title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-neutral-400">{step.body}</p>
      <div className="mt-4 border border-arc-mint/20 bg-black/30 px-3 py-2 font-mono text-[10px] leading-relaxed text-arc-mint">{step.formula}</div>
      <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.14em] text-neutral-500">Select a beacon in the 3D proof field</p>
    </div>
  </aside>;
}

function InterfaceOverlay({ activeStep, onSelect }: { activeStep: number; onSelect: (index: number) => void }) {
  const [mobileTutorial, setMobileTutorial] = useState(false);
  return <div className="pointer-events-none absolute inset-0 z-10 min-h-[720px]">
    <header className="pointer-events-auto absolute inset-x-4 top-5 z-20 flex items-start justify-between gap-4 xl:inset-x-8"><div><div className="font-mono text-[10px] uppercase tracking-[0.38em] text-arc-mint">Arc Mainnet / Dataset v3</div><div className="immersive-title mt-2 font-display text-2xl font-bold tracking-[0.16em] text-white sm:text-3xl">PI HUNTER</div></div><div className="flex items-center gap-2"><ClaimGallery /><WalletButton /></div></header>
    <div className="pointer-events-auto absolute left-4 right-4 top-[5.8rem] xl:left-[max(2rem,calc((100vw-1240px)/2))] xl:right-auto xl:top-1/2 xl:w-[450px] xl:-translate-y-1/2"><div className="immersive-panel max-h-[68svh] overflow-y-auto border border-pi-gold/35 bg-void-950/82 p-1 shadow-[0_0_90px_rgba(242,201,76,0.18)] backdrop-blur-xl"><div className="relative border border-white/10 bg-void-900/75 p-5 sm:p-7"><CornerBrackets /><PiHunt /><button onClick={() => setMobileTutorial(true)} className="mt-5 w-full border border-cyan-300/25 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-arc-mint xl:hidden">Open proof tutorial</button></div></div></div>
    <div className="pointer-events-auto absolute right-[max(2rem,calc((100vw-1240px)/2))] top-1/2 hidden -translate-y-1/2 xl:block"><TutorialPanel activeStep={activeStep} onSelect={onSelect} /></div>
    {mobileTutorial && <div className="pointer-events-auto absolute inset-x-4 top-24 z-30 xl:hidden"><TutorialPanel activeStep={activeStep} onSelect={onSelect} compact onClose={() => setMobileTutorial(false)} /></div>}
    <div className="pointer-events-none absolute bottom-5 left-4 right-4 flex justify-between font-mono text-[9px] uppercase tracking-[0.16em] text-neutral-500 xl:left-8 xl:right-8"><span>5,000,000 digits</span><span>Click proof beacons</span><span>Gas in USDC</span></div>
  </div>;
}

export function ImmersiveHunt() {
  const [activeStep, setActiveStep] = useState(0);
  return <main className="relative h-[100svh] min-h-[720px] overflow-hidden bg-void-950"><div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_44%,rgba(139,92,246,0.18),transparent_32%),radial-gradient(circle_at_20%_70%,rgba(34,211,238,0.08),transparent_28%)]" /><Canvas className="absolute inset-0" camera={{ position: [0, 0, 8.2], fov: 43 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }}><color attach="background" args={["#07080f"]} /><fog attach="fog" args={["#07080f", 8, 20]} /><ambientLight intensity={0.38} /><pointLight position={[3, 3, 5]} intensity={16} color="#f2c94c" /><pointLight position={[-4, -2, 2]} intensity={11} color="#22d3ee" /><pointLight position={[0, 0, -3]} intensity={8} color="#8b5cf6" /><DiscoveryPortal activeStep={activeStep} onSelect={setActiveStep} /><DataField /><Sparkles count={150} scale={[12, 8, 8]} size={1.45} speed={0.28} opacity={0.42} color="#f2c94c" /><Stars radius={36} depth={18} count={900} factor={2} fade speed={0.38} /><CameraMotion /></Canvas><InterfaceOverlay activeStep={activeStep} onSelect={setActiveStep} /></main>;
}
