import { describe, expect, it } from "vitest";
import { buildSuffixArray, search } from "../src/suffix-array";
import { computePiDigits } from "../src/pi-generator";

function toDigitArray(s: string): Uint8Array {
  const arr = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i) - 48;
  return arr;
}

describe("buildSuffixArray + search", () => {
  it("finds a known substring at the correct position in a small fixed string", () => {
    const fixed = "31415926535897932384626433832795";
    const digits = toDigitArray(fixed);
    const sa = buildSuffixArray(digits);
    const r = search(digits, sa, "97932");
    expect(r.found).toBe(true);
    expect(r.firstPosition).toBe(fixed.indexOf("97932"));
  });

  it("matches naive indexOf on real generated π digits (cross-check)", () => {
    const piStr = computePiDigits(20000);
    const digits = toDigitArray(piStr);
    const sa = buildSuffixArray(digits);

    const queries = ["14159", "26535", "00000", "12345", "99999", "271828"];
    for (const q of queries) {
      const expectedPos = piStr.indexOf(q);
      const r = search(digits, sa, q);
      if (expectedPos === -1) {
        expect(r.found).toBe(false);
      } else {
        expect(r.found).toBe(true);
        expect(r.firstPosition).toBe(expectedPos);
      }
    }
  });

  it("reports occurrence count matching a naive count for a short, common sequence", () => {
    const piStr = computePiDigits(50000);
    const digits = toDigitArray(piStr);
    const sa = buildSuffixArray(digits);

    let naiveCount = 0;
    let idx = piStr.indexOf("14");
    while (idx !== -1) {
      naiveCount++;
      idx = piStr.indexOf("14", idx + 1);
    }
    const r = search(digits, sa, "14");
    expect(r.occurrenceCount).toBe(naiveCount);
  });

  it("returns not found for a sequence that cannot appear (11 digits of the same non-repeating pattern is unlikely but we use an intentionally absent one)", () => {
    const piStr = computePiDigits(2000);
    const digits = toDigitArray(piStr);
    const sa = buildSuffixArray(digits);
    // Construct a sequence guaranteed absent from this specific prefix by taking
    // a substring that doesn't occur (verified via indexOf) rather than assuming.
    const candidate = "01234567890123";
    if (piStr.includes(candidate)) return; // pragmatic guard; astronomically unlikely
    const r = search(digits, sa, candidate);
    expect(r.found).toBe(false);
  });
});
