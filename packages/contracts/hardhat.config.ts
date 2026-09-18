import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";

const RPC_URL = process.env.RPC_URL ?? "https://sepolia.base.org";
const ARC_MAINNET_RPC_URL = process.env.ARC_MAINNET_RPC_URL ?? "https://rpc.mainnet.arc.io";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  networks: {
    // Base Sepolia (testnet)  -  see docs/architecture.md §3 for the chain choice.
    // Never hardcode a private key; DEPLOYER_PRIVATE_KEY is dev/testnet-only,
    // read from env, never committed (see .env.example).
    baseSepolia: {
      url: RPC_URL,
      chainId: 84532,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
    // Arc is EVM-compatible. Gas is paid in USDC on mainnet, so this deploy
    // must use a deliberately funded deployment wallet, never a browser key.
    arcMainnet: {
      url: ARC_MAINNET_RPC_URL,
      chainId: 5042,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
};

export default config;
