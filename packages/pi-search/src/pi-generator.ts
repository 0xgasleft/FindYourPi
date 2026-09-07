import { Mpz } from "@pi-hunter/gmp-native";

/**
 * Reproducible π digit generation via the Chudnovsky algorithm with binary
 * splitting. This is the generation method referenced throughout
 * docs/architecture.md §5 and docs/threat-model.md T3: anyone can run this
 * exact, deterministic algorithm and get the exact same digits, so the
 * dataset's provenance doesn't depend on trusting this project's
 * infrastructure.
 *
 * Reference constants (A, B, C, and the closing 426880*sqrt(10005) form)
 * are the standard, widely published Chudnovsky binary-splitting
 * coefficients. Correctness is verified in test/pi-generator.test.ts against
 * a well-known, independently-checkable prefix of π's decimal expansion  -
 * don't trust the constants, check the test.
 *
 * ARITHMETIC BACKEND  -  hybrid native BigInt / GMP, not pure BigInt:
 * V8's native BigInt has a hard ceiling of 2^30-1 bits (~323M decimal
 * digits for a single value)  -  hit well before that in practice, because
 * Chudnovsky binary splitting's internal P/Q/T values grow superlinearly
 * with term count (measured and derived in docs/architecture.md §5.1: the
 * real ceiling for pure-BigInt generation was ~92.86M digits, confirmed
 * empirically). combinePQT below tries native BigInt arithmetic first
 * (simple and fast for the vast majority of the recursion, where operands
 * are still small) and transparently falls back to GMP only for the
 * handful of top-of-recursion-tree operations whose result would actually
 * exceed BigInt's ceiling.
 *
 * GMP here means real, native GMP (via packages/gmp-native, a small N-API
 * addon)  -  NOT gmp-wasm. gmp-wasm was tried first and genuinely fixed the
 * BigInt ceiling, but introduced two further, real ceilings of its own,
 * both measured directly rather than assumed (see docs/architecture.md
 * §5.1 for the full investigation):
 *   1. Standard WebAssembly linear memory is capped at 4GB by spec  -
 *      120M digits succeeded at 3.93GB peak, 125M+ failed consistently.
 *   2. Even after that, V8's own JS strings have a hard length ceiling
 *      (~2^29 characters, ~536M)  -  a ~200M-digit computation's largest
 *      intermediate value needed a ~590M-character hex string to
 *      round-trip through JS, past that limit.
 * Real, natively-linked GMP has neither ceiling (bound only by actual
 * system memory, real 64-bit address space), *and* never passes huge
 * values through JS strings at all: packages/gmp-native's `Mpz` is a real
 * JS class backed by a native mpz_t, GC-managed (no manual free  -  tied to
 * normal JS garbage collection exactly like a plain BigInt value), and the
 * only way to extract digits from one is `writeDigits`, which writes raw
 * digit bytes straight into a pre-allocated Buffer/Uint8Array  -  never a
 * JS string of the whole value. That's also why computePiDigits below
 * returns a Uint8Array, not a string: for a 1B+ digit dataset, even the
 * *final output* would itself exceed V8's string-length ceiling.
 *
 * (mpzjs  -  the obvious existing native-GMP npm package  -  doesn't support
 * Windows, hence a purpose-built addon here; see packages/gmp-native's own
 * doc comment.)
 *
 * `binarySplit` and `combinePQT` are exported so packages/pi-search's
 * parallel generator (parallel-pi-generator.ts) can distribute the
 * recursion's independent subranges across worker threads and fold the
 * partial results back together with the exact same arithmetic.
 */

export const CHUDNOVSKY_A = 13591409n;
export const CHUDNOVSKY_B = 545140134n;
export const CHUDNOVSKY_C = 640320n;
const C3_OVER_24 = CHUDNOVSKY_C ** 3n / 24n;
export const DIGITS_PER_TERM = 14.1816474627254776555;
export const GUARD_DIGITS = 10;

/**
 * A value too big for native BigInt is tagged as a live, GC-managed native
 * Mpz  -  see the module doc above for why a real object rather than a hex
 * string. Once a value has "graduated" to GmpBig it stays that way for the
 * rest of the recursion (going up the tree, values only grow, never shrink
 * back under the native ceiling).
 */
export interface GmpBig {
  readonly mpz: Mpz;
}

export type BigNum = bigint | GmpBig;

function isGmpBig(x: BigNum): x is GmpBig {
  return typeof x === "object";
}

function toMpz(x: BigNum): Mpz {
  return isGmpBig(x) ? x.mpz : new Mpz(x.toString(16));
}

/** Native BigInt when both operands are still small enough; transparently falls back to native GMP otherwise. */
export function bnMul(a: BigNum, b: BigNum): BigNum {
  if (!isGmpBig(a) && !isGmpBig(b)) {
    try {
      return a * b;
    } catch (err) {
      if (!(err instanceof RangeError)) throw err;
    }
  }
  return { mpz: toMpz(a).mul(toMpz(b)) };
}

/** Native BigInt when both operands are still small enough; transparently falls back to native GMP otherwise. */
export function bnAdd(a: BigNum, b: BigNum): BigNum {
  if (!isGmpBig(a) && !isGmpBig(b)) {
    try {
      return a + b;
    } catch (err) {
      if (!(err instanceof RangeError)) throw err;
    }
  }
  return { mpz: toMpz(a).add(toMpz(b)) };
}

