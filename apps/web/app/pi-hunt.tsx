"use client";

import { useEffect, useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount, usePublicClient, useReadContract, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { achievability, computeDiscoveryId, convert, rarityTierForLength, theoreticalRarityLabel, type ConversionMode } from "@pi-hunter/pi-core";
import { search } from "../../../packages/pi-search/src/suffix-array";
import { concatHex, keccak256, toHex, zeroAddress, zeroHash, type Hex } from "viem";
import { NFT_CONTRACT_ADDRESS, piHunterNFTAbi } from "@/lib/contracts";
import { arcMainnet } from "@/lib/chains";
import { WalletButton } from "./components/wallet-button";
import { RarityBadge } from "./components/rarity-badge";
import { CornerBrackets } from "./components/corner-brackets";

const EXAMPLES = ["314159", "271828", "141421", "161803", "123456", "ARC"];
type Manifest = { version: number; digitCount: number; chunkSizeDigits: number; chunkCount: number; merkleRoot: Hex };
type Proof = { dataset_version: number; position: number; sequence_hex: `0x${string}`; proofs: Array<{ chunk_index: number; chunk_data: `0x${string}`; merkle_proof: `0x${string}`[] }> };
type InputKind = "number" | "text";
type HuntResult = { submitted_input: string; input_kind: InputKind; normalized_input: string; pi_dataset_version: number; digits_indexed: number; found: boolean; position?: number; match_length?: number; occurrence_count?: number; available_occurrence_count?: number; occurrence_positions?: number[]; discovery_id?: `0x${string}`; rarity_tier?: "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY" | "MYTHIC"; theoretical_rarity?: string; achievability?: { label: string }; proof?: Proof };
type Engine = { manifest: Manifest; digits: Uint8Array; suffixArray: Int32Array; chunks: Uint8Array[]; layers: Hex[][] };
type Phase = { kind: "loading" } | { kind: "idle" } | { kind: "searching" } | { kind: "result"; result: HuntResult } | { kind: "claiming" } | { kind: "minting"; hash: `0x${string}`; result: HuntResult } | { kind: "claimed"; hash: `0x${string}`; result: HuntResult } | { kind: "error"; message: string };
export type HuntActivity = "loading" | "idle" | "searching" | "proof" | "claiming" | "minting" | "claimed" | "error";

const MAX_OCCURRENCES_TO_CHECK = 1_000;

function modeFor(input: string): ConversionMode { return /^[0-9\s/\-.:]+$/.test(input) ? "number" : "hash"; }
function compact(value: string) { return `${value.slice(0, 10)}...${value.slice(-8)}`; }
function pair(left: Hex, right: Hex): Hex { return keccak256(concatHex([left, right])); }

async function loadEngine(): Promise<Engine> {
  const [manifestResponse, digitsResponse, suffixResponse] = await Promise.all([fetch("/dataset/arc-grant-v3/manifest.json"), fetch("/dataset/arc-grant-v3/raw-digits.bin"), fetch("/dataset/arc-grant-v3/suffix-array.bin")]);
  if (!manifestResponse.ok || !digitsResponse.ok || !suffixResponse.ok) throw new Error("Could not load the public proof dataset.");
  const manifest = await manifestResponse.json() as Manifest;
  const digits = new Uint8Array(await digitsResponse.arrayBuffer());
  const suffixArray = new Int32Array(await suffixResponse.arrayBuffer());
  if (digits.length !== manifest.digitCount || suffixArray.length !== manifest.digitCount) throw new Error("Public dataset files do not match their manifest.");
  const chunks = Array.from({ length: manifest.chunkCount }, (_, chunkIndex) => {
    const packed = new Uint8Array(Math.ceil(manifest.chunkSizeDigits / 2)).fill(0xff);
    const start = chunkIndex * manifest.chunkSizeDigits;
    for (let offset = 0; offset < manifest.chunkSizeDigits && start + offset < digits.length; offset++) {
      const byteIndex = Math.floor(offset / 2); const current = packed[byteIndex]!; const digit = digits[start + offset]!;
      packed[byteIndex] = offset % 2 === 0 ? (digit << 4) | (current & 0x0f) : (current & 0xf0) | digit;
    }
    return packed;
  });
  let current = chunks.map((chunk) => keccak256(chunk)); const layers: Hex[][] = [current];
  while (current.length > 1) { const next: Hex[] = []; for (let index = 0; index < current.length; index += 2) next.push(pair(current[index]!, current[index + 1] ?? current[index]!)); layers.push(next); current = next; }
  if (current[0] !== manifest.merkleRoot) throw new Error("Public dataset integrity check failed: derived Merkle root does not match manifest.");
  return { manifest, digits, suffixArray, chunks, layers };
}

function proofFor(engine: Engine, position: number, length: number): Proof["proofs"] {
  const start = Math.floor(position / engine.manifest.chunkSizeDigits); const end = Math.floor((position + length - 1) / engine.manifest.chunkSizeDigits);
  return Array.from({ length: end - start + 1 }, (_, offset) => {
    const chunkIndex = start + offset; const merkleProof: Hex[] = []; let index = chunkIndex;
    for (let level = 0; level < engine.layers.length - 1; level++) { const layer = engine.layers[level]!; const sibling = index % 2 === 0 ? index + 1 : index - 1; merkleProof.push(layer[sibling] ?? layer[index]!); index = Math.floor(index / 2); }
    return { chunk_index: chunkIndex, chunk_data: toHex(engine.chunks[chunkIndex]!), merkle_proof: merkleProof };
  });
}

function hunt(engine: Engine, input: string, selectedPosition?: number): HuntResult {
  const submittedInput = input.trim(); const mode = modeFor(submittedInput); const conversion = convert(submittedInput, mode, mode === "hash" ? { hashKeepDigits: 6 } : undefined);
  if (conversion.sequence.length < 5) throw new Error("Use at least five search digits. Try one of the examples or a word to create a six-digit private hash.");
  const result = search(engine.digits, engine.suffixArray, conversion.sequence, MAX_OCCURRENCES_TO_CHECK);
  const base = { submitted_input: submittedInput, input_kind: mode === "number" ? "number" as const : "text" as const, normalized_input: conversion.sequence, pi_dataset_version: engine.manifest.version, digits_indexed: engine.manifest.digitCount };
  if (!result.found || result.firstPosition === null) return { ...base, found: false };
  if (result.occurrenceCount > MAX_OCCURRENCES_TO_CHECK) throw new Error("This sequence has more than 1,000 occurrences. Use a longer sequence so every claimable occurrence can be checked on Arc.");
  const occurrencePositions = Array.from(new Set([result.firstPosition, ...result.positions])).sort((left, right) => left - right);
  const position = selectedPosition ?? result.firstPosition;
  if (!occurrencePositions.includes(position)) throw new Error("That occurrence is not available in the local proof index.");
  const discoveryId = computeDiscoveryId({ datasetVersion: BigInt(engine.manifest.version), root: engine.manifest.merkleRoot, position: BigInt(position), matchLength: conversion.sequence.length, sequence: conversion.sequence });
  return { ...base, found: true, position, match_length: conversion.sequence.length, occurrence_count: result.occurrenceCount, occurrence_positions: occurrencePositions, discovery_id: discoveryId, rarity_tier: rarityTierForLength(conversion.sequence.length), theoretical_rarity: theoreticalRarityLabel(conversion.sequence.length), achievability: achievability(conversion.sequence.length, engine.manifest.digitCount), proof: { dataset_version: engine.manifest.version, position, sequence_hex: toHex(Uint8Array.from(conversion.sequence, (digit) => digit.charCodeAt(0) - 48)), proofs: proofFor(engine, position, conversion.sequence.length) } };
}

export function PiHunt({ onActivity }: { onActivity?: (activity: HuntActivity) => void }) {
  const [engine, setEngine] = useState<Engine | null>(null); const [value, setValue] = useState(""); const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const { isConnected, chainId } = useAccount(); const { switchChainAsync } = useSwitchChain(); const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: arcMainnet.id });
  const activeResult = phase.kind === "result" ? phase.result : undefined;
  const activeDiscoveryId = activeResult?.discovery_id;
  const { data: isClaimedOnChain, isLoading: isClaimCheckLoading, isFetching: isClaimCheckFetching, refetch: refetchClaimed } = useReadContract({ address: NFT_CONTRACT_ADDRESS ?? zeroAddress, abi: piHunterNFTAbi, functionName: "claimed", args: [activeDiscoveryId ?? zeroHash], query: { enabled: Boolean(NFT_CONTRACT_ADDRESS && activeDiscoveryId) } });
  const checkingClaim = Boolean(activeDiscoveryId && (isClaimCheckLoading || isClaimCheckFetching));

  useEffect(() => { onActivity?.(phase.kind === "result" ? "proof" : phase.kind); }, [onActivity, phase.kind]);

  useEffect(() => { void loadEngine().then((loaded) => { setEngine(loaded); setPhase({ kind: "idle" }); }).catch((error: unknown) => setPhase({ kind: "error", message: error instanceof Error ? error.message : "The local proof engine could not start." })); }, []);
  function runSearch(input: string) {
    if (!input.trim() || !engine) return;
    setPhase({ kind: "searching" });
    window.setTimeout(() => { void (async () => {
      try {
        const localResult = hunt(engine, input.trim());
        const contractAddress = NFT_CONTRACT_ADDRESS;
        if (!localResult.found || !contractAddress || !publicClient) return setPhase({ kind: "result", result: localResult });
        const positions = localResult.occurrence_positions ?? [];
        const claimedStates: boolean[] = [];
        for (let start = 0; start < positions.length; start += 24) {
          const batch = await Promise.all(positions.slice(start, start + 24).map((position) => {
            const discoveryId = computeDiscoveryId({ datasetVersion: BigInt(engine.manifest.version), root: engine.manifest.merkleRoot, position: BigInt(position), matchLength: localResult.match_length!, sequence: localResult.normalized_input });
            return publicClient.readContract({ address: contractAddress, abi: piHunterNFTAbi, functionName: "claimed", args: [discoveryId] }) as Promise<boolean>;
          }));
          claimedStates.push(...batch);
        }
        const availablePositions = positions.filter((_, index) => !claimedStates[index]);
        if (availablePositions.length === 0) return setPhase({ kind: "result", result: { ...localResult, occurrence_positions: [], available_occurrence_count: 0 } });
        const selectedResult = hunt(engine, localResult.submitted_input, availablePositions[0]);
        setPhase({ kind: "result", result: { ...selectedResult, occurrence_positions: availablePositions, available_occurrence_count: availablePositions.length } });
      } catch (error) {
        setPhase({ kind: "error", message: error instanceof Error ? error.message : "The local proof engine could not complete this request." });
      }
    })(); }, 0);
  }
  function selectOccurrence(position: number) { if (!engine || !activeResult) return; try { const selectedResult = hunt(engine, activeResult.submitted_input, position); const availablePositions = activeResult.occurrence_positions ?? []; setPhase({ kind: "result", result: { ...selectedResult, occurrence_positions: availablePositions, available_occurrence_count: activeResult.available_occurrence_count ?? availablePositions.length } }); } catch (error) { setPhase({ kind: "error", message: error instanceof Error ? error.message : "Could not construct a proof for this occurrence." }); } }
  async function claim(result: HuntResult) {
    if (!result.proof) return;
    if (!isConnected) return setPhase({ kind: "error", message: "Connect an Arc wallet first. Your verified proof stays in this browser." });
    if (!NFT_CONTRACT_ADDRESS) return setPhase({ kind: "error", message: "The Arc contract is not configured yet. The proof is real; deployment is the final setup step." });
    if (isClaimedOnChain) return runSearch(result.submitted_input);
    const freshClaimState = await refetchClaimed();
    if (freshClaimState.data) return runSearch(result.submitted_input);
    setPhase({ kind: "claiming" });
    try {
      if (chainId !== arcMainnet.id) await switchChainAsync({ chainId: arcMainnet.id });
      const hash = await writeContractAsync({ address: NFT_CONTRACT_ADDRESS, abi: piHunterNFTAbi, functionName: "claim", args: [BigInt(result.proof.dataset_version), BigInt(result.proof.position), result.proof.sequence_hex, result.proof.proofs.map((proof) => ({ chunkIndex: BigInt(proof.chunk_index), chunkData: proof.chunk_data, merkleProof: proof.merkle_proof })), result.submitted_input, result.input_kind === "text" ? 1 : 0] });
      setPhase({ kind: "minting", hash, result });
    } catch (error) {
      if (error instanceof Error && /already claimed/i.test(error.message)) return runSearch(result.submitted_input);
      const message = error instanceof Error && /switch|chain/i.test(error.message) ? "Arc Mainnet was not approved in your wallet. Approve the network switch, then claim again." : "The claim was not submitted. Your discovery and locally constructed proof remain available to search again.";
      setPhase({ kind: "error", message });
    }
  }

  const busy = phase.kind === "loading" || phase.kind === "searching";
  return <div className="w-full"><div className="mb-5 flex items-center justify-between gap-3"><span className="font-mono text-[10px] uppercase tracking-[0.18em] text-arc-mint">{phase.kind === "loading" ? "Loading 5,000,000 public Pi digits..." : "Local proof engine online"}</span><span className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500">{isConnected ? "Wallet armed" : "Connect to claim"}</span></div>
    {(phase.kind === "idle" || phase.kind === "loading" || phase.kind === "searching") && <><form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); runSearch(value); }} className="flex flex-col gap-3 sm:flex-row" role="search"><label htmlFor="pi-query" className="sr-only">Enter a number or phrase to locate in Pi</label><input id="pi-query" type="text" autoComplete="off" value={value} onChange={(event) => setValue(event.target.value)} disabled={busy} placeholder="314159, a date, or a word..." className="w-full flex-1 border border-white/15 bg-void-800/80 px-5 py-4 text-base text-neutral-100 placeholder:text-neutral-500 outline-none ring-pi-gold/60 backdrop-blur transition focus:border-pi-gold/50 focus:ring-1 disabled:opacity-60" /><button type="submit" disabled={!value.trim() || busy} className="border border-pi-gold bg-pi-gold px-6 py-4 text-sm font-bold uppercase tracking-wide text-void-950 transition hover:bg-pi-amber disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-neutral-500">{phase.kind === "loading" ? "Preparing proof..." : phase.kind === "searching" ? "Verifying..." : "Find it in Pi"}</button></form><p className="mt-3 text-xs leading-relaxed text-neutral-500">Numbers are searched as written. Words become a deterministic six-digit SHA-256 prefix in your browser, which is never sent to a server. Do not enter secrets.</p><div className="mt-5 flex flex-wrap gap-2" aria-label="Real Pi examples">{EXAMPLES.map((example) => <button key={example} type="button" disabled={busy} onClick={() => setValue(example)} className="clip-tag-sm border border-white/10 px-3 py-1.5 font-mono text-xs font-medium text-neutral-300 transition hover:border-pi-gold/50 hover:text-pi-gold disabled:opacity-40">{example}</button>)}</div></>}
    <AnimatePresence mode="wait">{phase.kind === "result" && <ResultCard key="result" result={phase.result} connected={isConnected} checkingClaim={checkingClaim} onClaim={() => void claim(phase.result)} onSelect={selectOccurrence} onAgain={() => setPhase({ kind: "idle" })} />}{phase.kind === "claiming" && <StatusCard key="claiming" title="Proof locked. Awaiting your Arc wallet..." body="Your browser constructed the exact chunk proof. The contract independently verifies it." />}{phase.kind === "minting" && <MintingCard key="minting" hash={phase.hash} done={() => setPhase({ kind: "claimed", hash: phase.hash, result: phase.result })} failed={() => setPhase({ kind: "error", message: "Arc did not confirm the transaction. Your proof has not been lost." })} />}{phase.kind === "claimed" && <ClaimedCard key="claimed" hash={phase.hash} result={phase.result} again={() => setPhase({ kind: "idle" })} />}{phase.kind === "error" && <StatusCard key="error" title="Almost there" body={phase.message} action="Try another search" onAction={() => setPhase({ kind: "idle" })} />}</AnimatePresence>
  </div>;
}

