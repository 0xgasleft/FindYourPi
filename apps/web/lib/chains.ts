import { defineChain } from "viem";

export const arcMainnet = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } },
  blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.arc.io" } },
});

/** Local Hardhat node (see packages/contracts `pnpm node` / `pnpm deploy:localhost`)  -  used for local dev/demo. */
export const hardhatLocal = defineChain({
  id: 31337,
  name: "Hardhat Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

export function getActiveChain() {
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? String(arcMainnet.id));
  return chainId === hardhatLocal.id ? hardhatLocal : arcMainnet;
}
