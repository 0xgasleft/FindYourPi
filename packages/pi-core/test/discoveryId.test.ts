import { describe, expect, it } from "vitest";
import { computeDiscoveryId, digitsToBytes, sequenceHashOf } from "../src/discoveryId";

const ROOT = "0x" + "ab".repeat(32) as `0x${string}`;

describe("digitsToBytes", () => {
  it("maps digit characters to their numeric value, not char code", () => {
    expect(Array.from(digitsToBytes("0129"))).toEqual([0, 1, 2, 9]);
  });

  it("rejects non-digit characters", () => {
    expect(() => digitsToBytes("12a4")).toThrow(RangeError);
  });
});

describe("sequenceHashOf", () => {
  it("is deterministic", () => {
    expect(sequenceHashOf("314159")).toBe(sequenceHashOf("314159"));
  });

  it("differs for different sequences", () => {
    expect(sequenceHashOf("314159")).not.toBe(sequenceHashOf("271828"));
  });
});

describe("computeDiscoveryId", () => {
  const base = { datasetVersion: 1n, root: ROOT, position: 482193n, matchLength: 6, sequence: "314159" };

  it("is deterministic for identical inputs", () => {
    expect(computeDiscoveryId(base)).toBe(computeDiscoveryId({ ...base }));
  });

  it("changes if position changes", () => {
    expect(computeDiscoveryId(base)).not.toBe(computeDiscoveryId({ ...base, position: 482194n }));
  });

  it("changes if dataset version changes (v1 vs v2 discoveries never collide)", () => {
    expect(computeDiscoveryId(base)).not.toBe(computeDiscoveryId({ ...base, datasetVersion: 2n }));
  });

  it("changes if the sequence changes", () => {
    expect(computeDiscoveryId(base)).not.toBe(computeDiscoveryId({ ...base, sequence: "314158" }));
  });

  it("produces a 32-byte hex hash", () => {
    expect(computeDiscoveryId(base)).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
