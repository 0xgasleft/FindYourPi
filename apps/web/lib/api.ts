import type { DiscoveryResponse, LeaderboardResponse, ProfileResponse, ProofResponse, SearchResponse } from "@pi-hunter/types";
import type { ConversionMode } from "@pi-hunter/pi-core";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function searchPi(input: string, mode: ConversionMode): Promise<SearchResponse> {
  const res = await fetch(`${API_URL}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input, mode }),
  });
  if (!res.ok) throw new Error(`search failed: ${res.status}`);
  return res.json();
}

export async function fetchDiscovery(id: string): Promise<DiscoveryResponse | null> {
  const res = await fetch(`${API_URL}/api/discovery/${id}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`discovery lookup failed: ${res.status}`);
  return res.json();
}

export async function fetchLeaderboard(): Promise<LeaderboardResponse> {
  const res = await fetch(`${API_URL}/api/leaderboard`, { cache: "no-store" });
  if (!res.ok) throw new Error(`leaderboard failed: ${res.status}`);
  return res.json();
}

export async function fetchProfile(address: string): Promise<ProfileResponse> {
  const res = await fetch(`${API_URL}/api/profile/${address}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`profile failed: ${res.status}`);
  return res.json();
}

export async function fetchProof(position: number, sequence: string): Promise<ProofResponse> {
  const res = await fetch(`${API_URL}/api/proof`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ position, sequence }),
  });
  if (!res.ok) throw new Error(`proof failed: ${res.status}`);
  return res.json();
}
