import type { FastifyInstance } from "fastify";
import { getPool } from "../db";
import { computeAchievements } from "../achievements";

export function registerProfileRoute(app: FastifyInstance) {
  app.get("/api/profile/:address", async (req, reply) => {
    const { address } = req.params as { address: string };
    const wallet = address.toLowerCase();

    const { rows } = await getPool().query(
      `SELECT discovery_id, sequence, position, match_length, rarity_tier, token_id, created_at
       FROM discoveries WHERE owner_address = $1 AND claimed = true ORDER BY created_at DESC`,
      [wallet]
    );

    if (rows.length === 0) {
      return reply.send({ wallet_address: wallet, discoveries: [], stats: null, achievements: [] });
    }

    const longestMatch = Math.max(...rows.map((r) => r.match_length));
    const furthestPosition = Math.max(...rows.map((r) => Number(r.position)));
    const tierRank: Record<string, number> = { COMMON: 1, UNCOMMON: 2, RARE: 3, EPIC: 4, LEGENDARY: 5, MYTHIC: 6 };
    const rarest = rows.reduce((best, r) => ((tierRank[r.rarity_tier] ?? 0) > (tierRank[best.rarity_tier] ?? 0) ? r : best));

    return reply.send({
      wallet_address: wallet,
      discoveries: rows.map((r) => ({
        discovery_id: r.discovery_id,
        sequence: r.sequence,
        position: Number(r.position),
        match_length: r.match_length,
        rarity_tier: r.rarity_tier,
        token_id: Number(r.token_id),
        created_at: r.created_at,
      })),
      stats: {
        total_discoveries: rows.length,
        longest_match: longestMatch,
        rarest_tier: rarest.rarity_tier,
        furthest_position: furthestPosition,
      },
      achievements: computeAchievements(rows),
    });
  });
}
