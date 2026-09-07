import { describe, expect, it } from "vitest";
import { buildDatasetTree, buildOccurrenceProof, verifyOccurrenceProof } from "../src/proof";

// Small, fixed digit string standing in for a dataset slice  -  the point of
// these tests is proof mechanics (chunk spanning, tamper detection), not
// real π digits (that's covered in packages/pi-search's own tests).
const DIGIT_STR = Array.from({ length: 5000 }, (_, i) => ((i * 7 + 3) % 10)).join("");
const CHUNK_SIZE = 32; // small on purpose, to force multi-chunk-spanning matches in a small fixture

function toDigits(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) - 48;
  return out;
}

const digits = toDigits(DIGIT_STR);
const { tree, chunks } = buildDatasetTree(digits, CHUNK_SIZE);

describe("buildOccurrenceProof + verifyOccurrenceProof", () => {
  it("verifies a match fully within a single chunk", () => {
    const position = 5;
    const matchLength = 6;
    const sequence = DIGIT_STR.slice(position, position + matchLength);
    const proof = buildOccurrenceProof(chunks, tree, CHUNK_SIZE, position, matchLength);
    expect(proof.proofs.length).toBe(1);
    expect(verifyOccurrenceProof(tree.root, CHUNK_SIZE, sequence, proof)).toBe(true);
  });

  it("verifies a match spanning exactly two adjacent chunks", () => {
    const position = CHUNK_SIZE - 3; // starts 3 before a chunk boundary
    const matchLength = 10;
    const sequence = DIGIT_STR.slice(position, position + matchLength);
    const proof = buildOccurrenceProof(chunks, tree, CHUNK_SIZE, position, matchLength);
    expect(proof.proofs.length).toBe(2);
    expect(verifyOccurrenceProof(tree.root, CHUNK_SIZE, sequence, proof)).toBe(true);
  });

  it("verifies a match spanning three chunks (chunkSize < matchLength, generalized case)", () => {
    const position = CHUNK_SIZE - 5;
    const matchLength = CHUNK_SIZE + 10; // forces 3 chunks touched
    const sequence = DIGIT_STR.slice(position, position + matchLength);
    const proof = buildOccurrenceProof(chunks, tree, CHUNK_SIZE, position, matchLength);
    expect(proof.proofs.length).toBe(3);
    expect(verifyOccurrenceProof(tree.root, CHUNK_SIZE, sequence, proof)).toBe(true);
  });

  it("rejects a proof for the wrong sequence at the same position", () => {
    const position = 100;
    const matchLength = 8;
    const proof = buildOccurrenceProof(chunks, tree, CHUNK_SIZE, position, matchLength);
    const wrongSequence = DIGIT_STR.slice(position, position + matchLength - 1) + "9"; // last digit wrong
    expect(verifyOccurrenceProof(tree.root, CHUNK_SIZE, wrongSequence, proof)).toBe(false);
  });

  it("rejects a proof with tampered chunk data (fails Merkle check)", () => {
    const position = 200;
    const matchLength = 6;
    const sequence = DIGIT_STR.slice(position, position + matchLength);
    const proof = buildOccurrenceProof(chunks, tree, CHUNK_SIZE, position, matchLength);
    const tampered = { ...proof, proofs: [{ ...proof.proofs[0]!, chunkData: new Uint8Array(proof.proofs[0]!.chunkData.length).fill(0xff) }] };
    expect(verifyOccurrenceProof(tree.root, CHUNK_SIZE, sequence, tampered)).toBe(false);
  });

  it("rejects a proof claiming a different position than what the chunk indices support", () => {
    const position = 300;
    const matchLength = 6;
    const sequence = DIGIT_STR.slice(position, position + matchLength);
    const proof = buildOccurrenceProof(chunks, tree, CHUNK_SIZE, position, matchLength);
    const relocated = { ...proof, position: position + 1 };
    expect(verifyOccurrenceProof(tree.root, CHUNK_SIZE, sequence, relocated)).toBe(false);
  });

  it("rejects a proof with non-contiguous chunk indices", () => {
    const position = CHUNK_SIZE - 3;
    const matchLength = 10;
    const proof = buildOccurrenceProof(chunks, tree, CHUNK_SIZE, position, matchLength);
    const sequence = DIGIT_STR.slice(position, position + matchLength);
    const shuffled = { ...proof, proofs: [proof.proofs[1]!, proof.proofs[0]!] };
    expect(verifyOccurrenceProof(tree.root, CHUNK_SIZE, sequence, shuffled)).toBe(false);
  });

  it("rejects against the wrong root", () => {
    const position = 50;
    const matchLength = 6;
    const sequence = DIGIT_STR.slice(position, position + matchLength);
    const proof = buildOccurrenceProof(chunks, tree, CHUNK_SIZE, position, matchLength);
    const wrongRoot = ("0x" + "ab".repeat(32)) as `0x${string}`;
    expect(verifyOccurrenceProof(wrongRoot, CHUNK_SIZE, sequence, proof)).toBe(false);
  });
});
