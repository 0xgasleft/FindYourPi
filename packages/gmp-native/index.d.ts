/**
 * A native, GC-managed arbitrary-precision integer. Constructed from a hex
 * string (optional leading "-"; omit entirely for zero); every operation
 * returns a new Mpz, never a string  -  see src/addon.cc for why (V8's own
 * JS string length ceiling, ~536M characters, a real limit hit at scale
 * while building this).
 */
export class Mpz {
  constructor(hex?: string);
  mul(other: Mpz): Mpz;
  add(other: Mpz): Mpz;
  abs(): Mpz;
  /** Integer square root, truncated toward zero. Throws on a negative value. */
  sqrt(): Mpz;
  /** Truncating division (toward zero)  -  matches native BigInt's `/`. Throws on division by zero. */
  divTrunc(other: Mpz): Mpz;
  /**
   * Writes `count` raw decimal digit VALUES (one byte each, 0-9  -  not
   * ASCII) into `buffer` starting at buffer offset 0, reading this
   * value's decimal expansion starting `skip` digits in. Returns the
   * value's leading decimal digit as a 1-character string (for a "must
   * start with 3" sanity check)  -  the only string this produces,
   * deliberately tiny regardless of the value's actual size. Throws if
   * there aren't at least `skip + count` decimal digits.
   */
  writeDigits(buffer: Buffer | Uint8Array, skip: number, count: number): string;
  /** Approximate bit count. Diagnostic/debugging aid  -  cheap and safe at any scale (never materializes a string of the whole value). */
  bitLength(): number;
  /** 10^exp, exp given as a plain number (safe up to 2^53  -  comfortably past any realistic digit-count target). */
  static powTen(exp: number): Mpz;
}
