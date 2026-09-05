import { describe, expect, it } from "vitest";
import { packDigitsToNibbles, unpackNibblesToDigits, chunkDigits } from "../src/chunking";

describe("packDigitsToNibbles / unpackNibblesToDigits", () => {
  it("round-trips an even-length digit array", () => {
    const digits = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 0]);
    const packed = packDigitsToNibbles(digits);
    expect(packed.length).toBe(5);
    const unpacked = unpackNibblesToDigits(packed, digits.length);
    expect(Array.from(unpacked)).toEqual(Array.from(digits));
  });

  it("pads an odd-length digit array with 0xF in the unused nibble", () => {
    const digits = Uint8Array.from([1, 2, 3]);
    const packed = packDigitsToNibbles(digits);
    expect(packed.length).toBe(2);
    expect(packed[1]! >> 4).toBe(3);
    expect(packed[1]! & 0x0f).toBe(0xf);
  });

  it("packs the worked example correctly (high nibble first)", () => {
    const digits = Uint8Array.from([9, 3]);
    const packed = packDigitsToNibbles(digits);
    expect(packed[0]).toBe(0x93);
  });
});

describe("chunkDigits", () => {
  it("splits into the configured chunk size, last chunk padded", () => {
    const digits = new Uint8Array(300).map((_, i) => i % 10);
    const chunks = chunkDigits(digits, 128);
    expect(chunks.length).toBe(3); // 128 + 128 + 44
    expect(chunks[0]!.index).toBe(0);
    expect(chunks[2]!.packed.length).toBe(64); // still a full 128-digit/64-byte chunk, padded
  });

  it("round-trips through unpack for every chunk except padding", () => {
    const digitCount = 300;
    const digits = new Uint8Array(digitCount).map((_, i) => i % 10);
    const chunks = chunkDigits(digits, 128);
    const reconstructed = new Uint8Array(digitCount);
    let offset = 0;
    for (const chunk of chunks) {
      const take = Math.min(128, digitCount - offset);
      const unpacked = unpackNibblesToDigits(chunk.packed, 128).subarray(0, take);
      reconstructed.set(unpacked, offset);
      offset += take;
    }
    expect(Array.from(reconstructed)).toEqual(Array.from(digits));
  });
});
