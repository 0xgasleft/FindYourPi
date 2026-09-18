import hre from "hardhat";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineChain } from "viem";

const arcMainnet = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } },
  blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.arc.io" } },
});

/**
 * Deploys PiDatasetRegistry + MerkleVerifierV1 + PiHunterNFT, then registers
 * the dataset version described by a manifest.json produced by
 * `pnpm --filter @pi-hunter/pi-search generate` (see packages/pi-search).
 *
 * Usage: PI_MANIFEST_PATH=../pi-search/data/v2/manifest.json pnpm deploy:localhost
 *
 * An env var, not a --manifest CLI flag: Hardhat's own `run` task rejects
 * any argv it doesn't recognize (HH305 "Unrecognized param") before this
 * script ever gets to see it  -  confirmed directly, not assumed  -  so a
 * flag-based override silently never worked. Defaults to v2 (this
 * project's actual, largest generated dataset  -  see docs/architecture.md
 * §5.1 for why 500,000,000 digits, not v1's original 80,000,000, is now
 * the real target).
 */
async function main() {
  const defaultManifestPath = hre.network.name === "arcMainnet"
    ? join(__dirname, "../../../apps/web/public/dataset/arc-grant-v3/manifest.json")
    : join(__dirname, "../../pi-search/data/v2/manifest.json");
  const manifestPath = process.env.PI_MANIFEST_PATH ?? defaultManifestPath;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

  const isArc = hre.network.name === "arcMainnet";
  const clientConfig = isArc ? { chain: arcMainnet } : {};
  const [deployer] = await hre.viem.getWalletClients(clientConfig);
  if (!deployer) throw new Error("No deployer account is configured. Set DEPLOYER_PRIVATE_KEY for this network.");
  const publicClient = await hre.viem.getPublicClient(clientConfig);
  const client = { public: publicClient, wallet: deployer };
  console.log(`Deploying with account: ${deployer.account.address}`);

  const registry = await hre.viem.deployContract("PiDatasetRegistry", [deployer.account.address], { client });
  console.log(`PiDatasetRegistry: ${registry.address}`);

  const verifier = await hre.viem.deployContract("MerkleVerifierV1", [], { client });
  console.log(`MerkleVerifierV1:  ${verifier.address}`);

  const nft = await hre.viem.deployContract("PiHunterNFT", [deployer.account.address, registry.address], { client });
  console.log(`PiHunterNFT:       ${nft.address}`);

  await registry.write.registerDataset([
    BigInt(manifest.version),
    BigInt(manifest.digitCount),
    BigInt(manifest.chunkSizeDigits),
    manifest.merkleRoot,
    manifest.datasetHash,
    verifier.address,
  ]);
  console.log(`Registered dataset v${manifest.version} (${manifest.digitCount.toLocaleString()} digits, root ${manifest.merkleRoot})`);

  console.log("\nSet these in .env:");
  console.log(`NFT_CONTRACT_ADDRESS=${nft.address}`);
  console.log(`DATASET_REGISTRY_ADDRESS=${registry.address}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
