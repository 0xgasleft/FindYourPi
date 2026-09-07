/**
 * Suffix array substring index over the digit alphabet {0..9}, built via
 * the classic prefix-doubling algorithm (Manber-Myers style): O(n log^2 n)
 * construction, O(m log n) query via binary search.
 *
 * docs/architecture.md §4 originally targeted an FM-index (compressed,
 * memory-mappable) for a full ~1B-digit dataset. This MVP's actual dataset
 * (see packages/pi-search/README.md for the real, generated size) is
 * realistically achievable to generate and index in this pass; a suffix
 * array is simpler to implement correctly and is explicitly named in the
 * spec (§6) as an acceptable approach. Revisit toward FM-index/BWT if a
 * future dataset version scales toward the billions and the suffix array's
 * memory footprint (O(n), ~4 bytes/digit) becomes the bottleneck  -  this was
 * anticipated as the fallback path in docs/architecture.md §4.
 */

/**
 * Stable counting sort of `sa` (an array of indices) by an integer key in
 * [0, keyRange], returning a new Int32Array in sorted order. O(n), no
 * comparator function involved at all.
 *
 * This replaces what used to be a single `Array.prototype.sort`/
 * `TypedArray.prototype.sort` call with a custom comparator  -  removed
 * because BOTH hit real, hard V8 ceilings at dataset scale, confirmed
 * directly while generating the 500M-digit v2 dataset, not assumed:
 *   1. Converting to a plain Array first (V8's own Array.prototype.sort
 *      optimizes custom comparators much better than
 *      TypedArray.prototype.sort, so this used to be the fast path) hits a
 *      hard V8 length ceiling for plain JS Arrays well under Int32Array's
 *      own limits  -  `Array.from(new Int32Array(100_000_000))` succeeds,
 *      the same call at 200_000_000 throws "RangeError: Invalid array
 *      length", regardless of available memory.
 *   2. Sorting the Int32Array in place with a custom comparator (the
 *      seemingly obvious fallback) hits a SEPARATE V8 restriction:
 *      "TypeError: Custom comparefn not supported for huge TypedArrays".
 * Counting sort sidesteps both  -  it never calls a comparator-accepting
 * sort at all  -  and is asymptotically better besides (O(n) per pass here,
 * vs O(n log n) for a comparison sort), since our keys are exactly the
 * small-bounded-integer case counting sort is built for.
 */
function countingSortByKey(sa: Int32Array, keyOf: (i: number) => number, keyRange: number): Int32Array {
  const n = sa.length;
  const count = new Int32Array(keyRange + 1);
  for (let i = 0; i < n; i++) count[keyOf(sa[i]!)]!++;

  // Transform counts into an exclusive prefix sum: count[v] becomes the
  // first output slot for key v. Iterating the input in its original
  // order and bumping count[v] after each placement keeps this stable  -
  // required, since prefix-doubling's correctness depends on ties being
  // broken by the *previous* round's relative order.
  let sum = 0;
  for (let v = 0; v <= keyRange; v++) {
    const c = count[v]!;
    count[v] = sum;
    sum += c;
  }

  const output = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const idx = sa[i]!;
    const k = keyOf(idx);
    output[count[k]!] = idx;
    count[k]! += 1;
  }
  return output;
}

export function buildSuffixArray(digits: Uint8Array): Int32Array {
  const n = digits.length;
  let sa = new Int32Array(n);
  for (let i = 0; i < n; i++) sa[i] = i;

  let rank = new Int32Array(n);
  for (let i = 0; i < n; i++) rank[i] = digits[i]!;
  let tmp = new Int32Array(n);

  const rankAt = (i: number, k: number): number => (i + k < n ? rank[i + k]! : -1);

  for (let k = 1; k < n; k <<= 1) {
    const rr = rank; // capture for keyOf closures
    const kk = k;
    // LSD radix sort by (primary=rank, secondary=rankAt(·,k)): sort by the
    // least-significant key first (secondary, offset +1 since rankAt can
    // be -1), then the most-significant key last (primary)  -  two stable
    // passes reproduce exactly what the removed comparator
    // `(ra - rb) || (rankAt(a,k) - rankAt(b,k))` did.
    sa = countingSortByKey(sa, (i) => rankAt(i, kk) + 1, n);
    sa = countingSortByKey(sa, (i) => rr[i]!, n - 1);

    tmp[sa[0]!] = 0;
    for (let i = 1; i < n; i++) {
      const prev = sa[i - 1]!;
      const cur = sa[i]!;
      const same = rank[prev] === rank[cur] && rankAt(prev, k) === rankAt(cur, k);
      tmp[cur] = tmp[prev]! + (same ? 0 : 1);
    }
    [rank, tmp] = [tmp, rank];

    if (rank[sa[n - 1]!] === n - 1) break;
  }

  return sa;
}

function compareSuffixToPattern(digits: Uint8Array, suffixStart: number, pattern: Uint8Array): number {
  const n = digits.length;
  const m = pattern.length;
  for (let i = 0; i < m; i++) {
    const dPos = suffixStart + i;
    const d = dPos < n ? digits[dPos]! : -1;
    const p = pattern[i]!;
    if (d !== p) return d - p;
  }
  return 0;
}

/**
 * Returns the range [lo, hi) in the suffix array whose suffixes all start
 * with `pattern`, via two binary searches (lower/upper bound). Empty range
 * if not found. O(m log n).
 */
export function searchPattern(digits: Uint8Array, sa: Int32Array, pattern: Uint8Array): { lo: number; hi: number } {
  const n = sa.length;
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (compareSuffixToPattern(digits, sa[mid]!, pattern) < 0) lo = mid + 1;
    else hi = mid;
  }
  const rangeStart = lo;
  hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (compareSuffixToPattern(digits, sa[mid]!, pattern) <= 0) lo = mid + 1;
    else hi = mid;
  }
  return { lo: rangeStart, hi: lo };
}

export interface SearchResult {
  found: boolean;
  /** Smallest matching position (spec §7 default: first occurrence). */
  firstPosition: number | null;
  occurrenceCount: number;
  /** All matching positions, sorted ascending  -  capped by the caller for very common short sequences. */
  positions: number[];
}

export function search(digits: Uint8Array, sa: Int32Array, patternDigits: string, maxPositions = 1000): SearchResult {
  const pattern = new Uint8Array(patternDigits.length);
  for (let i = 0; i < patternDigits.length; i++) pattern[i] = patternDigits.charCodeAt(i) - 48;

  const { lo, hi } = searchPattern(digits, sa, pattern);
  const occurrenceCount = hi - lo;
  if (occurrenceCount === 0) {
    return { found: false, firstPosition: null, occurrenceCount: 0, positions: [] };
  }
  const slice = Array.from(sa.subarray(lo, Math.min(hi, lo + maxPositions))).sort((a, b) => a - b);
  let firstPosition = sa[lo]!;
  for (let i = lo + 1; i < hi; i++) if (sa[i]! < firstPosition) firstPosition = sa[i]!;
  return {
    found: true,
    firstPosition,
    occurrenceCount,
    positions: slice,
  };
}
