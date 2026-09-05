import type { Hex } from "viem";

export interface DatasetManifest {
  version: number;
  digitCount: number;
  chunkSizeDigits: number;
  chunkCount: number;
  merkleRoot: Hex;
  /** keccak256 of the raw, unpacked digit-value byte file (0-9 per byte) — see docs/proof-system.md §5. */
  datasetHash: Hex;
  algorithm: "chudnovsky-binary-splitting";
  generatedAt: string;
}

export const RAW_DIGITS_FILENAME = "raw-digits.bin";
export const CHUNKS_FILENAME = "chunks.bin";
export const SUFFIX_ARRAY_FILENAME = "suffix-array.bin";
export const MANIFEST_FILENAME = "manifest.json";
