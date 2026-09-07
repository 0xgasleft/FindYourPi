import { getPool } from "./db";
import type { ActiveDataset } from "./dataset-loader";

/**
 * Upserts the active dataset's manifest into Postgres' `pi_datasets` table.
 * `discoveries.pi_dataset_version` has a foreign key against this table, so
 * this must run  -  and succeed  -  before any search/discovery persistence
 * can work. Not best-effort: if this fails, the API should fail loudly at
 * startup rather than silently dropping every discovery write later.
 */
export async function syncDatasetToDb(dataset: ActiveDataset): Promise<void> {
  await getPool().query(
    `INSERT INTO pi_datasets (version, digit_count, chunk_size_digits, merkle_root, dataset_hash, verifier_address, registry_address, nft_address, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
     ON CONFLICT (version) DO UPDATE SET
       digit_count = EXCLUDED.digit_count,
       chunk_size_digits = EXCLUDED.chunk_size_digits,
       merkle_root = EXCLUDED.merkle_root,
       dataset_hash = EXCLUDED.dataset_hash,
       verifier_address = COALESCE(EXCLUDED.verifier_address, pi_datasets.verifier_address),
       registry_address = COALESCE(EXCLUDED.registry_address, pi_datasets.registry_address),
       nft_address = COALESCE(EXCLUDED.nft_address, pi_datasets.nft_address)`,
    [
      dataset.manifest.version,
      dataset.manifest.digitCount,
      dataset.manifest.chunkSizeDigits,
      dataset.manifest.merkleRoot,
      dataset.manifest.datasetHash,
      process.env.VERIFIER_ADDRESS ?? null,
      process.env.DATASET_REGISTRY_ADDRESS ?? null,
      process.env.NFT_CONTRACT_ADDRESS ?? null,
    ]
  );
}
