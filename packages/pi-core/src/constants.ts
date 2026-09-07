/**
 * Shared protocol constants. These mirror docs/proof-system.md exactly  -
 * if you change a value here, update that doc (and vice versa).
 */

/** Position 0 = first digit after the decimal point. The leading "3" is never counted. */
export const POSITION_CONVENTION = "zero-indexed-digits-after-decimal-point" as const;

/** Digits per Merkle chunk (see docs/proof-system.md §3.1 / §4 benchmark). */
export const CHUNK_SIZE_DIGITS = 128;

/**
 * Max match length the on-chain verifier will accept (docs/proof-system.md §3.1).
 * Any conversion result longer than this is truncated for search/claim purposes;
 * the untruncated value is never silently discarded from the UI's explanation.
 */
export const MAX_MATCH_LEN = 64;

/** Default number of leading decimal digits kept from a SHA-256 hash-mode conversion. */
export const HASH_MODE_DIGITS = 10;
