import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { convert, rarityTierForLength, theoreticalRarityLabel, achievability, computeDiscoveryId, sequenceHashOf } from "@pi-hunter/pi-core";
import { search as searchIndex } from "@pi-hunter/pi-search";
import { getActiveDataset } from "../dataset-loader";
import { bestEffortQuery } from "../db";

const SearchBody = z.object({
  input: z.string().min(1).max(500),
  mode: z.enum(["number", "ascii", "utf8", "hash"]),
  hashKeepDigits: z.number().int().min(1).max(64).optional(),
  walletAddress: z.string().optional(),
});

export function registerSearchRoute(app: FastifyInstance) {
  app.post("/api/search", async (req, reply) => {
    const parsed = SearchBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_input", details: parsed.error.flatten() });
    }
    const { input, mode, hashKeepDigits, walletAddress } = parsed.data;

    let conversion;
    try {
      conversion = convert(input, mode, hashKeepDigits !== undefined ? { hashKeepDigits } : {});
    } catch (err) {
      return reply.status(400).send({ error: "conversion_failed", message: (err as Error).message });
    }

    if (conversion.sequence.length === 0) {
      return reply.status(400).send({ error: "empty_sequence", message: "Give us something we can turn into digits." });
    }

    const dataset = getActiveDataset();
    const result = searchIndex(dataset.digits, dataset.suffixArray, conversion.sequence);

    const responseBase = {
      normalized_input: conversion.sequence,
      full_conversion: conversion.fullSequence,
      truncated: conversion.truncated,
      conversion_mode: conversion.mode,
      pi_dataset_version: dataset.manifest.version,
      digits_indexed: dataset.manifest.digitCount,
    };

    // Best-effort search logging — never blocks or fails the response (spec §16: don't over-retain raw input; only the normalized sequence is stored).
    void bestEffortQuery(
      `INSERT INTO searches (conversion_mode, normalized_sequence, found, position, match_length, pi_dataset_version, wallet_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [conversion.mode, conversion.sequence, result.found, result.firstPosition, conversion.sequence.length, dataset.manifest.version, walletAddress ?? null],
      (err) => req.log.warn({ err }, "failed to log search")
    );

    if (!result.found) {
      return reply.send({ ...responseBase, found: false });
    }

    const matchLength = conversion.sequence.length;
    const position = result.firstPosition!;
    const rarityTier = rarityTierForLength(matchLength);
    const achievabilityInfo = achievability(matchLength, dataset.manifest.digitCount);
    const discoveryId = computeDiscoveryId({
      datasetVersion: BigInt(dataset.manifest.version),
      root: dataset.manifest.merkleRoot,
      position: BigInt(position),
      matchLength,
      sequence: conversion.sequence,
    });

    void bestEffortQuery(
      `INSERT INTO discoveries (discovery_id, sequence, sequence_hash, position, match_length, pi_dataset_version, conversion_method, rarity_tier)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (discovery_id) DO NOTHING`,
      [discoveryId, conversion.sequence, sequenceHashOf(conversion.sequence), position, matchLength, dataset.manifest.version, conversion.mode, rarityTier],
      (err) => req.log.warn({ err }, "failed to persist discovery")
    );

    return reply.send({
      ...responseBase,
      found: true,
      position,
      match_length: matchLength,
      occurrence_count: result.occurrenceCount,
      discovery_id: discoveryId,
      rarity_tier: rarityTier,
      theoretical_rarity: theoreticalRarityLabel(matchLength),
      achievability: achievabilityInfo,
    });
  });
}
