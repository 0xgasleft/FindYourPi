import hre from "hardhat";
import { keccak256, toHex } from "viem";
import { buildDatasetTree, buildOccurrenceProof, type ChunkProof as TsChunkProof } from "@pi-hunter/proofs";
import { digitsToBytes } from "@pi-hunter/pi-core";

/**
 * Measures REAL gas usage for claim() against a locally-deployed contract —
 * not the analytical estimate in packages/proofs/benchmark/chunk-encoding.js
 * (docs/proof-system.md §4). Run standalone: `pnpm --filter @pi-hunter/contracts test -- --grep "gas report"`
 */
const DIGIT_COUNT = 200_000;
const CHUNK_SIZE = 128; // matches the production chunk size decision
const DIGIT_STR = Array.from({ length: DIGIT_COUNT }, (_, i) => (i * 7 + 3) % 10).join("");

function digitStrToU8(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) - 48;
  return out;
}

function toSolidityProofs(proofs: TsChunkProof[]) {
  return proofs.map((p) => ({ chunkIndex: BigInt(p.chunkIndex), chunkData: toHex(p.chunkData), merkleProof: p.merkleProof }));
}

describe("gas report (informational, not an assertion)", () => {
  it("prints measured gas for single-chunk and two-chunk claims at the production chunk size", async () => {
    const [owner, alice] = await hre.viem.getWalletClients();
    const publicClient = await hre.viem.getPublicClient();

    const registry = await hre.viem.deployContract("PiDatasetRegistry", [owner.account.address]);
    const verifier = await hre.viem.deployContract("MerkleVerifierV1", []);
    const nft = await hre.viem.deployContract("PiHunterNFT", [owner.account.address, registry.address]);

    const digits = digitStrToU8(DIGIT_STR);
    const { tree, chunks } = buildDatasetTree(digits, CHUNK_SIZE);
    await registry.write.registerDataset(
      [1n, BigInt(DIGIT_COUNT), BigInt(CHUNK_SIZE), tree.root, keccak256(digits), verifier.address],
      { account: owner.account.address }
    );

    const nftAsAlice = await hre.viem.getContractAt("PiHunterNFT", nft.address, { client: { wallet: alice } });

    // Single-chunk claim: comfortably inside one 128-digit chunk.
    const posSingle = 10;
    const lenSingle = 12;
    const seqSingle = toHex(digitsToBytes(DIGIT_STR.slice(posSingle, posSingle + lenSingle)));
    const proofSingle = toSolidityProofs(buildOccurrenceProof(chunks, tree, CHUNK_SIZE, posSingle, lenSingle).proofs);
    const hash1 = await nftAsAlice.write.claim([1n, BigInt(posSingle), seqSingle, proofSingle]);
    const r1 = await publicClient.waitForTransactionReceipt({ hash: hash1 });

    // Two-chunk claim: straddles a chunk boundary, worst-case proof shape (docs/proof-system.md §3.1).
    const posDouble = CHUNK_SIZE - 5;
    const lenDouble = 20;
    const seqDouble = toHex(digitsToBytes(DIGIT_STR.slice(posDouble, posDouble + lenDouble)));
    const proofDouble = toSolidityProofs(buildOccurrenceProof(chunks, tree, CHUNK_SIZE, posDouble, lenDouble).proofs);
    const hash2 = await nftAsAlice.write.claim([1n, BigInt(posDouble), seqDouble, proofDouble]);
    const r2 = await publicClient.waitForTransactionReceipt({ hash: hash2 });

    console.log(`\n  [gas report] single-chunk claim (matchLength=${lenSingle}):  ${r1.gasUsed.toString()} gas`);
    console.log(`  [gas report] two-chunk claim   (matchLength=${lenDouble}):  ${r2.gasUsed.toString()} gas`);
    console.log(`  (analytical estimate in docs/proof-system.md §4 for the two-chunk worst case: ~98,818 gas)\n`);
  });
});
