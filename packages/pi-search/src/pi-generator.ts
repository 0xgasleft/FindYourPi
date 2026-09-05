import { isqrt } from "./isqrt";

/**
 * Reproducible π digit generation via the Chudnovsky algorithm with binary
 * splitting (pure BigInt arithmetic, no external pi library or downloaded
 * digit file). This is the generation method referenced throughout
 * docs/architecture.md §5 and docs/threat-model.md T3: anyone can run this
 * exact, deterministic algorithm and get the exact same digits, so the
 * dataset's provenance doesn't depend on trusting this project's
 * infrastructure.
 *
 * Reference constants (A, B, C, and the closing 426880*sqrt(10005) form)
 * are the standard, widely published Chudnovsky binary-splitting
 * coefficients. Correctness is verified in test/pi-generator.test.ts against
 * a well-known, independently-checkable prefix of π's decimal expansion —
 * don't trust the constants, check the test.
 */

const A = 13591409n;
const B = 545140134n;
const C = 640320n;
const C3_OVER_24 = C ** 3n / 24n;
const DIGITS_PER_TERM = 14.1816474627254776555;

interface PQT {
  P: bigint;
  Q: bigint;
  T: bigint;
}

function binarySplit(a: bigint, b: bigint): PQT {
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
    let T = P * (A + B * a);
    if (a % 2n === 1n) T = -T;
    return { P, Q, T };
  }
  const m = (a + b) / 2n;
  const left = binarySplit(a, m);
  const right = binarySplit(m, b);
  return {
    P: left.P * right.P,
    Q: left.Q * right.Q,
    T: right.Q * left.T + left.P * right.T,
  };
}

/**
 * Computes the first `numDigits` decimal digits of π after the decimal
 * point (i.e. NOT counting the leading "3" — matches the project-wide
 * position convention in packages/pi-core).
 */
export function computePiDigits(numDigits: number): string {
  if (numDigits < 1) throw new RangeError("numDigits must be >= 1");

  const guardDigits = 10; // extra precision to absorb truncation error, dropped from the tail
  const totalDigits = numDigits + guardDigits;
  const nTerms = BigInt(Math.floor(totalDigits / DIGITS_PER_TERM) + 1);

  const { Q, T } = binarySplit(0n, nTerms);
  const one = 10n ** BigInt(totalDigits);
  const sqrtC = isqrt(10005n * one * one);
  const absT = T < 0n ? -T : T;

  const piScaled = (Q * 426880n * sqrtC) / absT; // floor(pi * 10^totalDigits)
  const fullStr = piScaled.toString();

  if (fullStr[0] !== "3") {
    throw new Error(`pi generation sanity check failed: expected leading digit "3", got "${fullStr[0]}"`);
  }

  const afterDecimal = fullStr.slice(1);
  if (afterDecimal.length < numDigits) {
    throw new Error("pi generation produced fewer digits than requested — increase guardDigits");
  }
  return afterDecimal.slice(0, numDigits);
}
