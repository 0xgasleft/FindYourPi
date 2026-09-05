/**
 * Rarity tiers (spec §8) plus the achievability fix from docs/rarity.md:
 * every tier is shown alongside what's actually findable in the currently
 * indexed dataset, computed live from `digitsIndexed` rather than hardcoded.
 */

export type RarityTier = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY" | "MYTHIC";

export interface RarityTierBounds {
  tier: RarityTier;
  minLength: number;
  maxLength: number | null; // null = unbounded
}

/** Configurable per spec §8 ("Make these configurable"). */
export const DEFAULT_RARITY_TIERS: RarityTierBounds[] = [
  { tier: "COMMON", minLength: 3, maxLength: 5 },
  { tier: "UNCOMMON", minLength: 6, maxLength: 8 },
  { tier: "RARE", minLength: 9, maxLength: 11 },
  { tier: "EPIC", minLength: 12, maxLength: 14 },
  { tier: "LEGENDARY", minLength: 15, maxLength: 19 },
  { tier: "MYTHIC", minLength: 20, maxLength: null },
];

export function rarityTierForLength(matchLength: number, tiers: RarityTierBounds[] = DEFAULT_RARITY_TIERS): RarityTier {
  for (const t of tiers) {
    if (matchLength >= t.minLength && (t.maxLength === null || matchLength <= t.maxLength)) return t.tier;
  }
  // Below COMMON's floor (1-2 digits) is still COMMON in product terms — everything
  // shorter than the configured minimum falls into the lowest tier rather than being unranked.
  return tiers[0]!.tier;
}

/** "1 in 10^N" theoretical rarity string, spec §8. Not a claim about this dataset specifically. */
export function theoreticalRarityLabel(matchLength: number): string {
  return `1 in ~10^${matchLength}`;
}

/**
 * Expected number of occurrences of one specific length-N digit sequence in
 * a dataset of `digitsIndexed` digits: digitsIndexed / 10^N (docs/rarity.md §1).
 * Returned as a number; can be far below 1 (a probability, not a count) or far above.
 */
export function expectedOccurrences(matchLength: number, digitsIndexed: number): number {
  // 10^matchLength overflows a normal JS number well before matchLength ~ 309;
  // MAX_MATCH_LEN caps this at 64 so plain floating point is exact enough here.
  return digitsIndexed / Math.pow(10, matchLength);
}

export type Achievability =
  | "common-at-depth"
  | "achievable-at-depth"
  | "rare-at-depth"
  | "extremely-unlikely-at-depth"
  | "not-achievable-at-depth";

const ACHIEVABILITY_LABELS: Record<Achievability, string> = {
  "common-at-depth": "Common at this index depth",
  "achievable-at-depth": "Achievable at this index depth",
  "rare-at-depth": "Rare — most searches this long come back empty",
  "extremely-unlikely-at-depth": "Extremely unlikely at this index depth",
  "not-achievable-at-depth": "Not realistically achievable at this index depth yet",
};

export function achievability(matchLength: number, digitsIndexed: number): { level: Achievability; label: string; expected: number } {
  const expected = expectedOccurrences(matchLength, digitsIndexed);
  let level: Achievability;
  if (expected >= 10) level = "common-at-depth";
  else if (expected >= 1) level = "achievable-at-depth";
  else if (expected >= 0.01) level = "rare-at-depth";
  else if (expected >= 1e-6) level = "extremely-unlikely-at-depth";
  else level = "not-achievable-at-depth";
  return { level, label: ACHIEVABILITY_LABELS[level], expected };
}

/**
 * Daily-challenge target length picker (spec §21, fixed per docs/rarity.md):
 * never propose a length that's statistically unreachable at the active
 * dataset's depth. Picks the longest length in [minLength, maxLength] whose
 * expected occurrence count is still >= the achievability floor.
 */
export function pickAchievableChallengeLength(digitsIndexed: number, minLength = 6, maxLength = 14): number {
  let best = minLength;
  for (let n = minLength; n <= maxLength; n++) {
    if (expectedOccurrences(n, digitsIndexed) >= 0.01) best = n;
    else break;
  }
  return best;
}
