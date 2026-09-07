import { describe, expect, it } from "vitest";
import { buildSuffixArray, search } from "../src/suffix-array";
import { computePiDigits } from "../src/pi-generator";

function toDigitArray(s: string): Uint8Array {
  const arr = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i) - 48;
  return arr;
}

// computePiDigits returns raw digit VALUES (0-9 per byte), not ASCII  -  see
// pi-generator.ts's module doc. Only needed here for the naive
// String.prototype.indexOf/includes cross-checks below; buildSuffixArray
// and search() already take the raw Uint8Array directly.
function toDigitString(arr: Uint8Array): string {
  let s = "";
  for (let i = 0; i < arr.length; i++) s += String(arr[i]);
  return s;
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

  it("matches naive indexOf on real generated π digits (cross-check)", async () => {
    const digits = await computePiDigits(20000);
    const piStr = toDigitString(digits);
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

  it("reports occurrence count matching a naive count for a short, common sequence", async () => {
    const digits = await computePiDigits(50000);
    const piStr = toDigitString(digits);
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

  // buildSuffixArray's sort was rewritten from a single comparator-based
  // sort to two stable counting-sort passes (comparator-based sort hits
  // real, hard V8 ceilings at dataset scale  -  see the module doc in
  // src/suffix-array.ts). This directly verifies the actual invariant a
  // suffix array must hold  -  every suffix strictly precedes the next in
  // lexicographic order  -  rather than only spot-checking a few queries,
  // to catch any subtle stability/ordering regression the rewrite could
  // have introduced.
  it("produces a fully, correctly sorted suffix array (direct adjacent-suffix comparison, not just spot-check queries)", async () => {
    const digits = await computePiDigits(30000);
    const sa = buildSuffixArray(digits);
    expect(sa.length).toBe(digits.length);

    // sa must be a permutation of [0, n)  -  every position appears exactly once.
    const seen = new Uint8Array(digits.length);
    for (const pos of sa) {
      expect(seen[pos]).toBe(0);
      seen[pos] = 1;
    }

    const compareSuffixes = (a: number, b: number): number => {
      for (let i = 0; a + i < digits.length && b + i < digits.length; i++) {
        const da = digits[a + i]!;
        const db = digits[b + i]!;
        if (da !== db) return da - db;
      }
      // One is a prefix of the other (or both exhausted, impossible here
      // since sa positions are distinct): the shorter suffix  -  the one
      // starting further right  -  sorts first, same as a real string
      // sorting before any string it's a proper prefix of.
      return digits.length - a - (digits.length - b);
    };
    for (let i = 1; i < sa.length; i++) {
      expect(compareSuffixes(sa[i - 1]!, sa[i]!)).toBeLessThanOrEqual(0);
    }
  });

  it("returns not found for a sequence that cannot appear (11 digits of the same non-repeating pattern is unlikely but we use an intentionally absent one)", async () => {
    const digits = await computePiDigits(2000);
    const piStr = toDigitString(digits);
    const sa = buildSuffixArray(digits);
    // Construct a sequence guaranteed absent from this specific prefix by taking
    // a substring that doesn't occur (verified via indexOf) rather than assuming.
    const candidate = "01234567890123";
    if (piStr.includes(candidate)) return; // pragmatic guard; astronomically unlikely
    const r = search(digits, sa, candidate);
    expect(r.found).toBe(false);
  });
});
