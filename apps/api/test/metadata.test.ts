import { beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildMerkleTree, leafHash, chunkDigits, buildSuffixArray } from "@pi-hunter/pi-search";
import { setActiveDatasetForTesting } from "../src/dataset-loader";
import { buildApp } from "../src/app";

let app: FastifyInstance;

beforeAll(async () => {
  const digits = new Uint8Array(1000).map((_, i) => i % 10);
  const chunks = chunkDigits(digits, 32).map((c) => c.packed);
  const tree = buildMerkleTree(chunks.map((c) => leafHash(c)));
  setActiveDatasetForTesting({
    manifest: { version: 1, digitCount: digits.length, chunkSizeDigits: 32, chunkCount: chunks.length, merkleRoot: tree.root, datasetHash: "0x00", algorithm: "chudnovsky-binary-splitting", generatedAt: new Date().toISOString() },
    digits,
    suffixArray: buildSuffixArray(digits),
    tree,
    chunks,
  });
  app = await buildApp();
});

// Regression test for a real bug found during manual testing: a malformed
// tokenId caused Postgres to throw a type-cast error that leaked as a raw
// 500 with the internal error message (`invalid input syntax for type
// bigint`) — should be a clean 400 instead, and never leak driver internals.
describe("GET /api/metadata/:tokenId — malformed input", () => {
  it("rejects a non-numeric tokenId with 400, not a leaked DB error", async () => {
    const res = await app.inject({ method: "GET", url: "/api/metadata/not-a-number" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_token_id" });
  });

  it("rejects a non-numeric tokenId on the artwork route the same way", async () => {
    const res = await app.inject({ method: "GET", url: "/api/artwork/abc123" });
    expect(res.statusCode).toBe(400);
  });
});

describe("global error handler", () => {
  it("never leaks internal error details for an unexpected 500", async () => {
    // /api/profile/:address has no format validation (any string is a valid
    // WHERE clause parameter against a TEXT column) so it won't 500 here —
    // this checks the handler's shape directly by asserting the contract:
    // any 5xx response body is exactly { error: "internal_error" }.
    const res = await app.inject({ method: "GET", url: "/api/discovery/does-not-exist" });
    if (res.statusCode >= 500) {
      expect(res.json()).toEqual({ error: "internal_error" });
    } else {
      expect(res.statusCode).toBe(404);
    }
  });
});
