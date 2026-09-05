import type { FastifyInstance } from "fastify";
import { getPool } from "../db";
import { buildMetadata, type DiscoveryRow } from "../metadata";
import { buildArtworkSvg } from "../artwork";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000";
const TOKEN_ID_PATTERN = /^[0-9]+$/;

async function findByTokenId(tokenId: string): Promise<DiscoveryRow | null> {
  const { rows } = await getPool().query(
    `SELECT discovery_id, sequence, position, match_length, pi_dataset_version, conversion_method, rarity_tier, display_text, token_id
     FROM discoveries WHERE token_id = $1`,
    [tokenId]
  );
  return rows[0] ?? null;
}

export function registerMetadataRoutes(app: FastifyInstance) {
  app.get("/api/metadata/:tokenId", async (req, reply) => {
    const { tokenId } = req.params as { tokenId: string };
    if (!TOKEN_ID_PATTERN.test(tokenId)) return reply.status(400).send({ error: "invalid_token_id" });
    const discovery = await findByTokenId(tokenId);
    if (!discovery) return reply.status(404).send({ error: "not_found" });
    return reply.send(buildMetadata(discovery, API_BASE_URL));
  });

  app.get("/api/artwork/:tokenId", async (req, reply) => {
    const { tokenId } = req.params as { tokenId: string };
    if (!TOKEN_ID_PATTERN.test(tokenId)) return reply.status(400).send({ error: "invalid_token_id" });
    const discovery = await findByTokenId(tokenId);
    if (!discovery) return reply.status(404).send({ error: "not_found" });
    reply.header("Content-Type", "image/svg+xml");
    return reply.send(buildArtworkSvg(discovery));
  });
}
