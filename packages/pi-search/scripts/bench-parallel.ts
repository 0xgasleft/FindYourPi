import { cpus } from "node:os";
import { computePiDigits } from "../src/pi-generator";
import { computePiDigitsParallel } from "../src/parallel-pi-generator";

const n = Number(process.argv[2] ?? 50_000_000);
console.log(`CPUs: ${cpus().length}, target: ${n.toLocaleString()} digits\n`);

async function main() {
  const t0 = performance.now();
  const single = await computePiDigits(n);
  const singleMs = performance.now() - t0;
  console.log(`single-threaded: ${singleMs.toFixed(0)}ms`);

  const t1 = performance.now();
  const parallel = await computePiDigitsParallel(n);
  const parallelMs = performance.now() - t1;
  console.log(`parallel:        ${parallelMs.toFixed(0)}ms (${(singleMs / parallelMs).toFixed(2)}x speedup)`);

  // Reference equality (===) always fails for two distinct Uint8Array
  // instances regardless of content  -  need a real byte comparison here
  // (computePiDigits used to return a string, where === was a correct
  // value comparison; that stopped being true once it returned raw bytes).
  const match = Buffer.compare(Buffer.from(single), Buffer.from(parallel)) === 0;
  console.log(`match: ${match}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
