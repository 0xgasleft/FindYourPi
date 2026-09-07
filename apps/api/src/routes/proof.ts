import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { toHex } from "viem";
import { computeDiscoveryId } from "@pi-hunter/pi-core";
import { buildOccurrenceProof, verifyOccurrenceProof } from "@pi-hunter/proofs";
import { getActiveDataset } from "../dataset-loader";

const ProofBody = z.object({
  position: z.number().int().nonnegative(),
  sequence: z.string().regex(/^[0-9]+$/),
});

/**
 * Builds a claim-ready proof for a given (position, sequence). This is a
 * convenience  -  see docs/proof-system.md §1/§3.4: the proof is fully
 * self-contained, so the frontend (or anyone with a copy of the dataset)
 * could construct the exact same thing via packages/proofs directly
 * without calling this endpoint at all. The contract never trusts this
 * endpoint; it re-verifies from scratch.
 */
export function registerProofRoute(app: FastifyInstance) {
  app.post("/api/proof", async (req, reply) => {
    const parsed = ProofBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_input", details: parsed.error.flatten() });
    }
    const { position, sequence } = parsed.data;
    const dataset = getActiveDataset();

    if (position + sequence.length > dataset.manifest.digitCount) {
      return reply.status(400).send({ error: "out_of_range", message: "position + matchLength exceeds the indexed dataset" });
    }

    const occurrence = buildOccurrenceProof(dataset.chunks, dataset.tree, dataset.manifest.chunkSizeDigits, position, sequence.length);

    // Self-check before responding  -  if this ever fails, it's a bug in our
    // own proof construction, not something the caller should have to catch.
    const selfCheck = verifyOccurrenceProof(dataset.manifest.merkleRoot, dataset.manifest.chunkSizeDigits, sequence, occurrence);
    if (!selfCheck) {
      req.log.error({ position, sequence }, "constructed proof failed self-verification");
      return reply.status(500).send({ error: "proof_construction_failed" });
    }

    const discoveryId = computeDiscoveryId({
      datasetVersion: BigInt(dataset.manifest.version),
      root: dataset.manifest.merkleRoot,
      position: BigInt(position),
      matchLength: sequence.length,
      sequence,
    });

    return reply.send({
      dataset_version: dataset.manifest.version,
      position,
      sequence,
      sequence_hex: toHex(Uint8Array.from(sequence.split("").map((c) => c.charCodeAt(0) - 48))),
      discovery_id: discoveryId,
      proofs: occurrence.proofs.map((p) => ({
        chunk_index: p.chunkIndex,
        chunk_data: toHex(p.chunkData),
        merkle_proof: p.merkleProof,
      })),
    });
  });
}
