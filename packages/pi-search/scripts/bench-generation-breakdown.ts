/**
 * Breaks down where computePiDigits actually spends its time, post-native-
 * GMP-rewrite (docs/architecture.md §5.1). Superseded numbers this script
 * used to report (pre-GMP): at 50M digits, binarySplit was only ~55s of
 * ~225s total, the other ~70%+ was the hand-rolled isqrt.ts. That code path
 * no longer exists  -  digitsFromPQT now does its sqrt/division/decimal-
 * conversion via real native GMP (packages/gmp-native) in one bundled step,
 * so this script can only time two phases: binarySplit (native BigInt with
 * a GMP fallback for huge operands) and digitsFromPQT (fully GMP:
 * 10^totalDigits, sqrt, the final numerator multiply/divide, and decimal
 * conversion). Re-run this before trusting any claim about where time goes
 * now  -  don't assume the old ratio still holds.
 */
import { binarySplit, digitsFromPQT, termCountForDigits } from "../src/pi-generator";

async function main() {
  const numDigits = Number(process.argv[2] ?? 50_000_000);
  console.log(`numDigits=${numDigits.toLocaleString()}`);

  console.time("binarySplit(0, nTerms)");
  const nTerms = termCountForDigits(numDigits);
  const { Q, T } = binarySplit(0n, nTerms);
  console.timeEnd("binarySplit(0, nTerms)");

  console.time("digitsFromPQT (10^totalDigits, GMP sqrt, final mul/div, toString)");
  const result = digitsFromPQT(Q, T, numDigits);
  console.timeEnd("digitsFromPQT (10^totalDigits, GMP sqrt, final mul/div, toString)");

  console.log(`result length: ${result.length}, leading digits: ${Array.from(result.slice(0, 20)).join("")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
