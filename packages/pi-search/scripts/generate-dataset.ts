#!/usr/bin/env tsx
/**
 * Generates the canonical π dataset end-to-end: compute digits (reproducible
 * Chudnovsky binary splitting, no external file/library) -> chunk + pack ->
 * Merkle commitment -> suffix array search index -> manifest.
 *
 * Usage:
 *   pnpm generate                     # uses .env / defaults
 *   pnpm generate -- --digits 50000000 --out ./data/v1 --version 1
 *
 * This is exactly the process docs/architecture.md §5 and
 * docs/threat-model.md T3 describe as independently reproducible — see
 * scripts/independent-verify.ts for the standalone check that re-derives
 * everything from scratch and confirms it against this script's output.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { keccak256 } from "viem";
import { CHUNK_SIZE_DIGITS } from "@pi-hunter/pi-core";
import { computePiDigits } from "../src/pi-generator";
import { chunkDigits } from "../src/chunking";
import { buildMerkleTree, leafHash } from "../src/merkle";
import { buildSuffixArray } from "../src/suffix-array";
import { CHUNKS_FILENAME, MANIFEST_FILENAME, RAW_DIGITS_FILENAME, SUFFIX_ARRAY_FILENAME, type DatasetManifest } from "../src/manifest";

function argValue(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const digitCount = Number(argValue("--digits", process.env.PI_DATASET_DIGIT_COUNT ?? "1000000"));
const chunkSizeDigits = Number(argValue("--chunk-size", String(process.env.PI_DATASET_CHUNK_SIZE ?? CHUNK_SIZE_DIGITS)));
const version = Number(argValue("--version", process.env.PI_DATASET_VERSION ?? "1"));
const outDir = argValue("--out", process.env.PI_DATASET_PATH ?? join("data", `v${version}`));

async function main() {
  console.log(`Generating π dataset v${version}: ${digitCount.toLocaleString()} digits, chunk size ${chunkSizeDigits}, out=${outDir}`);
  mkdirSync(outDir, { recursive: true });

  console.time("generate digits");
  const digitsStr = computePiDigits(digitCount);
  console.timeEnd("generate digits");

  const digits = new Uint8Array(digitCount);
  for (let i = 0; i < digitCount; i++) digits[i] = digitsStr.charCodeAt(i) - 48;
  writeFileSync(join(outDir, RAW_DIGITS_FILENAME), Buffer.from(digits.buffer, digits.byteOffset, digits.byteLength));

  const datasetHash = keccak256(digits);

  console.time("chunk + pack");
  const chunks = chunkDigits(digits, chunkSizeDigits);
  const chunkBytes = chunks[0]!.packed.length;
  const chunksBuf = Buffer.alloc(chunks.length * chunkBytes);
  chunks.forEach((c, i) => chunksBuf.set(c.packed, i * chunkBytes));
  writeFileSync(join(outDir, CHUNKS_FILENAME), chunksBuf);
  console.timeEnd("chunk + pack");

  console.time("merkle tree");
  const leaves = chunks.map((c) => leafHash(c.packed));
  const tree = buildMerkleTree(leaves);
  console.timeEnd("merkle tree");

  console.time("suffix array");
  const sa = buildSuffixArray(digits);
  writeFileSync(join(outDir, SUFFIX_ARRAY_FILENAME), Buffer.from(sa.buffer, sa.byteOffset, sa.byteLength));
  console.timeEnd("suffix array");

  const manifest: DatasetManifest = {
    version,
    digitCount,
    chunkSizeDigits,
    chunkCount: chunks.length,
    merkleRoot: tree.root,
    datasetHash,
    algorithm: "chudnovsky-binary-splitting",
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(join(outDir, MANIFEST_FILENAME), JSON.stringify(manifest, null, 2));

  console.log("\nManifest:");
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
