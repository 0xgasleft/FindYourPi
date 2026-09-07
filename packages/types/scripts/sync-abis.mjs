#!/usr/bin/env node
// Extracts just the `.abi` array from packages/contracts' compiled Hardhat
// artifacts (a gitignored build output) into small, committed JSON files
// under src/generated/. This is what makes packages/types  -  and anything
// that depends on it, like apps/web  -  buildable (e.g. on Vercel) without
// needing Hardhat/Solidity in that build at all.
//
// Re-run whenever a contract's public interface changes:
//   pnpm --filter @pi-hunter/contracts compile
//   pnpm --filter @pi-hunter/types sync-abis
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const contractsDir = join(__dirname, "../../contracts/artifacts/contracts");
const outDir = join(__dirname, "../src/generated");
mkdirSync(outDir, { recursive: true });

const contracts = [
  { name: "PiHunterNFT", path: "PiHunterNFT.sol/PiHunterNFT.json" },
  { name: "PiDatasetRegistry", path: "PiDatasetRegistry.sol/PiDatasetRegistry.json" },
  { name: "MerkleVerifierV1", path: "MerkleVerifierV1.sol/MerkleVerifierV1.json" },
];

for (const { name, path } of contracts) {
  const artifact = JSON.parse(readFileSync(join(contractsDir, path), "utf-8"));
  const outFile = join(outDir, `${name}.abi.json`);
  writeFileSync(outFile, JSON.stringify(artifact.abi, null, 2) + "\n");
  console.log(`wrote ${outFile} (${artifact.abi.length} entries)`);
}
