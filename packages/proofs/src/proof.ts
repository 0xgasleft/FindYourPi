import type { Hex } from "viem";
import { chunkDigits, unpackNibblesToDigits, buildMerkleTree, getMerkleProof, verifyMerkleProof, leafHash, type MerkleTree } from "@pi-hunter/pi-search";

/**
 * Proof construction + a standalone verifier that mirrors the Solidity
 * MerkleVerifierV1 logic exactly (docs/proof-system.md §3.3). This package
 * has no dependency on apps/api — given only a copy of the public dataset,
 * anyone can build and check a claim proof themselves. That's the whole
 * point (docs/proof-system.md §1, §3.4).
 */

export interface ChunkProof {
  chunkIndex: number;
  chunkData: Uint8Array; // packed 4-bit/digit
  merkleProof: Hex[];
}

export interface OccurrenceProof {
  position: number;
  matchLength: number;
  proofs: ChunkProof[];
}

/**
 * Builds the tree once for a dataset (chunk leaves -> root). Callers with a
 * long-lived process (apps/api) should build this once per active dataset
 * version and reuse it, not rebuild per request.
 */
export function buildDatasetTree(digits: Uint8Array, chunkSizeDigits: number): { tree: MerkleTree; chunks: Uint8Array[] } {
  const chunks = chunkDigits(digits, chunkSizeDigits).map((c) => c.packed);
  const leaves = chunks.map((c) => leafHash(c));
  const tree = buildMerkleTree(leaves);
  return { tree, chunks };
}

/**
 * Constructs a proof for a match at `position` of length `matchLength`,
 * given the full chunked dataset + its Merkle tree. Touches at most the
 * chunks the match actually spans (1-2 for MAX_MATCH_LEN <= chunkSizeDigits,
 * see docs/proof-system.md §3.1).
 */
export function buildOccurrenceProof(
  chunks: Uint8Array[],
  tree: MerkleTree,
  chunkSizeDigits: number,
  position: number,
  matchLength: number
): OccurrenceProof {
  const startChunk = Math.floor(position / chunkSizeDigits);
  const endChunk = Math.floor((position + matchLength - 1) / chunkSizeDigits);

  const proofs: ChunkProof[] = [];
  for (let c = startChunk; c <= endChunk; c++) {
    const chunkData = chunks[c];
    if (!chunkData) throw new RangeError(`chunk index ${c} out of range (dataset has ${chunks.length} chunks)`);
    proofs.push({ chunkIndex: c, chunkData, merkleProof: getMerkleProof(tree, c) });
  }
  return { position, matchLength, proofs };
}

/**
 * Standalone verifier — deliberately reimplements exactly what
 * MerkleVerifierV1.verifyOccurrence does on-chain (docs/proof-system.md
 * §3.3), so it can be run independently of the contract or the backend to
 * confirm a claim proof is valid before (or instead of) submitting it.
 */
export function verifyOccurrenceProof(root: Hex, chunkSizeDigits: number, sequence: string, occurrence: OccurrenceProof): boolean {
  const { position, matchLength, proofs } = occurrence;
  if (sequence.length !== matchLength) return false;
  if (proofs.length === 0) return false;

  // proofs must be contiguous, ascending chunk indices starting at the match's first chunk
  const expectedStartChunk = Math.floor(position / chunkSizeDigits);
  for (let i = 0; i < proofs.length; i++) {
    if (proofs[i]!.chunkIndex !== expectedStartChunk + i) return false;
  }

  for (const p of proofs) {
    const leaf = leafHash(p.chunkData);
    if (!verifyMerkleProof(leaf, p.merkleProof, p.chunkIndex, root)) return false;
  }

  const unpackedChunks = proofs.map((p) => unpackNibblesToDigits(p.chunkData, chunkSizeDigits));
  const concatenated = new Uint8Array(unpackedChunks.length * chunkSizeDigits);
  unpackedChunks.forEach((u, i) => concatenated.set(u, i * chunkSizeDigits));

  const localOffset = position - expectedStartChunk * chunkSizeDigits;
  for (let i = 0; i < matchLength; i++) {
    const expectedDigit = sequence.charCodeAt(i) - 48;
    if (concatenated[localOffset + i] !== expectedDigit) return false;
  }
  return true;
}
