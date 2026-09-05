import { describe, expect, it } from "vitest";
import { rarityTierForLength, expectedOccurrences, achievability, pickAchievableChallengeLength } from "../src/rarity";

describe("rarityTierForLength", () => {
  it("matches the spec's tier boundaries", () => {
    expect(rarityTierForLength(3)).toBe("COMMON");
    expect(rarityTierForLength(5)).toBe("COMMON");
    expect(rarityTierForLength(6)).toBe("UNCOMMON");
    expect(rarityTierForLength(9)).toBe("RARE");
    expect(rarityTierForLength(12)).toBe("EPIC");
    expect(rarityTierForLength(15)).toBe("LEGENDARY");
    expect(rarityTierForLength(20)).toBe("MYTHIC");
    expect(rarityTierForLength(64)).toBe("MYTHIC");
  });
});

describe("expectedOccurrences", () => {
  it("matches docs/rarity.md's worked table for a 1B-digit dataset", () => {
    const D = 1_000_000_000;
    expect(expectedOccurrences(3, D)).toBeCloseTo(1_000_000, 5);
    expect(expectedOccurrences(9, D)).toBeCloseTo(1, 5);
    expect(expectedOccurrences(12, D)).toBeCloseTo(0.001, 8);
    expect(expectedOccurrences(20, D)).toBeCloseTo(1e-11, 15);
  });
});

describe("achievability", () => {
  it("never claims a 20-digit match is achievable at 1B digits indexed", () => {
    const r = achievability(20, 1_000_000_000);
    expect(r.level).toBe("not-achievable-at-depth");
  });

  it("marks a 9-digit match as achievable at 1B digits indexed", () => {
    const r = achievability(9, 1_000_000_000);
    expect(r.level).toBe("achievable-at-depth");
  });
});

describe("pickAchievableChallengeLength", () => {
  it("never proposes an unachievable length for a 1B-digit dataset", () => {
    const length = pickAchievableChallengeLength(1_000_000_000, 6, 20);
    expect(expectedOccurrences(length, 1_000_000_000)).toBeGreaterThanOrEqual(0.01);
  });

  it("scales up as the indexed dataset grows (v2/v3 roadmap)", () => {
    const small = pickAchievableChallengeLength(1_000_000_000, 6, 20);
    const large = pickAchievableChallengeLength(100_000_000_000, 6, 20);
    expect(large).toBeGreaterThanOrEqual(small);
  });
});
