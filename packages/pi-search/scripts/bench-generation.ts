import { computePiDigits } from "../src/pi-generator";

async function main() {
  const sizes = process.argv.slice(2).map(Number);
  const targets = sizes.length ? sizes : [10_000, 100_000, 1_000_000];

  for (const n of targets) {
    const start = performance.now();
    const digits = await computePiDigits(n);
    const ms = performance.now() - start;
    console.log(`n=${n.toLocaleString()} digits -> ${ms.toFixed(0)}ms (len=${digits.length})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
