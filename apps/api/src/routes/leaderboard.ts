import type { FastifyInstance } from "fastify";
import { getPool } from "../db";

/**
 * All leaderboard metrics are skill/luck-based (match length, rarity,
 * position, discovery count)  -  never spend-based, per spec §19 ("avoid
 * rankings that reward spending money").
 */
export function registerLeaderboardRoute(app: FastifyInstance) {
  app.get("/api/leaderboard", async (req, reply) => {
    const pool = getPool();

    const [longestMatch, rarest, furthestPosition, mostDiscoveries] = await Promise.all([
      pool.query(
        `SELECT owner_address, sequence, match_length, position, discovery_id
         FROM discoveries WHERE claimed = true ORDER BY match_length DESC, created_at ASC LIMIT 10`
      ),
      pool.query(
        `SELECT owner_address, sequence, match_length, rarity_tier, discovery_id
         FROM discoveries WHERE claimed = true
         ORDER BY CASE rarity_tier
           WHEN 'MYTHIC' THEN 6 WHEN 'LEGENDARY' THEN 5 WHEN 'EPIC' THEN 4
           WHEN 'RARE' THEN 3 WHEN 'UNCOMMON' THEN 2 ELSE 1 END DESC, match_length DESC
         LIMIT 10`
      ),
      pool.query(
        `SELECT owner_address, sequence, position, discovery_id
         FROM discoveries WHERE claimed = true ORDER BY position DESC LIMIT 10`
      ),
      pool.query(
        `SELECT owner_address, COUNT(*) as count
         FROM discoveries WHERE claimed = true AND owner_address IS NOT NULL
         GROUP BY owner_address ORDER BY count DESC LIMIT 10`
      ),
    ]);

    return reply.send({
      longest_match: longestMatch.rows,
      rarest: rarest.rows,
      furthest_position: furthestPosition.rows,
      most_discoveries: mostDiscoveries.rows.map((r) => ({ owner_address: r.owner_address, count: Number(r.count) })),
    });
  });
}
