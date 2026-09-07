/**
 * Runs the real, full computePiDigits pipeline at one or more digit counts
 * and reports success/time/peak memory. Originally built to validate the
 * pre-GMP native-BigInt ceiling estimate (~92.86M digits  -  see
 * docs/architecture.md §5.1); now repurposed as the general benchmarking
 * tool for the GMP-backed pipeline at much larger scale (hundreds of
 * millions to billions of digits). Slow by design  -  this runs the actual
 * computation, not an estimate. Use sparingly, on a handful of candidates.
 */
import { computePiDigits } from "../src/pi-generator";

function formatBytes(n: number): string {
  return `${(n / 1e9).toFixed(2)} GB`;
}

async function main() {
  const targets = process.argv.slice(2).map(Number);

  for (const numDigits of targets) {
    try {
      const t0 = performance.now();
      const result = await computePiDigits(numDigits);
      const ms = performance.now() - t0;
      console.log(
        `digits=${numDigits.toLocaleString()} -> OK, ${(ms / 1000).toFixed(1)}s, len=${result.length}, prefix=${Array.from(result.slice(0, 20)).join("")}, peak rss=${formatBytes(process.memoryUsage().rss)}`
      );
    } catch (err) {
      console.log(`digits=${numDigits.toLocaleString()} -> FAILED: ${(err as Error).message}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
