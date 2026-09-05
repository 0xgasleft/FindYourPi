import hre from "hardhat";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Deploys PiDatasetRegistry + MerkleVerifierV1 + PiHunterNFT, then registers
 * the dataset version described by a manifest.json produced by
 * `pnpm --filter @pi-hunter/pi-search generate` (see packages/pi-search).
 *
 * Usage: pnpm deploy:localhost -- --manifest ../pi-search/data/v1/manifest.json
 */
function argValue(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

async function main() {
  const manifestPath = argValue("--manifest", join(__dirname, "../../pi-search/data/v1/manifest.json"));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

  const [deployer] = await hre.viem.getWalletClients();
  console.log(`Deploying with account: ${deployer.account.address}`);

  const registry = await hre.viem.deployContract("PiDatasetRegistry", [deployer.account.address]);
  console.log(`PiDatasetRegistry: ${registry.address}`);

  const verifier = await hre.viem.deployContract("MerkleVerifierV1", []);
  console.log(`MerkleVerifierV1:  ${verifier.address}`);

  const nft = await hre.viem.deployContract("PiHunterNFT", [deployer.account.address, registry.address]);
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