export interface PQT {
  P: BigNum;
  Q: BigNum;
  T: BigNum;
}

export function combinePQT(left: PQT, right: PQT): PQT {
  return {
    P: bnMul(left.P, right.P),
    Q: bnMul(left.Q, right.Q),
    T: bnAdd(bnMul(right.Q, left.T), bnMul(left.P, right.T)),
  };
}

/**
 * Computes (P,Q,T) for the half-open term range [a, b). Pure function of
 * (a,b)  -  safe to run in any thread/process. Leaf-level values (bounded by
 * a single term index, never more than a couple hundred bits even at
 * 10B-digit scale) are always plain BigInt; combinePQT's BigInt-with-GMP-
 * fallback handles everything above that transparently.
 */
export function binarySplit(a: bigint, b: bigint): PQT {
  if (b - a === 1n) {
    let P: bigint;
    let Q: bigint;
    if (a === 0n) {
      P = 1n;
      Q = 1n;
    } else {
      P = (6n * a - 5n) * (2n * a - 1n) * (6n * a - 1n);
      Q = a * a * a * C3_OVER_24;
    }
    let T: bigint = P * (CHUDNOVSKY_A + CHUDNOVSKY_B * a);
    if (a % 2n === 1n) T = -T;
    return { P, Q, T };
  }
  const m = (a + b) / 2n;
  return combinePQT(binarySplit(a, m), binarySplit(m, b));
}

export function termCountForDigits(numDigits: number): bigint {
  const totalDigits = numDigits + GUARD_DIGITS;
  return BigInt(Math.floor(totalDigits / DIGITS_PER_TERM) + 1);
}

/**
 * Final sqrt/division step shared by the single-threaded and parallel
 * generators. Always uses GMP unconditionally, even for small numDigits:
 * this runs exactly once per computePiDigits() call (not per recursion
 * node), so there's no meaningful overhead either way, and GMP's native
 * sqrt is the standard, battle-tested implementation  -  replacing this
 * project's own hand-rolled Newton's-method isqrt.ts, which profiling
 * had identified as ~70%+ of total runtime at 50M digits. isqrt.ts is kept
 * as a standalone, still-correct, still independently tested utility but
 * is no longer on this path.
 *
 * Mpz.powTen uses manual binary exponentiation internally rather than
 * GMP's mpz_ui_pow_ui, specifically so a 10B-digit exponent (~10 billion)
 * doesn't silently wrap a 32-bit `unsigned long` on Windows  -  see
 * packages/gmp-native/src/addon.cc.
 *
 * Returns a Uint8Array (one raw digit value 0-9 per byte, NOT ASCII)  -
 * see the module doc for why not a string: for numDigits past V8's
 * ~536M-character string-length ceiling, the finished digit sequence
 * itself couldn't be represented as a single JS string either.
 */
export function digitsFromPQT(q: BigNum, t: BigNum, numDigits: number): Uint8Array {
  const totalDigits = numDigits + GUARD_DIGITS;

  const one = Mpz.powTen(totalDigits);
  const oneSquared = one.mul(one);
  const c = new Mpz((10005).toString(16)).mul(oneSquared);
  const sqrtC = c.sqrt();
  const absT = toMpz(t).abs();

  const numer = toMpz(q).mul(new Mpz((426880).toString(16)));
  const numer2 = numer.mul(sqrtC);
  const piScaled = numer2.divTrunc(absT);

  const digits = new Uint8Array(numDigits);
  // skip=1 drops the leading "3"  -  matches the project-wide position
  // convention (position 0 = first digit after the decimal point).
  const leading = piScaled.writeDigits(digits, 1, numDigits);

  if (leading !== "3") {
    throw new Error(`pi generation sanity check failed: expected leading digit "3", got "${leading}"`);
  }
  return digits;
}

/**
 * Computes the first `numDigits` decimal digits of π after the decimal
 * point (i.e. NOT counting the leading "3"  -  matches the project-wide
 * position convention in packages/pi-core), as raw digit VALUES (0-9 per
 * byte, not ASCII  -  see digitsFromPQT's doc for why not a string). Scales
 * past native BigInt's ~93M-digit ceiling (and past gmp-wasm's own
 * ~125M-digit WASM-memory and ~200M-digit JS-string ceilings) via real
 * native GMP  -  see this module's doc comment and docs/architecture.md
 * §5.1 for the measured investigation behind all three and why this
 * landed on a native addon instead.
 *
 * Async signature kept for compatibility with existing callers (all of
 * which already `await` this) even though native GMP loads synchronously
 * and nothing here actually suspends  -  `await` on a non-Promise value is
 * a no-op, so this costs nothing and avoids further churn.
 */
export async function computePiDigits(numDigits: number): Promise<Uint8Array> {
  if (numDigits < 1) throw new RangeError("numDigits must be >= 1");
  const nTerms = termCountForDigits(numDigits);
  const { Q, T } = binarySplit(0n, nTerms);
  return digitsFromPQT(Q, T, numDigits);
}
