import { defineChain } from "viem";
import { baseSepolia } from "viem/chains";

/** Local Hardhat node (see packages/contracts `pnpm node` / `pnpm deploy:localhost`)  -  used for local dev/demo. */
export const hardhatLocal = defineChain({
  id: 31337,
  name: "Hardhat Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

export { baseSepolia };

export function getActiveChain() {
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "31337");
  return chainId === baseSepolia.id ? baseSepolia : hardhatLocal;
}
