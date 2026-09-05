import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { hardhatLocal, baseSepolia } from "./chains";

// WalletConnect is a natural addition (spec §17) but needs a project ID the
// user must supply — omitted from the MVP config rather than hardcoding a
// placeholder. Injected covers MetaMask/Coinbase Wallet/browser wallets for now.
export const wagmiConfig = createConfig({
  chains: [hardhatLocal, baseSepolia],
  connectors: [injected()],
  transports: {
    [hardhatLocal.id]: http(),
    [baseSepolia.id]: http(process.env.NEXT_PUBLIC_RPC_URL ?? baseSepolia.rpcUrls.default.http[0]),
  },
});
