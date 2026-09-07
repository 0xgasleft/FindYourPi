import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { hardhatLocal, baseSepolia } from "./chains";

// WalletConnect is a natural addition (spec §17) but needs a project ID the
// user must supply  -  omitted from the MVP config rather than hardcoding a
// placeholder. Injected covers MetaMask/Coinbase Wallet/browser wallets for now.
export const wagmiConfig = createConfig({
  chains: [hardhatLocal, baseSepolia],
  connectors: [injected()],
  // Required for Next.js SSR: without this, wagmi restores a persisted
  // wallet connection (from localStorage) synchronously on the client,
  // which renders "0x123..." while the server-rendered HTML said "Connect
  // Wallet"  -  a hydration mismatch. `ssr: true` defers that restore until
  // after the initial client render instead. See wagmi's SSR guide.
  ssr: true,
  transports: {
    [hardhatLocal.id]: http(),
    [baseSepolia.id]: http(process.env.NEXT_PUBLIC_RPC_URL ?? baseSepolia.rpcUrls.default.http[0]),
  },
});
