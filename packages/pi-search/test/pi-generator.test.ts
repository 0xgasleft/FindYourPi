import { describe, expect, it } from "vitest";
import { computePiDigits } from "../src/pi-generator";

// First 150 decimal digits of π after the point, from a well-known,
// independently-checkable reference (e.g. NIST/OEIS A000796). Used only to
// validate our own Chudnovsky implementation below  -  this string is NOT
// used anywhere in the actual dataset generation pipeline.
const KNOWN_PI_150 =
  "14159265358979323846264338327950288419716939937510" +
  "58209749445923078164062862089986280348253421170679" +
  "82148086513282306647093844609550582231725359408128";

// computePiDigits returns raw digit VALUES (0-9 per byte), not ASCII  -  see
// pi-generator.ts's module doc for why (V8's JS string length ceiling).
function toDigitArray(s: string): Uint8Array {
  const arr = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i) - 48;
  return arr;
}

describe("computePiDigits", () => {
  it("matches the known reference for the first 150 digits", async () => {
    expect(await computePiDigits(150)).toEqual(toDigitArray(KNOWN_PI_150));
  });

  it("matches the known reference at smaller prefixes too (10, 50, 100)", async () => {
    expect(await computePiDigits(10)).toEqual(toDigitArray(KNOWN_PI_150.slice(0, 10)));
    expect(await computePiDigits(50)).toEqual(toDigitArray(KNOWN_PI_150.slice(0, 50)));
    expect(await computePiDigits(100)).toEqual(toDigitArray(KNOWN_PI_150.slice(0, 100)));
  });

  it("is deterministic across repeated calls", async () => {
    expect(await computePiDigits(200)).toEqual(await computePiDigits(200));
  });

  it("longer computations agree with shorter ones on the shared prefix", async () => {
    const short = await computePiDigits(100);
    const long = await computePiDigits(1000);
    expect(long.slice(0, 100)).toEqual(short);
  });
});
