import { computePiDigits } from "../src/pi-generator";
import { buildSuffixArray, search } from "../src/suffix-array";

async function main() {
  const sizes = process.argv.slice(2).map(Number);
  const targets = sizes.length ? sizes : [100_000, 1_000_000];

  for (const n of targets) {
    const genStart = performance.now();
    const digits = await computePiDigits(n);
    const genMs = performance.now() - genStart;

    const idxStart = performance.now();
    const sa = buildSuffixArray(digits);
    const idxMs = performance.now() - idxStart;

    const qStart = performance.now();
    const r = search(digits, sa, "31415");
    const qMs = performance.now() - qStart;

    console.log(
      `n=${n.toLocaleString()} gen=${genMs.toFixed(0)}ms index=${idxMs.toFixed(0)}ms query=${qMs.toFixed(2)}ms (found=${r.found}, count=${r.occurrenceCount})`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
