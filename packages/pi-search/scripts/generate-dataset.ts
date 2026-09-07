#!/usr/bin/env tsx
/**
 * Generates the canonical π dataset end-to-end: compute digits (reproducible
 * Chudnovsky binary splitting  -  no external file/library) -> chunk + pack ->
 * Merkle commitment -> suffix array search index -> manifest.
 *
 * Usage:
 *   NODE_OPTIONS='--max-old-space-size=8000' pnpm generate   # uses .env / defaults (v2, 500M digits)
 *   NODE_OPTIONS='--max-old-space-size=18000' pnpm generate -- --digits 500000000 --out ./data/v2 --version 2
 *
 * NODE_OPTIONS is not optional at real dataset scale: V8's default heap
 * limit (~4GB) is hit by the chunking/Merkle/suffix-array steps well before
 * any actual memory shortage  -  confirmed directly generating v2, not
 * assumed (the same 500M-digit run that needs ~20GB peak RSS overall
 * crashes with "JavaScript heap out of memory" under V8's default limit).
 * Size it comfortably above whatever peak RSS you expect (v2's real peak
 * was ~20.5GB; scale roughly linearly with digit count).
 *
 * Deliberately single-threaded (computePiDigits, not computePiDigitsParallel)
 *  -  see parallel-pi-generator.ts's own doc comment for why parallelizing
 * binarySplit measured as a net loss at the time it was tried, and why
 * that finding is now stale (pre-dates the native-GMP rewrite below) and
 * unverified rather than actively wrong.
 *
 * Digit count is bound by real native GMP now (packages/gmp-native), not
 * V8's native BigInt (hard ceiling ~92.86M digits) or gmp-wasm's
 * WASM-memory/JS-string ceilings (~125M / ~200M digits  -  also superseded).
 * On WINDOWS specifically, native GMP itself hits a further, real ceiling
 * around ~350-400M digits (the CRT allocator fails a large single
 * allocation well before system RAM is exhausted)  -  v2's actual 500M-digit
 * generation ran on Linux/WSL2 instead, where the identical operation that
 * crashes Windows succeeds immediately. See docs/architecture.md §5.1 for
 * the complete, measured investigation (four distinct ceilings found and
 * worked through to reach 500,000,000 digits)  -  MAX_SAFE_DIGITS below is a
 * generous sanity cap against typos, not a claim that any digit count under
 * it will actually succeed on any given machine/OS.
 *
 * This is exactly the process docs/architecture.md §5 and
 * docs/threat-model.md T3 describe as independently reproducible  -  see
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

const digitCount = Number(argValue("--digits", process.env.PI_DATASET_DIGIT_COUNT ?? "500000000"));
const chunkSizeDigits = Number(argValue("--chunk-size", String(process.env.PI_DATASET_CHUNK_SIZE ?? CHUNK_SIZE_DIGITS)));
const version = Number(argValue("--version", process.env.PI_DATASET_VERSION ?? "2"));
const outDir = argValue("--out", process.env.PI_DATASET_PATH ?? join("data", `v${version}`));

// Real native GMP (packages/gmp-native) is bound only by actual system
// memory  -  no fixed architectural ceiling like V8 BigInt's (~92.86M
// digits) or gmp-wasm's (WASM memory ~125M / JS-string ~200M digits, both
// also superseded  -  see docs/architecture.md §5.1 for the full history of
// all three). This is a generous sanity cap against typos/fat-fingered
// digit counts, not a measured limit  -  update it once real hardware
// limits at the scale you actually intend to run are known.
const MAX_SAFE_DIGITS = 50_000_000_000;

function formatBytes(n: number): string {
  return `${(n / 1e9).toFixed(2)} GB`;
}

async function main() {
  if (digitCount > MAX_SAFE_DIGITS) {
    throw new Error(
      `digitCount ${digitCount.toLocaleString()} exceeds MAX_SAFE_DIGITS (${MAX_SAFE_DIGITS.toLocaleString()})  -  ` +
        `this is a sanity cap against typos, not a measured ceiling (real native GMP is memory-bound, not digit-count- ` +
        `bound  -  see docs/architecture.md §5.1). Raise MAX_SAFE_DIGITS above if you really mean to generate this many.`
    );
  }

  console.log(`Generating π dataset v${version}: ${digitCount.toLocaleString()} digits, chunk size ${chunkSizeDigits}, out=${outDir}`);
  mkdirSync(outDir, { recursive: true });

  console.time("generate digits");
  const digits = await computePiDigits(digitCount);
  console.timeEnd("generate digits");

  console.log(`  peak memory so far: ${formatBytes(process.memoryUsage().rss)}`);

  writeFileSync(join(outDir, RAW_DIGITS_FILENAME), Buffer.from(digits.buffer, digits.byteOffset, digits.byteLength));
  console.log(`  wrote raw digits (${formatBytes(digits.byteLength)}), rss now: ${formatBytes(process.memoryUsage().rss)}`);

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
  console.log(`  peak memory: ${formatBytes(process.memoryUsage().rss)}`);

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
