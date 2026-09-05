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
 * memory footprint (O(n), ~4 bytes/digit) becomes the bottleneck — this was
 * anticipated as the fallback path in docs/architecture.md §4.
 */

export function buildSuffixArray(digits: Uint8Array): Int32Array {
  const n = digits.length;
  let sa = new Int32Array(n);
  for (let i = 0; i < n; i++) sa[i] = i;

  let rank = new Int32Array(n);
  for (let i = 0; i < n; i++) rank[i] = digits[i]!;
  let tmp = new Int32Array(n);

  const rankAt = (i: number, k: number): number => (i + k < n ? rank[i + k]! : -1);

  for (let k = 1; k < n; k <<= 1) {
    const rr = rank; // capture for comparator closure
    const kk = k;
    const saArr = Array.from(sa); // Array.prototype.sort is significantly faster than TypedArray.sort for custom comparators in V8
    saArr.sort((a, b) => {
      const ra = rr[a]!;
      const rb = rr[b]!;
      if (ra !== rb) return ra - rb;
      return rankAt(a, kk) - rankAt(b, kk);
    });
    sa = Int32Array.from(saArr);

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
  /** All matching positions, sorted ascending — capped by the caller for very common short sequences. */
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
