import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { randomUUID } from "node:crypto";
import { registerSearchRoute } from "./routes/search";
import { registerProofRoute } from "./routes/proof";
import { registerDiscoveryRoute } from "./routes/discovery";
import { registerMetadataRoutes } from "./routes/metadata";
import { registerLeaderboardRoute } from "./routes/leaderboard";
import { registerProfileRoute } from "./routes/profile";
import { getActiveDataset } from "./dataset-loader";

/** Builds the Fastify app WITHOUT listening  -  the dataset must already be
 * loaded (via loadActiveDataset in production, setActiveDatasetForTesting
 * in tests) before calling this. Kept separate from server.ts so tests can
 * exercise routes via `.inject()` without opening a real port. */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "warn" },
    genReqId: () => randomUUID(),
  });

  await app.register(cors, { origin: true });
  await app.register(rateLimit, { global: true, max: 300, timeWindow: "1 minute" });

  // Defense in depth: never leak raw internal error messages (DB error text,
  // stack traces, driver error codes) to clients. Routes that validate their
  // own input return intentional 4xx responses before this is ever reached;
  // this only catches genuinely unexpected failures. Full detail still goes
  // to the server-side log.
  app.setErrorHandler((error, req, reply) => {
    const statusCode = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    if (statusCode >= 500) {
      req.log.error({ err: error }, "unhandled request error");
      return reply.status(500).send({ error: "internal_error" });
    }
    return reply.status(statusCode).send({ error: error.message });
  });

  app.register(async (searchScope) => {
    await searchScope.register(rateLimit, { max: 60, timeWindow: "1 minute" });
    registerSearchRoute(searchScope);
  });
  registerProofRoute(app);
  registerDiscoveryRoute(app);
  registerMetadataRoutes(app);
  registerLeaderboardRoute(app);
  registerProfileRoute(app);

  app.get("/health", async () => {
    const dataset = getActiveDataset();
    return { ok: true, pi_dataset_version: dataset.manifest.version, digits_indexed: dataset.manifest.digitCount };
  });

  return app;
}
