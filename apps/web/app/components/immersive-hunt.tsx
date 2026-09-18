"use client";

import { useState } from "react";
import { PiHunt, type HuntActivity } from "../pi-hunt";
import { ClaimGallery } from "./claim-gallery";
import { WalletButton } from "./wallet-button";

const PROOF_STEPS = [
  { label: "Locate", eyebrow: "01 / Browser", title: "Find a trace in Pi", body: "Your device searches the public suffix array locally. No query is sent to a server.", formula: "suffix array -> position" },
  { label: "Pack", eyebrow: "02 / Dataset", title: "Compress the evidence", body: "The matching digits live inside fixed 128-digit chunks, packed two digits per byte.", formula: "leaf = keccak256(pack(chunk))" },
  { label: "Prove", eyebrow: "03 / Merkle", title: "Climb to the root", body: "Sibling hashes reconnect your chunk to the registered dataset root.", formula: "leaf + siblings -> root" },
  { label: "Identify", eyebrow: "04 / Identity", title: "Name one exact occurrence", body: "Position, sequence and dataset root form a unique discovery ID. It can only be minted once.", formula: "id = hash(version, root, position)" },
  { label: "Mint", eyebrow: "05 / Arc", title: "Let Arc verify", body: "The contract verifies the path itself before it can mint your card.", formula: "verify(proof) && !claimed(id)" },
] as const;

const PI_STREAMS = [
  "3.14159265358979323846264338327950288419716939937510",
  "58209749445923078164062862089986280348253421170679",
  "82148086513282306647093844609550582231725359408128",
  "48111745028410270193852110555964462294895493038196",
  "44288109756659334461284756482337867831652712019091",
  "45648566923460348610454326648213393607260249141273",
] as const;

function PiField({ activity }: { activity: HuntActivity }) {
  const northwestDigits = `${PI_STREAMS[0]} · ${PI_STREAMS[1]}`;
  const southeastDigits = `${PI_STREAMS[2]} · ${PI_STREAMS[3]}`;

  return <div className={`pi-field pi-field-${activity}`} aria-hidden="true">
    <div className="pi-grid" />
    <div className="pi-vignette" />
    <div className="pi-corner pi-corner-nw">
      <div className="pi-corner-orbit pi-corner-orbit-outer" />
      <div className="pi-corner-orbit pi-corner-orbit-inner" />
      <div className="pi-corner-symbol">π</div>
      <div className="pi-corner-caption">COORDINATE / 00</div>
      <div className="pi-ribbon pi-ribbon-nw">{northwestDigits}</div>
    </div>
    <div className="pi-corner pi-corner-se">
      <div className="pi-corner-orbit pi-corner-orbit-outer" />
      <div className="pi-corner-orbit pi-corner-orbit-inner" />
      <div className="pi-corner-symbol">π</div>
      <div className="pi-corner-caption">ARC / 5042</div>
      <div className="pi-ribbon pi-ribbon-se">{southeastDigits}</div>
    </div>
    <div className="pi-status pi-status-left">DATASET V3 / 5M</div>
    <div className="pi-status pi-status-right">PROOF / LOCAL</div>
  </div>;
}

function ProofGuide({ activeStep, onSelect, onClose }: { activeStep: number; onSelect: (step: number) => void; onClose: () => void }) {
  const step = PROOF_STEPS[activeStep]!;
  return <section className="guide-dock w-[min(92vw,360px)] border border-cyan-300/25 bg-void-950/90 p-1 shadow-[0_0_50px_rgba(34,211,238,0.12)] backdrop-blur-xl"><div className="border border-white/10 p-4"><div className="flex items-center justify-between"><span className="font-mono text-[10px] uppercase tracking-[0.2em] text-arc-mint">Proof map</span><button onClick={onClose} className="font-mono text-[10px] uppercase text-neutral-500 hover:text-white">Hide</button></div><div className="mt-4 grid grid-cols-5 gap-1">{PROOF_STEPS.map((item, index) => <button key={item.label} onClick={() => onSelect(index)} className={`h-8 border font-mono text-[9px] uppercase transition ${activeStep === index ? "border-pi-gold bg-pi-gold/15 text-pi-gold" : "border-white/10 text-neutral-500 hover:border-cyan-300/60 hover:text-arc-mint"}`} aria-label={`Step ${index + 1}: ${item.label}`}>{index + 1}</button>)}</div><div className="mt-5 font-mono text-[10px] uppercase tracking-[0.16em] text-pi-gold">{step.eyebrow}</div><h2 className="mt-1 font-display text-xl font-bold text-white">{step.title}</h2><p className="mt-2 text-sm leading-relaxed text-neutral-400">{step.body}</p><div className="mt-3 border-l-2 border-arc-mint/60 bg-black/30 px-3 py-2 font-mono text-[10px] text-arc-mint">{step.formula}</div></div></section>;
}

function SearchTerminal({ activity, onActivity }: { activity: HuntActivity; onActivity: (activity: HuntActivity) => void }) {
  const expanded = activity === "proof" || activity === "claiming" || activity === "minting" || activity === "claimed" || activity === "error";
  return <div className={`cinematic-terminal ${expanded ? "cinematic-terminal-expanded" : ""} ${activity === "searching" ? "cinematic-terminal-searching" : ""}`}><div className="cinematic-terminal-frame"><div className="mb-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em]"><span className="text-pi-gold">Pi coordinate console</span><span className="text-arc-mint">{activity === "searching" ? "Scanning locally" : activity === "proof" ? "Proof acquired" : activity === "minting" ? "Arc verifying" : activity === "claimed" ? "Card in orbit" : "Ready"}</span></div><PiHunt onActivity={onActivity} /></div></div>;
}

function InterfaceOverlay({ activity, onActivity }: { activity: HuntActivity; onActivity: (activity: HuntActivity) => void }) {
  const [guideOpen, setGuideOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  return <div className="pointer-events-none absolute inset-0 z-10 min-h-[720px]"><div className="cinematic-safe-zone absolute inset-x-0 bottom-4 top-24" /><header className="pointer-events-auto absolute inset-x-4 top-5 z-20 flex items-start justify-between gap-3 sm:inset-x-7"><div><div className="font-mono text-[9px] uppercase tracking-[0.34em] text-arc-mint">Arc Mainnet / Dataset v3</div><div className="mt-2 font-display text-xl font-bold tracking-[0.18em] text-white sm:text-2xl">PI HUNTER</div></div><div className="flex items-center gap-2"><ClaimGallery /><WalletButton /></div></header><div className="pointer-events-auto absolute right-4 top-24 z-20 sm:right-7"><button onClick={() => setGuideOpen((open) => !open)} className="clip-tag-sm border border-cyan-300/30 bg-void-950/70 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.15em] text-arc-mint backdrop-blur transition hover:bg-cyan-300/10">{guideOpen ? "Close guide" : "Proof map"}</button></div>{guideOpen && <div className="pointer-events-auto absolute right-4 top-36 z-30 sm:right-7"><ProofGuide activeStep={activeStep} onSelect={setActiveStep} onClose={() => setGuideOpen(false)} /></div>}<div className="pointer-events-auto absolute inset-x-0 bottom-4 top-24 z-20 flex items-center justify-center px-4 sm:px-7"><SearchTerminal activity={activity} onActivity={onActivity} /></div></div>;
}

export function ImmersiveHunt() {
  const [activity, setActivity] = useState<HuntActivity>("loading");
  return <main className="relative h-[100svh] min-h-[720px] overflow-hidden bg-void-950"><PiField activity={activity} /><InterfaceOverlay activity={activity} onActivity={setActivity} /></main>;
}
