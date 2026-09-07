/**
 * HISTORICAL  -  this originally probed V8's hard native-BigInt ceiling
 * (2^30-1 bits) by calling binarySplit(0n, nTerms) directly (skipping the
 * slow isqrt) and catching the RangeError it used to throw above
 * ~92.86M digits (see docs/architecture.md §5.1 for that measured
 * investigation and the resulting 80,000,000-digit dataset size). Since
 * the GMP rewrite, combinePQT transparently falls back to GMP once a value
 * would exceed that ceiling, so binarySplit no longer throws at these
 * sizes at all  -  this script now just reports how big Q/T actually get,
 * confirming generation succeeds well past the old failure point. Kept for
 * reproducibility of the original investigation, not as an active ceiling
 * check. (Also predates the later gmp-wasm -> native-GMP swap  -  see
 * docs/architecture.md §5.1 for that second and third ceiling and their
 * fix.) Bit-length reporting was dropped when GmpBig switched from a hex
 * string to a live native Mpz object (see pi-generator.ts's module doc)  -
 * Mpz deliberately has no hex/string export for intermediate values, to
 * avoid reintroducing the V8 string-length ceiling that fix was for. This
 * now just reports whether a value stayed native BigInt or graduated to
 * GMP, and how long binarySplit took.
 */
import { binarySplit, termCountForDigits, type BigNum } from "../src/pi-generator";

function describe(n: BigNum): string {
  return typeof n === "bigint" ? "native BigInt" : "native GMP (Mpz)";
}

async function main() {
  const candidates = process.argv.slice(2).map(Number);
  const targets = candidates.length ? candidates : [100_000_000, 150_000_000, 200_000_000, 300_000_000];

  for (const numDigits of targets) {
    const nTerms = termCountForDigits(numDigits);
    try {
      const t0 = performance.now();
      const { Q, T } = binarySplit(0n, nTerms);
      const ms = performance.now() - t0;
      console.log(`digits=${numDigits.toLocaleString()} nTerms=${nTerms.toLocaleString()} -> OK, ${ms.toFixed(0)}ms, Q=${describe(Q)}, T=${describe(T)}`);
    } catch (err) {
      console.log(`digits=${numDigits.toLocaleString()} nTerms=${nTerms.toLocaleString()} -> FAILED: ${(err as Error).message}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
