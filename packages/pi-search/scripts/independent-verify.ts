#!/usr/bin/env tsx
/**
 * STANDALONE independent verification of a published π dataset.
 *
 * This script deliberately does NOT trust the stored raw-digits.bin file  -
 * it regenerates every digit from scratch via the same reproducible
 * Chudnovsky algorithm (packages/pi-search/src/pi-generator.ts, single-
 * threaded  -  see scripts/generate-dataset.ts's module doc for why) using
 * only the manifest's claimed digitCount, then re-derives the chunking and
 * Merkle root independently and compares everything against the published
 * manifest. This is the concrete tool behind the claim in
 * docs/threat-model.md T3 and docs/proof-system.md §5: "anyone can
 * independently regenerate π and recompute the root"  -  run this, don't
 * take our word for it.
 *
 * Usage: pnpm verify -- --dir ./data/v2
 * Exit code 0 = verified, non-zero = mismatch (details printed).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chunkDigits } from "../src/chunking";
import { buildMerkleTree, leafHash } from "../src/merkle";
import { computePiDigits } from "../src/pi-generator";
import { keccak256 } from "viem";
import { MANIFEST_FILENAME, RAW_DIGITS_FILENAME, type DatasetManifest } from "../src/manifest";

function argValue(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const dir = argValue("--dir", process.env.PI_DATASET_PATH ?? "data/v2");

async function main() {
  const manifest: DatasetManifest = JSON.parse(readFileSync(join(dir, MANIFEST_FILENAME), "utf-8"));
  console.log(`Independently verifying dataset v${manifest.version} (${manifest.digitCount.toLocaleString()} digits) at ${dir}`);
  console.log("This regenerates every digit from scratch  -  it will take roughly as long as the original generation did.\n");

  let failures = 0;

  console.time("regenerate digits from scratch");
  const regenerated = await computePiDigits(manifest.digitCount);
  console.timeEnd("regenerate digits from scratch");

  const storedRaw = readFileSync(join(dir, RAW_DIGITS_FILENAME));
  const storedMatches = Buffer.compare(Buffer.from(regenerated.buffer, regenerated.byteOffset, regenerated.byteLength), storedRaw) === 0;
  console.log(`[${storedMatches ? "PASS" : "FAIL"}] stored raw-digits.bin matches independently regenerated π digits`);
  if (!storedMatches) failures++;

  const regeneratedHash = keccak256(regenerated);
  const hashMatches = regeneratedHash === manifest.datasetHash;
  console.log(`[${hashMatches ? "PASS" : "FAIL"}] datasetHash matches keccak256(regenerated digits): ${regeneratedHash}`);
  if (!hashMatches) failures++;

  console.time("rebuild chunks + merkle root");
  const chunks = chunkDigits(regenerated, manifest.chunkSizeDigits);
  const leaves = chunks.map((c) => leafHash(c.packed));
  const tree = buildMerkleTree(leaves);
  console.timeEnd("rebuild chunks + merkle root");

  const rootMatches = tree.root === manifest.merkleRoot;
  console.log(`[${rootMatches ? "PASS" : "FAIL"}] merkleRoot matches independently rebuilt tree: ${tree.root}`);
  if (!rootMatches) failures++;

  const chunkCountMatches = chunks.length === manifest.chunkCount;
  console.log(`[${chunkCountMatches ? "PASS" : "FAIL"}] chunkCount matches: expected ${manifest.chunkCount}, got ${chunks.length}`);
  if (!chunkCountMatches) failures++;

  if (failures === 0) {
    console.log("\nAll checks passed. This dataset's digits, hash, and Merkle root are independently reproducible from the published algorithm alone.");
  } else {
    console.error(`\n${failures} check(s) FAILED. Do not trust this dataset version's on-chain commitment.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
