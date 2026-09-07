import { Worker } from "node:worker_threads";
import { cpus } from "node:os";
import { join } from "node:path";
import { binarySplit, combinePQT, digitsFromPQT, termCountForDigits, type PQT } from "./pi-generator";

/**
 * Multi-core version of computePiDigits  -  parallelizes the binary-splitting
 * recursion by splitting the term range [0, nTerms) into `workerCount`
 * contiguous subranges, each computed independently (via binarySplit,
 * unmodified) in its own worker thread, then folded back together with a
 * *balanced pairwise tree* using the exact same combine step binarySplit
 * uses internally (a naive left-to-right fold measured worse than no
 * parallelism at all  -  see git history / docs/architecture.md §5.1).
 * Produces byte-for-byte identical output to computePiDigits for the same
 * numDigits, verified in test/parallel-pi-generator.test.ts at multiple
 * worker counts.
 *
 * IMPORTANT  -  measured, not assumed (at the time of that measurement): at
 * real dataset scale this did NOT make generation faster overall, and
 * `scripts/generate-dataset.ts` deliberately does not use it. Profiling
 * (`scripts/bench-generation-breakdown.ts`) showed binarySplit was only
 * ~20-30% of total time; the rest was the final isqrt step (Newton's
 * method on the ~2x-digit-count-scale value), which this module never
 * touched. Parallelizing the minority component while adding worker-spawn
 * and cross-thread BigInt-serialization overhead was a net loss at 50M
 * digits (253s parallel vs 225s single-threaded).
 *
 * STALE AS OF THE GMP REWRITE (docs/architecture.md §5.1): pi-generator.ts's
 * digitsFromPQT no longer uses the hand-rolled isqrt  -  it uses GMP's native
 * sqrt, which is a different, likely much faster, cost profile. The
 * "binarySplit is only ~20-30% of total time" finding above may no longer
 * hold; re-run bench-generation-breakdown.ts before trusting either the old
 * numbers or a claim that parallelizing binarySplit now helps. This module
 * is also not yet updated to use GMP for its own worker-thread combine path
 * at billion-digit scale (see pi-generator-worker.cjs's own doc)  -  treat it
 * as unverified beyond the digit counts test/parallel-pi-generator.test.ts
 * actually exercises until it's re-benchmarked.
 */

const MIN_TERMS_FOR_PARALLEL = 50_000; // below this, worker spawn overhead isn't worth it

function splitRange(a: bigint, b: bigint, parts: number): Array<[bigint, bigint]> {
  const total = b - a;
  const partsB = BigInt(parts);
  const base = total / partsB;
  const remainder = total % partsB;
  const ranges: Array<[bigint, bigint]> = [];
  let cur = a;
  for (let i = 0; i < parts; i++) {
    const size = base + (BigInt(i) < remainder ? 1n : 0n);
    if (size > 0n) {
      ranges.push([cur, cur + size]);
      cur += size;
    }
  }
  return ranges;
}

function runWorker(a: bigint, b: bigint): Promise<PQT> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(join(__dirname, "pi-generator-worker.cjs"), {
      workerData: { aStr: a.toString(), bStr: b.toString() },
    });
    worker.once("message", (msg: { pStr: string; qStr: string; tStr: string }) => {
      resolve({ P: BigInt(msg.pStr), Q: BigInt(msg.qStr), T: BigInt(msg.tStr) });
    });
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) reject(new Error(`pi-generator-worker exited with code ${code}`));
    });
  });
}

export interface ParallelGenerateOptions {
  workerCount?: number;
  onProgress?: (completed: number, total: number) => void;
}

export async function computePiDigitsParallel(numDigits: number, options: ParallelGenerateOptions = {}): Promise<Uint8Array> {
  if (numDigits < 1) throw new RangeError("numDigits must be >= 1");
  const nTerms = termCountForDigits(numDigits);
  const requestedWorkers = options.workerCount ?? Math.max(1, cpus().length - 1);

  if (nTerms < BigInt(MIN_TERMS_FOR_PARALLEL) || requestedWorkers <= 1) {
    const { Q, T } = binarySplit(0n, nTerms);
    return digitsFromPQT(Q, T, numDigits);
  }

  const workerCount = nTerms < BigInt(requestedWorkers) ? Number(nTerms) : requestedWorkers;
  const ranges = splitRange(0n, nTerms, workerCount);

  let completed = 0;
  const partials = await Promise.all(
    ranges.map(async ([a, b]) => {
      const result = await runWorker(a, b);
      completed++;
      options.onProgress?.(completed, ranges.length);
      return result;
    })
  );

  const combined = treeReduce(partials);
  return digitsFromPQT(combined.Q, combined.T, numDigits);
}

/**
 * Folds partial results with a balanced pairwise tree, not a linear chain.
 * This matters: binary splitting's whole efficiency argument rests on
 * combining similarly-sized operands at each step (P/Q/T magnitude scales
 * with term-range size, and BigInt multiplication cost is very sensitive to
 * operand size imbalance). A naive left-to-right reduce repeatedly
 * multiplies a growing accumulator against one small piece  -  by the last
 * step that's a ~(K-1):1 size-imbalanced multiplication  -  which measured
 * slower than single-threaded generation entirely. This tree fold mirrors
 * the same balanced-combine structure binarySplit's own recursion uses.
 */
function treeReduce(items: PQT[]): PQT {
  let level = items;
  while (level.length > 1) {
    const next: PQT[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? combinePQT(level[i]!, level[i + 1]!) : level[i]!);
    }
    level = next;
  }
  return level[0]!;
}
