export interface ProfileDiscovery {
  match_length: number;
  rarity_tier: string;
  position: number;
}

export interface Achievement {
  key: string;
  label: string;
}

/**
 * Computed on read from a wallet's existing claimed discoveries  -  no
 * separate tracked/awarded state to keep in sync, no fake scarcity (spec
 * §22: "Do not create fake scarcity"). Recomputing is cheap at profile-page
 * scale (a handful of rows per wallet).
 */
export function computeAchievements(discoveries: ProfileDiscovery[]): Achievement[] {
  const achievements: Achievement[] = [];
  if (discoveries.length === 0) return achievements;

  achievements.push({ key: "first_find", label: "First Find" });

  if (discoveries.some((d) => d.match_length === 7)) achievements.push({ key: "lucky_7", label: "Lucky 7" });
  if (discoveries.some((d) => d.match_length >= 10)) achievements.push({ key: "ten_digit_club", label: "10 Digit Club" });
  if (discoveries.length >= 5) achievements.push({ key: "pi_explorer", label: "π Explorer" });
  if (discoveries.some((d) => d.rarity_tier === "LEGENDARY")) achievements.push({ key: "legendary_find", label: "Legendary Find" });
  if (discoveries.some((d) => d.rarity_tier === "MYTHIC")) achievements.push({ key: "mythic_find", label: "Mythic Find" });
  if (discoveries.some((d) => d.position >= 10_000_000)) achievements.push({ key: "deep_diver", label: "Deep Diver" });
  if (discoveries.length >= 20) achievements.push({ key: "pi_addict", label: "π Addict" });

  return achievements;
}
