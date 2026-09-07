import { beforeAll, describe, expect, it } from "vitest";
import { computePiDigits } from "../src/pi-generator";
import { computePiDigitsParallel } from "../src/parallel-pi-generator";

/**
 * Correctness gate before the parallel generator is ever trusted for a real,
 * multi-hour, multi-billion-digit run: it must produce byte-for-byte the
 * same output as the already-validated single-threaded reference, at
 * several worker counts (including deliberately uneven splits).
 */
describe("computePiDigitsParallel", () => {
  const numDigits = 1_000_000; // large enough to clear MIN_TERMS_FOR_PARALLEL and actually spawn workers
  let reference: Uint8Array;

  beforeAll(async () => {
    reference = await computePiDigits(numDigits);
  });

  it("matches the single-threaded reference with 2 workers", async () => {
    const result = await computePiDigitsParallel(numDigits, { workerCount: 2 });
    expect(result).toEqual(reference);
  });

  it("matches the single-threaded reference with 8 workers", async () => {
    const result = await computePiDigitsParallel(numDigits, { workerCount: 8 });
    expect(result).toEqual(reference);
  });

  it("matches the single-threaded reference with an odd, unbalanced worker count", async () => {
    const result = await computePiDigitsParallel(numDigits, { workerCount: 7 });
    expect(result).toEqual(reference);
  });

  it("falls back to single-threaded (no workers) below the parallel threshold and still matches", async () => {
    const small = await computePiDigits(1000);
    const result = await computePiDigitsParallel(1000, { workerCount: 8 });
    expect(result).toEqual(small);
  });

  it("reports progress callbacks summing to the total range count", async () => {
    const calls: Array<[number, number]> = [];
    await computePiDigitsParallel(numDigits, { workerCount: 4, onProgress: (c, t) => calls.push([c, t]) });
    expect(calls.length).toBe(4);
    expect(calls[calls.length - 1]).toEqual([4, 4]);
  });
}, 60_000);
