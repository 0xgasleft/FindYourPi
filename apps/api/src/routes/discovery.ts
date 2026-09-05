import type { FastifyInstance } from "fastify";
import { getPool } from "../db";

export function registerDiscoveryRoute(app: FastifyInstance) {
  app.get("/api/discovery/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { rows } = await getPool().query(
      `SELECT discovery_id, sequence, position, match_length, pi_dataset_version, conversion_method,
              rarity_tier, display_text, claimed, token_id, owner_address, created_at
       FROM discoveries WHERE discovery_id = $1`,
      [id]
    );
    if (rows.length === 0) {
      return reply.status(404).send({ error: "not_found" });
    }
    const row = rows[0];
    return reply.send({
      discovery_id: row.discovery_id,
      sequence: row.sequence,
      position: Number(row.position),
      match_length: row.match_length,
      pi_dataset_version: row.pi_dataset_version,
      conversion_method: row.conversion_method,
      rarity_tier: row.rarity_tier,
      display_text: row.display_text,
      claimed: row.claimed,
      token_id: row.token_id !== null ? Number(row.token_id) : null,
      owner_address: row.owner_address,
      created_at: row.created_at,
    });
  });
}
