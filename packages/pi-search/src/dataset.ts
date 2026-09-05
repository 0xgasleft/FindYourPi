import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CHUNK_SIZE_DIGITS } from "@pi-hunter/pi-core";
import { MANIFEST_FILENAME, RAW_DIGITS_FILENAME, SUFFIX_ARRAY_FILENAME, type DatasetManifest } from "./manifest";

/**
 * Simple, fully-in-memory dataset loader. At this dataset's actual size
 * (see the manifest — tens of millions of digits, not billions), loading
 * the raw digits (~1 byte/digit) and suffix array (~4 bytes/digit) fully
 * into memory is a reasonable, simple choice. If a future dataset version
 * scales toward the billions, this is the place to switch to memory-mapped
 * / streaming access — anticipated in docs/architecture.md §4 but not
 * needed at the current scale.
 */
export interface LoadedDataset {
  manifest: DatasetManifest;
  digits: Uint8Array;
  suffixArray: Int32Array;
}

export function loadDataset(dir: string): LoadedDataset {
  const manifest: DatasetManifest = JSON.parse(readFileSync(join(dir, MANIFEST_FILENAME), "utf-8"));
  const rawBuf = readFileSync(join(dir, RAW_DIGITS_FILENAME));
  const digits = new Uint8Array(rawBuf.buffer, rawBuf.byteOffset, rawBuf.byteLength);
  const saBuf = readFileSync(join(dir, SUFFIX_ARRAY_FILENAME));
  const suffixArray = new Int32Array(saBuf.buffer, saBuf.byteOffset, saBuf.byteLength / 4);
  if (digits.length !== manifest.digitCount) {
    throw new Error(`raw digit file length (${digits.length}) doesn't match manifest.digitCount (${manifest.digitCount})`);
  }
  return { manifest, digits, suffixArray };
}

export function chunkSizeOrDefault(manifest: DatasetManifest): number {
  return manifest.chunkSizeDigits ?? CHUNK_SIZE_DIGITS;
}
