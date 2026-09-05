import { expect } from "chai";
import hre from "hardhat";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import { encodeAbiParameters, keccak256, toHex, parseEventLogs, type Hex } from "viem";
import { buildDatasetTree, buildOccurrenceProof, type ChunkProof as TsChunkProof } from "@pi-hunter/proofs";
import { computeDiscoveryId, digitsToBytes } from "@pi-hunter/pi-core";

// Small synthetic dataset — deterministic pseudo-digit sequence, not real π
// (real π correctness is covered in packages/pi-search's own tests). Fast
// to build fresh for every test.
const DIGIT_COUNT = 5000;
const CHUNK_SIZE = 32;
const DIGIT_STR = Array.from({ length: DIGIT_COUNT }, (_, i) => (i * 7 + 3) % 10).join("");

function digitStrToU8(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) - 48;
  return out;
}

function toSolidityProofs(proofs: TsChunkProof[]) {
  return proofs.map((p) => ({
    chunkIndex: BigInt(p.chunkIndex),
    chunkData: toHex(p.chunkData),
    merkleProof: p.merkleProof,
  }));
}

async function deployFixture() {
  const [owner, alice, bob] = await hre.viem.getWalletClients();
  const publicClient = await hre.viem.getPublicClient();

  const registry = await hre.viem.deployContract("PiDatasetRegistry", [owner.account.address]);
  const verifier = await hre.viem.deployContract("MerkleVerifierV1", []);
  const nft = await hre.viem.deployContract("PiHunterNFT", [owner.account.address, registry.address]);

  const digits = digitStrToU8(DIGIT_STR);
  const { tree, chunks } = buildDatasetTree(digits, CHUNK_SIZE);
  const datasetHash = keccak256(digits);

  await registry.write.registerDataset(
    [1n, BigInt(DIGIT_COUNT), BigInt(CHUNK_SIZE), tree.root, datasetHash, verifier.address],
    { account: owner.account.address }
  );

  return { owner, alice, bob, publicClient, registry, verifier, nft, digits, tree, chunks };
}

function buildClaimArgs(chunks: Uint8Array[], tree: ReturnType<typeof buildDatasetTree>["tree"], position: number, matchLength: number) {
  const sequence = DIGIT_STR.slice(position, position + matchLength);
  const occurrence = buildOccurrenceProof(chunks, tree, CHUNK_SIZE, position, matchLength);
  const sequenceHex = toHex(digitsToBytes(sequence));
  const proofsArg = toSolidityProofs(occurrence.proofs);
  const discoveryId = computeDiscoveryId({ datasetVersion: 1n, root: tree.root, position: BigInt(position), matchLength, sequence });
  return { sequence, sequenceHex, proofsArg, discoveryId };
}

