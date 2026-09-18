"use client";

import { useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { parseAbi } from "viem";
import { NFT_CONTRACT_ADDRESS } from "@/lib/contracts";
import { arcMainnet } from "@/lib/chains";

type ClaimCard = { tokenId: bigint; image: string; name: string };
const collectionAbi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
]);

function decodeCard(tokenId: bigint, tokenUri: string): ClaimCard {
  const encoded = tokenUri.split(",")[1];
  if (!encoded) throw new Error("The token metadata is not a self-contained data URI.");
  const metadata = JSON.parse(atob(encoded)) as { image?: string; name?: string };
  if (!metadata.image) throw new Error("The token metadata does not include a generated image.");
  return { tokenId, image: metadata.image, name: metadata.name ?? `Pi Hunter #${tokenId}` };
}

export function ClaimGallery() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: arcMainnet.id });
  const [open, setOpen] = useState(false);
  const [claims, setClaims] = useState<ClaimCard[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    const contractAddress = NFT_CONTRACT_ADDRESS;
    if (!open || !isConnected || !address || !publicClient || !contractAddress) return;
    let live = true;
    setState("loading");
    void (async () => {
      try {
        const balance = await publicClient.readContract({ address: contractAddress, abi: collectionAbi, functionName: "balanceOf", args: [address] });
        const count = Math.min(Number(balance), 24);
        const tokenIds = await Promise.all(Array.from({ length: count }, (_, index) => publicClient.readContract({ address: contractAddress, abi: collectionAbi, functionName: "tokenOfOwnerByIndex", args: [address, BigInt(index)] })));
        const tokenUris = await Promise.all(tokenIds.map((tokenId) => publicClient.readContract({ address: contractAddress, abi: collectionAbi, functionName: "tokenURI", args: [tokenId] })));
        if (live) { setClaims(tokenUris.map((tokenUri, index) => decodeCard(tokenIds[index]!, tokenUri))); setState("idle"); }
      } catch {
        if (live) { setClaims([]); setState("error"); }
      }
    })();
    return () => { live = false; };
  }, [address, isConnected, open, publicClient]);

  return <div className="relative"><button onClick={() => setOpen((current) => !current)} className="clip-tag-sm border border-cyan-300/30 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-arc-mint transition hover:bg-cyan-300/10">My claims</button>{open && <aside className="absolute right-0 top-11 z-40 w-[min(90vw,440px)] border border-cyan-300/25 bg-void-950/95 p-1 shadow-[0_0_70px_rgba(34,211,238,0.18)] backdrop-blur-xl"><div className="border border-white/10 p-4"><div className="flex items-center justify-between gap-3"><div className="font-mono text-[10px] uppercase tracking-[0.18em] text-arc-mint">On-chain collection</div><button onClick={() => setOpen(false)} className="font-mono text-[10px] uppercase text-neutral-400 hover:text-white">Close</button></div>{!isConnected ? <p className="mt-4 text-sm text-neutral-400">Connect the wallet that minted a discovery to inspect its cards.</p> : state === "loading" ? <p className="mt-4 animate-pulse text-sm text-neutral-400">Reading your Arc collection...</p> : state === "error" ? <p className="mt-4 text-sm text-neutral-400">This contract does not expose an enumerable collection yet. Switch to the fresh Arc deployment to view wallet claims here.</p> : claims.length === 0 ? <p className="mt-4 text-sm text-neutral-400">No Pi Hunter discoveries in this wallet yet.</p> : <div className="mt-4 grid grid-cols-2 gap-3">{claims.map((claim) => <div key={claim.tokenId.toString()} className="border border-white/10 bg-black/20 p-2"><img src={claim.image} alt={claim.name} className="aspect-square w-full border border-pi-gold/25 bg-void-900 object-cover" /><div className="mt-2 font-mono text-[10px] text-neutral-300">{claim.name}</div></div>)}</div>}</div></aside>}</div>;
}