function OccurrencePicker({ result, onSelect }: { result: HuntResult; onSelect: (position: number) => void }) { const positions = result.occurrence_positions ?? []; if (positions.length < 2) return null; return <div className="mt-5 border border-cyan-300/15 bg-black/20 p-3 text-left"><div className="font-mono text-[10px] uppercase tracking-[0.14em] text-arc-mint">Choose an unclaimed occurrence</div><p className="mt-1 text-xs text-neutral-500">{result.available_occurrence_count?.toLocaleString()} unclaimed out of {result.occurrence_count?.toLocaleString()} total occurrences.</p><div className="mt-3 flex flex-wrap gap-2">{positions.map((position) => <button key={position} onClick={() => onSelect(position)} className={`border px-2 py-1 font-mono text-[10px] transition ${position === result.position ? "border-pi-gold bg-pi-gold/10 text-pi-gold" : "border-white/15 text-neutral-300 hover:border-arc-mint hover:text-arc-mint"}`}>#{position.toLocaleString()}</button>)}</div></div>; }
function ResultCard({ result, connected, checkingClaim, onClaim, onSelect, onAgain }: { result: HuntResult; connected: boolean; checkingClaim: boolean; onClaim: () => void; onSelect: (position: number) => void; onAgain: () => void }) { if (!result.found) return <StatusCard title="Not in this public index yet." body={`We checked all ${result.digits_indexed.toLocaleString()} committed Pi digits locally. Try a six-digit example or a different word.`} action="Search again" onAction={onAgain} />; if (result.available_occurrence_count === 0) return <StatusCard title="No unclaimed occurrence is available." body={`All ${result.occurrence_count?.toLocaleString()} occurrences of ${result.submitted_input} are already minted on Arc.`} action="Search another sequence" onAction={onAgain} />; return <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative mt-6 border border-pi-gold/30 bg-void-800/70 px-6 py-7 text-center backdrop-blur"><CornerBrackets /><div className="font-display text-sm font-bold uppercase tracking-[0.2em] text-pi-gold">Occurrence independently provable</div><div className="mt-3 inline-flex border border-arc-mint/30 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-arc-mint">{result.input_kind === "number" ? "Number input" : "Text input / hash route"}</div><div className="mt-3 break-words font-mono text-4xl font-bold text-white">{result.submitted_input}</div>{result.input_kind === "text" && <p className="mt-2 font-mono text-[10px] text-neutral-500">Pi proof sequence {result.normalized_input}</p>}<div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-sm text-neutral-400"><span>Position <span className="font-mono text-white">{result.position!.toLocaleString()}</span></span><span>{result.match_length} digits</span>{result.rarity_tier && <RarityBadge tier={result.rarity_tier} />}</div><OccurrencePicker result={result} onSelect={onSelect} /><div className="mt-6 grid gap-px border border-white/10 bg-white/10 text-left sm:grid-cols-3"><ProofFact title="01 / Search" value={`${result.available_occurrence_count?.toLocaleString()} unclaimed / ${result.occurrence_count?.toLocaleString()} total`} /><ProofFact title="02 / Commit" value={`Pi dataset v${result.pi_dataset_version}`} /><ProofFact title="03 / Verify" value="Merkle proof ready" accent /></div><p className="mt-4 break-all font-mono text-[10px] leading-relaxed text-neutral-500">discovery {compact(result.discovery_id!)}</p><p className="mt-2 text-xs text-neutral-500">{result.theoretical_rarity} / {result.achievability?.label} / input label becomes public and permanent when claimed.</p><div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">{connected ? <button onClick={onClaim} disabled={checkingClaim} className="border border-pi-gold bg-pi-gold px-6 py-3 text-sm font-bold uppercase tracking-wide text-void-950 transition hover:bg-pi-amber disabled:cursor-wait disabled:opacity-60">{checkingClaim ? "Checking Arc..." : "Claim on Arc"}</button> : <WalletButton />}<button onClick={onAgain} className="text-sm text-neutral-400 underline underline-offset-4">Search again</button></div>{!connected && <p className="mt-3 text-xs text-neutral-500">Connect your wallet to unlock the Arc claim. Gas is paid in USDC.</p>}</motion.div>; }
function ProofFact({ title, value, accent = false }: { title: string; value: string; accent?: boolean }) { return <div className="bg-void-900/80 p-3"><div className="font-mono text-[10px] uppercase tracking-wide text-neutral-500">{title}</div><div className={`mt-1 text-xs ${accent ? "text-arc-mint" : "text-neutral-200"}`}>{value}</div></div>; }
function StatusCard({ title, body, action, onAction }: { title: string; body: string; action?: string; onAction?: () => void }) { return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 border border-white/10 bg-void-800/60 px-6 py-7 text-center"><div className="font-display text-xl font-bold text-white">{title}</div><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-neutral-500">{body}</p>{action && <button onClick={onAction} className="mt-4 text-sm text-pi-gold underline underline-offset-4">{action}</button>}</motion.div>; }
function MintingCard({ hash, done, failed }: { hash: `0x${string}`; done: () => void; failed: () => void }) { const { isSuccess, isError } = useWaitForTransactionReceipt({ hash }); useEffect(() => { if (isSuccess) done(); }, [isSuccess, done]); useEffect(() => { if (isError) failed(); }, [isError, failed]); return <StatusCard title="Arc is verifying your proof..." body="The transaction includes public chunk data and sibling hashes. No server can fabricate this result." />; }
function ClaimedCard({ hash, result, again }: { hash: `0x${string}`; result: HuntResult; again: () => void }) { const accent = (result.position ?? 0) % 2 === 0 ? "#22d3ee" : "#8b5cf6"; return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative mt-6 overflow-hidden border border-arc-mint/40 bg-arc-mint/[0.06] px-6 py-8 text-center"><CornerBrackets /><div className="font-mono text-[10px] uppercase tracking-[0.24em] text-arc-mint">Mint confirmed / card reveal</div><motion.div initial={{ opacity: 0, rotateY: -92, y: 24, scale: 0.82 }} animate={{ opacity: 1, rotateY: 0, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 120, damping: 15, delay: 0.15 }} style={{ perspective: 1200, transformStyle: "preserve-3d" }} className="mx-auto mt-6 max-w-[330px]"><div className="relative aspect-square overflow-hidden border-2 border-pi-gold/80 bg-void-950 p-5 shadow-[0_0_50px_rgba(242,201,76,0.3)]" style={{ backgroundImage: `radial-gradient(circle at 50% 42%, ${accent}40, transparent 36%), linear-gradient(135deg, #07080f, #151022)` }}><motion.div className="absolute inset-[12%] rounded-full border border-pi-gold/50" animate={{ rotate: 360 }} transition={{ duration: 12, repeat: Infinity, ease: "linear" }} /><motion.div className="absolute inset-[23%] rounded-full border" style={{ borderColor: accent }} animate={{ rotate: -360 }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }} /><div className="relative font-mono text-[10px] tracking-[0.22em] text-pi-gold">PI HUNTER / ARC</div><div className="relative mt-[22%] break-words font-mono text-4xl font-bold text-white">{result.submitted_input}</div><div className="relative mt-3 font-mono text-[10px] uppercase text-arc-mint">{result.input_kind === "number" ? "Number input" : "Text input"}</div><div className="relative mt-3 font-mono text-xs text-neutral-300">POSITION {result.position?.toLocaleString()}</div><div className="relative mt-10 font-mono text-[10px] tracking-[0.18em]" style={{ color: accent }}>VERIFIED OCCURRENCE</div></div></motion.div><div className="mt-6 font-display text-2xl font-bold text-arc-mint">Your place in Pi is now on Arc.</div><p className="mt-3 font-mono text-xs text-neutral-400">{compact(hash)}</p><a className="mt-4 inline-block text-sm text-pi-gold underline underline-offset-4" href={`${arcMainnet.blockExplorers.default.url}/tx/${hash}`} target="_blank" rel="noreferrer">View final transaction</a><div><button onClick={again} className="mt-5 text-sm text-neutral-300 underline underline-offset-4">Find another occurrence</button></div></motion.div>; }
