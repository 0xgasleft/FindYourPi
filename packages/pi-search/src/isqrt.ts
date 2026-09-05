/**
 * Integer square root of a non-negative BigInt via Newton's method.
 * Converges quadratically; the initial guess is seeded from the operand's
 * bit length (via its hex-string length) so convergence is fast even for
 * operands with tens of millions of bits.
 */
export function isqrt(value: bigint): bigint {
  if (value < 0n) throw new RangeError("isqrt: negative input");
  if (value < 2n) return value;

  const hexLen = value.toString(16).length;
  const bitLenEstimate = BigInt(hexLen * 4);
  let x = 1n << (bitLenEstimate / 2n + 1n);

  // Newton's method: x_{n+1} = (x_n + value/x_n) / 2
  for (;;) {
    const y = (x + value / x) >> 1n;
    if (y >= x) break;
    x = y;
  }
  // x may overshoot by one due to the estimate; correct downward.
  while (x * x > value) x -= 1n;
  while ((x + 1n) * (x + 1n) <= value) x += 1n;
  return x;
}
