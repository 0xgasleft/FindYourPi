import { sha256 } from "viem";
import { MAX_MATCH_LEN } from "./constants";

export type ConversionMode = "number" | "ascii" | "utf8" | "hash" | "base36" | "base95";

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
 * Mode A2 — Base-36 decimal encoding. Reads the input as a base-36 integer
 * (the standard digit alphabet "0-9" then "a-z" for values 0-35 — the same
 * convention JavaScript's own `Number.prototype.toString(36)` /
 * `parseInt(s, 36)` use, not something invented for this project) and
 * converts it to a base-10 string — the same "treat bytes/digits as one big
 * integer, then .toString(10)" technique convertHashDecimal below already
 * uses for hash mode, just applied directly to the input instead of its
 * hash. This exists to make ordinary short words/names findable at a real
 * (not astronomical) dataset size: ASCII mode's 3-digits-per-character
 * encoding means even a 3-character word needs a 9-digit match (under a 10%
 * chance of appearing anywhere in an 80-million-digit dataset — expected
 * count = digitsIndexed / 10^9). Base-36 is denser still: length scales as
 * ~1.556 decimal digits per input character (log10(36)), so "abc" needs only
 * a 5-digit match (expected count = digitsIndexed / 10^5 = 800 at that same
 * dataset size).
 *
 * A naive base-36-to-BigInt conversion has a real collision bug: leading
 * zero-value characters vanish from the integer's magnitude, so "0z" and
 * "z" both equal the same integer (35) — meaning two different inputs would
 * produce the identical search target and discoveryId. Fixed here with a
 * standard technique for exactly this problem: add a length-dependent
 * sentinel (36^n, where n = input length) before converting to decimal, so
 * the encoding is injective across every length and every input (36^n's
 * ranges for different n never overlap, since 2*36^n < 36^(n+1)).
 *
 * Tradeoff: case-insensitive, a-z and 0-9 only — no spaces, punctuation, or
 * Unicode (throws on those; use base95 mode below for space/punctuation
 * coverage at slightly lower density, or ascii/utf8/hash mode for exact-
 * fidelity/arbitrary-Unicode needs).
 */
export function convertBase36Decimal(input: string): ConversionResult {
  const codes: number[] = [];
  for (const ch of input.toLowerCase()) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 48 && cp <= 57) codes.push(cp - 48); // '0'-'9' -> 0-9
    else if (cp >= 97 && cp <= 122) codes.push(cp - 97 + 10); // 'a'-'z' -> 10-35
    else {
      throw new RangeError(
        `Base-36 mode only supports a-z and 0-9 (case-insensitive) — "${ch}" isn't in that set. Use base95, ASCII, UTF-8, or hash mode instead.`
      );
    }
  }
  return finalize("base36", encodeBaseNWithSentinel(codes, 36));
}

/**
 * Mode A3 — Base-95 decimal encoding. Same technique as base36 above (read
 * as a positional integer in the given base, plus a length sentinel to stay
 * injective), but over the full 95-character printable-ASCII range (space
 * through "~", code points 32-126 — the digit value is simply `codePoint -
 * 32`, i.e. printable ASCII's own built-in ordering, not an invented table).
 * This is the direct answer to "why no support for spaces/punctuation":
 * base36 deliberately trades away that coverage for maximum density on the
 * common case (plain words/names); base95 restores full ASCII coverage —
 * everything ascii mode supports except the non-printable control
 * characters 0-31 and DEL (127), which nobody types into a search box
 * anyway — while still beating ASCII mode's density (~1.988 decimal
 * digits/char here, log10(95), vs ASCII's fixed 3). Case-sensitive, unlike
 * base36, since preserving punctuation/spacing usually means the caller
 * wants closer-to-exact fidelity. Throws outside that range — use utf8/hash
 * mode for actual Unicode.
 */
export function convertBase95Decimal(input: string): ConversionResult {
  const codes: number[] = [];
  for (const ch of input) {
    const cp = ch.codePointAt(0)!;
    if (cp < 32 || cp > 126) {
      throw new RangeError(
        `Base-95 mode only supports printable ASCII (space through "~", code points 32-126) — "${ch}" isn't in that set. Use UTF-8 or hash mode instead.`
      );
    }
    codes.push(cp - 32);
  }
  return finalize("base95", encodeBaseNWithSentinel(codes, 95));
}

/**
 * Shared by convertBase36Decimal and convertBase95Decimal: reads `codes` (each
 * already validated as a digit value 0..base-1) as a positional integer in
 * the given base, and adds a length-dependent sentinel (base^n, n = digit
 * count) before converting to base-10. Without the sentinel, leading
 * zero-value digits vanish from the integer's magnitude — e.g. in base 36,
 * "0z" and "z" would both equal 35, a real collision (two different inputs
 * producing the identical search target/discoveryId). The sentinel fixes
 * this: base^n's ranges for different n never overlap (2*base^n < base^(n+1)
 * whenever base > 2), so the encoding is injective across every length and
 * every input.
 *
 * BigInt() calls, not `36n`/`95n` literal syntax — apps/web's tsconfig
 * targets ES2017 (a Next.js default), which can't parse BigInt literals even
 * though the runtime (Node 20+ / any modern browser) supports BigInt itself
 * fine; pi-core ships raw .ts (no build step), so every consumer's own tsc
 * target applies directly to this file.
 */
function encodeBaseNWithSentinel(codes: number[], base: number): string {
  const baseB = BigInt(base);
  let value = BigInt(0);
  for (const digit of codes) value = value * baseB + BigInt(digit);
  const withSentinel = baseB ** BigInt(codes.length) + value;
  return withSentinel.toString(10);
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
    case "base36":
      return convertBase36Decimal(input);
    case "base95":
      return convertBase95Decimal(input);
    case "ascii":
      return convertAsciiDecimal(input);
    case "utf8":
      return convertUtf8Bytes(input);
    case "hash":
      return convertHashDecimal(input, options?.hashKeepDigits);
  }
}
