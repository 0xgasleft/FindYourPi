# Rarity Design — Theoretical Tier vs. Achievable-in-Current-Index

> **Added on review.** The original rarity design (spec §8) defines tiers up
> to MYTHIC (20+ digits) purely from the combinatorics of a random digit
> sequence (`~1 in 10^N`). That's mathematically fine as a classification,
> but presenting it without qualification against a **1-billion-digit**
> initial index is misleading: it implies users can realistically go hunting
> for a 20-digit MYTHIC find, when the dataset is astronomically too small
> to contain one. This document fixes the UX, not the tier definitions.

## 1. The math the UI must respect

Expected number of occurrences of one specific length-`N` digit sequence
within a dataset of `D` digits is approximately `D / 10^N` (for `D >> 10^N`,
ignoring edge effects — good enough for product-facing rounding). For the
MVP dataset (`D = 1,000,000,000`):

| Length N | Tier       | Theoretical rarity | Expected occurrences in current 1B-digit index |
|----------|------------|--------------------:|-----------------------------------------------:|
| 3–5      | COMMON     | 1 in 10³–10⁵        | 10,000 – 1,000,000                              |
| 6–8      | UNCOMMON   | 1 in 10⁶–10⁸        | 10 – 1,000                                      |
| 9        | RARE       | 1 in 10⁹            | ~1                                               |
| 10–11    | RARE       | 1 in 10¹⁰–10¹¹      | 0.1 – 0.01                                       |
| 12–14    | EPIC       | 1 in 10¹²–10¹⁴      | 0.001 – 0.00001                                  |
| 15–19    | LEGENDARY  | 1 in 10¹⁵–10¹⁹      | 10⁻⁶ – 10⁻¹⁰                                     |
| 20+      | MYTHIC     | 1 in 10²⁰+          | ≤ 10⁻¹¹ — **not realistically achievable at this index depth** |

Reading this table: a random 9-digit sequence has, on average, about one
occurrence in the first billion digits — findable, but not guaranteed
(Poisson with mean 1 still has ~37% chance of zero hits). Past 12 digits,
the *overwhelming majority* of random searches will come back "not found ...
yet," honestly, because the math says so, not because of a search-engine
bug. Past ~15 digits it is fair to describe a hit as an extraordinary
coincidence rather than something the platform can promise is reachable;
past 20 it should not be presented as a goal at all for the current dataset.

## 2. What changes in the product

* **Tiers are unchanged** — COMMON through MYTHIC keep the same digit-length
  boundaries (spec §8, configurable). This is a display/wording fix, not a
  rebalancing of the tiers themselves.
* **Every rarity display shows two numbers, not one**: theoretical rarity
  *and* the dataset it's measured against, matching the spec's own
  instruction not to overclaim (§8, §55). Result-screen copy becomes:

  ```text
  12-digit match — LEGENDARY
  Theoretical rarity: ~1 in 1 trillion
  Currently searched: first 1,000,000,000 digits of π
  ```

  (Tier boundaries in this doc's table don't exactly match the spec's
  example wording above — LEGENDARY there is used loosely; the shipped copy
  uses whatever tier the configured boundaries actually assign to 12
  digits. The point is the two-line pattern, not this specific number.)

* **An "achievability" label is derived, live, from `digitsIndexed`** (not
  hardcoded per tier, so it stays correct if/when the dataset grows to v2,
  v3):

  ```text
  expectedOccurrences(matchLength, digitsIndexed) = digitsIndexed / 10^matchLength

  >= 10        -> "Common at this index depth"
  >= 1         -> "Achievable at this index depth"
  >= 0.01      -> "Rare — most searches this long come back empty"
  >= 1e-6      -> "Extremely unlikely at this index depth"
  else         -> "Not realistically achievable at this index depth yet"
  ```

  This label is computed in `packages/pi-core` (same module that owns
  `discoveryId`/conversion, so it's one source of truth) and surfaces on
  every result screen and discovery page, next to the tier badge.

* **Daily challenges (spec §21) never propose an unachievable target.** The
  challenge generator only picks a target match length where
  `expectedOccurrences >= ~0.01` for the active dataset — i.e. it will
  never say "find a 20-digit sequence" against a 1B-digit index. As the
  dataset grows in later versions (v2 = 10B, v3 = 100B, per the roadmap),
  the achievable range shifts up automatically because it's derived from
  `digitsIndexed`, not hardcoded.
* **Marketing/landing copy** avoids implying MYTHIC is a reachable goal for
  the current index. "Compete for rare/long matches" (spec §2) is still
  true and still the hook — framed around RARE/EPIC, which are genuinely
  findable-with-effort, rather than MYTHIC, which currently isn't.

## 3. Why this is the minimal fix

This does not change the contract, the proof system, or the discoveryId
scheme — rarity is a display/derived-data concern computed from
`(matchLength, digitsIndexed)`, both of which are already recorded per
discovery. The fix is entirely in `packages/pi-core`'s rarity module and the
frontend copy that reads from it, which is why it can ship in Phase 3 (Core
product) alongside the rest of rarity, not as a separate workstream.
