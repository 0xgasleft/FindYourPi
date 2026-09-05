import { theoreticalRarityLabel } from "@pi-hunter/pi-core";

export interface DiscoveryRow {
  discovery_id: string;
  sequence: string;
  position: number;
  match_length: number;
  pi_dataset_version: number;
  conversion_method: string;
  rarity_tier: string;
  display_text: string | null;
  token_id: number | null;
}

/**
 * Deterministic NFT metadata (spec §15) — reproducible from on-chain
 * discovery data alone (position/matchLength/rarity/dataset version),
 * never including raw user input;
 * `display_text` is an explicit, user-opted-in public label, not the raw
 * search string (docs/threat-model.md T8).
 */
export function buildMetadata(discovery: DiscoveryRow, apiBaseUrl: string) {
  const tokenId = discovery.token_id ?? 0;
  return {
    name: `π Discovery #${tokenId}`,
    description: `A permanent claim to a specific occurrence in the digits of π. You do not own π or this sequence itself — you own a token representing a verified occurrence at position ${discovery.position.toLocaleString()} in π dataset v${discovery.pi_dataset_version}.`,
    image: `${apiBaseUrl}/api/artwork/${tokenId}`,
    external_url: `${apiBaseUrl.replace(/\/api.*$/, "")}/discovery/${discovery.discovery_id}`,
    attributes: [
      { trait_type: "Sequence", value: discovery.display_text ?? discovery.sequence },
      { trait_type: "Position", value: discovery.position },
      { trait_type: "Match Length", value: discovery.match_length },
      { trait_type: "Rarity Tier", value: discovery.rarity_tier },
      { trait_type: "Theoretical Rarity", value: theoreticalRarityLabel(discovery.match_length) },
      { trait_type: "Conversion", value: discovery.conversion_method },
      { trait_type: "π Dataset", value: `Pi v${discovery.pi_dataset_version}` },
    ],
  };
}
