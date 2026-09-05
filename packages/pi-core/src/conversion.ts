import { sha256 } from "viem";
import { MAX_MATCH_LEN } from "./constants";

export type ConversionMode = "number" | "ascii" | "utf8" | "hash";

export interface ConversionResult {
  mode: ConversionMode;
  /** The full deterministic digit sequence produced by this mode, before any truncation. */
  fullSequence: string;
  /** The sequence actually used for search/claim — truncated to MAX_MATCH_LEN if needed. */
  sequence: string;
  truncated: boolean;
}

function finalize(mode: ConversionMode, fullSequence: string): ConversionResult {
  const truncated = fullSequence.length > MAX_MATCH_LEN;
  return {
    mode,
    fullSequence,
    sequence: truncated ? fullSequence.slice(0, MAX_MATCH_LEN) : fullSequence,
    truncated,
  };
}

/**
 * Mode A — Numbers. Strip every character that isn't a decimal digit and
 * concatenate what remains, in order. "12/03/1995" -> "12031995".
 */
export function convertNumber(input: string): ConversionResult {
  const digitsOnly = input.replace(/[^0-9]/g, "");
  return finalize("number", digitsOnly);
}

/**
 * Mode B1 — ASCII decimal encoding. Defined only for printable ASCII
 * (code points 0-127). Each code point is zero-padded to exactly 3 digits
 * and concatenated in order, e.g. "AB" -> "065" + "066" -> "065066".
 * Throws if the input contains a character outside printable ASCII —
 * callers should offer UTF-8 or hash mode instead in that case.
 */
export function convertAsciiDecimal(input: string): ConversionResult {
  const codePoints = Array.from(input).map((ch) => ch.codePointAt(0)!);
  if (codePoints.some((cp) => cp > 127)) {
    throw new RangeError("ASCII decimal mode requires printable ASCII input (code points 0-127); use UTF-8 or hash mode instead.");
  }
  const fullSequence = codePoints.map((cp) => cp.toString().padStart(3, "0")).join("");
  return finalize("ascii", fullSequence);
}

/**
 * Mode B2 — UTF-8 byte encoding. Encode the input as UTF-8 bytes; each byte
 * (0-255) is zero-padded to exactly 3 digits and concatenated in order.
 * Supports arbitrary Unicode input, unlike ASCII mode.
 */
export function convertUtf8Bytes(input: string): ConversionResult {
  const bytes = new TextEncoder().encode(input);
  let fullSequence = "";
  for (const byte of bytes) fullSequence += byte.toString().padStart(3, "0");
  return finalize("utf8", fullSequence);
}

/**
 * Mode B3 — SHA-256 -> decimal. Hash the UTF-8 bytes of the input with
 * SHA-256, interpret the 256-bit digest as a big-endian unsigned integer,
 * and take its base-10 representation. Only the leading `keepDigits` digits
 * (default HASH_MODE_DIGITS) are kept, matching viral discovery's chance of
 * an actual find — the untruncated full hash-decimal is still returned in
 * `fullSequence` for transparency.
 */
export function convertHashDecimal(input: string, keepDigits = 10): ConversionResult {
  const digestHex = sha256(new TextEncoder().encode(input));
  const asBigInt = BigInt(digestHex);
  const fullSequence = asBigInt.toString(10);
  const result = finalize("hash", fullSequence);
  // Two truncation points can apply here: MAX_MATCH_LEN (protocol-wide, for
  // on-chain claimability) and keepDigits (product choice, for findability).
  // The shorter of the two wins; fullSequence always keeps the untruncated hash decimal.
  const effectiveLength = Math.min(keepDigits, MAX_MATCH_LEN, fullSequence.length);
  return {
    mode: "hash",
    fullSequence,
    sequence: fullSequence.slice(0, effectiveLength),
    truncated: effectiveLength < fullSequence.length,
  };
}

export function convert(input: string, mode: ConversionMode, options?: { hashKeepDigits?: number }): ConversionResult {
  switch (mode) {
    case "number":
      return convertNumber(input);
    case "ascii":
      return convertAsciiDecimal(input);
    case "utf8":
      return convertUtf8Bytes(input);
    case "hash":
      return convertHashDecimal(input, options?.hashKeepDigits);
  }
}
