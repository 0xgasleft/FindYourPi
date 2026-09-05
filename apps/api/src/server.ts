import "dotenv/config";
import { loadActiveDataset } from "./dataset-loader";
import { syncDatasetToDb } from "./sync-dataset";
import { buildApp } from "./app";

const PORT = Number(process.env.PORT ?? 4000);
const PI_DATASET_PATH = process.env.PI_DATASET_PATH ?? "../../packages/pi-search/data/v1";

async function main() {
  console.log(`Loading π dataset from ${PI_DATASET_PATH}...`);
  const dataset = loadActiveDataset(PI_DATASET_PATH);
  console.log(`Loaded dataset v${dataset.manifest.version}: ${dataset.manifest.digitCount.toLocaleString()} digits, root ${dataset.manifest.merkleRoot}`);

  // Not best-effort: discoveries.pi_dataset_version has a foreign key against
  // this row, so search persistence silently breaks if it's skipped.
  await syncDatasetToDb(dataset);
  console.log(`Synced dataset v${dataset.manifest.version} into pi_datasets.`);

  const app = await buildApp();
  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(`Pi Hunter API listening on :${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
