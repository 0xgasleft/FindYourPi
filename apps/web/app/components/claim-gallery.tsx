"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAccount, usePublicClient } from "wagmi";
import { parseAbi } from "viem";
import { NFT_CONTRACT_ADDRESS } from "@/lib/contracts";
import { arcMainnet } from "@/lib/chains";

type ClaimCard = { tokenId: bigint; image: string; name: string; input: string; kind: "Number" | "Text" };
const collectionAbi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function tokenInput(uint256 tokenId) view returns (string)",
  "function tokenInputKind(uint256 tokenId) view returns (uint8)",
]);

function decodeBase64(value: string) {
  const binary = atob(value);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function decodeCard(tokenId: bigint, tokenUri: string, input: string, inputKind: number): ClaimCard {
  const encoded = tokenUri.split(",")[1];
  if (!encoded) throw new Error("The token metadata is not a self-contained data URI.");
  const metadata = JSON.parse(decodeBase64(encoded)) as { image?: string; name?: string; submitted_input_base64?: string };
  if (!metadata.image) throw new Error("The token metadata does not include a generated image.");
  return { tokenId, image: metadata.image, name: metadata.name ?? `Pi Hunter #${tokenId}`, input: input || (metadata.submitted_input_base64 ? decodeBase64(metadata.submitted_input_base64) : "Untitled input"), kind: inputKind === 0 ? "Number" : "Text" };
}

export function ClaimGallery() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: arcMainnet.id });
  const [open, setOpen] = useState(false);
  const [claims, setClaims] = useState<ClaimCard[]>([]);
  const [selectedId, setSelectedId] = useState<bigint | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const selected = claims.find((claim) => claim.tokenId === selectedId) ?? claims[0];

  useEffect(() => {
    const contractAddress = NFT_CONTRACT_ADDRESS;
    if (!open || !isConnected || !address || !publicClient || !contractAddress) return;
    let live = true;
    setState("loading");
    void (async () => {
      try {
        const balance = await publicClient.readContract({ address: contractAddress, abi: collectionAbi, functionName: "balanceOf", args: [address] });
        const count = Math.min(Number(balance), 24);
        const tokenIds = await Promise.all(Array.from({ length: count }, (_, index) => publicClient.readContract({ address: contractAddress, abi: collectionAbi, functionName: "tokenOfOwnerByIndex", args: [address, BigInt(index)] }) as Promise<bigint>));
        const [tokenUris, inputs, kinds] = await Promise.all([
          Promise.all(tokenIds.map((tokenId) => publicClient.readContract({ address: contractAddress, abi: collectionAbi, functionName: "tokenURI", args: [tokenId] }) as Promise<string>)),
          Promise.all(tokenIds.map((tokenId) => publicClient.readContract({ address: contractAddress, abi: collectionAbi, functionName: "tokenInput", args: [tokenId] }) as Promise<string>)),
          Promise.all(tokenIds.map((tokenId) => publicClient.readContract({ address: contractAddress, abi: collectionAbi, functionName: "tokenInputKind", args: [tokenId] }) as Promise<number>)),
        ]);
        if (live) {
          const nextClaims = tokenUris.map((tokenUri, index) => decodeCard(tokenIds[index]!, tokenUri, inputs[index]!, kinds[index]!));
          setClaims(nextClaims);
          setSelectedId((current) => current ?? nextClaims[0]?.tokenId ?? null);
          setState("idle");
        }
      } catch {
        if (live) { setClaims([]); setState("error"); }
      }
    })();
    return () => { live = false; };
  }, [address, isConnected, open, publicClient]);

  return <div className="relative"><button onClick={() => setOpen((current) => !current)} className="clip-tag-sm border border-cyan-300/30 bg-cyan-300/[0.04] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-arc-mint transition hover:bg-cyan-300/15">My orbit</button>{open && <aside className="absolute right-0 top-11 z-40 w-[min(94vw,580px)] overflow-hidden border border-cyan-300/30 bg-void-950/95 shadow-[0_0_90px_rgba(34,211,238,0.22)] backdrop-blur-xl"><motion.div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full border border-arc-mint/20" animate={{ rotate: 360, scale: [0.9, 1.08, 0.9] }} transition={{ rotate: { duration: 20, repeat: Infinity, ease: "linear" }, scale: { duration: 4, repeat: Infinity } }} /><div className="relative border border-white/10 p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><div className="font-mono text-[10px] uppercase tracking-[0.2em] text-arc-mint">Personal Pi orbit</div><div className="mt-1 font-display text-xl font-bold text-white">Your verified cards</div></div><button onClick={() => setOpen(false)} className="font-mono text-[10px] uppercase text-neutral-400 transition hover:text-white">Close</button></div>{!isConnected ? <p className="mt-5 text-sm text-neutral-400">Connect the wallet that minted a discovery to enter its orbit.</p> : state === "loading" ? <div className="mt-8 grid place-items-center py-10"><motion.div className="h-16 w-16 rounded-full border border-arc-mint/50 border-t-transparent" animate={{ rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }} /><p className="mt-4 font-mono text-xs text-arc-mint">Mapping your claims on Arc...</p></div> : state === "error" ? <p className="mt-5 text-sm leading-relaxed text-neutral-400">This collection predates input labels. Switch to the V2 Arc contract to view its interactive orbit.</p> : claims.length === 0 ? <div className="mt-7 border border-dashed border-white/15 p-7 text-center"><div className="font-display text-lg text-white">Your orbit is waiting.</div><p className="mt-2 text-sm text-neutral-500">Mint a verified occurrence and its card will appear here.</p></div> : <div className="mt-5"><div className="flex items-center justify-between border-y border-white/10 py-2 font-mono text-[10px] uppercase tracking-[0.13em] text-neutral-400"><span>{claims.length} card{claims.length === 1 ? "" : "s"} in orbit</span><span className="text-pi-gold">Arc 5042</span></div><AnimatePresence mode="wait">{selected && <motion.div key={selected.tokenId.toString()} initial={{ opacity: 0, rotateY: -28, scale: 0.9 }} animate={{ opacity: 1, rotateY: 0, scale: 1 }} exit={{ opacity: 0, rotateY: 24, scale: 0.92 }} transition={{ type: "spring", stiffness: 180, damping: 20 }} style={{ perspective: 1000 }} className="mt-5 grid gap-5 sm:grid-cols-[190px_1fr]"><div className="relative mx-auto w-full max-w-[190px]"><motion.div className="absolute -inset-3 rounded-full border border-pi-gold/30" animate={{ rotate: 360 }} transition={{ duration: 18, repeat: Infinity, ease: "linear" }} /><img src={selected.image} alt={selected.name} className="relative aspect-square w-full border border-pi-gold/60 bg-void-900 shadow-[0_0_35px_rgba(242,201,76,0.22)]" /></div><div className="min-w-0 self-center"><div className="inline-flex border border-arc-mint/30 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-arc-mint">{selected.kind} input</div><div className="mt-3 break-words font-display text-2xl font-bold text-white">{selected.input}</div><div className="mt-2 font-mono text-xs text-neutral-400">{selected.name}</div><div className="mt-5 flex gap-2"><a href={`${arcMainnet.blockExplorers.default.url}/token/${NFT_CONTRACT_ADDRESS}?a=${selected.tokenId}`} target="_blank" rel="noreferrer" className="border border-white/15 px-3 py-2 font-mono text-[10px] uppercase text-neutral-300 transition hover:border-pi-gold hover:text-pi-gold">Inspect on Arc</a><button onClick={() => navigator.clipboard?.writeText(selected.input)} className="border border-white/15 px-3 py-2 font-mono text-[10px] uppercase text-neutral-300 transition hover:border-arc-mint hover:text-arc-mint">Copy input</button></div></div></motion.div>}</AnimatePresence><div className="mt-5 flex gap-3 overflow-x-auto pb-2">{claims.map((claim, index) => <button key={claim.tokenId.toString()} onClick={() => setSelectedId(claim.tokenId)} className={`group relative w-24 shrink-0 border p-1 text-left transition ${selected?.tokenId === claim.tokenId ? "border-pi-gold bg-pi-gold/10" : "border-white/10 hover:-translate-y-1 hover:border-arc-mint/60"}`}><img src={claim.image} alt="" className="aspect-square w-full opacity-80 transition group-hover:opacity-100" /><span className="mt-1 block truncate font-mono text-[9px] text-neutral-300">#{claim.tokenId.toString()} / {index + 1}</span></button>)}</div></div>}</div></aside>}</div>;
}
