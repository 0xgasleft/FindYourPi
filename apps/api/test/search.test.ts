import { beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildMerkleTree, leafHash, chunkDigits } from "@pi-hunter/pi-search";
import { buildSuffixArray } from "@pi-hunter/pi-search";
import { computeDiscoveryId } from "@pi-hunter/pi-core";
import { verifyOccurrenceProof, type ChunkProof } from "@pi-hunter/proofs";
import { setActiveDatasetForTesting } from "../src/dataset-loader";
import { buildApp } from "../src/app";

const CHUNK_SIZE = 32;
const DIGIT_STR = "31415926535897932384626433832795028841971693993751058209749445923078164062862089986280348253421170679";

function toDigitArray(s: string): Uint8Array {
  const arr = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i) - 48;
  return arr;
}

let app: FastifyInstance;

// Fixture digits/chunks/tree, computed once and reused by tests that need
// to independently recompute an expected value (discoveryId, proof root).
const fixtureDigits = toDigitArray(DIGIT_STR);
const fixtureChunks = chunkDigits(fixtureDigits, CHUNK_SIZE).map((c) => c.packed);
const fixtureTree = buildMerkleTree(fixtureChunks.map((c) => leafHash(c)));

beforeAll(async () => {
  const suffixArray = buildSuffixArray(fixtureDigits);

  setActiveDatasetForTesting({
    manifest: {
      version: 1,
      digitCount: fixtureDigits.length,
      chunkSizeDigits: CHUNK_SIZE,
      chunkCount: fixtureChunks.length,
      merkleRoot: fixtureTree.root,
      datasetHash: "0x00",
      algorithm: "chudnovsky-binary-splitting",
      generatedAt: new Date().toISOString(),
    },
    digits: fixtureDigits,
    suffixArray,
    tree: fixtureTree,
    chunks: fixtureChunks,
  });

  app = await buildApp();
});

describe("POST /api/search", () => {
  it("finds a known sequence and returns its real position", async () => {
    const res = await app.inject({ method: "POST", url: "/api/search", payload: { input: "14159", mode: "number" } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.found).toBe(true);
    expect(body.position).toBe(DIGIT_STR.indexOf("14159"));
    expect(body.match_length).toBe(5);
    expect(body.rarity_tier).toBe("COMMON"); // 5 digits: COMMON is 3-5 per DEFAULT_RARITY_TIERS
    expect(body.digits_indexed).toBe(DIGIT_STR.length);
  });

  it("reports not found for a sequence absent from this small fixture", async () => {
    const res = await app.inject({ method: "POST", url: "/api/search", payload: { input: "9999999999", mode: "number" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().found).toBe(false);
  });

  it("rejects invalid conversion mode", async () => {
    const res = await app.inject({ method: "POST", url: "/api/search", payload: { input: "abc", mode: "bogus" } });
    expect(res.statusCode).toBe(400);
  });

  it("rejects ASCII mode for non-ASCII input with a clear error, not a 500", async () => {
    const res = await app.inject({ method: "POST", url: "/api/search", payload: { input: "café", mode: "ascii" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("conversion_failed");
  });

  it("accepts base36 mode and normalizes to the base-36-as-decimal encoding", async () => {
    const res = await app.inject({ method: "POST", url: "/api/search", payload: { input: "abc", mode: "base36" } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.conversion_mode).toBe("base36");
    expect(body.normalized_input).toBe("60024"); // 36^3 + (a=10,b=11,c=12 as base36) — denser than ASCII's 9 digits
  });

  it("rejects base36 mode for characters outside a-z/0-9 with a clear error, not a 500", async () => {
    const res = await app.inject({ method: "POST", url: "/api/search", payload: { input: "café!", mode: "base36" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("conversion_failed");
  });

  it("accepts base95 mode, covering spaces and punctuation base36 rejects", async () => {
    const res = await app.inject({ method: "POST", url: "/api/search", payload: { input: "a b", mode: "base95" } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.conversion_mode).toBe("base95");
    expect(body.normalized_input).toBe("1444066");
  });

  it("rejects base95 mode for non-printable-ASCII input with a clear error, not a 500", async () => {
    const res = await app.inject({ method: "POST", url: "/api/search", payload: { input: "café!", mode: "base95" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("conversion_failed");
  });

  it("returns a discovery_id that matches the shared pi-core derivation exactly", async () => {
    const query = DIGIT_STR.slice(40, 46); // guaranteed present — taken directly from the fixture
    const res = await app.inject({ method: "POST", url: "/api/search", payload: { input: query, mode: "number" } });
    const body = res.json();
    expect(body.found).toBe(true);
    const expected = computeDiscoveryId({
      datasetVersion: 1n,
      root: fixtureTree.root,
      position: BigInt(body.position),
      matchLength: body.match_length,
      sequence: body.normalized_input,
    });
    expect(body.discovery_id).toBe(expected);
  });
});

describe("POST /api/proof", () => {
  it("builds a proof that independently verifies against the dataset's Merkle root", async () => {
    const searchRes = await app.inject({ method: "POST", url: "/api/search", payload: { input: "26535", mode: "number" } });
    const { position } = searchRes.json();

    const proofRes = await app.inject({ method: "POST", url: "/api/proof", payload: { position, sequence: "26535" } });
    expect(proofRes.statusCode).toBe(200);
    const body = proofRes.json();

    const proofs: ChunkProof[] = body.proofs.map((p: any) => ({
      chunkIndex: p.chunk_index,
      chunkData: Uint8Array.from(Buffer.from(p.chunk_data.slice(2), "hex")),
      merkleProof: p.merkle_proof,
    }));

    const ok = verifyOccurrenceProof(fixtureTree.root, CHUNK_SIZE, "26535", { position, matchLength: 5, proofs });
    expect(ok).toBe(true);
  });

  it("rejects a position out of range", async () => {
    const res = await app.inject({ method: "POST", url: "/api/proof", payload: { position: 999999, sequence: "123" } });
    expect(res.statusCode).toBe(400);
  });
});
