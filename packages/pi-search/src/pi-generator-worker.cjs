"use strict";
const { parentPort, workerData } = require("node:worker_threads");

// Deliberately self-contained plain CommonJS (no imports, no TS) so this
// worker loads identically regardless of how the parent process/thread was
// launched (tsx CLI, ts-node, or nested inside a test runner like Vitest  -
// spawning a worker with a TS loader via execArgv proved fragile across
// those contexts; plain .cjs sidesteps the problem entirely).
//
// This MUST stay byte-for-byte equivalent to packages/pi-search/src/pi-
// generator.ts's binarySplit/combinePQT for whatever range it's actually
// exercised on. That equivalence is not just asserted here  -  it's enforced
// by test/parallel-pi-generator.test.ts, which compares this worker's
// parallel output against the single-threaded TS reference at multiple
// worker counts before either is trusted for a real multi-billion-digit
// run. If you change the algorithm in pi-generator.ts, mirror the change
// here or that test will fail.
//
// NOT updated for the GMP rewrite (docs/architecture.md §5.1): this worker
// is pure native BigInt only, with the same ~2^30-1-bit ceiling
// pi-generator.ts used to have before combinePQT gained a GMP fallback. A
// worker's own subrange can still overflow that ceiling if it's given a
// large enough slice of a billion-plus-digit computation. This is fine for
// parallel-pi-generator.ts's current, modest-scale test coverage, but this
// worker is not yet a safe drop-in for the parallel path at real
// multi-billion-digit scale  -  see parallel-pi-generator.ts's module doc.

const CHUDNOVSKY_A = 13591409n;
const CHUDNOVSKY_B = 545140134n;
const CHUDNOVSKY_C = 640320n;
const C3_OVER_24 = CHUDNOVSKY_C ** 3n / 24n;

function binarySplit(a, b) {
  if (b - a === 1n) {
    let P, Q;
    if (a === 0n) {
      P = 1n;
      Q = 1n;
    } else {
      P = (6n * a - 5n) * (2n * a - 1n) * (6n * a - 1n);
      Q = a * a * a * C3_OVER_24;
    }
    let T = P * (CHUDNOVSKY_A + CHUDNOVSKY_B * a);
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

const { aStr, bStr } = workerData;
const t0 = performance.now();
const { P, Q, T } = binarySplit(BigInt(aStr), BigInt(bStr));
const computeMs = performance.now() - t0;
parentPort.postMessage({ pStr: P.toString(), qStr: Q.toString(), tStr: T.toString(), computeMs });
