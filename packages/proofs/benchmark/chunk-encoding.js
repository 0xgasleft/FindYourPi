#!/usr/bin/env node
/**
 * Analytical gas/calldata benchmark for candidate Merkle-chunk encodings
 * used by PiProofVerifier.verifyOccurrence(). No deployed contract is
 * required: calldata and keccak256 gas costs are fixed EVM constants
 * (EIP-2028 calldata pricing; keccak256 = 30 + 6 gas per 32-byte word),
 * and Base follows the standard EVM gas schedule for these opcodes.
 *
 * Run: node packages/proofs/benchmark/chunk-encoding.js
 *
 * This is the source of the numbers cited in docs/proof-system.md ("Chunk
 * encoding benchmark"). Re-run and update both if DATASET_DIGITS,
 * MAX_MATCH_LEN, or the mint-overhead estimate changes.
 */

const DATASET_DIGITS = 1_000_000_000;
const MAX_MATCH_LEN = 64; // on-chain-provable cap; see docs/proof-system.md 3.1
const CALLDATA_GAS_NONZERO = 16; // EIP-2028 worst case: digit/nibble bytes are ~always nonzero
const KECCAK_BASE = 30;
const KECCAK_PER_WORD = 6;
const MINT_OVERHEAD_GAS = 21000 /* base tx */ + 46000 /* ERC721 _mint + cold SSTORE claimed[id] + event logs, rough */;

function keccakGas(inputBytes) {
  return KECCAK_BASE + KECCAK_PER_WORD * Math.ceil(inputBytes / 32);
}

function bench({ label, chunkDigits, bytesPerDigit }) {
  const chunkDataBytes = Math.ceil(chunkDigits * bytesPerDigit);
  const numChunks = Math.ceil(DATASET_DIGITS / chunkDigits);
  const treeDepth = Math.ceil(Math.log2(numChunks));

  // Worst case is bounded to 2 chunks touched as long as chunkDigits >= MAX_MATCH_LEN
  // (a match can start at most 1 digit before a chunk boundary and still fit in 2 chunks).
  const chunksTouched = chunkDigits >= MAX_MATCH_LEN ? 2 : Math.ceil((MAX_MATCH_LEN + chunkDigits - 1) / chunkDigits) + 1;

  const chunkDataCalldata = chunksTouched * chunkDataBytes;
  const proofCalldata = chunksTouched * treeDepth * 32; // sibling hashes
  const sequenceCalldata = MAX_MATCH_LEN; // sequence kept unpacked (1 byte/digit) for on-chain readability; see docs
  const abiOverhead = 4 /* selector */ + 32 * 6 /* dynamic array offsets/lengths, rough */;

  const totalCalldataBytes = chunkDataCalldata + proofCalldata + sequenceCalldata + abiOverhead;
  const calldataGas = totalCalldataBytes * CALLDATA_GAS_NONZERO;

  const leafHashGas = chunksTouched * keccakGas(chunkDataBytes);
  const pathHashGas = chunksTouched * treeDepth * keccakGas(64);
  const sequenceHashGas = keccakGas(sequenceCalldata);
  const totalKeccakGas = leafHashGas + pathHashGas + sequenceHashGas;

  const totalGas = calldataGas + totalKeccakGas + MINT_OVERHEAD_GAS;

  return { label, numChunks, treeDepth, chunksTouched, chunkDataBytes, totalCalldataBytes, calldataGas, totalKeccakGas, totalGas };
}

const scenarios = [
  { label: "1024-digit chunks, 1 byte/digit (naive)", chunkDigits: 1024, bytesPerDigit: 1 },
  { label: "256-digit chunks, 1 byte/digit", chunkDigits: 256, bytesPerDigit: 1 },
  { label: "128-digit chunks, 1 byte/digit", chunkDigits: 128, bytesPerDigit: 1 },
  { label: "256-digit chunks, packed 4-bit/digit", chunkDigits: 256, bytesPerDigit: 0.5 },
  { label: "128-digit chunks, packed 4-bit/digit (chosen)", chunkDigits: 128, bytesPerDigit: 0.5 },
  { label: "96-digit chunks, packed 4-bit/digit", chunkDigits: 96, bytesPerDigit: 0.5 },
  { label: "64-digit chunks, packed 4-bit/digit", chunkDigits: 64, bytesPerDigit: 0.5 },
  { label: "512-digit chunks, packed 4-bit/digit", chunkDigits: 512, bytesPerDigit: 0.5 },
];

console.log(`Dataset: ${DATASET_DIGITS.toLocaleString()} digits, max on-chain match length: ${MAX_MATCH_LEN} digits\n`);
console.log(["label", "numChunks", "depth", "chunksTouched", "chunkDataB", "totalCalldataB", "calldataGas", "keccakGas", "TOTAL_GAS"].join(" | "));
for (const s of scenarios) {
  const r = bench(s);
  console.log([r.label, r.numChunks.toLocaleString(), r.treeDepth, r.chunksTouched, r.chunkDataBytes, r.totalCalldataBytes, r.calldataGas.toLocaleString(), r.totalKeccakGas.toLocaleString(), r.totalGas.toLocaleString()].join(" | "));
}
