import type { DiscoveryRow } from "./metadata";

const TIER_COLORS: Record<string, { accent: string; glow: string }> = {
  COMMON: { accent: "#a3a3a3", glow: "#525252" },
  UNCOMMON: { accent: "#34d399", glow: "#065f46" },
  RARE: { accent: "#38bdf8", glow: "#075985" },
  EPIC: { accent: "#8b5cf6", glow: "#4c1d95" },
  LEGENDARY: { accent: "#f2c94c", glow: "#92400e" },
  MYTHIC: { accent: "#ec4899", glow: "#831843" },
};

/**
 * Deterministic SVG artwork (spec §37) — reproducible byte-for-byte from
 * discovery data alone, no randomness, no external assets. Encodes π
 * symbol, sequence, position, match length, rarity, and token number, per
 * the spec's example composition.
 */
export function buildArtworkSvg(discovery: DiscoveryRow): string {
  const { accent, glow } = TIER_COLORS[discovery.rarity_tier] ?? TIER_COLORS.COMMON!;
  const tokenId = discovery.token_id ?? 0;
  const sequence = discovery.sequence;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <defs>
    <radialGradient id="bg" cx="50%" cy="35%" r="75%">
      <stop offset="0%" stop-color="${glow}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#05040a" stop-opacity="1"/>
    </radialGradient>
  </defs>
  <rect width="800" height="800" fill="#05040a"/>
  <rect width="800" height="800" fill="url(#bg)"/>
  <rect x="24" y="24" width="752" height="752" rx="24" fill="none" stroke="${accent}" stroke-opacity="0.35" stroke-width="2"/>

  <text x="400" y="180" text-anchor="middle" font-family="Georgia, serif" font-size="120" fill="${accent}" fill-opacity="0.9">&#960;</text>

  <text x="400" y="420" text-anchor="middle" font-family="'Courier New', monospace" font-size="64" font-weight="bold" fill="#f5f5f5">${escapeXml(sequence)}</text>

  <text x="400" y="480" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" letter-spacing="2" fill="#a3a3a3">POSITION ${discovery.position.toLocaleString()}</text>

  <text x="400" y="520" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" letter-spacing="2" fill="#a3a3a3">${discovery.match_length} DIGITS</text>

  <rect x="300" y="560" width="200" height="48" rx="24" fill="${accent}" fill-opacity="0.18" stroke="${accent}" stroke-opacity="0.6"/>
  <text x="400" y="591" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="bold" letter-spacing="3" fill="${accent}">${discovery.rarity_tier}</text>

  <text x="400" y="750" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" letter-spacing="3" fill="#525252">PI HUNTER · DISCOVERY #${tokenId}</text>
</svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
