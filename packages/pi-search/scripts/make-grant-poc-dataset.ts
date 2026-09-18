#!/usr/bin/env tsx
/**
 * Derives the grant POC's compact public dataset from the locally generated
 * v1 π corpus. It copies only the first five million independently generated
 * digits, then derives a fresh suffix array and Merkle commitment for that
 * exact prefix. The browser can therefore search and prove every result with
 * no API, database, or private service.
 *
 * Run: pnpm --filter @pi-hunter/pi-search grant-poc-dataset
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { keccak256 } from "viem";
import { CHUNK_SIZE_DIGITS } from "@pi-hunter/pi-core";
import { chunkDigits } from "../src/chunking";
import { buildMerkleTree, leafHash } from "../src/merkle";
import { buildSuffixArray } from "../src/suffix-array";
import { MANIFEST_FILENAME, RAW_DIGITS_FILENAME, SUFFIX_ARRAY_FILENAME, type DatasetManifest } from "../src/manifest";

const DIGIT_COUNT = 5_000_000;
const VERSION = 3;
const source = join("data", "v1", RAW_DIGITS_FILENAME);
const output = join("..", "..", "apps", "web", "public", "dataset", "arc-grant-v3");

function main() {
  const sourceDigits = readFileSync(source);
  if (sourceDigits.length < DIGIT_COUNT) throw new Error(`Expected at least ${DIGIT_COUNT} source digits, got ${sourceDigits.length}`);

  const digits = new Uint8Array(sourceDigits.buffer, sourceDigits.byteOffset, DIGIT_COUNT).slice();
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, RAW_DIGITS_FILENAME), digits);

  console.time("build suffix array");
  const suffixArray = buildSuffixArray(digits);
  console.timeEnd("build suffix array");
  writeFileSync(join(output, SUFFIX_ARRAY_FILENAME), Buffer.from(suffixArray.buffer));

  const chunks = chunkDigits(digits, CHUNK_SIZE_DIGITS);
  const tree = buildMerkleTree(chunks.map((chunk) => leafHash(chunk.packed)));
  const manifest: DatasetManifest = {
    version: VERSION,
    digitCount: DIGIT_COUNT,
    chunkSizeDigits: CHUNK_SIZE_DIGITS,
    chunkCount: chunks.length,
    merkleRoot: tree.root,
    datasetHash: keccak256(digits),
    algorithm: "chudnovsky-binary-splitting",
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(join(output, MANIFEST_FILENAME), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${DIGIT_COUNT.toLocaleString()} real π digits to ${output}`);
  console.log(JSON.stringify(manifest, null, 2));
}

main();
