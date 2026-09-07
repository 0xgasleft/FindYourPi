import { keccak256, concatHex, type Hex } from "viem";

/**
 * Standard binary Merkle tree over keccak256 leaves, with "duplicate last
 * node" padding at odd-length layers (docs/proof-system.md §3.1/§3.3)  -  the
 * simplest construction that keeps on-chain verification purely proof-array
 * driven (every level has exactly one sibling entry, derived from the leaf
 * index's bits, with no extra state needed beyond the proof itself).
 *
 * This is a fixed, append-only positional commitment over public dataset
 * chunks (not user-submitted arbitrary leaves), so the well-known
 * "duplicate-leaf" ambiguity that affects some Merkle-tree-of-transactions
 * designs doesn't apply here  -  every chunk index has one fixed, publicly
 * checkable position and content.
 */

function hashPair(left: Hex, right: Hex): Hex {
  return keccak256(concatHex([left, right]));
}

export interface MerkleTree {
  root: Hex;
  layers: Hex[][]; // layers[0] = leaves, layers[last] = [root]
}

export function buildMerkleTree(leaves: Hex[]): MerkleTree {
  if (leaves.length === 0) throw new Error("buildMerkleTree: no leaves");
  const layers: Hex[][] = [leaves];
  let current = leaves;
  while (current.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i]!;
      const right = i + 1 < current.length ? current[i + 1]! : current[i]!;
      next.push(hashPair(left, right));
    }
    layers.push(next);
    current = next;
  }
  return { root: current[0]!, layers };
}

/** Sibling path from `leaves[index]` up to the root, one hash per level. */
export function getMerkleProof(tree: MerkleTree, index: number): Hex[] {
  const proof: Hex[] = [];
  let idx = index;
  for (let level = 0; level < tree.layers.length - 1; level++) {
    const layer = tree.layers[level]!;
    const isRight = idx % 2 === 1;
    const pairIndex = isRight ? idx - 1 : idx + 1;
    const siblingIndex = pairIndex < layer.length ? pairIndex : idx; // duplicate-last case
    proof.push(layer[siblingIndex]!);
    idx = Math.floor(idx / 2);
  }
  return proof;
}

/** Re-derives the root from a leaf + its proof + its index  -  the exact logic the on-chain verifier mirrors. */
export function verifyMerkleProof(leaf: Hex, proof: Hex[], index: number, root: Hex): boolean {
  let hash = leaf;
  let idx = index;
  for (const sibling of proof) {
    hash = idx % 2 === 0 ? hashPair(hash, sibling) : hashPair(sibling, hash);
    idx = Math.floor(idx / 2);
  }
  return hash === root;
}

export function leafHash(chunkData: Uint8Array): Hex {
  return keccak256(chunkData);
}
