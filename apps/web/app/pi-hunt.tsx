"use client";

import { useEffect, useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import type { SearchResponse } from "@pi-hunter/types";
import { searchPi, fetchProof } from "@/lib/api";
import { NFT_CONTRACT_ADDRESS, piHunterNFTAbi } from "@/lib/contracts";
import { WalletButton } from "./components/wallet-button";
import { RarityBadge } from "./components/rarity-badge";
import { CornerBrackets } from "./components/corner-brackets";

const EXAMPLES = ["314159", "123456", "2001-09-11", "SATOSHI", "ALICE", "777777", "I LOVE PI"];
const STAGES = ["Analyzing input...", "Converting...", "Searching π...", "Scanning..."];

type Phase =
  | { kind: "idle" }
  | { kind: "searching"; label: string }
  | { kind: "result"; result: SearchResponse }
  | { kind: "claiming" }
  | { kind: "minting"; hash: `0x${string}` }
  | { kind: "claimed" }
  | { kind: "error"; message: string };

function guessMode(input: string): "number" | "base36" | "base95" | "utf8" {
  if (/^[0-9\s/\-.:]+$/.test(input)) return "number";
  // base36 (read the word as a base-36 integer, ~1.556 decimal digits/char)
  // makes ordinary short words/names findable at a real dataset size  -  see
  // packages/pi-core/src/conversion.ts's module doc.
  if (/^[a-zA-Z0-9]+$/.test(input)) return "base36";
  // base95 covers the rest of printable ASCII (spaces, punctuation) at
  // ~1.988 decimal digits/char  -  still denser than ASCII mode's fixed 3.
  if (/^[\x20-\x7E]+$/.test(input)) return "base95";
  // Anything outside printable ASCII (real Unicode) falls back to UTF-8 mode.
  return "utf8";
}

export function PiHunt() {
  const [value, setValue] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const { isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();

  async function runSearch(input: string) {
    if (!input.trim()) return;
    setPhase({ kind: "searching", label: STAGES[0]! });

    let stageIdx = 0;
    const stageTimer = setInterval(() => {
      stageIdx = Math.min(stageIdx + 1, STAGES.length - 1);
      setPhase({ kind: "searching", label: STAGES[stageIdx]! });
    }, 450);

    const minDelay = new Promise((resolve) => setTimeout(resolve, STAGES.length * 450));
    try {
      const [result] = await Promise.all([searchPi(input.trim(), guessMode(input)), minDelay]);
      clearInterval(stageTimer);
      setPhase({ kind: "result", result });
    } catch (err) {
      clearInterval(stageTimer);
      setPhase({ kind: "error", message: "π is being difficult right now. Try again." });
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void runSearch(value);
  }

  async function handleClaim(result: SearchResponse) {
    if (!NFT_CONTRACT_ADDRESS) {
      setPhase({ kind: "error", message: "No contract configured yet  -  set NEXT_PUBLIC_NFT_CONTRACT_ADDRESS." });
      return;
    }
    setPhase({ kind: "claiming" });
    try {
      const proof = await fetchProof(result.position!, result.normalized_input);
      const hash = await writeContractAsync({
        address: NFT_CONTRACT_ADDRESS,
        abi: piHunterNFTAbi,
        functionName: "claim",
        args: [
          BigInt(proof.dataset_version),
          BigInt(proof.position),
          proof.sequence_hex,
          proof.proofs.map((p) => ({ chunkIndex: BigInt(p.chunk_index), chunkData: p.chunk_data, merkleProof: p.merkle_proof })),
        ],
      });
      setPhase({ kind: "minting", hash });
    } catch (err) {
      setPhase({ kind: "error", message: "Mint cancelled. Your discovery is still waiting for you." });
    }
  }

  return (
    <div className="w-full">
      <div className="mb-5 flex justify-end">
        <WalletButton />
      </div>

      {(phase.kind === "idle" || phase.kind === "searching") && (
        <>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row" role="search">
            <label htmlFor="pi-query" className="sr-only">
              Enter a number, name, date, or word
            </label>
            <input
              id="pi-query"
              type="text"
              autoComplete="off"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={phase.kind === "searching"}
              placeholder="Enter a number, name, date, or anything..."
              className="w-full flex-1 border border-white/15 bg-void-800/80 px-5 py-4 text-base text-neutral-100 placeholder:text-neutral-500 outline-none ring-pi-gold/60 backdrop-blur transition focus:border-pi-gold/50 focus:ring-1 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!value.trim() || phase.kind === "searching"}
              className="shrink-0 border border-pi-gold bg-pi-gold px-6 py-4 text-sm font-bold uppercase tracking-wide text-void-950 transition hover:bg-pi-amber hover:shadow-glow-gold disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-neutral-500"
            >
              {phase.kind === "searching" ? phase.label : "Find it in π"}
            </button>
          </form>
          <p className="mt-3 text-xs text-neutral-500">
            Don&apos;t enter passwords, private keys, financial information, or other sensitive data.
          </p>
          <div className="mt-5 flex flex-wrap gap-2" aria-label="Example searches">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                disabled={phase.kind === "searching"}
                onClick={() => setValue(example)}
                className="clip-tag-sm border border-white/10 px-3 py-1.5 font-mono text-xs font-medium text-neutral-300 transition hover:border-pi-gold/50 hover:text-pi-gold disabled:opacity-40"
              >
                {example}
              </button>
            ))}
          </div>
        </>
      )}

      <AnimatePresence mode="wait">
        {phase.kind === "result" && (
          <ResultCard
            key="result"
            result={phase.result}
            isConnected={isConnected}
            onClaim={() => handleClaim(phase.result)}
            onSearchAgain={() => setPhase({ kind: "idle" })}
          />
        )}
        {phase.kind === "claiming" && (
          <motion.div key="claiming" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 text-center text-neutral-300">
            Building your proof and waiting for your wallet...
          </motion.div>
        )}
        {phase.kind === "minting" && (
          <MintingCard key="minting" hash={phase.hash} onDone={() => setPhase({ kind: "claimed" })} onFail={(m) => setPhase({ kind: "error", message: m })} />
        )}
        {phase.kind === "claimed" && (
          <motion.div
            key="claimed"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative mt-6 border border-pi-gold/30 bg-pi-gold/[0.06] px-6 py-8 text-center"
          >
            <CornerBrackets />
            <div className="font-display text-2xl font-bold text-pi-gold">Your place in π is permanent.</div>
            <button onClick={() => setPhase({ kind: "idle" })} className="mt-4 text-sm text-neutral-300 underline underline-offset-4">
              Search again
            </button>
          </motion.div>
        )}
        {phase.kind === "error" && (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 text-center text-neutral-300">
            {phase.message}
            <div>
              <button onClick={() => setPhase({ kind: "idle" })} className="mt-3 text-sm text-pi-gold underline underline-offset-4">
                Try again
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MintingCard({ hash, onDone, onFail }: { hash: `0x${string}`; onDone: () => void; onFail: (m: string) => void }) {
  const { isSuccess, isError } = useWaitForTransactionReceipt({ hash });
  useEffect(() => {
    if (isSuccess) onDone();
  }, [isSuccess, onDone]);
  useEffect(() => {
    if (isError) onFail("The transaction failed. Your discovery is still waiting for you.");
  }, [isError, onFail]);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 text-center text-neutral-300">
      Your π discovery is becoming permanent...
    </motion.div>
  );
}

function ResultCard({
  result,
  isConnected,
  onClaim,
  onSearchAgain,
}: {
  result: SearchResponse;
  isConnected: boolean;
  onClaim: () => void;
  onSearchAgain: () => void;
}) {
  if (!result.found) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-6 text-center">
        <div className="font-display text-2xl font-bold text-neutral-200">Not found... yet.</div>
        <p className="mt-2 text-sm text-neutral-500">We searched the first {result.digits_indexed.toLocaleString()} digits of π.</p>
        <button onClick={onSearchAgain} className="mt-4 text-sm text-pi-gold underline underline-offset-4">
          Search again
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="relative mt-6 border border-white/10 bg-void-800/60 px-6 py-8 text-center backdrop-blur"
    >
      <CornerBrackets />
      <div className="font-display text-sm font-bold uppercase tracking-[0.2em] text-pi-gold">Found in π</div>
      <div className="mt-3 font-mono text-4xl font-bold text-white">{result.normalized_input}</div>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-sm text-neutral-400">
        <span>
          Position <span className="font-mono text-neutral-200">{result.position!.toLocaleString()}</span>
        </span>
        <span>
          Match length <span className="font-mono text-neutral-200">{result.match_length}</span>
        </span>
        {result.rarity_tier && <RarityBadge tier={result.rarity_tier} />}
      </div>
      <div className="mt-3 text-xs text-neutral-500">
        Theoretical rarity: {result.theoretical_rarity} &middot; {result.achievability?.label} &middot; searched first{" "}
        {result.digits_indexed.toLocaleString()} digits of π
      </div>

      <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <button
          onClick={onClaim}
          className="border border-pi-gold bg-pi-gold px-6 py-3 text-sm font-bold uppercase tracking-wide text-void-950 transition hover:bg-pi-amber hover:shadow-glow-gold"
        >
          Claim this discovery
        </button>
        <button onClick={onSearchAgain} className="text-sm text-neutral-400 underline underline-offset-4">
          Search again
        </button>
      </div>
      {!isConnected && <p className="mt-3 text-xs text-neutral-500">You&apos;ll connect a wallet when you claim  -  not before.</p>}
    </motion.div>
  );
}