describe("PiHunterNFT", () => {
  it("mints on a valid claim and assigns ownership to the caller", async () => {
    const { alice, nft, chunks, tree } = await deployFixture();
    const { sequenceHex, proofsArg, discoveryId } = buildClaimArgs(chunks, tree, 100, 6);

    const nftAsAlice = await hre.viem.getContractAt("PiHunterNFT", nft.address, { client: { wallet: alice } });
    await nftAsAlice.write.claim([1n, 100n, sequenceHex, proofsArg]);

    expect((await nft.read.ownerOf([1n])).toLowerCase()).to.equal(alice.account.address.toLowerCase());
    expect(await nft.read.claimed([discoveryId])).to.equal(true);
    expect(await nft.read.tokenIdToDiscoveryId([1n])).to.equal(discoveryId);
    expect(await nft.read.discoveryIdToTokenId([discoveryId])).to.equal(1n);
  });

  it("emits DiscoveryClaimed with the correct fields", async () => {
    const { alice, nft, chunks, tree, publicClient } = await deployFixture();
    const { sequenceHex, proofsArg, discoveryId } = buildClaimArgs(chunks, tree, 200, 8);

    const nftAsAlice = await hre.viem.getContractAt("PiHunterNFT", nft.address, { client: { wallet: alice } });
    const hash = await nftAsAlice.write.claim([1n, 200n, sequenceHex, proofsArg]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    const events = parseEventLogs({ abi: nft.abi, logs: receipt.logs, eventName: "DiscoveryClaimed" });
    expect(events.length).to.equal(1);
    expect(events[0]!.args.discoveryId).to.equal(discoveryId);
    expect(events[0]!.args.position).to.equal(200n);
    expect(events[0]!.args.matchLength).to.equal(8n);
    expect(events[0]!.args.owner.toLowerCase()).to.equal(alice.account.address.toLowerCase());
  });

  it("rejects a second claim of the same discovery (duplicate-claim prevention)", async () => {
    const { alice, bob, nft, chunks, tree } = await deployFixture();
    const { sequenceHex, proofsArg } = buildClaimArgs(chunks, tree, 300, 6);

    const nftAsAlice = await hre.viem.getContractAt("PiHunterNFT", nft.address, { client: { wallet: alice } });
    await nftAsAlice.write.claim([1n, 300n, sequenceHex, proofsArg]);

    const nftAsBob = await hre.viem.getContractAt("PiHunterNFT", nft.address, { client: { wallet: bob } });
    await expect(nftAsBob.write.claim([1n, 300n, sequenceHex, proofsArg])).to.be.rejectedWith(/already claimed/);
  });

  it("rejects a claim with a tampered sequence (invalid proof)", async () => {
    const { alice, nft, chunks, tree } = await deployFixture();
    const { proofsArg } = buildClaimArgs(chunks, tree, 400, 6);
    const wrongSequenceHex = toHex(digitsToBytes("999999"));

    const nftAsAlice = await hre.viem.getContractAt("PiHunterNFT", nft.address, { client: { wallet: alice } });
    await expect(nftAsAlice.write.claim([1n, 400n, wrongSequenceHex, proofsArg])).to.be.rejectedWith(/invalid proof/);
  });

  it("rejects a claim against an unregistered dataset version", async () => {
    const { alice, nft, chunks, tree } = await deployFixture();
    const { sequenceHex, proofsArg } = buildClaimArgs(chunks, tree, 500, 6);

    const nftAsAlice = await hre.viem.getContractAt("PiHunterNFT", nft.address, { client: { wallet: alice } });
    await expect(nftAsAlice.write.claim([2n, 500n, sequenceHex, proofsArg])).to.be.rejected;
  });

  it("rejects new claims once the dataset version is deactivated, but does not affect existing tokens", async () => {
    const { owner, alice, bob, registry, nft, chunks, tree } = await deployFixture();
    const first = buildClaimArgs(chunks, tree, 600, 6);
    const nftAsAlice = await hre.viem.getContractAt("PiHunterNFT", nft.address, { client: { wallet: alice } });
    await nftAsAlice.write.claim([1n, 600n, first.sequenceHex, first.proofsArg]);

    await registry.write.setActive([1n, false], { account: owner.account.address });

    const second = buildClaimArgs(chunks, tree, 700, 6);
    const nftAsBob = await hre.viem.getContractAt("PiHunterNFT", nft.address, { client: { wallet: bob } });
    await expect(nftAsBob.write.claim([1n, 700n, second.sequenceHex, second.proofsArg])).to.be.rejectedWith(/not open for new claims/);

    // the earlier claim's token remains owned and intact
    expect((await nft.read.ownerOf([1n])).toLowerCase()).to.equal(alice.account.address.toLowerCase());
  });

  it("only the registry owner can register a dataset or set active state", async () => {
    const { alice, registry } = await deployFixture();
    await expect(
      registry.write.setActive([1n, false], { account: alice.account.address })
    ).to.be.rejected;
  });

  it("only the NFT owner can pause/unpause", async () => {
    const { alice, nft } = await deployFixture();
    await expect(nft.write.pause({ account: alice.account.address })).to.be.rejected;
  });

  it("tokenURI reflects the owner-settable metadata base URI", async () => {
    const { owner, alice, nft, chunks, tree } = await deployFixture();
    const { sequenceHex, proofsArg } = buildClaimArgs(chunks, tree, 1300, 6);
    const nftAsAlice = await hre.viem.getContractAt("PiHunterNFT", nft.address, { client: { wallet: alice } });
    await nftAsAlice.write.claim([1n, 1300n, sequenceHex, proofsArg]);

    expect(await nft.read.tokenURI([1n])).to.equal("");
    await nft.write.setMetadataBaseURI(["https://api.example.com/api/metadata/"], { account: owner.account.address });
    expect(await nft.read.tokenURI([1n])).to.equal("https://api.example.com/api/metadata/1");

    await expect(
      nft.write.setMetadataBaseURI(["https://evil.example.com/"], { account: alice.account.address })
    ).to.be.rejected;
  });

  it("rejects claims while paused", async () => {
    const { owner, alice, nft, chunks, tree } = await deployFixture();
    await nft.write.pause({ account: owner.account.address });
    const { sequenceHex, proofsArg } = buildClaimArgs(chunks, tree, 800, 6);
    const nftAsAlice = await hre.viem.getContractAt("PiHunterNFT", nft.address, { client: { wallet: alice } });
    await expect(nftAsAlice.write.claim([1n, 800n, sequenceHex, proofsArg])).to.be.rejected;
  });

  describe("commit-reveal claim path", () => {
    it("mints via commitClaim + revealClaim after the reveal delay", async () => {
      const { alice, nft, chunks, tree } = await deployFixture();
      const { sequenceHex, proofsArg, discoveryId } = buildClaimArgs(chunks, tree, 900, 9);
      const secret = keccak256(toHex("alice-secret-1"));
      const commitHash = keccak256(
        encodeAbiParameters(
          [{ type: "address" }, { type: "bytes32" }, { type: "bytes32" }],
          [alice.account.address, discoveryId, secret]
        )
      );

      const nftAsAlice = await hre.viem.getContractAt("PiHunterNFT", nft.address, { client: { wallet: alice } });
      await nftAsAlice.write.commitClaim([commitHash]);

      await mine(3);

      await nftAsAlice.write.revealClaim([1n, 900n, sequenceHex, proofsArg, secret]);
      expect(await nft.read.claimed([discoveryId])).to.equal(true);
      expect((await nft.read.ownerOf([1n])).toLowerCase()).to.equal(alice.account.address.toLowerCase());
    });

    it("rejects a reveal before MIN_REVEAL_DELAY blocks have passed", async () => {
      const { alice, nft, chunks, tree } = await deployFixture();
      const { sequenceHex, proofsArg, discoveryId } = buildClaimArgs(chunks, tree, 1000, 6);
      const secret = keccak256(toHex("too-fast"));
      const commitHash = keccak256(
        encodeAbiParameters([{ type: "address" }, { type: "bytes32" }, { type: "bytes32" }], [alice.account.address, discoveryId, secret])
      );

      const nftAsAlice = await hre.viem.getContractAt("PiHunterNFT", nft.address, { client: { wallet: alice } });
      await nftAsAlice.write.commitClaim([commitHash]);
      // 0 extra blocks mined — reveal in the very next block should still be too early
      await expect(nftAsAlice.write.revealClaim([1n, 1000n, sequenceHex, proofsArg, secret])).to.be.rejectedWith(/too early/);
    });

    it("rejects a reveal whose secret doesn't match any commit", async () => {
      const { alice, nft, chunks, tree } = await deployFixture();
      const { sequenceHex, proofsArg } = buildClaimArgs(chunks, tree, 1100, 6);
      const wrongSecret = keccak256(toHex("never-committed"));

      const nftAsAlice = await hre.viem.getContractAt("PiHunterNFT", nft.address, { client: { wallet: alice } });
      await mine(5);
      await expect(nftAsAlice.write.revealClaim([1n, 1100n, sequenceHex, proofsArg, wrongSecret])).to.be.rejectedWith(/no matching commit/);
    });

    it("prevents a different address from stealing a reveal for someone else's commit", async () => {
      const { alice, bob, nft, chunks, tree } = await deployFixture();
      const { sequenceHex, proofsArg, discoveryId } = buildClaimArgs(chunks, tree, 1200, 6);
      const secret = keccak256(toHex("alices-secret"));
      const commitHash = keccak256(
        encodeAbiParameters([{ type: "address" }, { type: "bytes32" }, { type: "bytes32" }], [alice.account.address, discoveryId, secret])
      );

      const nftAsAlice = await hre.viem.getContractAt("PiHunterNFT", nft.address, { client: { wallet: alice } });
      await nftAsAlice.write.commitClaim([commitHash]);
      await mine(3);

      // Bob knows the revealed plaintext (position/sequence/secret leak at reveal time in general,
      // but here Bob tries to front-run using Alice's exact secret before she reveals) —
      // the commitHash is keyed by committer address, so Bob's own commit lookup won't find it.
      const nftAsBob = await hre.viem.getContractAt("PiHunterNFT", nft.address, { client: { wallet: bob } });
      await expect(nftAsBob.write.revealClaim([1n, 1200n, sequenceHex, proofsArg, secret])).to.be.rejectedWith(/no matching commit/);
    });
  });
});
