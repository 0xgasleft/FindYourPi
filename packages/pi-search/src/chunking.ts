import { CHUNK_SIZE_DIGITS } from "@pi-hunter/pi-core";

/**
 * Packs decimal digit values (0-9, one per array element) into 4-bit
 * nibbles, two digits per byte, high nibble first  -  matching
 * docs/proof-system.md §3.3 exactly. If the digit count isn't a multiple
 * of 2, the final nibble is padded with 0xF (an impossible digit value,
 * 10-15, so it's unambiguous which nibbles are real data).
 */
export function packDigitsToNibbles(digits: Uint8Array): Uint8Array {
  const byteLen = Math.ceil(digits.length / 2);
  const out = new Uint8Array(byteLen);
  for (let i = 0; i < byteLen; i++) {
    const hi = digits[i * 2] ?? 0xf;
    const lo = digits[i * 2 + 1] ?? 0xf;
    out[i] = (hi << 4) | lo;
  }
  return out;
}

export function unpackNibblesToDigits(packed: Uint8Array, digitCount: number): Uint8Array {
  const out = new Uint8Array(digitCount);
  for (let i = 0; i < digitCount; i++) {
    const byte = packed[i >> 1]!;
    out[i] = i % 2 === 0 ? byte >> 4 : byte & 0x0f;
  }
  return out;
}

export interface Chunk {
  index: number;
  /** Packed (4-bit/digit) chunk bytes  -  this is exactly the on-chain `chunkData`. */
  packed: Uint8Array;
}

/**
 * Splits a full raw digit array (values 0-9) into fixed-size chunks
 * (CHUNK_SIZE_DIGITS digits each) and packs each one. The last chunk is
 * padded with 0xF nibbles if the dataset length isn't an exact multiple of
 * the chunk size  -  padding is never treated as a valid match position
 * (see docs/proof-system.md  -  searches only consider positions where a
 * full match fits within `digitCount`).
 */
export function chunkDigits(digits: Uint8Array, chunkSizeDigits = CHUNK_SIZE_DIGITS): Chunk[] {
  const chunks: Chunk[] = [];
  for (let start = 0, index = 0; start < digits.length; start += chunkSizeDigits, index++) {
    const slice = digits.subarray(start, start + chunkSizeDigits);
    // Every chunk is packed at the full, fixed chunkSizeDigits length (even the
    // last, short one) so every leaf hashes an identically-sized input  -  pad
    // with the same 0xF sentinel used within a chunk for odd digit counts.
    const padded = slice.length === chunkSizeDigits ? slice : padDigits(slice, chunkSizeDigits);
    chunks.push({ index, packed: packDigitsToNibbles(padded) });
  }
  return chunks;
}

function padDigits(slice: Uint8Array, targetLength: number): Uint8Array {
  const out = new Uint8Array(targetLength).fill(0xf);
  out.set(slice);
  return out;
}
