"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";

function short(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        className="clip-tag-sm border border-white/15 px-4 py-2 text-xs font-mono text-neutral-300 transition hover:border-pi-gold/50 hover:text-pi-gold"
      >
        {short(address)}
      </button>
    );
  }

  const connector = connectors[0];

  return (
    <button
      onClick={() => connector && connect({ connector })}
      disabled={!connector || isPending}
      className="clip-tag-sm border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-wide text-neutral-100 transition hover:border-pi-gold/40 hover:bg-white/20 disabled:opacity-40"
    >
      {isPending ? "Connecting…" : "Connect Wallet"}
    </button>
  );
}
