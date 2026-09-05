import { describe, expect, it } from "vitest";
import { buildMerkleTree, getMerkleProof, verifyMerkleProof, leafHash } from "../src/merkle";
import { keccak256, toHex } from "viem";

function fakeLeaves(n: number) {
  return Array.from({ length: n }, (_, i) => keccak256(toHex(`chunk-${i}`)));
}

describe("Merkle tree (power-of-two leaf counts)", () => {
  for (const n of [1, 2, 4, 8, 16]) {
    it(`builds and verifies every proof for ${n} leaves`, () => {
      const leaves = fakeLeaves(n);
      const tree = buildMerkleTree(leaves);
      for (let i = 0; i < n; i++) {
        const proof = getMerkleProof(tree, i);
        expect(verifyMerkleProof(leaves[i]!, proof, i, tree.root)).toBe(true);
      }
    });
  }
});

describe("Merkle tree (odd / non-power-of-two leaf counts)", () => {
  for (const n of [3, 5, 7, 13, 100, 977]) {
    it(`builds and verifies every proof for ${n} leaves`, () => {
      const leaves = fakeLeaves(n);
      const tree = buildMerkleTree(leaves);
      for (let i = 0; i < n; i++) {
        const proof = getMerkleProof(tree, i);
        expect(verifyMerkleProof(leaves[i]!, proof, i, tree.root)).toBe(true);
      }
    });
  }
});

describe("verifyMerkleProof rejects tampering", () => {
  it("fails if the leaf is wrong", () => {
    const leaves = fakeLeaves(10);
    const tree = buildMerkleTree(leaves);
    const proof = getMerkleProof(tree, 3);
    const wrongLeaf = keccak256(toHex("not-the-real-chunk"));
    expect(verifyMerkleProof(wrongLeaf, proof, 3, tree.root)).toBe(false);
  });

  it("fails if the index is wrong (proof doesn't match claimed position)", () => {
    const leaves = fakeLeaves(10);
    const tree = buildMerkleTree(leaves);
    const proof = getMerkleProof(tree, 3);
    expect(verifyMerkleProof(leaves[3]!, proof, 4, tree.root)).toBe(false);
  });

  it("fails against the wrong root", () => {
    const leaves = fakeLeaves(10);
    const tree = buildMerkleTree(leaves);
    const otherTree = buildMerkleTree(fakeLeaves(10).map((_, i) => keccak256(toHex(`other-${i}`))));
    const proof = getMerkleProof(tree, 3);
    expect(verifyMerkleProof(leaves[3]!, proof, 3, otherTree.root)).toBe(false);
  });
});

describe("leafHash", () => {
  it("is deterministic", () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    expect(leafHash(data)).toBe(leafHash(data));
  });
});
