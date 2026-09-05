import { describe, expect, it } from "vitest";
import { computePiDigits } from "../src/pi-generator";

// First 150 decimal digits of π after the point, from a well-known,
// independently-checkable reference (e.g. NIST/OEIS A000796). Used only to
// validate our own Chudnovsky implementation below — this string is NOT
// used anywhere in the actual dataset generation pipeline.
const KNOWN_PI_150 =
  "14159265358979323846264338327950288419716939937510" +
  "58209749445923078164062862089986280348253421170679" +
  "82148086513282306647093844609550582231725359408128";

describe("computePiDigits", () => {
  it("matches the known reference for the first 150 digits", () => {
    expect(computePiDigits(150)).toBe(KNOWN_PI_150);
  });

  it("matches the known reference at smaller prefixes too (10, 50, 100)", () => {
    expect(computePiDigits(10)).toBe(KNOWN_PI_150.slice(0, 10));
    expect(computePiDigits(50)).toBe(KNOWN_PI_150.slice(0, 50));
    expect(computePiDigits(100)).toBe(KNOWN_PI_150.slice(0, 100));
  });

  it("is deterministic across repeated calls", () => {
    expect(computePiDigits(200)).toBe(computePiDigits(200));
  });

  it("longer computations agree with shorter ones on the shared prefix", () => {
    const short = computePiDigits(100);
    const long = computePiDigits(1000);
    expect(long.slice(0, 100)).toBe(short);
  });
});
