export * from "./abis";

export interface SearchResponse {
  normalized_input: string;
  full_conversion: string;
  truncated: boolean;
  conversion_mode: "number" | "base36" | "base95" | "ascii" | "utf8" | "hash";
  pi_dataset_version: number;
  digits_indexed: number;
  found: boolean;
  position?: number;
  match_length?: number;
  occurrence_count?: number;
  discovery_id?: string;
  rarity_tier?: "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY" | "MYTHIC";
  theoretical_rarity?: string;
  achievability?: { level: string; label: string; expected: number };
}

export interface DiscoveryResponse {
  discovery_id: string;
  sequence: string;
  position: number;
  match_length: number;
  pi_dataset_version: number;
  conversion_method: string;
  rarity_tier: string;
  display_text: string | null;
  claimed: boolean;
  token_id: number | null;
  owner_address: string | null;
  created_at: string;
}

export interface LeaderboardEntry {
  owner_address: string;
  sequence?: string;
  match_length?: number;
  position?: number;
  rarity_tier?: string;
  discovery_id?: string;
  count?: number;
}

export interface LeaderboardResponse {
  longest_match: LeaderboardEntry[];
  rarest: LeaderboardEntry[];
  furthest_position: LeaderboardEntry[];
  most_discoveries: LeaderboardEntry[];
}

export interface ProfileResponse {
  wallet_address: string;
  discoveries: Array<{
    discovery_id: string;
    sequence: string;
    position: number;
    match_length: number;
    rarity_tier: string;
    token_id: number;
    created_at: string;
  }>;
  stats: { total_discoveries: number; longest_match: number; rarest_tier: string; furthest_position: number } | null;
  achievements: Array<{ key: string; label: string }>;
}

export interface ProofResponse {
  dataset_version: number;
  position: number;
  sequence: string;
  sequence_hex: `0x${string}`;
  discovery_id: `0x${string}`;
  proofs: Array<{
    chunk_index: number;
    chunk_data: `0x${string}`;
    merkle_proof: `0x${string}`[];
  }>;
}
